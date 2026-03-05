from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from typing import Dict
import json
import logging

logger = logging.getLogger("openforge.ws")


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
    await ws_manager.connect(websocket, workspace_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "chat_message":
                conversation_id = data.get("conversation_id")
                content = data.get("content", "").strip()
                attachment_ids = data.get("attachment_ids", [])
                provider_id = data.get("provider_id")
                model_id = data.get("model_id")
                if not conversation_id or not content:
                    await ws_manager.send_to_connection(websocket, {
                        "type": "chat_error",
                        "detail": "conversation_id and content are required"
                    })
                    continue

                from uuid import UUID
                from openforge.db.postgres import AsyncSessionLocal
                from openforge.services.chat_service import chat_service

                async with AsyncSessionLocal() as db:
                    await chat_service.handle_chat_message(
                        websocket=websocket,
                        workspace_id=UUID(workspace_id),
                        conversation_id=UUID(conversation_id),
                        user_content=content,
                        db=db,
                        attachment_ids=attachment_ids,
                        provider_id=provider_id,
                        model_id=model_id,
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
