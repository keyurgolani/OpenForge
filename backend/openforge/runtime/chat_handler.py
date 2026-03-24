"""Chat handler — interactive chat execution with streaming, tool dispatch, and HITL."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.core.context_assembler import ContextAssembler
from openforge.core.llm_gateway import llm_gateway
from openforge.db.models import (
    AgentExecution,
    ApprovalRequestModel,
    Conversation,
    LLMProvider,
    MCPServer,
    MCPToolOverride,
    Message,
    MessageAttachment,
    TaskLog,
    ToolCallLog,
    Workspace,
)
from openforge.integrations.tools.dispatcher import tool_dispatcher
from openforge.runtime.agent_registry import agent_registry
from openforge.runtime.input_extraction import extract_parameter_values
from openforge.runtime.hitl import hitl_service
from openforge.runtime.policy import ToolCallRateLimiter, policy_engine
from openforge.runtime.template_engine import render as render_template
from openforge.services.attachment_pipeline import extract_http_urls, get_extractor, resolve_attachment_pipeline
from openforge.services.conversation_service import conversation_service
from openforge.services.llm_service import llm_service

logger = logging.getLogger("openforge.runtime.chat_handler")

context_assembler = ContextAssembler()
_MAX_OUTPUT_LOG_CHARS = 50_000
_MAX_LLM_TOOL_RESULT_CHARS = 4_000
_TOOL_NAME_SEP = "__"


def _tool_id_to_fn_name(tool_id: str) -> str:
    return tool_id.replace(".", _TOOL_NAME_SEP)


def _fn_name_to_tool_id(fn_name: str) -> str:
    return fn_name.replace(_TOOL_NAME_SEP, ".")


def _mcp_tool_fn_name(server_id: str, tool_name: str) -> str:
    raw = f"mcp_{server_id}_{tool_name}"
    return re.sub(r"[^a-zA-Z0-9_]", "_", raw)


def _tools_to_openai_schema(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": _tool_id_to_fn_name(tool["id"]),
                "description": tool["description"],
                "parameters": tool.get("input_schema", {"type": "object", "properties": {}}),
            },
        }
        for tool in tools
    ]


def _truncate_text(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[:limit] + "..."


def _skill_description(skill: dict[str, Any]) -> str:
    content = skill.get("content", "")
    if not content:
        return skill.get("description", "")
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                import yaml
                meta = yaml.safe_load(parts[1])
                if meta and meta.get("description"):
                    return str(meta["description"])[:200]
            except Exception:
                pass
    for line in content.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and not stripped.startswith("---"):
            return stripped[:200]
    return skill.get("description", "")


@dataclass
class LoadedTools:
    openai_tools: list[dict[str, Any]]
    fn_name_to_tool_info: dict[str, dict[str, Any]]


class _AgentCompat:
    """Wraps AgentRuntimeConfig to provide the attribute interface needed by run().

    This bridges the gap until all of run() is refactored to use AgentRuntimeConfig
    directly. Maps AgentRuntimeConfig fields to the old ResolvedAgentProfile interface.
    """

    def __init__(self, spec: Any) -> None:
        from openforge.domains.agents.compiled_spec import AgentRuntimeConfig
        assert isinstance(spec, AgentRuntimeConfig)
        self._spec = spec

    @property
    def id(self) -> str:
        return str(self._spec.agent_id)

    @property
    def name(self) -> str:
        return self._spec.name

    @property
    def tools_enabled(self) -> bool:
        return self._spec.tools_enabled

    @property
    def allowed_tools(self) -> list[str] | None:
        return self._spec.allowed_tools

    @property
    def max_iterations(self) -> int:
        return 20

    @property
    def max_tool_calls_per_minute(self) -> int:
        return 30

    @property
    def max_tool_calls_per_execution(self) -> int:
        return 200

    @property
    def history_limit(self) -> int:
        return self._spec.history_limit

    @property
    def attachment_support(self) -> bool:
        return self._spec.attachment_support

    @property
    def auto_bookmark_urls(self) -> bool:
        return True

    @property
    def mention_support(self) -> bool:
        return True

    @property
    def skill_ids(self) -> list[str] | None:
        return None

    @property
    def provider_override_id(self) -> str | None:
        return self._spec.provider_name

    @property
    def model_override(self) -> str | None:
        return self._spec.model_name

    @property
    def description(self) -> str:
        return ""


async def _persist_tool_call_log(
    *,
    workspace_id: UUID | None,
    conversation_id: UUID,
    call_id: str,
    tool_name: str,
    arguments: dict[str, Any],
    success: bool,
    output: object,
    error: str | None,
    duration_ms: int,
    started_at: datetime,
    finished_at: datetime,
) -> None:
    from openforge.db.postgres import AsyncSessionLocal

    output_text: str | None = None
    if output is not None:
        if isinstance(output, str):
            output_text = output[:_MAX_OUTPUT_LOG_CHARS]
        else:
            try:
                output_text = json.dumps(output, default=str)[:_MAX_OUTPUT_LOG_CHARS]
            except Exception:
                output_text = str(output)[:_MAX_OUTPUT_LOG_CHARS]
    try:
        async with AsyncSessionLocal() as db:
            db.add(
                ToolCallLog(
                    workspace_id=workspace_id,
                    conversation_id=conversation_id,
                    call_id=call_id,
                    tool_name=tool_name,
                    arguments=arguments,
                    success=success,
                    output=output_text,
                    error=error,
                    duration_ms=duration_ms,
                    started_at=started_at,
                    finished_at=finished_at,
                )
            )
            await db.commit()
    except Exception as exc:
        logger.warning("Failed to persist tool call log for %s: %s", call_id, exc)


class ChatHandler:
    """Handles interactive chat execution with streaming, tools, and HITL.

    This is the extraction of AgentExecutionEngine's core logic. The old
    agent_engine singleton delegates all calls here.
    """

    def __init__(self) -> None:
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._cancel_content: dict[str, str] = {}
        self._use_redis: bool | None = None

    async def _should_use_redis(self) -> bool:
        if self._use_redis is not None:
            return self._use_redis
        try:
            from openforge.db.redis_client import get_redis
            redis = await get_redis()
            await redis.ping()
            self._use_redis = True
        except Exception:
            self._use_redis = False
        return self._use_redis

    async def _publish(
        self,
        execution_id: str,
        workspace_id: UUID | None,
        event_type: str,
        *,
        conversation_id: UUID | None = None,
        **data: Any,
    ) -> None:
        event = {
            "type": event_type,
            "execution_id": execution_id,
            "workspace_id": str(workspace_id) if workspace_id else None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **data,
        }
        if conversation_id is not None:
            event["conversation_id"] = str(conversation_id)

        if await self._should_use_redis():
            try:
                from openforge.db.redis_client import get_redis
                redis = await get_redis()
                await redis.publish(f"agent:{execution_id}", json.dumps(event, default=str))
                return
            except Exception as exc:
                logger.warning("Redis publish failed, falling back to WebSocket: %s", exc)

        from openforge.api.websocket import ws_manager
        # Publish to workspace connections (workspace-scoped chat)
        if workspace_id is not None:
            await ws_manager.send_to_workspace(str(workspace_id), event)
        # Publish to per-conversation connections (global and workspace chat)
        if conversation_id is not None:
            await ws_manager.send_to_conversation(str(conversation_id), event)

    async def _update_stream_state(
        self,
        execution_id: str,
        *,
        content: str = "",
        thinking: str = "",
        tool_calls: list[dict[str, Any]] | None = None,
        sources: list[dict[str, Any]] | None = None,
        attachments_processed: list[dict[str, Any]] | None = None,
        timeline: list[dict[str, Any]] | None = None,
    ) -> None:
        if not await self._should_use_redis():
            return
        try:
            from openforge.db.redis_client import get_redis
            redis = await get_redis()
            await redis.hset(
                f"stream_state:{execution_id}",
                mapping={
                    "content": content,
                    "thinking": thinking,
                    "tool_calls": json.dumps(tool_calls or [], default=str),
                    "sources": json.dumps(sources or [], default=str),
                    "attachments_processed": json.dumps(attachments_processed or [], default=str),
                    "timeline": json.dumps(timeline or [], default=str),
                },
            )
            await redis.expire(f"stream_state:{execution_id}", 3600)
        except Exception as exc:
            logger.warning("Failed to update stream state for %s: %s", execution_id, exc)

    async def _update_execution_record(self, db: AsyncSession, execution_id: str, **fields: Any) -> None:
        try:
            record = await db.get(AgentExecution, UUID(execution_id))
            if record is None:
                return
            for key, value in fields.items():
                setattr(record, key, value)
            await db.commit()
        except Exception as exc:
            logger.warning("Failed to update execution record %s: %s", execution_id, exc)

    async def _find_active_execution(self, db: AsyncSession, conversation_id: UUID) -> AgentExecution | None:
        from datetime import timedelta
        stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        result = await db.execute(
            select(AgentExecution)
            .where(
                AgentExecution.conversation_id == conversation_id,
                AgentExecution.status.in_(["queued", "running", "paused_hitl"]),
            )
            .order_by(AgentExecution.started_at.desc())
            .limit(1)
        )
        exec_record = result.scalar_one_or_none()
        if exec_record is not None and exec_record.started_at < stale_cutoff:
            logger.warning(
                "Marking stale execution %s as failed (started %s)",
                exec_record.id, exec_record.started_at,
            )
            exec_record.status = "failed"
            exec_record.error_message = "Execution timed out (stale after 5 minutes)"
            exec_record.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return None
        return exec_record

    async def get_stream_state(self, workspace_id: UUID | None, conversation_id: UUID) -> dict[str, Any]:
        from openforge.db.postgres import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            exec_record = await self._find_active_execution(db, conversation_id)

        if exec_record is None or exec_record.workspace_id != workspace_id:
            return {"active": False}

        payload: dict[str, Any] = {
            "active": True,
            "status": exec_record.status,
            "execution_id": str(exec_record.id),
        }
        if not await self._should_use_redis():
            return payload

        try:
            from openforge.db.redis_client import get_redis
            redis = await get_redis()
            state = await redis.hgetall(f"stream_state:{exec_record.id}")
            if state:
                payload.update({
                    "content": state.get("content", ""),
                    "thinking": state.get("thinking", ""),
                    "tool_calls": json.loads(state.get("tool_calls", "[]")),
                    "sources": json.loads(state.get("sources", "[]")),
                    "attachments_processed": json.loads(state.get("attachments_processed", "[]")),
                    "timeline": json.loads(state.get("timeline", "[]")),
                })
        except Exception as exc:
            logger.warning("Failed to load stream state for %s: %s", exec_record.id, exc)
        return payload

    async def send_stream_snapshot(
        self,
        websocket: WebSocket,
        workspace_id: UUID | None,
        conversation_id: UUID | None = None,
    ) -> None:
        if conversation_id is None:
            return
        state = await self.get_stream_state(workspace_id, conversation_id)
        if not state.get("active"):
            return

        from openforge.api.websocket import ws_manager
        await ws_manager.send_to_connection(
            websocket,
            {
                "type": "agent_stream_snapshot",
                "conversation_id": str(conversation_id),
                "data": {
                    "content": state.get("content", ""),
                    "thinking": state.get("thinking", ""),
                    "tool_calls": state.get("tool_calls", []),
                    "sources": state.get("sources", []),
                    "attachments_processed": state.get("attachments_processed", []),
                    "timeline": state.get("timeline", []),
                    "status": state.get("status"),
                },
            },
        )

    def store_cancel_content(self, conversation_id: UUID, content: str) -> None:
        """Store partial content from the frontend for use when saving interrupted messages."""
        self._cancel_content[str(conversation_id)] = content

    def pop_cancel_content(self, conversation_id: UUID) -> str | None:
        """Retrieve and remove stored cancel content for a conversation."""
        return self._cancel_content.pop(str(conversation_id), None)

    def cancel(self, conversation_id: UUID) -> None:
        event = self._cancel_events.get(str(conversation_id))
        if event is not None:
            event.set()

    async def force_cancel_execution(self, conversation_id: UUID) -> bool:
        """Force-cancel a stuck execution by marking it as cancelled in the DB.

        Called after the normal cancel path fails to stop the execution within
        a reasonable timeout. Returns True if an execution was force-cancelled.
        """
        from openforge.db.postgres import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            exec_record = await self._find_active_execution(db, conversation_id)
            if exec_record is None:
                return False
            logger.warning("Force-cancelling stuck execution %s for conversation %s", exec_record.id, conversation_id)
            exec_record.status = "cancelled"
            exec_record.error_message = "Force-cancelled by user (execution unresponsive)"
            exec_record.completed_at = datetime.now(timezone.utc)
            await db.commit()

            # Clean up stream state in Redis
            try:
                from openforge.db.redis_client import get_redis
                redis = await get_redis()
                await redis.delete(f"stream_state:{exec_record.id}")
            except Exception:
                pass

            # Publish agent_done so frontend exits streaming state
            await self._publish(
                str(exec_record.id), exec_record.workspace_id, "agent_done",
                conversation_id=conversation_id, message_id="", interrupted=True,
            )
            return True

    async def _subscribe_redis_cancel(self, channel_key: str, cancel_event: asyncio.Event) -> tuple[Any, Any, asyncio.Task]:
        import redis.asyncio as aioredis
        from openforge.common.config import get_settings

        redis = aioredis.from_url(get_settings().redis_url, decode_responses=True)
        pubsub = redis.pubsub()
        channel = f"agent_cancel:{channel_key}"
        await pubsub.subscribe(channel)

        async def _listener() -> None:
            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        cancel_event.set()
                        return
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.debug("Redis cancel listener failed for %s: %s", channel, exc)

        return redis, pubsub, asyncio.create_task(_listener())

    async def _teardown_cancel_listener(self, subscription: tuple[Any, Any, asyncio.Task] | None, channel_key: str) -> None:
        if subscription is None:
            return
        redis, pubsub, task = subscription
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        try:
            await pubsub.unsubscribe(f"agent_cancel:{channel_key}")
            await pubsub.aclose()
        except Exception:
            pass
        try:
            await redis.aclose()
        except Exception:
            pass

    async def _process_message_attachments(
        self,
        db: AsyncSession,
        *,
        workspace_id: UUID | None,
        conversation_id: UUID,
        user_message_id: UUID,
        attachment_ids: list[str] | None,
    ) -> tuple[str, list[dict[str, Any]]]:
        if not attachment_ids:
            return "", []

        from openforge.db.postgres import AsyncSessionLocal
        from openforge.utils.task_audit import mark_task_log_done, mark_task_log_failed, start_task_log

        context_blocks: list[str] = []
        processed: list[dict[str, Any]] = []
        db_updated = False

        for raw_attachment_id in dict.fromkeys(attachment_ids):
            try:
                attachment_id = UUID(str(raw_attachment_id))
            except Exception:
                processed.append({"id": str(raw_attachment_id), "filename": "unknown", "status": "failed", "pipeline": "unknown", "details": "Invalid attachment id"})
                continue

            result = await db.execute(select(MessageAttachment).where(MessageAttachment.id == attachment_id))
            attachment = result.scalar_one_or_none()
            if attachment is None:
                processed.append({"id": str(attachment_id), "filename": "unknown", "status": "missing", "pipeline": "unknown", "details": "Attachment record not found"})
                continue

            extractor = get_extractor(content_type=attachment.content_type, filename=attachment.filename)
            pipeline = extractor.pipeline if extractor is not None else resolve_attachment_pipeline(content_type=attachment.content_type, filename=attachment.filename)
            status = "deferred"
            details = "Pipeline not available yet for this file type"

            if attachment.message_id is None:
                attachment.message_id = user_message_id
                db_updated = True

            task_log_id = None
            if extractor is not None:
                try:
                    async with AsyncSessionLocal() as audit_db:
                        target_link = f"/w/{workspace_id}/conversations/{conversation_id}" if workspace_id else f"/conversations/{conversation_id}"
                        task_log = await start_task_log(audit_db, task_type="extract_attachment_content", workspace_id=workspace_id, target_link=target_link)
                        task_log_id = task_log.id
                        await audit_db.commit()
                except Exception as exc:
                    logger.warning("Failed to create attachment audit log: %s", exc)

                try:
                    if not (attachment.extracted_text or "").strip():
                        attachment.extracted_text = await extractor.extract(attachment.file_path) or None
                        db_updated = True
                    extracted_text = (attachment.extracted_text or "").strip()
                    if extracted_text:
                        status = "processed"
                        details = f"Extracted text ({len(extracted_text)} chars)"
                        context_blocks.append(f"\n--- Content from {attachment.filename} ---\n{extracted_text}\n--- End of {attachment.filename} ---\n")
                    else:
                        status = "empty"
                        details = "No text extracted from attachment"

                    if task_log_id is not None:
                        try:
                            async with AsyncSessionLocal() as audit_db:
                                log_entry = await audit_db.get(TaskLog, task_log_id)
                                if log_entry is not None:
                                    mark_task_log_done(log_entry, item_count=len(extracted_text))
                                    await audit_db.commit()
                        except Exception as exc:
                            logger.warning("Failed to mark attachment log complete: %s", exc)
                except Exception as exc:
                    status = "failed"
                    details = str(exc)[:200]
                    logger.warning("Attachment extraction failed for %s: %s", attachment.filename, exc)
                    if task_log_id is not None:
                        try:
                            async with AsyncSessionLocal() as audit_db:
                                log_entry = await audit_db.get(TaskLog, task_log_id)
                                if log_entry is not None:
                                    mark_task_log_failed(log_entry, exc)
                                    await audit_db.commit()
                        except Exception:
                            pass

            processed.append({
                "id": str(attachment.id),
                "filename": attachment.filename,
                "status": status,
                "pipeline": pipeline,
                "details": details,
                "extracted_text": (attachment.extracted_text or "")[:5000] or None,
            })

        if db_updated:
            await db.commit()

        if not context_blocks:
            return "", processed
        return "\n\nThe user attached the following file content:\n" + "\n".join(context_blocks), processed

    async def _extract_urls_for_chat(
        self,
        *,
        workspace_id: UUID | None,
        user_message_id: UUID,
        urls: list[str],
    ) -> tuple[str, list[dict[str, Any]]]:
        if not urls:
            return "", []

        from openforge.db.postgres import AsyncSessionLocal
        from openforge.services.knowledge_processing_service import knowledge_processing_service
        from openforge.utils.task_audit import mark_task_log_done, mark_task_log_failed, start_task_log

        context_blocks: list[str] = []
        url_attachments: list[dict[str, Any]] = []

        for url in urls[:3]:
            task_log_id = None
            try:
                async with AsyncSessionLocal() as audit_db:
                    task_log = await start_task_log(audit_db, task_type="extract_url_content", workspace_id=workspace_id, target_link=url)
                    task_log_id = task_log.id
                    await audit_db.commit()

                try:
                    result = await asyncio.wait_for(knowledge_processing_service.extract_url_content_raw(url), timeout=20)
                except asyncio.TimeoutError:
                    raise RuntimeError("Extraction timed out after 20s")

                content = (result.get("content") or "").strip()
                title = result.get("title") or result.get("resolved_url") or url
                resolved_url = result.get("resolved_url") or url
                attachment_id = uuid.uuid4()

                async with AsyncSessionLocal() as att_db:
                    att_db.add(MessageAttachment(id=attachment_id, message_id=user_message_id, filename=title[:500], content_type="text/url-extract", file_size=len(content.encode()), file_path="", source_url=resolved_url, extracted_text=content or None))
                    await att_db.commit()

                if content:
                    context_blocks.append(f"\n--- Content from {title} ---\n{content}\n--- End of {title} ---\n")
                    status = "processed"
                    details = f"Extracted {len(content)} chars"
                else:
                    status = "empty"
                    details = "No content could be extracted"

                if task_log_id is not None:
                    async with AsyncSessionLocal() as audit_db:
                        log_entry = await audit_db.get(TaskLog, task_log_id)
                        if log_entry is not None:
                            mark_task_log_done(log_entry, item_count=len(content))
                            await audit_db.commit()

                url_attachments.append({"id": str(attachment_id), "filename": title, "status": status, "pipeline": "url_extract", "details": details, "source_url": url, "extracted_text": content[:5000] if content else None})
            except Exception as exc:
                logger.warning("URL extraction failed for %s: %s", url, exc)
                if task_log_id is not None:
                    try:
                        async with AsyncSessionLocal() as audit_db:
                            log_entry = await audit_db.get(TaskLog, task_log_id)
                            if log_entry is not None:
                                mark_task_log_failed(log_entry, exc)
                                await audit_db.commit()
                    except Exception:
                        pass
                url_attachments.append({"id": str(uuid.uuid4()), "filename": url, "status": "failed", "pipeline": "url_extract", "details": str(exc)[:200], "source_url": url})

        if not context_blocks:
            return "", url_attachments
        header = "\n\nThe following URLs were shared by the user. Their content is already extracted below. Do not call fetch or browse tools to retrieve these same URLs again.\n"
        return header + "\n".join(context_blocks), url_attachments

    async def _resolve_mentions(self, db: AsyncSession, workspace_id: UUID | None, mentions: list[dict[str, Any]] | None) -> str:
        if not mentions:
            return ""
        parts: list[str] = []
        for mention in mentions:
            mention_type = mention.get("type")
            mention_id = mention.get("id")
            mention_name = mention.get("name") or mention_id or "workspace"
            if mention_type == "workspace" and mention_id:
                try:
                    workspace = await db.get(Workspace, UUID(str(mention_id)))
                except Exception:
                    workspace = None
                if workspace is not None:
                    parts.append(
                        "\n## Cross-workspace delegation required\n"
                        f"The user explicitly mentioned workspace '@{mention_name}' ({mention_id}). "
                        "Use the `agent.invoke` tool if you need data or actions from that workspace. "
                        "Do not use current-workspace tools to guess or fake cross-workspace access."
                    )
        return "\n".join(parts)

    def _build_skills_section(self, installed_skills: list[dict[str, Any]], agent: Any) -> str:
        if not installed_skills:
            return ""
        configured_ids = set(agent.skill_ids or [])
        configured_lines: list[str] = []
        other_names: list[str] = []
        for skill in installed_skills:
            name = skill.get("name", "")
            if not name:
                continue
            if name in configured_ids:
                description = _skill_description(skill)
                configured_lines.append(f"- **{name}**: {description}" if description else f"- **{name}**")
            else:
                other_names.append(name)
        lines = ["", "## Skills", "Installed skills can be read when relevant."]
        if configured_lines:
            lines.append("Configured skills:")
            lines.extend(configured_lines)
        if other_names:
            lines.append("Other installed skills:")
            lines.extend(f"- {name}" for name in other_names[:25])
        return "\n".join(lines)

    async def _load_tools(self, db: AsyncSession, agent: Any) -> LoadedTools:
        openai_tools: list[dict[str, Any]] = []
        fn_name_to_tool_info: dict[str, dict[str, Any]] = {}

        if not agent.tools_enabled:
            return LoadedTools(openai_tools=openai_tools, fn_name_to_tool_info=fn_name_to_tool_info)

        try:
            raw_tools = await tool_dispatcher.list_tools()
            if agent.allowed_tools is not None:
                allowed = set(agent.allowed_tools)
                raw_tools = [tool for tool in raw_tools if tool["id"] in allowed]
            for tool in raw_tools:
                fn_name_to_tool_info[_tool_id_to_fn_name(tool["id"])] = {"type": "builtin", "tool_id": tool["id"], "risk_level": tool.get("risk_level", "low")}
            openai_tools.extend(_tools_to_openai_schema(raw_tools))
        except Exception as exc:
            logger.warning("Failed to load tool-server registry: %s", exc)

        try:
            from openforge.services.mcp_service import get_enabled_servers_with_overrides
            for server, overrides in await get_enabled_servers_with_overrides(db):
                assert isinstance(server, MCPServer)
                assert isinstance(overrides, dict)
                for raw_tool in server.discovered_tools or []:
                    tool_name = raw_tool.get("name", "")
                    if not tool_name:
                        continue
                    override = overrides.get(tool_name)
                    if isinstance(override, MCPToolOverride) and not override.is_enabled:
                        continue
                    fn_name = _mcp_tool_fn_name(str(server.id), tool_name)
                    schema = raw_tool.get("inputSchema") or {"type": "object", "properties": {}}
                    fn_name_to_tool_info[fn_name] = {"type": "mcp", "server_id": str(server.id), "tool_name": tool_name, "risk_level": override.risk_level if isinstance(override, MCPToolOverride) else server.default_risk_level}
                    openai_tools.append({"type": "function", "function": {"name": fn_name, "description": raw_tool.get("description", ""), "parameters": schema}})
        except Exception as exc:
            logger.warning("Failed to load MCP tool registry: %s", exc)

        return LoadedTools(openai_tools=openai_tools, fn_name_to_tool_info=fn_name_to_tool_info)

    async def execute_subagent(
        self,
        *,
        workspace_id: UUID,
        instruction: str,
        db: AsyncSession,
        agent_id: str | None = None,
        parent_execution_id: str | None = None,
        parent_conversation_id: UUID | None = None,
        parent_workspace_id: UUID | None = None,
        scope_path: list[int] | None = None,
        execution_chain_id: str | None = None,
    ) -> dict[str, Any]:
        del parent_execution_id, parent_conversation_id, parent_workspace_id, scope_path, execution_chain_id

        # Resolve target agent via agent_registry
        target_spec = None
        if agent_id:
            target_spec = await agent_registry.resolve(db, slug=agent_id)
        if target_spec is None:
            target_spec = await agent_registry.resolve_for_workspace(db, workspace_id)

        _subagent_id = str(target_spec.agent_id) if target_spec else "workspace_agent"

        conversation = Conversation(
            workspace_id=workspace_id,
            title=f"[delegated] {instruction[:80]}",
            is_subagent=True,
            subagent_agent_id=_subagent_id,
        )
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)

        execution_id = str(uuid.uuid4())
        await self.run(
            workspace_id=workspace_id,
            conversation_id=conversation.id,
            user_content=instruction,
            db=db,
            execution_id=execution_id,
            mentions=[],
        )

        latest_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation.id, Message.role == "assistant")
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        message = latest_result.scalar_one_or_none()
        return {
            "response": message.content if message else "",
            "timeline": message.timeline if message and message.timeline else [],
            "conversation_id": str(conversation.id),
        }

    async def run(
        self,
        workspace_id: UUID | None,
        conversation_id: UUID,
        user_content: str,
        db: AsyncSession,
        agent: Any = None,
        execution_id: str | None = None,
        attachment_ids: list[str] | None = None,
        provider_id: str | None = None,
        model_id: str | None = None,
        mentions: list[dict[str, Any]] | None = None,
        optimize: bool = False,
    ) -> None:
        """Main chat execution loop.

        Resolves agent via agent_registry → AgentRuntimeConfig → _AgentCompat wrapper.
        Context assembly, LLM resolution, tool loop, message save.
        workspace_id is None for global (workspace-agnostic) conversations.
        """
        if execution_id is None:
            execution_id = str(uuid.uuid4())

        cancel_event = asyncio.Event()
        self._cancel_events[str(conversation_id)] = cancel_event
        cancel_subscriptions: list[tuple[str, tuple[Any, Any, asyncio.Task] | None]] = []
        try:
            cancel_subscriptions.append((str(conversation_id), await self._subscribe_redis_cancel(str(conversation_id), cancel_event)))
        except Exception as exc:
            logger.debug("Conversation cancel subscription unavailable: %s", exc)

        # Resolve agent via agent_registry → AgentRuntimeConfig → _AgentCompat
        if agent is None:
            if workspace_id is not None:
                # Workspace-scoped chat: resolve workspace's default agent
                try:
                    compiled_spec = await agent_registry.resolve_for_workspace(db, workspace_id)
                    if compiled_spec is not None:
                        agent = _AgentCompat(compiled_spec)
                        logger.debug("Resolved agent via agent_registry for workspace %s: %s", workspace_id, compiled_spec.agent_slug)
                except Exception as exc:
                    logger.debug("agent_registry.resolve_for_workspace failed: %s", exc)
            else:
                # Global chat: resolve from conversation's agent_id
                conversation_for_agent = await db.get(Conversation, conversation_id)
                if conversation_for_agent and conversation_for_agent.agent_id:
                    try:
                        compiled_spec = await agent_registry.resolve(db, agent_id=conversation_for_agent.agent_id)
                        if compiled_spec is not None:
                            agent = _AgentCompat(compiled_spec)
                            logger.debug("Resolved agent for global chat: %s", compiled_spec.agent_slug)
                    except Exception as exc:
                        logger.debug("agent_registry.resolve for global chat failed: %s", exc)

        if agent is None:
            await self._publish(
                execution_id,
                workspace_id,
                "agent_error",
                conversation_id=conversation_id,
                detail="Agent could not be resolved",
            )
            self._cancel_events.pop(str(conversation_id), None)
            self._cancel_content.pop(str(conversation_id), None)
            for channel_key, subscription in cancel_subscriptions:
                await self._teardown_cancel_listener(subscription, channel_key)
            return

        conversation = await db.get(Conversation, conversation_id)
        if conversation is None or conversation.workspace_id != workspace_id or conversation.is_archived:
            await self._publish(execution_id, workspace_id, "agent_error", conversation_id=conversation_id, detail="Conversation not found")
            self._cancel_events.pop(str(conversation_id), None)
            self._cancel_content.pop(str(conversation_id), None)
            for channel_key, subscription in cancel_subscriptions:
                await self._teardown_cancel_listener(subscription, channel_key)
            return

        existing_execution = await db.get(AgentExecution, UUID(execution_id))
        if existing_execution is None:
            db.add(AgentExecution(id=UUID(execution_id), workspace_id=workspace_id, conversation_id=conversation_id, agent_id=agent.id, status="running"))
            await db.commit()
        else:
            await self._update_execution_record(db, execution_id, status="running", agent_id=agent.id)

        # Initialize stream state early so the UI can show progress
        await self._update_stream_state(execution_id, content="", thinking="", tool_calls=[], sources=[], attachments_processed=[], timeline=[])

        # Check for existing user message (global chat creates it before dispatching)
        user_message = None
        latest_user_result = await db.execute(
            select(Message).where(Message.conversation_id == conversation_id, Message.role == "user").order_by(Message.created_at.desc()).limit(1)
        )
        user_message = latest_user_result.scalar_one_or_none()
        if user_message is None:
            user_message = await conversation_service.add_message(db, conversation_id, role="user", content=user_content, provider_metadata={"optimize": True} if optimize else None)

        resolved_provider_id = provider_id or agent.provider_override_id
        resolved_model_id = model_id or agent.model_override
        provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
            db,
            workspace_id,
            provider_id=resolved_provider_id,
            model_override=resolved_model_id,
        )

        try:
            attachment_context = ""
            attachments_processed: list[dict[str, Any]] = []
            history = await conversation_service.get_recent_messages(
                db,
                conversation_id,
                limit=max(agent.history_limit, 12),
            )
            input_values: dict[str, Any] = {}
            if hasattr(agent, "_spec") and getattr(agent._spec, "is_parameterized", False) and getattr(agent._spec, "input_schema", None):
                extraction = await extract_parameter_values(
                    agent._spec.input_schema,
                    user_content,
                    conversation_history=history,
                    provider_name=provider_name,
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                )
                input_values = extraction.get("extracted", {}) or {}
                if not extraction.get("all_filled"):
                    follow_up = (extraction.get("follow_up") or "I need a few more details before I can continue.").strip()
                    follow_up_message = await conversation_service.add_message(
                        db,
                        conversation_id,
                        role="assistant",
                        content=follow_up,
                        trigger_auto_title=False,
                    )
                    follow_up_timeline = [
                        {
                            "type": "follow_up_request",
                            "missing_inputs": extraction.get("missing", []),
                            "content": follow_up,
                        }
                    ]
                    await self._update_execution_record(
                        db,
                        execution_id,
                        status="paused",
                        iteration_count=0,
                        tool_calls_count=0,
                        timeline=follow_up_timeline,
                    )
                    await self._update_stream_state(
                        execution_id,
                        content=follow_up,
                        thinking="",
                        tool_calls=[],
                        sources=[],
                        attachments_processed=[],
                        timeline=follow_up_timeline,
                    )
                    await self._publish(
                        execution_id,
                        workspace_id,
                        "agent_done",
                        conversation_id=conversation_id,
                        message_id=str(follow_up_message.id),
                        interrupted=False,
                        waiting_for_input=True,
                    )
                    return

            if agent.attachment_support:
                attachment_context, attachments_processed = await self._process_message_attachments(
                    db,
                    workspace_id=workspace_id,
                    conversation_id=conversation_id,
                    user_message_id=user_message.id,
                    attachment_ids=attachment_ids,
                )

            url_context = ""
            url_attachments_processed: list[dict[str, Any]] = []
            if agent.auto_bookmark_urls:
                urls = extract_http_urls(user_content)
                if urls:
                    url_context, url_attachments_processed = await self._extract_urls_for_chat(workspace_id=workspace_id, user_message_id=user_message.id, urls=urls)

            mention_context = ""
            if agent.mention_support:
                mention_context = await self._resolve_mentions(db, workspace_id, mentions)

            all_attachments_processed = attachments_processed + url_attachments_processed
            if all_attachments_processed:
                await self._publish(execution_id, workspace_id, "agent_attachments_processed", conversation_id=conversation_id, data=all_attachments_processed)
                await self._update_stream_state(execution_id, attachments_processed=all_attachments_processed)

            # ── Build system variable context for template rendering ──
            # System variables are structured lists so templates can loop over them.
            workspaces_data: list[dict] = []
            agents_data: list[dict] = []
            tools_data: list[dict] = []
            skills_data: list[dict] = []
            installed_skills: list[dict] = []
            try:
                from openforge.db.models import Workspace as _Workspace, Knowledge as _Knowledge
                from sqlalchemy import func as _func

                ws_stmt = (
                    select(
                        _Workspace,
                        _func.count(_Knowledge.id).label("knowledge_count"),
                    )
                    .outerjoin(_Knowledge, _Knowledge.workspace_id == _Workspace.id)
                    .group_by(_Workspace.id)
                    .order_by(_Workspace.sort_order)
                )
                ws_results = (await db.execute(ws_stmt)).all()
                for ws, k_count in ws_results:
                    workspaces_data.append({
                        "id": str(ws.id),
                        "name": ws.name,
                        "description": ws.description or "",
                        "knowledge_count": k_count,
                    })
            except Exception:
                pass

            try:
                available = await agent_registry.list_available_agents(db)
                for a in available:
                    if a["id"] != agent.id:
                        agents_data.append({
                            "id": str(a["id"]),
                            "slug": a.get("slug", ""),
                            "name": a.get("name", ""),
                            "description": a.get("description", ""),
                            "tags": a.get("tags", []),
                        })
            except Exception:
                pass

            try:
                raw_tools = await tool_dispatcher.list_tools()
                for t in (raw_tools or []):
                    tools_data.append({
                        "id": t["id"],
                        "name": t.get("name", t["id"]),
                        "description": (t.get("description", "") or "")[:120],
                        "category": t.get("category", ""),
                    })
            except Exception:
                pass

            try:
                installed_skills = await tool_dispatcher.list_skills()
                for s in (installed_skills or []):
                    skills_data.append({
                        "id": s.get("id", ""),
                        "name": s.get("name", s.get("id", "")),
                        "description": (s.get("description", "") or "")[:120],
                    })
            except Exception:
                installed_skills = []

            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            system_vars: dict = {
                "system.agent_name": agent.name,
                "system.agent_description": getattr(agent, 'description', '') or '',
                "system.agent_slug": getattr(agent, 'slug', agent.id),
                "system.timestamp": now.isoformat(),
                "system.date": now.strftime("%Y-%m-%d"),
                "system.workspaces": workspaces_data,
                "system.tools": tools_data,
                "system.skills": skills_data,
                "system.agents": agents_data,
            }

            # Merge system vars with user-provided input values
            all_template_vars = {**system_vars, **(input_values or {})}

            # ── Inject input/output definitions into template vars ──
            # (must happen before rendering the user's system prompt so
            #  {{system.input_schema}}, {{system.output_definitions}}, and
            #  {{output.<key>}} references work inside the editable section)
            spec = getattr(agent, '_spec', None)
            input_schema = spec.input_schema if spec else []
            output_defs = spec.output_definitions if spec else []

            all_template_vars["system.input_schema"] = input_schema
            all_template_vars["system.output_definitions"] = output_defs

            # Populate output.* namespace so users can reference output
            # variable keys inline in prompts (e.g. {{output.analysis}})
            output_ns: dict[str, str] = {}
            for od in output_defs:
                key = od.get("key") or od.get("name", "")
                if key:
                    label = od.get("label") or key
                    output_ns[key] = f"the `{key}` output"
            all_template_vars["output"] = output_ns

            # ── Resolve system prompt from agent spec or fallback ──
            if hasattr(agent, '_spec'):
                base_system_prompt = agent._spec.system_prompt or "You are a helpful AI assistant."
                system_prompt = render_template(base_system_prompt, all_template_vars).output
            else:
                system_prompt = getattr(agent, 'system_prompt', None) or "You are a helpful AI assistant."

            # ── Build preamble via template rendering ──

            _PREAMBLE_TEMPLATE = (
                "# Agent: {{system.agent_name}}\n"
                "You are **{{system.agent_name}}**"
                "{% if system.agent_description %}"
                " — {{system.agent_description}}."
                "{% else %}"
                ", an AI agent in OpenForge."
                "{% endif %}\n"
                "You are running on the **OpenForge** platform."
                "{% if system.input_schema %}\n\n"
                "## Input Variables\n"
                "{% for p in system.input_schema %}"
                "- `{{p.name}}` ({{p.type}}"
                "{% if p.required %}, required{% endif %}"
                ")"
                "{% if p.description %} — {{p.description}}{% endif %}\n"
                "{% endfor %}"
                "{% endif %}"
                "{% if system.output_definitions %}\n\n"
                "## Output Variables\n"
                "You MUST structure your final response so the system can extract these output variables:\n"
                "{% for out in system.output_definitions %}"
                "- `{{out.key}}` ({{out.type}})"
                "{% if out.label %} — {{out.label}}{% endif %}\n"
                "{% endfor %}\n"
                "Wrap your structured output in a fenced block:\n"
                "```output\n{\n"
                "{% for out in system.output_definitions %}"
                "  \"{{out.key}}\": <{{out.type}} value>"
                "{% if not loop.last %},{% endif %}\n"
                "{% endfor %}"
                "}\n```"
                "{% endif %}"
            )
            preamble = render_template(_PREAMBLE_TEMPLATE, all_template_vars).output.strip()

            # ── Build postamble via template rendering ──
            # Add workspace context and optimization flag to template vars
            if workspace_id is None:
                ws_context = (
                    "You are running in a workspace-agnostic context. "
                    "When using workspace tools, you MUST pass the `workspace_id` parameter."
                )
            else:
                ws_context = (
                    f"You are operating in workspace `{workspace_id}`. "
                    "Workspace tools default to this workspace, but you can pass a different `workspace_id`."
                )
            all_template_vars["system.workspace_context"] = ws_context
            all_template_vars["system.tools_enabled"] = agent.tools_enabled
            all_template_vars["system.optimize"] = optimize and agent.id != "optimizer_agent"

            _POSTAMBLE_TEMPLATE = (
                "# OpenForge Application Context\n\n"
                "{% if system.workspaces %}"
                "## Available Workspaces\n"
                "{{system.workspace_context}}\n"
                "{% for ws in system.workspaces %}"
                "- **{{ws.name}}** (id: `{{ws.id}}`"
                "{% if ws.knowledge_count %}, {{ws.knowledge_count}} knowledge items{% endif %}"
                ")"
                "{% if ws.description %}: {{ws.description}}{% endif %}\n"
                "{% endfor %}\n"
                "{% endif %}"
                "{% if contains(system.tools, \"agent.invoke\") %}\n"
                "## Available Agents\n"
                "You can invoke these agents via the `agent.invoke` tool:\n"
                "{% for ag in system.agents %}"
                "- **{{ag.slug}}**{% if ag.tags %} [{{join(ag.tags, \", \")}}]{% endif %}: {{ag.description}}\n"
                "{% endfor %}\n"
                "{% endif %}"
                "{% if system.tools_enabled == false %}\n"
                "## Tooling disabled\n"
                "Do not claim to search workspace knowledge or use tools. "
                "Respond using conversation context and model knowledge only.\n"
                "{% endif %}"
                "{% if system.skills %}\n"
                "## Available Skills\n"
                "If there are relevant skills, use tools to read the skills to enhance your ability to tackle the request.\n"
                "{% for sk in system.skills %}"
                "- `{{sk.name}}`: {{sk.description}}\n"
                "{% endfor %}"
                "{% endif %}"
                "{% if system.optimize %}\n"
                "## Prompt optimization required\n"
                "Before doing anything else, call `agent.invoke` with `agent_id=\"optimizer_agent\"` "
                "and the user's exact message as `instruction`. Use the optimized result instead of the original prompt.\n"
                "{% endif %}"
            )
            postamble = render_template(_POSTAMBLE_TEMPLATE, all_template_vars).output.strip()

            # ── Assemble final system prompt: preamble + user prompt + postamble ──
            final_parts = [preamble, system_prompt]
            if postamble:
                final_parts.append(postamble)
            system_prompt = "\n\n---\n\n".join(final_parts)

            context_parts = [part for part in [attachment_context, url_context, mention_context] if part]
            loop_messages = context_assembler.assemble(
                system_prompt=system_prompt,
                conversation_messages=history,
                explicit_context="\n".join(context_parts) if context_parts else None,
            )

            tools = await self._load_tools(db, agent)
            execution_started_payload = {"agent_id": agent.id, "agent_name": agent.name}
            await self._publish(execution_id, workspace_id, "execution_started", conversation_id=conversation_id, **execution_started_payload)

            provider_display_name = provider_name
            try:
                provider_result = await db.execute(select(LLMProvider).where(LLMProvider.provider_name == provider_name).limit(1))
                provider_row = provider_result.scalar_one_or_none()
                if provider_row is not None and provider_row.display_name:
                    provider_display_name = provider_row.display_name
            except Exception:
                pass

            model_selection_entry = {
                "type": "model_selection",
                "provider_name": provider_name,
                "provider_display_name": provider_display_name,
                "model": model,
                "is_override": bool(provider_id or model_id or agent.provider_override_id or agent.model_override),
            }

            context_sources: list[dict[str, Any]] = []
            rate_limiter = ToolCallRateLimiter(max_per_minute=agent.max_tool_calls_per_minute, max_per_execution=agent.max_tool_calls_per_execution)
            generation_started = time.perf_counter()

            await self._publish(execution_id, workspace_id, "agent_model_selection", conversation_id=conversation_id, data=model_selection_entry)
            await self._update_stream_state(execution_id, timeline=[model_selection_entry])

            # Build ToolLoopContext and streaming callbacks
            from openforge.runtime.tool_loop import ToolLoopContext, ToolLoopCallbacks, ToolLoopResult, execute_tool_loop

            # Pre-create the result object so callbacks can reference live state
            loop_result = ToolLoopResult()

            # Build agent_spec for tool_loop (may be None for legacy agents)
            _agent_spec = None
            if workspace_id is not None:
                try:
                    _agent_spec = await agent_registry.resolve_for_workspace(db, workspace_id)
                except Exception:
                    pass
            if _agent_spec is None and hasattr(agent, '_spec'):
                _agent_spec = agent._spec

            loop_ctx = ToolLoopContext(
                workspace_id=workspace_id,
                conversation_id=conversation_id,
                execution_id=execution_id,
                agent_spec=_agent_spec,
                tools=tools,
                rate_limiter=rate_limiter,
                policy_engine=policy_engine,
                hitl_service=hitl_service,
                cancel_event=cancel_event,
                db=db,
            )

            def _effective_content() -> str:
                """Return only the non-intermediate portion of the response for stream state."""
                total = loop_result.intermediate_response_total
                return loop_result.full_response[total:] if total > 0 else loop_result.full_response

            async def _cb_thinking(chunk: str) -> None:
                await self._publish(execution_id, workspace_id, "agent_thinking", conversation_id=conversation_id, data=chunk)
                await self._update_stream_state(execution_id, content=_effective_content(), thinking=loop_result.full_thinking, tool_calls=loop_result.tool_calls, sources=context_sources, attachments_processed=all_attachments_processed, timeline=[model_selection_entry] + loop_result.timeline)

            async def _cb_token(token: str) -> None:
                await self._publish(execution_id, workspace_id, "agent_token", conversation_id=conversation_id, data=token)
                await self._update_stream_state(execution_id, content=_effective_content(), thinking=loop_result.full_thinking, tool_calls=loop_result.tool_calls, sources=context_sources, attachments_processed=all_attachments_processed, timeline=[model_selection_entry] + loop_result.timeline)

            async def _cb_tool_start(call_id: str, tool_id: str, arguments: dict) -> None:
                await self._publish(execution_id, workspace_id, "agent_tool_call_start", conversation_id=conversation_id, data={"call_id": call_id, "tool_name": tool_id, "arguments": arguments})
                await self._update_stream_state(execution_id, content=_effective_content(), thinking=loop_result.full_thinking, tool_calls=loop_result.tool_calls, sources=context_sources, attachments_processed=all_attachments_processed, timeline=[model_selection_entry] + loop_result.timeline)

            async def _cb_tool_result(call_id: str, tool_id: str, success: bool, error: str | None, output: Any = None, duration_ms: int | None = None, nested_timeline: list | None = None, delegated_conversation_id: str | None = None) -> None:
                await self._publish(execution_id, workspace_id, "agent_tool_call_result", conversation_id=conversation_id, data={"call_id": call_id, "tool_name": tool_id, "success": success, "error": error, "output": output, "duration_ms": duration_ms, "nested_timeline": nested_timeline, "delegated_conversation_id": delegated_conversation_id})
                await self._update_stream_state(execution_id, content=_effective_content(), thinking=loop_result.full_thinking, tool_calls=loop_result.tool_calls, sources=context_sources, attachments_processed=all_attachments_processed, timeline=[model_selection_entry] + loop_result.timeline)

            async def _cb_hitl_request(call_id: str, hitl_id: str, action_summary: str, risk_level: str) -> None:
                await self._publish(execution_id, workspace_id, "agent_tool_hitl", conversation_id=conversation_id, data={"call_id": call_id, "hitl_id": hitl_id, "action_summary": action_summary, "risk_level": risk_level, "agent_id": agent.id, "status": "pending"})
                await self._update_execution_record(db, execution_id, status="paused_hitl")

            async def _cb_hitl_resolved(call_id: str, hitl_id: str, approved: bool, note: str) -> None:
                await self._publish(execution_id, workspace_id, "agent_tool_hitl_resolved", conversation_id=conversation_id, data={"call_id": call_id, "hitl_id": hitl_id, "status": "approved" if approved else "denied", "resolution_note": note or None})
                await self._update_execution_record(db, execution_id, status="running")

            async def _cb_intermediate_response(content: str) -> None:
                await self._publish(execution_id, workspace_id, "agent_intermediate_response", conversation_id=conversation_id, data={"content": content})

            callbacks = ToolLoopCallbacks(
                on_thinking=_cb_thinking,
                on_token=_cb_token,
                on_tool_start=_cb_tool_start,
                on_tool_result=_cb_tool_result,
                on_hitl_request=_cb_hitl_request,
                on_hitl_resolved=_cb_hitl_resolved,
                on_intermediate_response=_cb_intermediate_response,
            )

            loop_result = await execute_tool_loop(
                ctx=loop_ctx,
                messages=loop_messages,
                callbacks=callbacks,
                llm_kwargs={"provider_name": provider_name, "api_key": api_key, "model": model, "base_url": base_url},
                max_iterations=agent.max_iterations,
                llm_gateway=llm_gateway,
                tool_dispatcher=tool_dispatcher,
                result=loop_result,
            )

            full_response = loop_result.full_response
            full_thinking = loop_result.full_thinking
            all_tool_calls = loop_result.tool_calls
            tool_calls_count = len(all_tool_calls)
            was_cancelled = loop_result.was_cancelled
            intermediate_response_total = loop_result.intermediate_response_total
            timeline = [model_selection_entry] + loop_result.timeline

            # Persist tool call logs for interactive mode
            for entry in loop_result.timeline:
                if entry.get("type") == "tool_call" and entry.get("success") is not None:
                    asyncio.create_task(
                        _persist_tool_call_log(
                            workspace_id=workspace_id,
                            conversation_id=conversation_id,
                            call_id=entry.get("call_id", ""),
                            tool_name=entry.get("tool_name", ""),
                            arguments=entry.get("arguments", {}),
                            success=entry.get("success", False),
                            output=entry.get("output"),
                            error=entry.get("error"),
                            duration_ms=entry.get("duration_ms", 0),
                            started_at=datetime.now(timezone.utc),
                            finished_at=datetime.now(timezone.utc),
                        )
                    )

            final_response = full_response[intermediate_response_total:].strip() if intermediate_response_total > 0 else full_response.strip()

            if not was_cancelled and not final_response and (all_tool_calls or full_thinking.strip() or intermediate_response_total > 0):
                try:
                    async for event in llm_gateway.stream_with_tools(messages=loop_messages, tools=[], provider_name=provider_name, api_key=api_key, model=model, base_url=base_url, include_thinking=False):
                        if event.get("type") == "token":
                            token = event.get("content", "")
                            if token:
                                full_response += token
                                await self._publish(execution_id, workspace_id, "agent_token", conversation_id=conversation_id, data=token)
                                _eff = full_response[intermediate_response_total:] if intermediate_response_total > 0 else full_response
                                await self._update_stream_state(execution_id, content=_eff, thinking=full_thinking, tool_calls=all_tool_calls, sources=context_sources, attachments_processed=all_attachments_processed, timeline=timeline)
                except Exception as exc:
                    logger.warning("Final summary turn failed: %s", exc)
                final_response = full_response[intermediate_response_total:].strip() if intermediate_response_total > 0 else full_response.strip()

            generation_ms = int((time.perf_counter() - generation_started) * 1000)
            # If cancelled with empty backend response, use frontend's partial content as fallback
            if was_cancelled and not final_response.strip():
                cancel_content = self.pop_cancel_content(conversation_id)
                if cancel_content:
                    final_response = cancel_content
            await conversation_service.add_message(db, conversation_id, role="assistant", content=final_response, thinking=full_thinking.strip() or None, model_used=model, provider_used=provider_name, token_count=llm_gateway.count_tokens(final_response), generation_ms=generation_ms, context_sources=context_sources, tool_calls=all_tool_calls or None, timeline=timeline or None, is_interrupted=was_cancelled)

            status_value = "cancelled" if was_cancelled else "completed"
            await self._update_execution_record(db, execution_id, status=status_value, iteration_count=max(len([entry for entry in timeline if entry.get("type") == "thinking"]), 1), tool_calls_count=tool_calls_count, timeline=timeline, completed_at=datetime.now(timezone.utc))
            await self._update_stream_state(execution_id, content=final_response, thinking=full_thinking, tool_calls=all_tool_calls, sources=context_sources, attachments_processed=all_attachments_processed, timeline=timeline)
            await self._publish(execution_id, workspace_id, "execution_completed", conversation_id=conversation_id, status=status_value)
            await self._publish(execution_id, workspace_id, "agent_done", conversation_id=conversation_id, message_id="", interrupted=was_cancelled)
        except Exception as exc:
            logger.exception("Agent execution %s failed", execution_id)
            await self._update_execution_record(db, execution_id, status="failed", error_message=str(exc), completed_at=datetime.now(timezone.utc))
            await self._publish(execution_id, workspace_id, "agent_error", conversation_id=conversation_id, detail=str(exc))
        finally:
            self._cancel_events.pop(str(conversation_id), None)
            self._cancel_content.pop(str(conversation_id), None)
            for channel_key, subscription in cancel_subscriptions:
                await self._teardown_cancel_listener(subscription, channel_key)


chat_handler = ChatHandler()
