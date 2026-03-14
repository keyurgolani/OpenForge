from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from typing import Dict
import json
import logging

logger = logging.getLogger("openforge.ws")

# Channel constants
CHANNEL_AGENT = "agent"
CHANNEL_SYSTEM = "system"
CHANNEL_LEGACY = "legacy"

# Event types that belong to the agent channel
AGENT_EVENT_TYPES = frozenset({
    "agent_thinking", "agent_token", "agent_error", "agent_done",
    "agent_model_selection", "agent_tool_call_start", "agent_tool_call_result",
    "agent_tool_hitl", "agent_tool_hitl_resolved", "agent_nested_event",
    "agent_attachments_processed", "agent_stream_snapshot",
    "execution_started", "execution_completed",
    "chat_error", "conversation_updated",
})

# Event types that belong to the system channel
SYSTEM_EVENT_TYPES = frozenset({
    "knowledge_updated", "hitl_resolved",
})


class WorkspaceConnectionManager:
    """
    Manages WebSocket connections scoped to workspaces and channels.

    Connections are tracked as:
        workspace_id -> channel -> [connections]

    Channels:
        - "agent"  : agent streaming (chat, tool calls, thinking, etc.)
        - "system" : knowledge processing, HITL events, system notifications
        - "legacy" : the original ws/workspace/{id} endpoint (receives everything)
    """

    def __init__(self):
        # workspace_id -> channel -> [WebSocket]
        self.active_connections: Dict[str, Dict[str, list[WebSocket]]] = {}
        # execution_id -> [WebSocket]  (for non-workspace agent connections)
        self.execution_connections: Dict[str, list[WebSocket]] = {}
        # settings connections (no workspace scope)
        self.settings_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket, workspace_id: str, channel: str = CHANNEL_LEGACY):
        """Connect a WebSocket to a workspace on a specific channel."""
        await websocket.accept()
        if workspace_id not in self.active_connections:
            self.active_connections[workspace_id] = {}
        if channel not in self.active_connections[workspace_id]:
            self.active_connections[workspace_id][channel] = []
        self.active_connections[workspace_id][channel].append(websocket)
        total = sum(len(conns) for conns in self.active_connections[workspace_id].values())
        logger.info(
            f"WebSocket connected for workspace {workspace_id} channel={channel}. "
            f"Total connections: {total}"
        )

    def disconnect(self, websocket: WebSocket, workspace_id: str, channel: str = CHANNEL_LEGACY):
        """Disconnect a WebSocket from a workspace channel."""
        if workspace_id in self.active_connections:
            ch_conns = self.active_connections[workspace_id].get(channel, [])
            try:
                ch_conns.remove(websocket)
            except ValueError:
                pass
            if not ch_conns:
                self.active_connections[workspace_id].pop(channel, None)
            if not self.active_connections[workspace_id]:
                del self.active_connections[workspace_id]
        logger.info(f"WebSocket disconnected for workspace {workspace_id} channel={channel}")

    async def connect_execution(self, websocket: WebSocket, execution_id: str):
        """Connect a WebSocket for a specific agent execution (non-workspace)."""
        await websocket.accept()
        if execution_id not in self.execution_connections:
            self.execution_connections[execution_id] = []
        self.execution_connections[execution_id].append(websocket)
        logger.info(f"WebSocket connected for execution {execution_id}")

    def disconnect_execution(self, websocket: WebSocket, execution_id: str):
        """Disconnect a WebSocket from an execution."""
        if execution_id in self.execution_connections:
            try:
                self.execution_connections[execution_id].remove(websocket)
            except ValueError:
                pass
            if not self.execution_connections[execution_id]:
                del self.execution_connections[execution_id]
        logger.info(f"WebSocket disconnected for execution {execution_id}")

    async def connect_settings(self, websocket: WebSocket):
        """Connect a WebSocket for settings/system status."""
        await websocket.accept()
        self.settings_connections.append(websocket)
        logger.info(f"Settings WebSocket connected. Total: {len(self.settings_connections)}")

    def disconnect_settings(self, websocket: WebSocket):
        """Disconnect a settings WebSocket."""
        try:
            self.settings_connections.remove(websocket)
        except ValueError:
            pass
        logger.info(f"Settings WebSocket disconnected. Total: {len(self.settings_connections)}")

    async def send_to_workspace(self, workspace_id: str, message: dict):
        """Send a message to ALL connections for a workspace (all channels).

        This is the backward-compatible method: every caller that used to call
        send_to_workspace will continue to reach all clients regardless of
        which channel they connected on.
        """
        if workspace_id not in self.active_connections:
            return
        dead_by_channel: Dict[str, list[WebSocket]] = {}
        for channel, conns in self.active_connections[workspace_id].items():
            for conn in conns:
                try:
                    await conn.send_json(message)
                except Exception:
                    dead_by_channel.setdefault(channel, []).append(conn)
        # Clean up dead connections
        for channel, dead in dead_by_channel.items():
            ch_conns = self.active_connections.get(workspace_id, {}).get(channel, [])
            for conn in dead:
                try:
                    ch_conns.remove(conn)
                except ValueError:
                    pass

    async def send_to_workspace_channel(self, workspace_id: str, channel: str, message: dict):
        """Send a message to a SPECIFIC channel for a workspace.

        Also sends to legacy connections so old clients receive everything.
        """
        if workspace_id not in self.active_connections:
            return
        # Determine which channels to send to
        channels_to_send = {channel}
        if channel != CHANNEL_LEGACY:
            channels_to_send.add(CHANNEL_LEGACY)

        dead_by_channel: Dict[str, list[WebSocket]] = {}
        for ch in channels_to_send:
            conns = self.active_connections[workspace_id].get(ch, [])
            for conn in conns:
                try:
                    await conn.send_json(message)
                except Exception:
                    dead_by_channel.setdefault(ch, []).append(conn)
        for ch, dead in dead_by_channel.items():
            ch_conns = self.active_connections.get(workspace_id, {}).get(ch, [])
            for conn in dead:
                try:
                    ch_conns.remove(conn)
                except ValueError:
                    pass

    async def send_to_execution(self, execution_id: str, message: dict):
        """Send a message to all connections watching a specific execution."""
        if execution_id not in self.execution_connections:
            return
        dead = []
        for conn in self.execution_connections[execution_id]:
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            try:
                self.execution_connections[execution_id].remove(conn)
            except ValueError:
                pass

    async def send_to_settings(self, message: dict):
        """Send a message to all settings connections."""
        dead = []
        for conn in self.settings_connections:
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            try:
                self.settings_connections.remove(conn)
            except ValueError:
                pass

    async def send_to_connection(self, websocket: WebSocket, message: dict):
        """Send a message to a SPECIFIC connection."""
        await websocket.send_json(message)


# Singleton
ws_manager = WorkspaceConnectionManager()


ws_router = APIRouter()


# ── Helper: auth check for WebSocket ──

async def _ws_auth_check(websocket: WebSocket) -> bool:
    """Return True if the WebSocket passes authentication, False otherwise."""
    from openforge.config import get_settings
    settings = get_settings()
    if not settings.admin_password:
        return True
    token = websocket.cookies.get("openforge_session")
    if token:
        try:
            from jose import jwt, JWTError
            secret = settings.encryption_key or "openforge-fallback-secret"
            jwt.decode(token, secret, algorithms=["HS256"])
            return True
        except Exception:
            pass
    await websocket.close(code=4001)
    return False


def _cleanup_log_tasks(websocket: WebSocket):
    """Cancel any log-streaming tasks attached to a WebSocket."""
    if hasattr(websocket, "log_tasks"):
        for task in websocket.log_tasks:
            task.cancel()


# ── Helper: handle chat_message ──

async def _handle_chat_message(websocket: WebSocket, workspace_id: str, data: dict):
    """Process a chat_message from any workspace-scoped endpoint."""
    from openforge.config import get_settings
    settings = get_settings()

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
        return

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


# ── Helper: handle chat_stream_resume ──

async def _handle_chat_stream_resume(websocket: WebSocket, workspace_id: str, data: dict):
    """Process a chat_stream_resume from any workspace-scoped endpoint."""
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
            return

    await agent_engine.send_stream_snapshot(
        websocket=websocket,
        workspace_id=UUID(workspace_id),
        conversation_id=target_conversation_id,
    )


# ── Helper: handle chat_cancel ──

async def _handle_chat_cancel(data: dict):
    """Process a chat_cancel from any workspace-scoped endpoint."""
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return

    from uuid import UUID
    from openforge.services.agent_execution_engine import agent_engine
    try:
        agent_engine.cancel(UUID(conversation_id))
    except Exception:
        pass

    # Publish cancel via Redis so both inline and Celery workers receive it
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

    # Also publish cancel to the execution_chain_id channel
    # so nested subagents across HTTP boundaries get cancelled
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.db.models import AgentExecution
        from sqlalchemy import select as _select
        async with AsyncSessionLocal() as _cancel_db:
            _cancel_result = await _cancel_db.execute(
                _select(AgentExecution)
                .where(
                    AgentExecution.conversation_id == UUID(conversation_id),
                    AgentExecution.status.in_(["running", "paused_hitl"]),
                )
                .order_by(AgentExecution.started_at.desc())
                .limit(1)
            )
            _active_exec = _cancel_result.scalar_one_or_none()
            if _active_exec:
                await redis.publish(
                    f"agent_cancel:{_active_exec.id}",
                    _json.dumps({"execution_chain_id": str(_active_exec.id)}),
                )
    except Exception:
        pass


# ── 1. Legacy endpoint: ws/workspace/{workspace_id} ──
# Backward-compatible: handles ALL message types, receives ALL events.

@ws_router.websocket("/ws/workspace/{workspace_id}")
async def workspace_websocket(websocket: WebSocket, workspace_id: str):
    if not await _ws_auth_check(websocket):
        return
    await ws_manager.connect(websocket, workspace_id, CHANNEL_LEGACY)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "chat_message":
                await _handle_chat_message(websocket, workspace_id, data)

            elif msg_type == "chat_stream_resume":
                await _handle_chat_stream_resume(websocket, workspace_id, data)

            elif msg_type == "chat_cancel":
                await _handle_chat_cancel(data)

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
        _cleanup_log_tasks(websocket)
        ws_manager.disconnect(websocket, workspace_id, CHANNEL_LEGACY)
    except Exception as e:
        logger.error(f"WebSocket error for workspace {workspace_id}: {e}")
        _cleanup_log_tasks(websocket)
        ws_manager.disconnect(websocket, workspace_id, CHANNEL_LEGACY)


# ── 2. Agent channel: ws/workspace/{workspace_id}/agent ──
# Handles chat_message, chat_stream_resume, chat_cancel, ping.
# Receives agent-related events only.

@ws_router.websocket("/ws/workspace/{workspace_id}/agent")
async def workspace_agent_websocket(websocket: WebSocket, workspace_id: str):
    if not await _ws_auth_check(websocket):
        return
    await ws_manager.connect(websocket, workspace_id, CHANNEL_AGENT)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "chat_message":
                await _handle_chat_message(websocket, workspace_id, data)

            elif msg_type == "chat_stream_resume":
                await _handle_chat_stream_resume(websocket, workspace_id, data)

            elif msg_type == "chat_cancel":
                await _handle_chat_cancel(data)

            elif msg_type == "ping":
                await ws_manager.send_to_connection(websocket, {"type": "pong"})

            else:
                await ws_manager.send_to_connection(websocket, {
                    "type": "error",
                    "detail": f"Unknown message type for agent channel: {msg_type}"
                })

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, workspace_id, CHANNEL_AGENT)
    except Exception as e:
        logger.error(f"WebSocket error for workspace {workspace_id} agent channel: {e}")
        ws_manager.disconnect(websocket, workspace_id, CHANNEL_AGENT)


# ── 3. System channel: ws/workspace/{workspace_id}/system ──
# Receives knowledge_updated, hitl_resolved, and other system events.
# Accepts ping only.

@ws_router.websocket("/ws/workspace/{workspace_id}/system")
async def workspace_system_websocket(websocket: WebSocket, workspace_id: str):
    if not await _ws_auth_check(websocket):
        return
    await ws_manager.connect(websocket, workspace_id, CHANNEL_SYSTEM)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await ws_manager.send_to_connection(websocket, {"type": "pong"})

            else:
                await ws_manager.send_to_connection(websocket, {
                    "type": "error",
                    "detail": f"Unknown message type for system channel: {msg_type}"
                })

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, workspace_id, CHANNEL_SYSTEM)
    except Exception as e:
        logger.error(f"WebSocket error for workspace {workspace_id} system channel: {e}")
        ws_manager.disconnect(websocket, workspace_id, CHANNEL_SYSTEM)


# ── 4. Execution channel: ws/agent/{execution_id} ──
# Non-workspace agent executions (e.g., Agents page).
# Receives agent events for a specific execution. Accepts ping only.

@ws_router.websocket("/ws/agent/{execution_id}")
async def agent_execution_websocket(websocket: WebSocket, execution_id: str):
    if not await _ws_auth_check(websocket):
        return
    await ws_manager.connect_execution(websocket, execution_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await ws_manager.send_to_connection(websocket, {"type": "pong"})

            else:
                await ws_manager.send_to_connection(websocket, {
                    "type": "error",
                    "detail": f"Unknown message type for agent execution channel: {msg_type}"
                })

    except WebSocketDisconnect:
        ws_manager.disconnect_execution(websocket, execution_id)
    except Exception as e:
        logger.error(f"WebSocket error for execution {execution_id}: {e}")
        ws_manager.disconnect_execution(websocket, execution_id)


# ── 5. Settings channel: ws/settings ──
# Handles stream_logs, stop_logs, ping.
# Receives model downloads and system status events.

@ws_router.websocket("/ws/settings")
async def settings_websocket(websocket: WebSocket):
    if not await _ws_auth_check(websocket):
        return
    await ws_manager.connect_settings(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "stream_logs":
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

            elif msg_type == "ping":
                await ws_manager.send_to_connection(websocket, {"type": "pong"})

            else:
                await ws_manager.send_to_connection(websocket, {
                    "type": "error",
                    "detail": f"Unknown message type for settings channel: {msg_type}"
                })

    except WebSocketDisconnect:
        _cleanup_log_tasks(websocket)
        ws_manager.disconnect_settings(websocket)
    except Exception as e:
        logger.error(f"WebSocket error for settings channel: {e}")
        _cleanup_log_tasks(websocket)
        ws_manager.disconnect_settings(websocket)


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

        # Persist user message before queuing so it's visible on page refresh
        from openforge.services.conversation_service import conversation_service
        _user_metadata = {"optimize": True} if optimize else None
        await conversation_service.add_message(
            db, UUID(conversation_id), role="user", content=content,
            provider_metadata=_user_metadata,
        )

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
