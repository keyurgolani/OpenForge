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
    from openforge.config import get_settings
    settings = get_settings()
    if settings.admin_password:
        token = websocket.cookies.get("openforge_session")
        valid = False
        if token:
            try:
                from jose import jwt, JWTError
                secret = settings.encryption_key or "openforge-fallback-secret"
                jwt.decode(token, secret, algorithms=["HS256"])
                valid = True
            except Exception:
                pass
        if not valid:
            await websocket.close(code=4001)
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
                provider_id = data.get("provider_id")
                model_id = data.get("model_id")
                mentions = data.get("mentions", [])
                optimize = data.get("optimize", False)
                if not conversation_id or not content:
                    await ws_manager.send_to_connection(websocket, {
                        "type": "chat_error",
                        "detail": "conversation_id and content are required"
                    })
                    continue

                import asyncio as _asyncio
                from uuid import UUID
                from openforge.db.postgres import AsyncSessionLocal

                _cid = conversation_id
                _wid = workspace_id
                _content = content
                _att = attachment_ids
                _pid = provider_id
                _mid = model_id
                _mentions = mentions
                _optimize = optimize
                logger.info("DEBUG WS chat_message: optimize=%s use_celery=%s", _optimize, settings.use_celery_agents)

                _use_celery = settings.use_celery_agents
                if _use_celery:
                    try:
                        await _dispatch_celery_agent(
                            workspace_id=_wid,
                            conversation_id=_cid,
                            content=_content,
                            attachment_ids=_att,
                            provider_id=_pid,
                            model_id=_mid,
                            mentions=_mentions,
                            optimize=_optimize,
                        )
                    except Exception as _celery_err:
                        logger.warning("Celery dispatch failed, falling back to inline: %s", _celery_err)
                        _use_celery = False

                if not _use_celery:
                    from openforge.services.agent_execution_engine import agent_engine

                    async def _run_agent():
                        async with AsyncSessionLocal() as db:
                            await agent_engine.run(
                                workspace_id=UUID(_wid),
                                conversation_id=UUID(_cid),
                                user_content=_content,
                                db=db,
                                attachment_ids=_att,
                                provider_id=_pid,
                                model_id=_mid,
                                mentions=_mentions,
                                optimize=_optimize,
                            )

                    _asyncio.create_task(_run_agent())

            elif msg_type == "chat_stream_resume":
                from uuid import UUID
                from openforge.services.agent_execution_engine import agent_engine

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

                await agent_engine.send_stream_snapshot(
                    websocket=websocket,
                    workspace_id=UUID(workspace_id),
                    conversation_id=target_conversation_id,
                )

            elif msg_type == "chat_cancel":
                conversation_id = data.get("conversation_id")
                if conversation_id:
                    from uuid import UUID
                    from openforge.services.agent_execution_engine import agent_engine
                    try:
                        agent_engine.cancel(UUID(conversation_id))
                    except Exception:
                        pass

                    # Also publish cancel via Redis for Celery workers
                    if settings.use_celery_agents:
                        try:
                            from openforge.db.redis_client import get_redis
                            import json as _json
                            redis = await get_redis()
                            await redis.publish(
                                f"agent_cancel:{conversation_id}",
                                _json.dumps({"conversation_id": conversation_id}),
                            )
                        except Exception:
                            pass

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


async def _dispatch_celery_agent(
    *,
    workspace_id: str,
    conversation_id: str,
    content: str,
    attachment_ids: list,
    provider_id: str | None,
    model_id: str | None,
    mentions: list,
    optimize: bool = False,
) -> None:
    """Create an execution record and dispatch to Celery."""
    import uuid as _uuid
    from uuid import UUID
    from openforge.db.postgres import AsyncSessionLocal
    from openforge.db.models import AgentExecution
    from openforge.core.agent_registry import agent_registry

    execution_id = str(_uuid.uuid4())

    async with AsyncSessionLocal() as db:
        # Get agent for workspace
        agent = await agent_registry.get_for_workspace(db, UUID(workspace_id))

        # Create execution record
        db.add(AgentExecution(
            id=UUID(execution_id),
            workspace_id=UUID(workspace_id),
            conversation_id=UUID(conversation_id),
            agent_id=agent.id,
            status="queued",
        ))
        await db.commit()

    # Dispatch to Celery
    from openforge.worker.tasks import execute_agent_task
    execute_agent_task.delay(
        execution_id=execution_id,
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        user_message=content,
        agent_id=agent.id,
        agent_enabled=agent.tools_enabled,
        agent_tool_categories=agent.allowed_tool_categories or [],
        agent_max_tool_loops=agent.max_iterations,
        attachment_ids=attachment_ids,
        provider_id=provider_id,
        model_id=model_id,
        mentions=mentions,
        optimize=optimize,
    )
