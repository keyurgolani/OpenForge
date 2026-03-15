"""Transitional runtime execution engine for chat interactions.

This module intentionally lives under ``openforge.runtime`` rather than the
deleted legacy service package. It keeps the chat/tool/HITL surface working
through Phase 4 while Profiles, Workflows, Missions, and Runs continue to take
over long-term execution ownership.
"""

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
from openforge.domains.prompts.service import resolve_profile_system_prompt
from openforge.runtime.hitl import hitl_service
from openforge.runtime.policy import ToolCallRateLimiter, policy_engine
from openforge.runtime.profile_registry import ResolvedAgentProfile, profile_registry
from openforge.services.attachment_pipeline import extract_http_urls, get_extractor, resolve_attachment_pipeline
from openforge.services.conversation_service import conversation_service
from openforge.services.llm_service import llm_service

logger = logging.getLogger("openforge.runtime.execution_engine")

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
    if len(value) <= limit:
        return value
    return value[:limit] + "..."


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


async def _persist_tool_call_log(
    *,
    workspace_id: UUID,
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


@dataclass
class LoadedTools:
    openai_tools: list[dict[str, Any]]
    fn_name_to_tool_info: dict[str, dict[str, Any]]


class AgentExecutionEngine:
    """Runtime-owned transitional chat execution engine."""

    def __init__(self) -> None:
        self._cancel_events: dict[str, asyncio.Event] = {}
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
        workspace_id: UUID,
        event_type: str,
        *,
        conversation_id: UUID | None = None,
        **data: Any,
    ) -> None:
        event = {
            "type": event_type,
            "execution_id": execution_id,
            "workspace_id": str(workspace_id),
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

        await ws_manager.send_to_workspace(str(workspace_id), event)

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
        result = await db.execute(
            select(AgentExecution)
            .where(
                AgentExecution.conversation_id == conversation_id,
                AgentExecution.status.in_(["queued", "running", "paused_hitl"]),
            )
            .order_by(AgentExecution.started_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_stream_state(self, workspace_id: UUID, conversation_id: UUID) -> dict[str, Any]:
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
                payload.update(
                    {
                        "content": state.get("content", ""),
                        "thinking": state.get("thinking", ""),
                        "tool_calls": json.loads(state.get("tool_calls", "[]")),
                        "sources": json.loads(state.get("sources", "[]")),
                        "attachments_processed": json.loads(state.get("attachments_processed", "[]")),
                        "timeline": json.loads(state.get("timeline", "[]")),
                    }
                )
        except Exception as exc:
            logger.warning("Failed to load stream state for %s: %s", exec_record.id, exc)
        return payload

    async def send_stream_snapshot(
        self,
        websocket: WebSocket,
        workspace_id: UUID,
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

    def cancel(self, conversation_id: UUID) -> None:
        event = self._cancel_events.get(str(conversation_id))
        if event is not None:
            event.set()

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
        workspace_id: UUID,
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
                processed.append(
                    {
                        "id": str(raw_attachment_id),
                        "filename": "unknown",
                        "status": "failed",
                        "pipeline": "unknown",
                        "details": "Invalid attachment id",
                    }
                )
                continue

            result = await db.execute(select(MessageAttachment).where(MessageAttachment.id == attachment_id))
            attachment = result.scalar_one_or_none()
            if attachment is None:
                processed.append(
                    {
                        "id": str(attachment_id),
                        "filename": "unknown",
                        "status": "missing",
                        "pipeline": "unknown",
                        "details": "Attachment record not found",
                    }
                )
                continue

            extractor = get_extractor(content_type=attachment.content_type, filename=attachment.filename)
            pipeline = extractor.pipeline if extractor is not None else resolve_attachment_pipeline(
                content_type=attachment.content_type,
                filename=attachment.filename,
            )
            status = "deferred"
            details = "Pipeline not available yet for this file type"

            if attachment.message_id is None:
                attachment.message_id = user_message_id
                db_updated = True

            task_log_id = None
            if extractor is not None:
                try:
                    async with AsyncSessionLocal() as audit_db:
                        task_log = await start_task_log(
                            audit_db,
                            task_type="extract_attachment_content",
                            workspace_id=workspace_id,
                            target_link=f"/w/{workspace_id}/conversations/{conversation_id}",
                        )
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
                        context_blocks.append(
                            f"\n--- Content from {attachment.filename} ---\n{extracted_text}\n--- End of {attachment.filename} ---\n"
                        )
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

            processed.append(
                {
                    "id": str(attachment.id),
                    "filename": attachment.filename,
                    "status": status,
                    "pipeline": pipeline,
                    "details": details,
                    "extracted_text": (attachment.extracted_text or "")[:5000] or None,
                }
            )

        if db_updated:
            await db.commit()

        if not context_blocks:
            return "", processed
        return "\n\nThe user attached the following file content:\n" + "\n".join(context_blocks), processed

    async def _extract_urls_for_chat(
        self,
        *,
        workspace_id: UUID,
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
                    task_log = await start_task_log(
                        audit_db,
                        task_type="extract_url_content",
                        workspace_id=workspace_id,
                        target_link=url,
                    )
                    task_log_id = task_log.id
                    await audit_db.commit()

                try:
                    result = await asyncio.wait_for(
                        knowledge_processing_service.extract_url_content_raw(url),
                        timeout=20,
                    )
                except asyncio.TimeoutError:
                    raise RuntimeError("Extraction timed out after 20s")

                content = (result.get("content") or "").strip()
                title = result.get("title") or result.get("resolved_url") or url
                resolved_url = result.get("resolved_url") or url
                attachment_id = uuid.uuid4()

                async with AsyncSessionLocal() as att_db:
                    att_db.add(
                        MessageAttachment(
                            id=attachment_id,
                            message_id=user_message_id,
                            filename=title[:500],
                            content_type="text/url-extract",
                            file_size=len(content.encode()),
                            file_path="",
                            source_url=resolved_url,
                            extracted_text=content or None,
                        )
                    )
                    await att_db.commit()

                if content:
                    context_blocks.append(
                        f"\n--- Content from {title} ---\n{content}\n--- End of {title} ---\n"
                    )
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

                url_attachments.append(
                    {
                        "id": str(attachment_id),
                        "filename": title,
                        "status": status,
                        "pipeline": "url_extract",
                        "details": details,
                        "source_url": url,
                        "extracted_text": content[:5000] if content else None,
                    }
                )
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
                url_attachments.append(
                    {
                        "id": str(uuid.uuid4()),
                        "filename": url,
                        "status": "failed",
                        "pipeline": "url_extract",
                        "details": str(exc)[:200],
                        "source_url": url,
                    }
                )

        if not context_blocks:
            return "", url_attachments
        header = (
            "\n\nThe following URLs were shared by the user. Their content is already extracted below. "
            "Do not call fetch or browse tools to retrieve these same URLs again.\n"
        )
        return header + "\n".join(context_blocks), url_attachments

    async def _resolve_mentions(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        mentions: list[dict[str, Any]] | None,
    ) -> str:
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

    def _build_skills_section(self, installed_skills: list[dict[str, Any]], agent: ResolvedAgentProfile) -> str:
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

        lines = [
            "",
            "## Skills",
            "Installed skills can be read when relevant.",
        ]
        if configured_lines:
            lines.append("Configured skills:")
            lines.extend(configured_lines)
        if other_names:
            lines.append("Other installed skills:")
            lines.extend(f"- {name}" for name in other_names[:25])
        return "\n".join(lines)

    async def _load_tools(self, db: AsyncSession, agent: ResolvedAgentProfile) -> LoadedTools:
        openai_tools: list[dict[str, Any]] = []
        fn_name_to_tool_info: dict[str, dict[str, Any]] = {}

        if not agent.tools_enabled:
            return LoadedTools(openai_tools=openai_tools, fn_name_to_tool_info=fn_name_to_tool_info)

        try:
            raw_tools = await tool_dispatcher.list_tools()
            if agent.allowed_tool_categories:
                allowed_categories = set(agent.allowed_tool_categories) | {"agent"}
                raw_tools = [tool for tool in raw_tools if tool.get("category") in allowed_categories]
            if agent.blocked_tool_ids:
                blocked = set(agent.blocked_tool_ids)
                raw_tools = [tool for tool in raw_tools if tool["id"] not in blocked]

            for tool in raw_tools:
                fn_name_to_tool_info[_tool_id_to_fn_name(tool["id"])] = {
                    "type": "builtin",
                    "tool_id": tool["id"],
                    "risk_level": tool.get("risk_level", "low"),
                }
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
                    fn_name_to_tool_info[fn_name] = {
                        "type": "mcp",
                        "server_id": str(server.id),
                        "tool_name": tool_name,
                        "risk_level": override.risk_level if isinstance(override, MCPToolOverride) else server.default_risk_level,
                    }
                    openai_tools.append(
                        {
                            "type": "function",
                            "function": {
                                "name": fn_name,
                                "description": raw_tool.get("description", ""),
                                "parameters": schema,
                            },
                        }
                    )
        except Exception as exc:
            logger.warning("Failed to load MCP tool registry: %s", exc)

        return LoadedTools(openai_tools=openai_tools, fn_name_to_tool_info=fn_name_to_tool_info)

    async def _wait_for_hitl_resolution(
        self,
        *,
        hitl_id: UUID,
        cancel_event: asyncio.Event,
    ) -> bool:
        async def _wait_cancel() -> None:
            while not cancel_event.is_set():
                await asyncio.sleep(0.25)

        hitl_task = asyncio.create_task(hitl_service.wait_for_decision(str(hitl_id), timeout=300.0))
        cancel_task = asyncio.create_task(_wait_cancel())
        done, pending = await asyncio.wait({hitl_task, cancel_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        if cancel_event.is_set():
            return False
        return hitl_task.result() if hitl_task in done else False

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

        target_agent = profile_registry.get(agent_id) if agent_id else await profile_registry.get_for_workspace(db, workspace_id)
        if target_agent is None:
            target_agent = profile_registry.get_default()

        conversation = Conversation(
            workspace_id=workspace_id,
            title=f"[subagent] {instruction[:80]}",
            is_subagent=True,
            subagent_agent_id=target_agent.id,
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
            agent=target_agent,
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
        workspace_id: UUID,
        conversation_id: UUID,
        user_content: str,
        db: AsyncSession,
        agent: ResolvedAgentProfile | None = None,
        execution_id: str | None = None,
        attachment_ids: list[str] | None = None,
        provider_id: str | None = None,
        model_id: str | None = None,
        mentions: list[dict[str, Any]] | None = None,
        optimize: bool = False,
    ) -> None:
        if execution_id is None:
            execution_id = str(uuid.uuid4())

        cancel_event = asyncio.Event()
        self._cancel_events[str(conversation_id)] = cancel_event
        cancel_subscriptions: list[tuple[str, tuple[Any, Any, asyncio.Task] | None]] = []
        try:
            cancel_subscriptions.append((str(conversation_id), await self._subscribe_redis_cancel(str(conversation_id), cancel_event)))
        except Exception as exc:
            logger.debug("Conversation cancel subscription unavailable: %s", exc)

        if agent is None:
            agent = await profile_registry.get_for_workspace(db, workspace_id)

        conversation = await db.get(Conversation, conversation_id)
        if conversation is None or conversation.workspace_id != workspace_id or conversation.is_archived:
            await self._publish(
                execution_id,
                workspace_id,
                "agent_error",
                conversation_id=conversation_id,
                detail="Conversation not found",
            )
            self._cancel_events.pop(str(conversation_id), None)
            return

        existing_execution = await db.get(AgentExecution, UUID(execution_id))
        if existing_execution is None:
            db.add(
                AgentExecution(
                    id=UUID(execution_id),
                    workspace_id=workspace_id,
                    conversation_id=conversation_id,
                    agent_id=agent.id,
                    status="running",
                )
            )
            await db.commit()
        else:
            await self._update_execution_record(db, execution_id, status="running", agent_id=agent.id)

        user_message = None
        if existing_execution is not None:
            latest_user_result = await db.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id, Message.role == "user")
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            user_message = latest_user_result.scalar_one_or_none()
        if user_message is None:
            user_message = await conversation_service.add_message(
                db,
                conversation_id,
                role="user",
                content=user_content,
                provider_metadata={"optimize": True} if optimize else None,
            )

        try:
            attachment_context = ""
            attachments_processed: list[dict[str, Any]] = []
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
                    url_context, url_attachments_processed = await self._extract_urls_for_chat(
                        workspace_id=workspace_id,
                        user_message_id=user_message.id,
                        urls=urls,
                    )

            mention_context = ""
            if agent.mention_support:
                mention_context = await self._resolve_mentions(db, workspace_id, mentions)

            all_attachments_processed = attachments_processed + url_attachments_processed
            if all_attachments_processed:
                await self._publish(
                    execution_id,
                    workspace_id,
                    "agent_attachments_processed",
                    conversation_id=conversation_id,
                    data=all_attachments_processed,
                )
                await self._update_stream_state(execution_id, attachments_processed=all_attachments_processed)

            history = await conversation_service.get_recent_messages(db, conversation_id, limit=agent.history_limit)
            system_prompt = await resolve_profile_system_prompt(db, agent, context="runtime")

            if agent.id in {"router_agent", "council_agent"}:
                available_agents = [a for a in profile_registry.list_all() if a.id not in {"router_agent", "council_agent"}]
                if available_agents:
                    system_prompt += "\n\n## Available Agents\n" + "\n".join(
                        f"- **{candidate.id}**: {candidate.description}" for candidate in available_agents
                    )

            if not agent.tools_enabled:
                system_prompt += (
                    "\n\n## Tooling disabled\n"
                    "Do not claim to search workspace knowledge or use tools in this workspace. "
                    "Respond using conversation context and model knowledge only."
                )

            try:
                installed_skills = await tool_dispatcher.list_skills()
            except Exception:
                installed_skills = []
            skills_section = self._build_skills_section(installed_skills, agent)
            if skills_section:
                system_prompt += "\n" + skills_section

            if optimize and agent.id != "optimizer_agent":
                system_prompt += (
                    "\n\n## Prompt optimization required\n"
                    "Before doing anything else, call `agent.invoke` with `agent_id=\"optimizer_agent\"` and the "
                    "user's exact message as `instruction`. Use the optimized result instead of the original prompt."
                )

            context_parts = [part for part in [attachment_context, url_context, mention_context] if part]
            loop_messages = context_assembler.assemble(
                system_prompt=system_prompt,
                conversation_messages=history,
                explicit_context="\n".join(context_parts) if context_parts else None,
            )

            resolved_provider_id = provider_id or agent.provider_override_id
            resolved_model_id = model_id or agent.model_override
            provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
                db,
                workspace_id,
                provider_id=resolved_provider_id,
                model_override=resolved_model_id,
            )

            tools = await self._load_tools(db, agent)
            execution_started_payload = {"agent_id": agent.id, "agent_name": agent.name}
            await self._publish(
                execution_id,
                workspace_id,
                "execution_started",
                conversation_id=conversation_id,
                **execution_started_payload,
            )

            provider_display_name = provider_name
            try:
                provider_result = await db.execute(
                    select(LLMProvider).where(LLMProvider.provider_name == provider_name).limit(1)
                )
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

            timeline: list[dict[str, Any]] = [model_selection_entry]
            context_sources: list[dict[str, Any]] = []
            full_response = ""
            full_thinking = ""
            all_tool_calls: list[dict[str, Any]] = []
            tool_calls_count = 0
            rate_limiter = ToolCallRateLimiter(
                max_per_minute=agent.max_tool_calls_per_minute,
                max_per_execution=agent.max_tool_calls_per_execution,
            )
            generation_started = time.perf_counter()
            was_cancelled = False

            await self._publish(
                execution_id,
                workspace_id,
                "agent_model_selection",
                conversation_id=conversation_id,
                data=model_selection_entry,
            )
            await self._update_stream_state(execution_id, timeline=timeline)

            for iteration_index in range(agent.max_iterations):
                if cancel_event.is_set():
                    was_cancelled = True
                    break

                response_this_turn = ""
                thinking_this_turn = ""
                tool_calls_this_turn: list[dict[str, Any]] = []
                finish_reason = "stop"

                async for event in llm_gateway.stream_with_tools(
                    messages=loop_messages,
                    tools=tools.openai_tools,
                    provider_name=provider_name,
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                    include_thinking=True,
                ):
                    if cancel_event.is_set():
                        was_cancelled = True
                        break
                    event_type = event.get("type")
                    if event_type == "thinking":
                        chunk = event.get("content", "")
                        if chunk:
                            full_thinking += chunk
                            thinking_this_turn += chunk
                            await self._publish(
                                execution_id,
                                workspace_id,
                                "agent_thinking",
                                conversation_id=conversation_id,
                                data=chunk,
                            )
                            await self._update_stream_state(
                                execution_id,
                                content=full_response,
                                thinking=full_thinking,
                                tool_calls=all_tool_calls,
                                sources=context_sources,
                                attachments_processed=all_attachments_processed,
                                timeline=timeline,
                            )
                    elif event_type == "token":
                        token = event.get("content", "")
                        if token:
                            full_response += token
                            response_this_turn += token
                            await self._publish(
                                execution_id,
                                workspace_id,
                                "agent_token",
                                conversation_id=conversation_id,
                                data=token,
                            )
                            await self._update_stream_state(
                                execution_id,
                                content=full_response,
                                thinking=full_thinking,
                                tool_calls=all_tool_calls,
                                sources=context_sources,
                                attachments_processed=all_attachments_processed,
                                timeline=timeline,
                            )
                    elif event_type == "tool_calls":
                        tool_calls_this_turn = event.get("calls", [])
                    elif event_type == "done":
                        finish_reason = event.get("finish_reason", "stop")

                if was_cancelled:
                    if thinking_this_turn.strip():
                        timeline.append({"type": "thinking", "content": thinking_this_turn.strip()})
                    break

                if not tool_calls_this_turn or finish_reason == "stop":
                    if thinking_this_turn.strip():
                        timeline.append({"type": "thinking", "content": thinking_this_turn.strip()})
                    break

                if thinking_this_turn.strip():
                    timeline.append({"type": "thinking", "content": thinking_this_turn.strip()})

                tool_results_for_messages: list[dict[str, Any]] = []
                for call in tool_calls_this_turn:
                    if cancel_event.is_set():
                        was_cancelled = True
                        break

                    call_id = call.get("id") or str(uuid.uuid4())
                    fn_name = call.get("name", "")
                    arguments = call.get("arguments") or {}
                    tool_info = tools.fn_name_to_tool_info.get(fn_name)
                    if tool_info and tool_info.get("type") == "builtin":
                        tool_id = tool_info["tool_id"]
                    elif tool_info and tool_info.get("type") == "mcp":
                        tool_id = f"mcp:{tool_info['server_id']}:{tool_info['tool_name']}"
                    else:
                        tool_id = _fn_name_to_tool_id(fn_name)

                    tool_started_at = datetime.now(timezone.utc)
                    timeline_entry = {
                        "type": "tool_call",
                        "call_id": call_id,
                        "tool_name": tool_id,
                        "arguments": arguments,
                        "hitl": None,
                        "success": None,
                        "output": None,
                        "error": None,
                        "duration_ms": None,
                        "nested_timeline": None,
                        "subagent_conversation_id": None,
                    }
                    timeline.append(timeline_entry)
                    tool_entry_idx = len(timeline) - 1
                    all_tool_calls.append({"call_id": call_id, "tool_name": tool_id, "arguments": arguments})
                    tool_calls_count += 1

                    await self._publish(
                        execution_id,
                        workspace_id,
                        "agent_tool_call_start",
                        conversation_id=conversation_id,
                        data={"call_id": call_id, "tool_name": tool_id, "arguments": arguments},
                    )
                    await self._update_execution_record(
                        db,
                        execution_id,
                        iteration_count=iteration_index + 1,
                        tool_calls_count=tool_calls_count,
                    )

                    rate_error = rate_limiter.check()
                    if rate_error:
                        timeline[tool_entry_idx]["success"] = False
                        timeline[tool_entry_idx]["error"] = rate_error
                        await self._publish(
                            execution_id,
                            workspace_id,
                            "agent_tool_call_result",
                            conversation_id=conversation_id,
                            data={"call_id": call_id, "tool_name": tool_id, "success": False, "error": rate_error},
                        )
                        tool_results_for_messages.append(
                            {"tool_call_id": call_id, "content": f"Tool error: {rate_error}"}
                        )
                        continue

                    risk_level = "medium"
                    if tool_info and tool_info.get("risk_level"):
                        risk_level = str(tool_info["risk_level"])

                    from openforge.db.postgres import AsyncSessionLocal

                    async with AsyncSessionLocal() as policy_db:
                        policy_decision = await policy_engine.evaluate_async(
                            tool_id,
                            risk_level,
                            policy_db,
                            agent=agent,
                        )

                    hitl_note = ""
                    if policy_decision == "blocked":
                        error = f"Tool '{tool_id}' is blocked by policy."
                        timeline[tool_entry_idx]["success"] = False
                        timeline[tool_entry_idx]["error"] = error
                        await self._publish(
                            execution_id,
                            workspace_id,
                            "agent_tool_call_result",
                            conversation_id=conversation_id,
                            data={"call_id": call_id, "tool_name": tool_id, "success": False, "error": error},
                        )
                        tool_results_for_messages.append({"tool_call_id": call_id, "content": f"Tool error: {error}"})
                        continue

                    if policy_decision == "hitl_required":
                        action_summary = f"Agent wants to execute '{tool_id}' with: {json.dumps(arguments, default=str)[:300]}"
                        async with AsyncSessionLocal() as hitl_db:
                            hitl_request = await hitl_service.create_request(
                                hitl_db,
                                workspace_id=workspace_id,
                                conversation_id=conversation_id,
                                tool_id=tool_id,
                                tool_input=arguments,
                                action_summary=action_summary,
                                risk_level=risk_level,
                                agent_id=agent.id,
                            )
                        hitl_service.register_event(str(hitl_request.id))
                        timeline[tool_entry_idx]["hitl"] = {
                            "hitl_id": str(hitl_request.id),
                            "action_summary": action_summary,
                            "risk_level": risk_level,
                            "agent_id": agent.id,
                            "status": "pending",
                            "resolution_note": None,
                        }
                        await self._publish(
                            execution_id,
                            workspace_id,
                            "agent_tool_hitl",
                            conversation_id=conversation_id,
                            data={
                                "call_id": call_id,
                                "hitl_id": str(hitl_request.id),
                                "action_summary": action_summary,
                                "risk_level": risk_level,
                                "agent_id": agent.id,
                                "status": "pending",
                            },
                        )
                        await self._update_execution_record(db, execution_id, status="paused_hitl")
                        approved = await self._wait_for_hitl_resolution(hitl_id=hitl_request.id, cancel_event=cancel_event)
                        await self._update_execution_record(db, execution_id, status="running")

                        async with AsyncSessionLocal() as hitl_db:
                            approval_row = await hitl_db.get(ApprovalRequestModel, hitl_request.id)
                            if approval_row is not None and approval_row.resolution_note:
                                hitl_note = approval_row.resolution_note

                        timeline[tool_entry_idx]["hitl"]["status"] = "approved" if approved else "denied"
                        timeline[tool_entry_idx]["hitl"]["resolution_note"] = hitl_note or None
                        await self._publish(
                            execution_id,
                            workspace_id,
                            "agent_tool_hitl_resolved",
                            conversation_id=conversation_id,
                            data={
                                "call_id": call_id,
                                "hitl_id": str(hitl_request.id),
                                "status": "approved" if approved else "denied",
                                "resolution_note": hitl_note or None,
                            },
                        )

                        if cancel_event.is_set():
                            was_cancelled = True
                            break
                        if not approved:
                            denied_message = "Tool execution denied by the user."
                            if hitl_note:
                                denied_message += f" Guidance: {hitl_note}"
                            timeline[tool_entry_idx]["success"] = False
                            timeline[tool_entry_idx]["error"] = denied_message
                            await self._publish(
                                execution_id,
                                workspace_id,
                                "agent_tool_call_result",
                                conversation_id=conversation_id,
                                data={"call_id": call_id, "tool_name": tool_id, "success": False, "error": denied_message},
                            )
                            tool_results_for_messages.append(
                                {"tool_call_id": call_id, "content": denied_message}
                            )
                            continue

                    rate_limiter.record()
                    tool_result = await tool_dispatcher.execute(
                        tool_id=tool_id,
                        params=arguments,
                        workspace_id=str(workspace_id),
                        execution_id=execution_id,
                        conversation_id=str(conversation_id),
                        agent_id=agent.id,
                    )
                    finished_at = datetime.now(timezone.utc)
                    duration_ms = max(1, int((finished_at - tool_started_at).total_seconds() * 1000))

                    response_payload: dict[str, Any] = {
                        "call_id": call_id,
                        "tool_name": tool_id,
                        "success": tool_result.get("success", False),
                        "duration_ms": duration_ms,
                    }

                    output_for_timeline = tool_result.get("output")
                    result_content: str
                    if tool_id == "agent.invoke" and tool_result.get("success"):
                        nested_output = output_for_timeline or {}
                        nested_response = nested_output.get("response", "") if isinstance(nested_output, dict) else ""
                        nested_timeline = nested_output.get("timeline", []) if isinstance(nested_output, dict) else []
                        nested_conversation_id = nested_output.get("conversation_id") if isinstance(nested_output, dict) else None
                        timeline[tool_entry_idx]["success"] = True
                        timeline[tool_entry_idx]["output"] = nested_response
                        timeline[tool_entry_idx]["nested_timeline"] = nested_timeline
                        timeline[tool_entry_idx]["subagent_conversation_id"] = nested_conversation_id
                        timeline[tool_entry_idx]["duration_ms"] = duration_ms
                        response_payload["output"] = nested_response
                        response_payload["nested_timeline"] = nested_timeline
                        response_payload["subagent_conversation_id"] = nested_conversation_id
                        result_content = (
                            f"Subagent completed. Response:\n\n{nested_response}"
                            if nested_response
                            else "Subagent completed with no text response."
                        )
                        if arguments.get("agent_id") == "optimizer_agent" and nested_response:
                            await self._publish(
                                execution_id,
                                workspace_id,
                                "agent_prompt_optimized",
                                conversation_id=conversation_id,
                                data={"original": user_content, "optimized": nested_response},
                            )
                            timeline.append(
                                {
                                    "type": "prompt_optimized",
                                    "original": user_content,
                                    "optimized": nested_response,
                                }
                            )
                    else:
                        if tool_result.get("success"):
                            if output_for_timeline is None:
                                result_content = "Tool executed successfully with no output."
                            elif isinstance(output_for_timeline, (dict, list)):
                                result_content = json.dumps(output_for_timeline, indent=2, default=str)
                            else:
                                result_content = str(output_for_timeline)
                        else:
                            result_content = f"Tool error: {tool_result.get('error', 'Unknown error')}"
                        result_content = _truncate_text(result_content, _MAX_LLM_TOOL_RESULT_CHARS)
                        if hitl_note:
                            result_content += f"\n\n[User guidance]: {hitl_note}"
                        timeline[tool_entry_idx]["success"] = tool_result.get("success", False)
                        timeline[tool_entry_idx]["output"] = (
                            _truncate_text(json.dumps(output_for_timeline, default=str), 2000)
                            if isinstance(output_for_timeline, (dict, list))
                            else (_truncate_text(str(output_for_timeline), 2000) if output_for_timeline is not None else None)
                        )
                        timeline[tool_entry_idx]["error"] = tool_result.get("error")
                        timeline[tool_entry_idx]["duration_ms"] = duration_ms
                        response_payload["output"] = output_for_timeline
                        response_payload["error"] = tool_result.get("error")

                    await self._publish(
                        execution_id,
                        workspace_id,
                        "agent_tool_call_result",
                        conversation_id=conversation_id,
                        data=response_payload,
                    )
                    await self._update_stream_state(
                        execution_id,
                        content=full_response,
                        thinking=full_thinking,
                        tool_calls=all_tool_calls,
                        sources=context_sources,
                        attachments_processed=all_attachments_processed,
                        timeline=timeline,
                    )

                    asyncio.create_task(
                        _persist_tool_call_log(
                            workspace_id=workspace_id,
                            conversation_id=conversation_id,
                            call_id=call_id,
                            tool_name=tool_id,
                            arguments=arguments,
                            success=tool_result.get("success", False),
                            output=result_content if tool_id == "agent.invoke" else output_for_timeline,
                            error=tool_result.get("error"),
                            duration_ms=duration_ms,
                            started_at=tool_started_at,
                            finished_at=finished_at,
                        )
                    )
                    tool_results_for_messages.append({"tool_call_id": call_id, "content": result_content})

                if was_cancelled:
                    break

                assistant_tool_message: dict[str, Any] = {"role": "assistant", "content": response_this_turn or ""}
                assistant_tool_message["tool_calls"] = [
                    {
                        "id": call.get("id") or call.get("call_id", ""),
                        "type": "function",
                        "function": {
                            "name": _tool_id_to_fn_name(_fn_name_to_tool_id(call.get("name", ""))),
                            "arguments": json.dumps(call.get("arguments", {}), default=str),
                        },
                    }
                    for call in tool_calls_this_turn
                ]
                loop_messages.append(assistant_tool_message)
                for tool_message in tool_results_for_messages:
                    loop_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_message["tool_call_id"],
                            "content": tool_message["content"],
                        }
                    )

            if not was_cancelled and not full_response.strip() and (all_tool_calls or full_thinking.strip()):
                try:
                    async for event in llm_gateway.stream_with_tools(
                        messages=loop_messages,
                        tools=[],
                        provider_name=provider_name,
                        api_key=api_key,
                        model=model,
                        base_url=base_url,
                        include_thinking=False,
                    ):
                        if event.get("type") == "token":
                            token = event.get("content", "")
                            if token:
                                full_response += token
                                await self._publish(
                                    execution_id,
                                    workspace_id,
                                    "agent_token",
                                    conversation_id=conversation_id,
                                    data=token,
                                )
                except Exception as exc:
                    logger.warning("Final summary turn failed: %s", exc)

            generation_ms = int((time.perf_counter() - generation_started) * 1000)
            await conversation_service.add_message(
                db,
                conversation_id,
                role="assistant",
                content=full_response,
                thinking=full_thinking.strip() or None,
                model_used=model,
                provider_used=provider_name,
                token_count=llm_gateway.count_tokens(full_response),
                generation_ms=generation_ms,
                context_sources=context_sources,
                tool_calls=all_tool_calls or None,
                timeline=timeline or None,
                is_interrupted=was_cancelled,
            )

            status_value = "cancelled" if was_cancelled else "completed"
            await self._update_execution_record(
                db,
                execution_id,
                status=status_value,
                iteration_count=max(len([entry for entry in timeline if entry.get("type") == "thinking"]), 1),
                tool_calls_count=tool_calls_count,
                timeline=timeline,
                completed_at=datetime.now(timezone.utc),
            )
            await self._update_stream_state(
                execution_id,
                content=full_response,
                thinking=full_thinking,
                tool_calls=all_tool_calls,
                sources=context_sources,
                attachments_processed=all_attachments_processed,
                timeline=timeline,
            )
            await self._publish(
                execution_id,
                workspace_id,
                "execution_completed",
                conversation_id=conversation_id,
                status=status_value,
            )
            await self._publish(
                execution_id,
                workspace_id,
                "agent_done",
                conversation_id=conversation_id,
                message_id="",
                interrupted=was_cancelled,
            )
        except Exception as exc:
            logger.exception("Agent execution %s failed", execution_id)
            await self._update_execution_record(
                db,
                execution_id,
                status="failed",
                error_message=str(exc),
                completed_at=datetime.now(timezone.utc),
            )
            await self._publish(
                execution_id,
                workspace_id,
                "agent_error",
                conversation_id=conversation_id,
                detail=str(exc),
            )
        finally:
            self._cancel_events.pop(str(conversation_id), None)
            for channel_key, subscription in cancel_subscriptions:
                await self._teardown_cancel_listener(subscription, channel_key)


agent_engine = AgentExecutionEngine()

__all__ = ["AgentExecutionEngine", "agent_engine"]
