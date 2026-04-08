from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from typing import Dict, Set
import asyncio as _asyncio_mod
import json
import logging

logger = logging.getLogger("openforge.ws")

# Strong references to background relay tasks to prevent garbage collection.
# Tasks remove themselves via a done-callback.
_background_tasks: Set[_asyncio_mod.Task] = set()

# Channel constants
CHANNEL_AGENT = "agent"
CHANNEL_SYSTEM = "system"

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
    """

    def __init__(self):
        # workspace_id -> channel -> [WebSocket]
        self.active_connections: Dict[str, Dict[str, list[WebSocket]]] = {}
        # conversation_id -> [WebSocket] (per-conversation connections)
        self.conversation_connections: Dict[str, list[WebSocket]] = {}
        # settings connections (no workspace scope)
        self.settings_connections: list[WebSocket] = []
        # mission_id -> [WebSocket] (per-mission live connections)
        self.mission_connections: Dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, workspace_id: str, channel: str):
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

    def disconnect(self, websocket: WebSocket, workspace_id: str, channel: str):
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

    async def connect_conversation(self, websocket: WebSocket, conversation_id: str):
        """Connect a WebSocket scoped to a specific conversation."""
        await websocket.accept()
        if conversation_id not in self.conversation_connections:
            self.conversation_connections[conversation_id] = []
        self.conversation_connections[conversation_id].append(websocket)
        logger.info(
            f"Conversation WebSocket connected for {conversation_id}. "
            f"Total: {len(self.conversation_connections[conversation_id])}"
        )

    def disconnect_conversation(self, websocket: WebSocket, conversation_id: str):
        """Disconnect a WebSocket from a conversation."""
        conns = self.conversation_connections.get(conversation_id, [])
        try:
            conns.remove(websocket)
        except ValueError:
            pass
        if not conns:
            self.conversation_connections.pop(conversation_id, None)
        logger.info(f"Conversation WebSocket disconnected for {conversation_id}")

    async def send_to_conversation(self, conversation_id: str, message: dict):
        """Send a message to all connections for a specific conversation."""
        conns = self.conversation_connections.get(conversation_id)
        if not conns:
            return
        dead: list[WebSocket] = []
        for conn in conns:
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            try:
                conns.remove(conn)
            except ValueError:
                pass
        if not conns:
            self.conversation_connections.pop(conversation_id, None)

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

    async def _send_to_channels(self, workspace_id: str, channels: set[str], message: dict):
        if workspace_id not in self.active_connections:
            return

        dead_by_channel: Dict[str, list[WebSocket]] = {}
        for channel in channels:
            conns = self.active_connections[workspace_id].get(channel, [])
            for conn in conns:
                try:
                    await conn.send_json(message)
                except Exception:
                    dead_by_channel.setdefault(channel, []).append(conn)
        for channel, dead in dead_by_channel.items():
            ch_conns = self.active_connections.get(workspace_id, {}).get(channel, [])
            for conn in dead:
                try:
                    ch_conns.remove(conn)
                except ValueError:
                    pass

    async def send_to_workspace(self, workspace_id: str, message: dict):
        """Route a workspace event to the appropriate channel."""
        if workspace_id not in self.active_connections:
            return
        event_type = str(message.get("type", ""))
        if event_type in AGENT_EVENT_TYPES:
            await self._send_to_channels(workspace_id, {CHANNEL_AGENT}, message)
            return
        if event_type in SYSTEM_EVENT_TYPES:
            await self._send_to_channels(workspace_id, {CHANNEL_SYSTEM}, message)
            return

        logger.warning(
            "Workspace event %r has no channel mapping; broadcasting to all workspace channels",
            event_type,
        )
        await self._send_to_channels(
            workspace_id,
            set(self.active_connections[workspace_id].keys()),
            message,
        )

    async def send_to_workspace_channel(self, workspace_id: str, channel: str, message: dict):
        """Send a message to a specific workspace channel."""
        await self._send_to_channels(workspace_id, {channel}, message)

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

    async def connect_mission(self, websocket: WebSocket, mission_id: str):
        """Connect a WebSocket for live mission cycle streaming."""
        await websocket.accept()
        if mission_id not in self.mission_connections:
            self.mission_connections[mission_id] = []
        self.mission_connections[mission_id].append(websocket)
        logger.info(
            f"Mission WebSocket connected for {mission_id}. "
            f"Total: {len(self.mission_connections[mission_id])}"
        )

    def disconnect_mission(self, websocket: WebSocket, mission_id: str):
        """Disconnect a WebSocket from a mission."""
        conns = self.mission_connections.get(mission_id, [])
        try:
            conns.remove(websocket)
        except ValueError:
            pass
        if not conns:
            self.mission_connections.pop(mission_id, None)
        logger.info(f"Mission WebSocket disconnected for {mission_id}")

    async def send_to_mission(self, mission_id: str, message: dict):
        """Send a message to all connections for a specific mission."""
        conns = self.mission_connections.get(mission_id)
        if not conns:
            return
        dead: list[WebSocket] = []
        for conn in conns:
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            try:
                conns.remove(conn)
            except ValueError:
                pass
        if not conns:
            self.mission_connections.pop(mission_id, None)

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

async def _handle_chat_message(websocket: WebSocket, workspace_id: str | None, data: dict):
    """Process a chat_message from a workspace-scoped or per-conversation endpoint."""
    from openforge.config import get_settings
    settings = get_settings()

    conversation_id = data.get("conversation_id")
    content = data.get("content", "").strip()
    attachment_ids = data.get("attachment_ids", [])
    provider_id = data.get("provider_id")
    model_id = data.get("model_id")
    mentions = data.get("mentions", [])
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
    logger.info("DEBUG WS chat_message: use_celery=%s", settings.use_celery_agents)

    _use_celery = settings.use_celery_agents
    if _use_celery:
        # Quick check: is a Celery worker actually available?
        try:
            import asyncio as _aio_check
            from openforge.worker.tasks import celery_app

            def _ping_workers():
                inspector = celery_app.control.inspect(timeout=1.0)
                return inspector.ping()

            pong = await _aio_check.to_thread(_ping_workers)
            if not pong:
                logger.info("No Celery workers responding, falling back to inline execution")
                _use_celery = False
        except Exception:
            _use_celery = False

    if _use_celery:
        try:
            _exec_id = await _dispatch_celery_agent(
                conversation_id=_cid,
                content=_content,
                attachment_ids=_att,
                provider_id=_pid,
                model_id=_mid,
                mentions=_mentions,
            )
            # Start background relay: subscribe to Redis and forward events to WebSocket
            _task = _asyncio.create_task(_relay_agent_events(websocket, _exec_id, conversation_id=_cid))
            _background_tasks.add(_task)
            _task.add_done_callback(_background_tasks.discard)
        except Exception as _celery_err:
            logger.warning("Celery dispatch failed, falling back to inline: %s", _celery_err)
            _use_celery = False

    if not _use_celery:
        from openforge.runtime.chat_handler import chat_handler
        import uuid as _uuid_mod

        _exec_id = str(_uuid_mod.uuid4())

        async def _run_inline_agent():
            async with AsyncSessionLocal() as db:
                await chat_handler.run(
                    conversation_id=UUID(_cid),
                    user_content=_content,
                    db=db,
                    execution_id=_exec_id,
                    attachment_ids=_att,
                    provider_id=_pid,
                    model_id=_mid,
                    mentions=_mentions,
                )

        _asyncio.create_task(_run_inline_agent())
        # Subscribe to Redis events and relay them to the WebSocket,
        # same as the Celery path, so streaming works.
        _relay = _asyncio.create_task(
            _relay_agent_events(websocket, _exec_id, conversation_id=_cid)
        )
        _background_tasks.add(_relay)
        _relay.add_done_callback(_background_tasks.discard)


# ── Helper: handle chat_stream_resume ──

async def _handle_chat_stream_resume(websocket: WebSocket, workspace_id: str | None, data: dict):
    """Process a chat_stream_resume from a workspace-scoped or per-conversation endpoint."""
    from uuid import UUID
    from openforge.runtime.chat_handler import chat_handler

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

    await chat_handler.send_stream_snapshot(
        websocket=websocket,
        conversation_id=target_conversation_id,
    )


# ── Helper: handle chat_cancel ──

async def _handle_chat_cancel(data: dict):
    """Process a chat_cancel from any workspace-scoped endpoint."""
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return

    from uuid import UUID
    from openforge.runtime.chat_handler import chat_handler
    try:
        # Store partial content from the frontend as fallback
        partial_content = data.get("partial_content")
        if partial_content:
            chat_handler.store_cancel_content(UUID(conversation_id), partial_content)
        chat_handler.cancel(UUID(conversation_id))
    except Exception as exc:
        logger.warning("Local cancel failed for %s: %s", conversation_id, exc)

    # Publish cancel via Redis so both inline and Celery workers receive it
    try:
        from openforge.db.redis_client import get_redis
        import json as _json
        redis = await get_redis()
        subscribers = await redis.publish(
            f"agent_cancel:{conversation_id}",
            _json.dumps({"conversation_id": conversation_id}),
        )
        logger.info("Cancel published for %s, %d subscribers received", conversation_id, subscribers)
    except Exception as exc:
        logger.error("Redis cancel publish failed for %s: %s", conversation_id, exc)

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

    # Schedule a force-cancel fallback: if execution is still running after
    # 15 seconds, force-mark it as cancelled so the frontend can recover.
    import asyncio as _cancel_asyncio

    async def _force_cancel_fallback():
        await _cancel_asyncio.sleep(15)
        try:
            cancelled = await chat_handler.force_cancel_execution(UUID(conversation_id))
            if cancelled:
                logger.info("Force-cancelled stuck execution for conversation %s", conversation_id)
        except Exception as exc:
            logger.warning("Force-cancel fallback failed for %s: %s", conversation_id, exc)

    _fc_task = _cancel_asyncio.create_task(_force_cancel_fallback())
    _background_tasks.add(_fc_task)
    _fc_task.add_done_callback(_background_tasks.discard)


# ── 1. Agent channel: ws/workspace/{workspace_id}/agent ──
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


# ── 1b. Per-conversation agent channel: ws/chat/{conversation_id}/agent ──
# Same capabilities as workspace agent channel but scoped to a single conversation.
# Used by global (workspace-agnostic) chat and can also be used by workspace chat.

@ws_router.websocket("/ws/chat/{conversation_id}/agent")
async def conversation_agent_websocket(websocket: WebSocket, conversation_id: str):
    if not await _ws_auth_check(websocket):
        return
    await ws_manager.connect_conversation(websocket, conversation_id)

    # Conversations are workspace-agnostic; no workspace_id to resolve.
    resolved_workspace_id: str | None = None

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "chat_message":
                # Inject conversation_id from URL if not in payload
                if "conversation_id" not in data:
                    data["conversation_id"] = conversation_id
                await _handle_chat_message(websocket, resolved_workspace_id, data)

            elif msg_type == "chat_stream_resume":
                if "conversation_id" not in data:
                    data["conversation_id"] = conversation_id
                await _handle_chat_stream_resume(websocket, resolved_workspace_id, data)

            elif msg_type == "chat_cancel":
                if "conversation_id" not in data:
                    data["conversation_id"] = conversation_id
                await _handle_chat_cancel(data)

            elif msg_type == "ping":
                await ws_manager.send_to_connection(websocket, {"type": "pong"})

            else:
                await ws_manager.send_to_connection(websocket, {
                    "type": "error",
                    "detail": f"Unknown message type for conversation agent channel: {msg_type}"
                })

    except WebSocketDisconnect:
        ws_manager.disconnect_conversation(websocket, conversation_id)
    except Exception as e:
        logger.error(f"WebSocket error for conversation {conversation_id} agent channel: {e}")
        ws_manager.disconnect_conversation(websocket, conversation_id)


# ── 2. System channel: ws/workspace/{workspace_id}/system ──
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


# ── 3. Settings channel: ws/settings ──
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
    conversation_id: str,
    content: str,
    attachment_ids: list,
    provider_id: str | None,
    model_id: str | None,
    mentions: list,
) -> str:
    """Create an execution record and dispatch to Celery. Returns execution_id."""
    import uuid as _uuid
    from uuid import UUID
    from openforge.db.postgres import AsyncSessionLocal
    from openforge.db.models import AgentExecution, Conversation

    execution_id = str(_uuid.uuid4())

    async with AsyncSessionLocal() as db:
        # Resolve agent from conversation's agent_id
        agent_id = "default_agent"
        conversation = await db.get(Conversation, UUID(conversation_id))
        if conversation and conversation.agent_id:
            agent_id = str(conversation.agent_id)

        # Persist user message before queuing so it's visible on page refresh
        from openforge.services.conversation_service import conversation_service
        await conversation_service.add_message(
            db, UUID(conversation_id), role="user", content=content,
        )

        # Create execution record
        db.add(AgentExecution(
            id=UUID(execution_id),
            conversation_id=UUID(conversation_id),
            agent_id=agent_id,
            status="queued",
        ))
        await db.commit()

    # Dispatch to Celery
    from openforge.worker.tasks import execute_agent_task
    execute_agent_task.delay(
        execution_id=execution_id,
        conversation_id=conversation_id,
        user_message=content,
        attachment_ids=attachment_ids,
        provider_id=provider_id,
        model_id=model_id,
        mentions=mentions,
    )
    return execution_id


async def _relay_agent_events(
    websocket: WebSocket,
    execution_id: str,
    *,
    conversation_id: str | None = None,
) -> None:
    """Subscribe to Redis channel ``agent:{execution_id}`` and relay events
    to the WebSocket client.  Mirrors the run_live relay pattern."""
    import asyncio
    try:
        import redis.asyncio as aioredis
        from openforge.common.config import get_settings

        settings = get_settings()
        redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        pubsub = redis.pubsub()
        channel = f"agent:{execution_id}"
        await pubsub.subscribe(channel)

        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = None
                    event_type = ""
                    try:
                        data = json.loads(message["data"])
                        event_type = data.get("type", "")
                    except Exception as parse_err:
                        logger.warning("Failed to parse relay event for execution %s: %s", execution_id, parse_err)
                        continue

                    try:
                        # Route to per-conversation connections
                        if conversation_id:
                            await ws_manager.send_to_conversation(conversation_id, data)
                    except Exception as relay_err:
                        logger.warning(
                            "Failed to relay %s event for execution %s (conv=%s): %s",
                            event_type, execution_id, conversation_id, relay_err,
                        )

                    # Stop relay when stream is done
                    if event_type in ("agent_done", "agent_error", "execution_completed"):
                        break
        except asyncio.CancelledError:
            pass
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
                await redis.aclose()
            except Exception:
                pass
    except Exception as exc:
        logger.warning("Agent event relay failed for execution %s: %s", execution_id, exc)


# ── Run live WebSocket ────────────────────────────────────────────────────────

@ws_router.websocket("/ws/run/{run_id}/live")
async def run_live(websocket: WebSocket, run_id: str):
    """WebSocket endpoint that relays execution events for a run.

    Subscribes to the Redis channel ``runtime:{run_id}`` and forwards
    execution events (thinking, tool calls, node started/completed)
    to the connected client.
    """
    await websocket.accept()
    import asyncio

    try:
        import redis.asyncio as aioredis
        from openforge.common.config import get_settings

        settings = get_settings()
        redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        pubsub = redis.pubsub()
        channel = f"runtime:{run_id}"
        await pubsub.subscribe(channel)

        async def _relay():
            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        try:
                            data = json.loads(message["data"])
                            await websocket.send_json(data)
                        except Exception:
                            await websocket.send_text(message["data"])
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.debug("Run terminal relay error for %s: %s", run_id, exc)

        relay_task = asyncio.create_task(_relay())

        try:
            while True:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
        except WebSocketDisconnect:
            pass
        finally:
            relay_task.cancel()
            try:
                await relay_task
            except (asyncio.CancelledError, Exception):
                pass
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
                await redis.aclose()
            except Exception:
                pass

    except Exception as exc:
        logger.warning("Run terminal WebSocket failed for %s: %s", run_id, exc)
        try:
            await websocket.close()
        except Exception:
            pass


# ── Mission live WebSocket ───────────────────────────────────────────────────

@ws_router.websocket("/ws/mission/{mission_id}/live")
async def mission_live_websocket(websocket: WebSocket, mission_id: str):
    """WebSocket endpoint for live mission cycle execution events.

    Subscribes to Redis channel ``mission:{mission_id}`` and relays
    cycle events (cycle_started, cycle_completed, cycle_failed) to
    connected clients.
    """
    if not await _ws_auth_check(websocket):
        return
    await ws_manager.connect_mission(websocket, mission_id)
    import asyncio

    try:
        import redis.asyncio as aioredis
        from openforge.common.config import get_settings

        settings = get_settings()
        redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        pubsub = redis.pubsub()
        channel = f"mission:{mission_id}"
        await pubsub.subscribe(channel)

        async def _relay():
            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        try:
                            data = json.loads(message["data"])
                            await ws_manager.send_to_mission(mission_id, data)
                        except Exception:
                            pass
            except asyncio.CancelledError:
                pass

        relay_task = asyncio.create_task(_relay())

        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")

                if msg_type == "stream_resume":
                    # Send snapshot from Redis if available
                    try:
                        snapshot_key = f"mission_timeline:{mission_id}"
                        snapshot_data = await redis.get(snapshot_key)
                        if snapshot_data:
                            await ws_manager.send_to_connection(websocket, {
                                "type": "mission_snapshot",
                                "data": json.loads(snapshot_data),
                            })
                    except Exception as exc:
                        logger.warning("Mission snapshot send failed for %s: %s", mission_id, exc)

                elif msg_type == "ping":
                    await ws_manager.send_to_connection(websocket, {"type": "pong"})

                else:
                    await ws_manager.send_to_connection(websocket, {
                        "type": "error",
                        "detail": f"Unknown message type for mission channel: {msg_type}"
                    })

        except WebSocketDisconnect:
            pass
        finally:
            relay_task.cancel()
            try:
                await relay_task
            except (asyncio.CancelledError, Exception):
                pass
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
                await redis.aclose()
            except Exception:
                pass

    except Exception as exc:
        logger.warning("Mission WebSocket failed for %s: %s", mission_id, exc)
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        ws_manager.disconnect_mission(websocket, mission_id)
