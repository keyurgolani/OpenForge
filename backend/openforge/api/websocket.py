from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from typing import Dict
import json
import logging

logger = logging.getLogger("openforge.ws")

# Feature flag: use agent execution engine instead of direct chat_service
USE_AGENT_ENGINE = True


class WorkspaceConnectionManager:
    """
    Manages WebSocket connections scoped to workspaces.
    One connection per workspace per client.
    """

    def __init__(self):
        self.active_connections: Dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, workspace_id: str):
        await websocket.accept()
        if workspace_id not in self.active_connections:
            self.active_connections[workspace_id] = []
        self.active_connections[workspace_id].append(websocket)
        logger.info(
            f"WebSocket connected for workspace {workspace_id}. "
            f"Total connections: {len(self.active_connections[workspace_id])}"
        )

    def disconnect(self, websocket: WebSocket, workspace_id: str):
        if workspace_id in self.active_connections:
            try:
                self.active_connections[workspace_id].remove(websocket)
            except ValueError:
                pass
            if not self.active_connections[workspace_id]:
                del self.active_connections[workspace_id]
        logger.info(f"WebSocket disconnected for workspace {workspace_id}")

    async def send_to_workspace(self, workspace_id: str, message: dict):
        """Send a message to ALL connections for a workspace."""
        if workspace_id in self.active_connections:
            dead = []
            for conn in self.active_connections[workspace_id]:
                try:
                    await conn.send_json(message)
                except Exception:
                    dead.append(conn)
            for conn in dead:
                try:
                    self.active_connections[workspace_id].remove(conn)
                except ValueError:
                    pass

    async def send_to_connection(self, websocket: WebSocket, message: dict):
        """Send a message to a SPECIFIC connection."""
        await websocket.send_json(message)


# Singleton
ws_manager = WorkspaceConnectionManager()


ws_router = APIRouter()


@ws_router.websocket("/ws/workspace/{workspace_id}")
async def workspace_websocket(websocket: WebSocket, workspace_id: str):
    # Auth check
    from openforge.config import get_settings
    settings = get_settings()
    if settings.admin_password:
        token = websocket.cookies.get("openforge_session")
        if not token:
            await websocket.close(code=4001, reason="Not authenticated")
            return
        try:
            import jose.jwt
            jose.jwt.decode(token, settings.encryption_key or "default-insecure-key", algorithms=["HS256"])
        except Exception:
            await websocket.close(code=4001, reason="Session invalid or expired")
            return

    await ws_manager.connect(websocket, workspace_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "chat_message":
                conversation_id = data.get("conversation_id")
                content = data.get("content", "").strip()
                attachment_ids = data.get("attachment_ids", [])
                endpoint_id = data.get("endpoint_id")
                # Legacy support: accept provider_id/model_id as fallback
                if not endpoint_id:
                    endpoint_id = data.get("provider_id")
                if not conversation_id or not content:
                    await ws_manager.send_to_connection(websocket, {
                        "type": "chat_error",
                        "detail": "conversation_id and content are required"
                    })
                    continue

                from uuid import UUID
                from openforge.db.postgres import AsyncSessionLocal

                async with AsyncSessionLocal() as db:
                    if USE_AGENT_ENGINE:
                        try:
                            from openforge.core.agent_execution_engine import agent_execution_engine
                            from openforge.core.agent_registry import agent_registry

                            agent = await agent_registry.get_for_workspace(db, UUID(workspace_id))
                            await agent_execution_engine.execute(
                                workspace_id=UUID(workspace_id),
                                conversation_id=UUID(conversation_id),
                                user_message=content,
                                agent=agent,
                                db=db,
                                attachment_ids=attachment_ids,
                                endpoint_id=endpoint_id,
                            )
                        except Exception as e:
                            logger.error(f"Agent execution engine error: {e}")
                            # Fallback to chat_service
                            from openforge.services.chat_service import chat_service
                            await chat_service.handle_chat_message(
                                workspace_id=UUID(workspace_id),
                                conversation_id=UUID(conversation_id),
                                user_content=content,
                                db=db,
                                attachment_ids=attachment_ids,
                                provider_id=endpoint_id,
                            )
                    else:
                        from openforge.services.chat_service import chat_service
                        await chat_service.handle_chat_message(
                            workspace_id=UUID(workspace_id),
                            conversation_id=UUID(conversation_id),
                            user_content=content,
                            db=db,
                            attachment_ids=attachment_ids,
                            endpoint_id=endpoint_id,
                        )

            elif msg_type == "chat_stream_resume":
                from uuid import UUID
                from openforge.services.chat_service import chat_service

                conversation_id = data.get("conversation_id")
                target_conversation_id = None
                if conversation_id:
                    try:
                        target_conversation_id = UUID(conversation_id)
                    except Exception:
                        await ws_manager.send_to_connection(websocket, {
                            "type": "chat_error",
                            "detail": "Invalid conversation_id",
                        })
                        continue

                await chat_service.send_stream_snapshot(
                    websocket=websocket,
                    workspace_id=UUID(workspace_id),
                    conversation_id=target_conversation_id,
                )

            elif msg_type == "ping":
                await ws_manager.send_to_connection(websocket, {"type": "pong"})

            elif msg_type == "stream_logs":
                import asyncio
                from openforge.services.docker_service import docker_service

                task = asyncio.create_task(docker_service.stream_logs(websocket, ws_manager))
                if not hasattr(websocket, "log_tasks"):
                    websocket.log_tasks = []
                websocket.log_tasks.append(task)

            elif msg_type == "stop_logs":
                if hasattr(websocket, "log_tasks"):
                    for task in websocket.log_tasks:
                        task.cancel()
                    websocket.log_tasks = []

            else:
                await ws_manager.send_to_connection(websocket, {
                    "type": "error",
                    "detail": f"Unknown message type: {msg_type}"
                })

    except WebSocketDisconnect:
        if hasattr(websocket, "log_tasks"):
            for task in websocket.log_tasks:
                task.cancel()
        ws_manager.disconnect(websocket, workspace_id)
    except Exception as e:
        logger.error(f"WebSocket error for workspace {workspace_id}: {e}")
        if hasattr(websocket, "log_tasks"):
            for task in websocket.log_tasks:
                task.cancel()
        ws_manager.disconnect(websocket, workspace_id)
