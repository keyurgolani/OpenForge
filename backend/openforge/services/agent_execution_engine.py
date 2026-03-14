"""
TRANSITIONAL MONOLITH

This module is the current unified chat pipeline that handles all agent execution.
It is scheduled for extraction and refactoring into the runtime package in a later phase.

Architecture Evolution:
- Phase 1: This module continues to handle chat-based execution
- Phase 2+: Will be extracted into:
  - Runtime coordinator (runtime/coordinator.py)
  - Node executors (runtime/node_executors/)
  - State management (runtime/state_store.py)

New development should target the domain architecture (openforge.domains.*) when possible.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from openforge.core.llm_gateway import llm_gateway
from openforge.core.context_assembler import ContextAssembler
from openforge.core.agent_definition import AgentDefinition
from openforge.core.prompt_catalogue import resolve_agent_system_prompt, resolve_prompt_text
from openforge.services.conversation_service import conversation_service
from openforge.services.llm_service import llm_service
from openforge.services.attachment_pipeline import (
    extract_http_urls,
    get_extractor,
    resolve_attachment_pipeline,
)
from openforge.services.tool_dispatcher import tool_dispatcher
from openforge.services.policy_engine import policy_engine
from openforge.services.hitl_service import hitl_service
from openforge.db.models import (
    AgentExecution, Conversation, Knowledge,
    Message, MessageAttachment, TaskLog, ToolCallLog, Workspace,
)

_MAX_OUTPUT_LOG_CHARS = 50_000

logger = logging.getLogger("openforge.agent")

context_assembler = ContextAssembler()


async def _persist_tool_call_log(
    *,
    workspace_id: UUID,
    conversation_id: UUID,
    call_id: str,
    tool_name: str,
    arguments: dict,
    success: bool,
    output: object,
    error: str | None,
    duration_ms: int,
    started_at: datetime,
    finished_at: datetime,
) -> None:
    """Write a ToolCallLog row in a short-lived session so it survives mid-stream."""
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
            db.add(ToolCallLog(
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
            ))
            await db.commit()
    except Exception as exc:
        logger.warning("Failed to persist tool call log for %s: %s", call_id, exc)


# Tool name separator: OpenAI rejects dots in function names, so we use double-underscore.
_TOOL_NAME_SEP = "__"


def _tool_id_to_fn_name(tool_id: str) -> str:
    return tool_id.replace(".", _TOOL_NAME_SEP)


def _fn_name_to_tool_id(fn_name: str) -> str:
    return fn_name.replace(_TOOL_NAME_SEP, ".")


def _mcp_tool_fn_name(server_id: str, tool_name: str) -> str:
    """Stable, LLM-safe function name for an MCP tool."""
    raw = f"mcp_{server_id}_{tool_name}"
    return re.sub(r"[^a-zA-Z0-9_]", "_", raw)


def _tools_to_openai_schema(tools: list[dict]) -> list[dict]:
    """Convert tool registry entries to OpenAI tool_call schema."""
    result = []
    for tool in tools:
        result.append({
            "type": "function",
            "function": {
                "name": _tool_id_to_fn_name(tool["id"]),
                "description": tool["description"],
                "parameters": tool.get("input_schema", {"type": "object", "properties": {}}),
            },
        })
    return result


def _get_skill_description(skill: dict) -> str:
    """Extract a short description from a skill for prompt injection."""
    content = skill.get("content", "")
    if not content:
        return skill.get("description", "")

    # Try YAML frontmatter
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                import yaml
                meta = yaml.safe_load(parts[1])
                if meta and meta.get("description"):
                    return meta["description"][:200]
            except Exception:
                pass

    # Fall back to first non-header, non-empty line
    for line in content.split("\n"):
        line = line.strip()
        if line and not line.startswith("#") and not line.startswith("---"):
            return line[:200]

    return skill.get("description", "")


class AgentExecutionEngine:
    """
    Unified execution engine for all agent chat interactions.
    Publishes events via Redis (for Celery workers) or direct WebSocket (inline fallback).
    Parameterized by AgentDefinition for framework conformance.
    """

    MAX_TOOL_LOOPS = 20

    def __init__(self) -> None:
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._use_redis: bool | None = None

    async def _should_use_redis(self) -> bool:
        """Check if Redis is available for event publishing."""
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
        conversation_id: UUID | None = None,
        **data,
    ) -> None:
        """Publish an event via Redis pub/sub. Falls back to direct WebSocket."""
        event = {
            "type": event_type,
            "execution_id": execution_id,
            "workspace_id": str(workspace_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **data,
        }
        if conversation_id:
            event["conversation_id"] = str(conversation_id)

        if await self._should_use_redis():
            try:
                from openforge.db.redis_client import get_redis
                redis = await get_redis()
                await redis.publish(f"agent:{execution_id}", json.dumps(event, default=str))
                return
            except Exception as e:
                logger.warning("Redis publish failed, falling back to WS: %s", e)

        # Fallback: direct WebSocket (channel-aware)
        from openforge.api.websocket import ws_manager, CHANNEL_AGENT, AGENT_EVENT_TYPES
        event_type = event.get("type")

        # Also send to execution-specific connections
        if execution_id:
            await ws_manager.send_to_execution(str(execution_id), event)

        if event_type in AGENT_EVENT_TYPES:
            await ws_manager.send_to_workspace_channel(str(workspace_id), CHANNEL_AGENT, event)
        else:
            await ws_manager.send_to_workspace(str(workspace_id), event)

    async def _update_stream_state(
        self,
        execution_id: str,
        *,
        content: str = "",
        thinking: str = "",
        tool_calls: list | None = None,
        sources: list | None = None,
        attachments_processed: list | None = None,
        timeline: list | None = None,
    ) -> None:
        """Write current stream state to Redis hash for reconnection support."""
        if not await self._should_use_redis():
            return
        try:
            from openforge.db.redis_client import get_redis
            redis = await get_redis()
            mapping = {
                "content": content,
                "thinking": thinking,
                "tool_calls": json.dumps(tool_calls or [], default=str),
                "sources": json.dumps(sources or [], default=str),
                "attachments_processed": json.dumps(attachments_processed or [], default=str),
                "timeline": json.dumps(timeline or [], default=str),
            }
            await redis.hset(f"stream_state:{execution_id}", mapping=mapping)
            await redis.expire(f"stream_state:{execution_id}", 3600)
        except Exception as e:
            logger.warning("Failed to update stream state: %s", e)

    async def _update_execution_record(
        self,
        db: AsyncSession,
        execution_id: str,
        **fields,
    ) -> None:
        """Update the AgentExecution record in the database."""
        try:
            exec_record = await db.get(AgentExecution, UUID(execution_id))
            if exec_record:
                for key, value in fields.items():
                    setattr(exec_record, key, value)
                await db.commit()
        except Exception as e:
            logger.warning("Failed to update execution record %s: %s", execution_id, e)

    def cancel(self, conversation_id: UUID) -> None:
        """Signal the running agent loop for this conversation to stop."""
        key = str(conversation_id)
        event = self._cancel_events.get(key)
        if event:
            event.set()

    async def _subscribe_redis_cancel(
        self, conversation_id: str, cancel_event: asyncio.Event
    ) -> tuple:
        """Subscribe to the Redis cancel channel for cross-process cancellation.

        Returns (redis_conn, pubsub, listener_task).  The listener sets the
        local asyncio.Event when a cancel message arrives on the channel
        ``agent_cancel:{conversation_id}``.
        """
        import redis.asyncio as aioredis
        from openforge.config import get_settings

        settings = get_settings()
        redis_conn = aioredis.from_url(settings.redis_url, decode_responses=True)
        pubsub = redis_conn.pubsub()
        channel = f"agent_cancel:{conversation_id}"
        await pubsub.subscribe(channel)

        async def _listener():
            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        logger.info("Received Redis cancel for conversation %s", conversation_id)
                        cancel_event.set()
                        return
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.debug("Redis cancel listener error: %s", exc)

        task = asyncio.create_task(_listener())
        return redis_conn, pubsub, task

    async def send_stream_snapshot(
        self,
        websocket: WebSocket,
        workspace_id: UUID,
        conversation_id: UUID | None = None,
    ) -> None:
        """Send stream state snapshot to a reconnecting client."""
        from openforge.api.websocket import ws_manager

        # Try Redis-based stream state first
        if await self._should_use_redis():
            try:
                from openforge.db.redis_client import get_redis
                redis = await get_redis()

                if conversation_id:
                    # Find execution for this conversation
                    from openforge.db.postgres import AsyncSessionLocal
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(
                            select(AgentExecution)
                            .where(
                                AgentExecution.conversation_id == conversation_id,
                                AgentExecution.status.in_(["running", "paused_hitl"]),
                            )
                            .order_by(AgentExecution.started_at.desc())
                            .limit(1)
                        )
                        exec_record = result.scalar_one_or_none()

                    if exec_record:
                        state = await redis.hgetall(f"stream_state:{exec_record.id}")
                        if state:
                            await ws_manager.send_to_connection(websocket, {
                                "type": "agent_stream_snapshot",
                                "conversation_id": str(conversation_id),
                                "data": {
                                    "content": state.get("content", ""),
                                    "thinking": state.get("thinking", ""),
                                    "tool_calls": json.loads(state.get("tool_calls", "[]")),
                                    "sources": json.loads(state.get("sources", "[]")),
                                    "attachments_processed": json.loads(
                                        state.get("attachments_processed", "[]")
                                    ),
                                    "timeline": json.loads(state.get("timeline", "[]")),
                                    "status": exec_record.status,
                                },
                            })
                            return
            except Exception as e:
                logger.warning("Redis stream snapshot failed: %s", e)

    async def _process_message_attachments(
        self,
        db: AsyncSession,
        *,
        workspace_id: UUID,
        conversation_id: UUID,
        user_message_id: UUID,
        attachment_ids: Optional[List[str]],
    ) -> tuple[str, list[dict]]:
        if not attachment_ids:
            return "", []

        from openforge.db.postgres import AsyncSessionLocal
        from openforge.utils.task_audit import start_task_log, mark_task_log_done, mark_task_log_failed

        context_blocks: list[str] = []
        processed: list[dict] = []
        db_updated = False

        for raw_attachment_id in dict.fromkeys(attachment_ids):
            try:
                attachment_id = UUID(str(raw_attachment_id))
            except Exception:
                processed.append({
                    "id": str(raw_attachment_id),
                    "filename": "unknown",
                    "status": "failed",
                    "pipeline": "unknown",
                    "details": "Invalid attachment id",
                })
                continue

            result = await db.execute(
                select(MessageAttachment).where(MessageAttachment.id == attachment_id)
            )
            attachment = result.scalar_one_or_none()
            if not attachment:
                processed.append({
                    "id": str(attachment_id),
                    "filename": "unknown",
                    "status": "missing",
                    "pipeline": "unknown",
                    "details": "Attachment record not found",
                })
                continue

            extractor = get_extractor(
                content_type=attachment.content_type,
                filename=attachment.filename,
            )
            pipeline = extractor.pipeline if extractor is not None else resolve_attachment_pipeline(
                content_type=attachment.content_type,
                filename=attachment.filename,
            )
            attachment_status = "deferred"
            details = "Pipeline not available yet for this file type"

            if attachment.message_id is None:
                attachment.message_id = user_message_id
                db_updated = True

            if extractor is not None:
                target_link = f"/w/{workspace_id}/conversations/{conversation_id}"
                task_log_id = None
                try:
                    async with AsyncSessionLocal() as audit_db:
                        task_log = await start_task_log(
                            audit_db,
                            task_type="extract_attachment_content",
                            workspace_id=workspace_id,
                            target_link=target_link,
                        )
                        task_log_id = task_log.id
                        await audit_db.commit()
                except Exception as log_exc:
                    logger.warning("Failed to create attachment extraction task log: %s", log_exc)

                try:
                    if not (attachment.extracted_text or "").strip():
                        extracted = await extractor.extract(attachment.file_path)
                        attachment.extracted_text = extracted or None
                        db_updated = True

                    extracted_text = (attachment.extracted_text or "").strip()
                    if extracted_text:
                        attachment_status = "processed"
                        details = f"Extracted text ({len(extracted_text)} chars)"
                        context_blocks.append(
                            (
                                f"\n--- Content from {attachment.filename} ---\n"
                                f"{extracted_text}\n"
                                f"--- End of {attachment.filename} ---\n"
                            )
                        )
                    else:
                        attachment_status = "empty"
                        details = "No text extracted from attachment"

                    if task_log_id:
                        try:
                            async with AsyncSessionLocal() as audit_db:
                                log_entry = await audit_db.get(TaskLog, task_log_id)
                                if log_entry:
                                    mark_task_log_done(log_entry, item_count=len(extracted_text) if extracted_text else 0)
                                    await audit_db.commit()
                        except Exception as log_exc:
                            logger.warning("Failed to mark attachment task log done: %s", log_exc)

                except Exception as extraction_error:
                    logger.warning("Attachment extraction failed for %s: %s", attachment.filename, extraction_error)
                    attachment_status = "failed"
                    details = str(extraction_error)[:200]
                    if task_log_id:
                        try:
                            async with AsyncSessionLocal() as audit_db:
                                log_entry = await audit_db.get(TaskLog, task_log_id)
                                if log_entry:
                                    mark_task_log_failed(log_entry, extraction_error)
                                    await audit_db.commit()
                        except Exception as log_exc:
                            logger.warning("Failed to mark attachment task log failed: %s", log_exc)

            processed.append({
                "id": str(attachment.id),
                "filename": attachment.filename,
                "status": attachment_status,
                "pipeline": pipeline,
                "details": details,
                "extracted_text": (attachment.extracted_text or "")[:5000] or None,
            })

        if db_updated:
            await db.commit()

        if not context_blocks:
            return "", processed
        return (
            "\n\nThe user has attached the following files:\n" + "\n".join(context_blocks),
            processed,
        )

    async def _extract_urls_for_chat(
        self,
        *,
        workspace_id: UUID,
        user_message_id: UUID,
        urls: list[str],
    ) -> tuple[str, list[dict]]:
        """Extract content from URLs mentioned in a chat message."""
        if not urls:
            return "", []

        from openforge.db.postgres import AsyncSessionLocal
        from openforge.services.knowledge_processing_service import knowledge_processing_service
        from openforge.utils.task_audit import start_task_log, mark_task_log_done, mark_task_log_failed

        context_blocks: list[str] = []
        url_attachments: list[dict] = []

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
                    logger.warning("URL extraction timed out for %s", url)
                    if task_log_id:
                        async with AsyncSessionLocal() as audit_db:
                            log_entry = await audit_db.get(TaskLog, task_log_id)
                            if log_entry:
                                mark_task_log_failed(log_entry, "Extraction timed out after 20s")
                                await audit_db.commit()
                    url_attachments.append({
                        "id": str(uuid.uuid4()),
                        "filename": url,
                        "status": "failed",
                        "pipeline": "url_extract",
                        "details": "Extraction timed out",
                        "source_url": url,
                    })
                    continue

                title = result.get("title") or None
                content = (result.get("content") or "").strip()
                resolved_url = result.get("resolved_url") or url
                display_name = title or resolved_url

                attachment_id = uuid.uuid4()
                async with AsyncSessionLocal() as att_db:
                    att_db.add(MessageAttachment(
                        id=attachment_id,
                        message_id=user_message_id,
                        filename=display_name[:500],
                        content_type="text/url-extract",
                        file_size=len(content.encode()),
                        file_path="",
                        source_url=resolved_url,
                        extracted_text=content or None,
                    ))
                    await att_db.commit()

                if content:
                    context_blocks.append(
                        f"\n--- Content from {display_name} ---\n"
                        f"{content}\n"
                        f"--- End of {display_name} ---\n"
                    )
                    status = "processed"
                    details = f"Extracted {len(content)} chars"
                else:
                    status = "empty"
                    details = "No content could be extracted"

                if task_log_id:
                    async with AsyncSessionLocal() as audit_db:
                        log_entry = await audit_db.get(TaskLog, task_log_id)
                        if log_entry:
                            mark_task_log_done(log_entry, item_count=len(content))
                            await audit_db.commit()

                url_attachments.append({
                    "id": str(attachment_id),
                    "filename": display_name,
                    "status": status,
                    "pipeline": "url_extract",
                    "details": details,
                    "source_url": url,
                    "extracted_text": content[:5000] if content else None,
                })

            except Exception as exc:
                logger.warning("Chat URL extraction failed for %s: %s", url, exc)
                if task_log_id:
                    try:
                        async with AsyncSessionLocal() as audit_db:
                            log_entry = await audit_db.get(TaskLog, task_log_id)
                            if log_entry:
                                mark_task_log_failed(log_entry, exc)
                                await audit_db.commit()
                    except Exception:
                        pass
                url_attachments.append({
                    "id": str(uuid.uuid4()),
                    "filename": url,
                    "status": "failed",
                    "pipeline": "url_extract",
                    "details": str(exc)[:200],
                    "source_url": url,
                })

        if not context_blocks:
            return "", url_attachments
        header = (
            "\n\nThe following URLs were shared by the user. Their content has already been "
            "extracted and is provided below. Do NOT call any fetch, browse, or URL tool to "
            "re-fetch these URLs — use the extracted content directly.\n"
        )
        return header + "\n".join(context_blocks), url_attachments

    async def _maybe_summarize_history(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        history: list[dict],
        workspace_id: UUID,
    ) -> list[dict]:
        """Summarize older messages when conversation exceeds 20 messages.

        Keeps the last 10 messages as-is, summarizes older ones via LLM.
        Caches the summary in Redis for 1 hour.
        """
        if len(history) <= 20:
            return history

        keep_count = 10
        recent = history[-keep_count:]
        older = history[:-keep_count]

        # Check Redis cache
        cache_key = f"conv_summary:{conversation_id}:{len(older)}"
        cached_summary: str | None = None
        try:
            from openforge.db.redis_client import get_redis
            redis = await get_redis()
            cached_summary = await redis.get(cache_key)
        except Exception:
            pass

        if cached_summary:
            summary_message = {"role": "system", "content": f"[Summary of earlier conversation]:\n{cached_summary}"}
            return [summary_message] + recent

        # Generate summary via LLM
        try:
            messages_text = "\n".join(
                f"[{m['role'].upper()}]: {m['content'][:500]}" for m in older
            )
            summary_prompt = await resolve_prompt_text(
                db, "conversation_summary", messages=messages_text[:8000]
            )

            provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
                db, workspace_id
            )
            summary = await llm_gateway.chat(
                messages=[{"role": "user", "content": summary_prompt}],
                provider_name=provider_name,
                api_key=api_key,
                model=model,
                base_url=base_url,
            )

            # Cache in Redis
            try:
                from openforge.db.redis_client import get_redis
                redis = await get_redis()
                await redis.set(cache_key, summary, ex=3600)
            except Exception:
                pass

            summary_message = {"role": "system", "content": f"[Summary of earlier conversation]:\n{summary}"}
            return [summary_message] + recent
        except Exception as e:
            logger.warning("Conversation summarization failed, using full history: %s", e)
            return history

    async def _maybe_summarize_tool_output(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        result_content: str,
        tool_name: str,
    ) -> str:
        """Summarize tool output if it exceeds 4000 tokens.

        Full output is already persisted in tool call logs and timeline
        before this point, so summarizing for LLM context is safe.
        """
        token_count = llm_gateway.count_tokens(result_content)
        if token_count <= 4000:
            return result_content

        try:
            provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
                db, workspace_id
            )
            summary = await llm_gateway.chat(
                messages=[{"role": "user", "content": (
                    f"Summarize this tool output from '{tool_name}', preserving key data, "
                    f"IDs, structure, and any actionable information. Be concise.\n\n"
                    f"{result_content[:12000]}"
                )}],
                provider_name=provider_name,
                api_key=api_key,
                model=model,
                base_url=base_url,
            )
            return f"[Summarized tool output — original was {token_count} tokens]\n{summary}"
        except Exception as e:
            logger.warning("Tool output summarization failed for %s, hard-truncating: %s", tool_name, e)
            return result_content[:4000] + f"\n[Output truncated from {len(result_content)} chars]"

    async def _resolve_mentions(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        mentions: list[dict],
    ) -> str:
        """Resolve @mention references into context strings."""
        if not mentions:
            return ""

        parts: list[str] = []
        for mention in mentions:
            mtype = mention.get("type", "")
            mid = mention.get("id", "")
            mname = mention.get("name", "")

            if mtype == "workspace" and mid:
                try:
                    ws = await db.get(Workspace, UUID(mid))
                    if ws:
                        parts.append(
                            f"\n## @{mname} Workspace — DELEGATION REQUIRED\n"
                            f"The user has explicitly mentioned workspace '@{mname}' (workspace_id: `{mid}`).\n"
                            f"YOU MUST call the `agent.invoke` tool with `workspace_id=\"{mid}\"` to access "
                            f"any information or perform any tasks in that workspace. "
                            f"Do NOT attempt to use memory tools, filesystem tools, or any other tool to access "
                            f"that workspace's content directly — those tools only access the CURRENT workspace.\n"
                            f"Call `agent.invoke` immediately with a clear, complete instruction based on the user's request. "
                            f"The subagent in that workspace has access to all its knowledge, files, and tools."
                        )
                except Exception:
                    pass

            elif mtype == "chat" and mid:
                try:
                    messages = await conversation_service.get_recent_messages(db, UUID(mid), limit=40)
                    if messages:
                        history_lines = [
                            f"[{m.get('role', 'user').upper()}]: {(m.get('content') or '')[:800]}"
                            for m in messages
                        ]
                        history_text = "\n".join(history_lines)
                        summary_instruction = await resolve_prompt_text(
                            db,
                            "mention_conversation_summary",
                            chat_name=mname,
                            conversation_history=history_text[:12000],
                        )
                        summary_result = await self.execute_subagent(
                            workspace_id=workspace_id,
                            instruction=summary_instruction,
                            db=db,
                        )
                        parts.append(
                            f"\n## Referenced Chat @{mname} (Subagent Summary)\n"
                            f"The user referenced chat '@{mname}'. "
                            f"A subagent analyzed and summarized that conversation:\n\n"
                            f"{summary_result.get('response', 'Summary unavailable.')}\n\n"
                            f"Use this summary to inform your response."
                        )
                except Exception as exc:
                    logger.warning("Failed to resolve @chat mention %s: %s", mid, exc)

        return "\n".join(parts)

    def _build_skills_section(self, installed_skills: list[dict], agent: AgentDefinition) -> str:
        """Build the optimized skills prompt section using three-tier injection."""
        if not installed_skills:
            return ""

        configured_ids = set(agent.skill_ids) if agent.skill_ids else set()
        configured_skills: list[dict] = []
        other_skills: list[str] = []

        for skill in installed_skills:
            skill_name = skill.get("name", "")
            if skill_name in configured_ids:
                desc = _get_skill_description(skill)
                configured_skills.append({"name": skill_name, "description": desc})
            else:
                other_skills.append(skill_name)

        section = "\n\n## Skills\n\n"
        section += (
            "You have access to skills that provide domain expertise. Read a skill's full "
            "content using `skills.read(skill_name, \"SKILL.md\")` when relevant.\n"
        )

        if configured_skills:
            section += "\n### Configured Skills (read these proactively when relevant):\n"
            for s in configured_skills:
                if s["description"]:
                    section += f"- **{s['name']}**: {s['description']}\n"
                else:
                    section += f"- **{s['name']}**\n"

        if other_skills:
            section += "\n### Other Installed Skills:\n"
            for name in other_skills:
                section += f"- {name}\n"

        section += "\nYou can discover and install more skills with `skills.search()` and `skills.install()`.\n"
        return section

    async def run(
        self,
        workspace_id: UUID,
        conversation_id: UUID,
        user_content: str,
        db: AsyncSession,
        agent: AgentDefinition | None = None,
        execution_id: str | None = None,
        attachment_ids: Optional[List[str]] = None,
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
        mentions: Optional[List[dict]] = None,
        optimize: bool = False,
    ):
        """Full agent execution pipeline, parameterized by AgentDefinition."""
        workspace_key = str(workspace_id)
        if not execution_id:
            execution_id = str(uuid.uuid4())
        cancel_event = asyncio.Event()
        self._cancel_events[str(conversation_id)] = cancel_event

        # Subscribe to Redis cancel channel so cross-process cancel works (Celery)
        _cancel_redis_conn = None
        _cancel_redis_sub = None
        _cancel_listener_task = None
        try:
            _cancel_redis_conn, _cancel_redis_sub, _cancel_listener_task = (
                await self._subscribe_redis_cancel(str(conversation_id), cancel_event)
            )
        except Exception as exc:
            logger.debug("Redis cancel subscription unavailable: %s", exc)

        # If no agent provided, build one from workspace settings (backward compat)
        if agent is None:
            from openforge.core.agent_registry import agent_registry
            agent = await agent_registry.get_for_workspace(db, workspace_id)

        # Validate conversation
        conv_result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conversation = conv_result.scalar_one_or_none()
        if not conversation or conversation.workspace_id != workspace_id or conversation.is_archived:
            await self._publish(
                execution_id, workspace_id, "agent_error",
                conversation_id=conversation_id,
                detail="Conversation not found",
            )
            return

        # Ensure execution record exists (inline mode skips _dispatch_celery_agent)
        existing = await db.get(AgentExecution, UUID(execution_id))
        if not existing:
            db.add(AgentExecution(
                id=UUID(execution_id),
                workspace_id=workspace_id,
                conversation_id=conversation_id,
                agent_id=agent.id,
                status="running",
            ))
            await db.commit()
        else:
            # Update execution record to running
            await self._update_execution_record(db, execution_id, status="running")

        # 1. Save user message (skip if already persisted at dispatch time)
        _user_metadata = {"optimize": True} if optimize else None
        if existing:
            # Celery path: user message was already persisted during dispatch
            _last_msg = await db.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id, Message.role == "user")
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            user_message = _last_msg.scalar_one_or_none()
            if not user_message:
                user_message = await conversation_service.add_message(
                    db, conversation_id, role="user", content=user_content,
                    provider_metadata=_user_metadata,
                )
        else:
            user_message = await conversation_service.add_message(
                db, conversation_id, role="user", content=user_content,
                provider_metadata=_user_metadata,
            )

        try:
            # 2. Process attachments (if agent supports them)
            attachment_context = ""
            attachments_processed: list[dict] = []
            if agent.attachment_support:
                attachment_context, attachments_processed = await self._process_message_attachments(
                    db,
                    workspace_id=workspace_id,
                    conversation_id=conversation_id,
                    user_message_id=user_message.id,
                    attachment_ids=attachment_ids,
                )

            # 3. Extract content from HTTP links (if agent supports auto-bookmarking)
            url_context = ""
            url_attachments_processed: list[dict] = []
            if agent.auto_bookmark_urls:
                chat_urls = extract_http_urls(user_content)
                if chat_urls:
                    url_context, url_attachments_processed = await self._extract_urls_for_chat(
                        workspace_id=workspace_id,
                        user_message_id=user_message.id,
                        urls=chat_urls,
                    )

            # 3b. Resolve @mentions (if agent supports them)
            mention_context = ""
            if agent.mention_support and mentions:
                mention_context = await self._resolve_mentions(db, workspace_id, mentions)

            all_attachments_processed = attachments_processed + url_attachments_processed
            if all_attachments_processed:
                await self._publish(
                    execution_id, workspace_id, "agent_attachments_processed",
                    conversation_id=conversation_id,
                    data=all_attachments_processed,
                )
                await self._update_stream_state(
                    execution_id,
                    attachments_processed=all_attachments_processed,
                )

            # 4. Context sources (auto-RAG removed — agents retrieve knowledge
            #    on demand via the workspace__search tool)
            context_sources: list[dict] = []

            # 5. Assemble initial prompt
            history = await conversation_service.get_recent_messages(
                db, conversation_id, limit=agent.history_limit
            )
            history = await self._maybe_summarize_history(
                db, conversation_id, history, workspace_id
            )

            system_prompt = await resolve_agent_system_prompt(db, agent)

            # 5a-ii. Augment router/council prompts with available agent list
            if agent.id in ("router_agent", "council_agent"):
                from openforge.core.agent_registry import agent_registry as _ar
                all_agents = _ar.list_all()
                available = [a for a in all_agents if a.id not in ("router_agent", "council_agent")]
                agent_list_text = "\n".join(f"- **{a.id}**: {a.description}" for a in available)
                system_prompt += f"\n\n## Available Agents\n{agent_list_text}"

            # 5b. Agent mode disabled notice
            if not agent.tools_enabled:
                system_prompt = system_prompt + (
                    "\n\n## Agent Mode Disabled\n"
                    "Agent mode is not enabled for this workspace. You do NOT have access to any tools, "
                    "workspace knowledge search, or external integrations. If the user asks you to search "
                    "knowledge, use tools, or perform agentic tasks, politely explain that agent mode must "
                    "be enabled in Workspace Settings first, and that you can only respond based on the "
                    "conversation context and your own training knowledge.\n"
                )

            # 5c. Optimized skills injection (three-tier system)
            installed_skills = await tool_dispatcher.list_skills()
            skills_section = self._build_skills_section(installed_skills, agent)
            if skills_section:
                system_prompt = system_prompt + skills_section

            # 5d. Prompt optimization instruction
            if optimize and agent.id != "optimizer_agent":
                system_prompt += (
                    "\n\n## Prompt Optimization Required\n"
                    "The user has enabled prompt optimization for this message. "
                    "As your FIRST action before doing anything else, you MUST invoke the "
                    "`agent.invoke` tool with `agent_id` set to `\"optimizer_agent\"` and "
                    "`instruction` set to the user's exact message. The optimizer agent "
                    "will return an improved, more specific version of the prompt. "
                    "You MUST then use that optimized prompt as the basis for your "
                    "response instead of the original user message. "
                    "Do NOT skip this step — prompt optimization is mandatory when enabled.\n"
                )

            extra_context_parts = [p for p in [attachment_context, url_context, mention_context] if p]
            assembled = context_assembler.assemble(
                system_prompt=system_prompt,
                conversation_messages=history,
                rag_results=[],
                extra_context="\n".join(extra_context_parts) if extra_context_parts else None,
            )

            # 6. Get provider
            try:
                _provider_id = provider_id
                _model_id = model_id
                if agent.provider_override_id and not provider_id:
                    _provider_id = agent.provider_override_id
                if agent.model_override and not model_id:
                    _model_id = agent.model_override

                provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
                    db, workspace_id, provider_id=_provider_id, model_override=_model_id
                )
            except Exception as e:
                await self._publish(
                    execution_id, workspace_id, "agent_error",
                    conversation_id=conversation_id,
                    detail=str(e),
                )
                await self._update_execution_record(
                    db, execution_id, status="failed", error_message=str(e),
                    completed_at=datetime.now(timezone.utc),
                )
                return

            # 7. Load tool definitions if agent mode is enabled
            openai_tools: list[dict] = []
            all_tool_defs: list[dict] = []
            fn_name_to_tool_info: dict[str, dict] = {}

            if agent.tools_enabled:
                # 7a. Built-in tools from tool server
                try:
                    raw_tools = await tool_dispatcher.list_tools()
                    if agent.allowed_tool_categories:
                        raw_tools = [
                            t for t in raw_tools
                            if t.get("category") in agent.allowed_tool_categories
                            or t.get("category") == "agent"
                        ]
                    # Filter blocked tools
                    if agent.blocked_tool_ids:
                        blocked = set(agent.blocked_tool_ids)
                        raw_tools = [t for t in raw_tools if t["id"] not in blocked]

                    for t in raw_tools:
                        fn = _tool_id_to_fn_name(t["id"])
                        fn_name_to_tool_info[fn] = {
                            "type": "builtin",
                            "tool_id": t["id"],
                            "risk_level": t.get("risk_level", "low"),
                        }
                    all_tool_defs = raw_tools
                    openai_tools = _tools_to_openai_schema(raw_tools)
                except Exception as e:
                    logger.warning("Could not load tools from tool server: %s", e)

                # 7b. External MCP tools
                try:
                    from openforge.services.mcp_service import get_enabled_servers_with_overrides
                    mcp_server_pairs = await get_enabled_servers_with_overrides(db)
                    for mcp_server, overrides in mcp_server_pairs:
                        for raw_tool in (mcp_server.discovered_tools or []):
                            t_name = raw_tool.get("name", "")
                            if not t_name:
                                continue
                            ov = overrides.get(t_name)
                            if ov and not ov.is_enabled:
                                continue
                            fn = _mcp_tool_fn_name(str(mcp_server.id), t_name)
                            fn_name_to_tool_info[fn] = {
                                "type": "mcp",
                                "server": mcp_server,
                                "tool_name": t_name,
                            }
                            schema = raw_tool.get("inputSchema") or {"type": "object", "properties": {}}
                            openai_tools.append({
                                "type": "function",
                                "function": {
                                    "name": fn,
                                    "description": raw_tool.get("description", ""),
                                    "parameters": schema,
                                },
                            })
                            all_tool_defs.append({
                                "id": f"mcp:{mcp_server.id}:{t_name}",
                                "display_name": t_name,
                                "description": raw_tool.get("description", ""),
                                "category": "mcp",
                                "input_schema": schema,
                            })
                except Exception as e:
                    logger.warning("Could not load MCP tools: %s", e)

            # Publish execution_started event
            await self._publish(
                execution_id, workspace_id, "execution_started",
                conversation_id=conversation_id,
                agent_id=agent.id,
                agent_name=agent.name,
            )

            # 8. Agent loop
            full_response = ""
            full_thinking = ""
            all_tool_calls_made: list[dict] = []
            timeline: list[dict] = []
            generation_started = time.perf_counter()
            was_cancelled = False
            iteration_count = 0
            tool_calls_count = 0

            # Emit model_selection as the first timeline entry
            from openforge.db.models import LLMProvider
            _provider_display_name = provider_name
            try:
                _prov_result = await db.execute(
                    select(LLMProvider).where(LLMProvider.name == provider_name).limit(1)
                )
                _prov_row = _prov_result.scalar_one_or_none()
                if _prov_row and _prov_row.display_name:
                    _provider_display_name = _prov_row.display_name
            except Exception:
                pass

            model_selection_entry = {
                "type": "model_selection",
                "provider_name": provider_name,
                "provider_display_name": _provider_display_name,
                "model": model,
                "is_override": bool(provider_id or model_id),
            }
            timeline.append(model_selection_entry)
            await self._publish(
                execution_id, workspace_id, "agent_model_selection",
                conversation_id=conversation_id,
                data=model_selection_entry,
            )

            loop_messages = list(assembled)

            # Initialize rate limiter for this execution
            from openforge.services.policy_engine import ToolCallRateLimiter
            rate_limiter = ToolCallRateLimiter(
                max_per_minute=agent.max_tool_calls_per_minute,
                max_per_execution=agent.max_tool_calls_per_execution,
            )

            for loop_iteration in range(agent.max_iterations):
                if cancel_event.is_set():
                    was_cancelled = True
                    break

                iteration_count = loop_iteration + 1
                tool_calls_this_turn: list[dict] = []
                response_this_turn = ""
                thinking_this_turn = ""
                finish_reason = "stop"

                try:
                    async for event in llm_gateway.stream_with_tools(
                        messages=loop_messages,
                        tools=openai_tools,
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
                                    execution_id, workspace_id, "agent_thinking",
                                    conversation_id=conversation_id,
                                    data=chunk,
                                )
                                await self._update_stream_state(
                                    execution_id,
                                    content=full_response,
                                    thinking=full_thinking,
                                )

                        elif event_type == "token":
                            token = event.get("content", "")
                            if token:
                                full_response += token
                                response_this_turn += token
                                await self._publish(
                                    execution_id, workspace_id, "agent_token",
                                    conversation_id=conversation_id,
                                    data=token,
                                )
                                await self._update_stream_state(
                                    execution_id,
                                    content=full_response,
                                    thinking=full_thinking,
                                )

                        elif event_type == "tool_calls":
                            tool_calls_this_turn = event.get("calls", [])

                        elif event_type == "done":
                            finish_reason = event.get("finish_reason", "stop")

                except Exception as e:
                    logger.error("LLM streaming error: %s", e)
                    await self._publish(
                        execution_id, workspace_id, "agent_error",
                        conversation_id=conversation_id,
                        detail=str(e),
                    )
                    await self._update_execution_record(
                        db, execution_id, status="failed", error_message=str(e),
                        completed_at=datetime.now(timezone.utc),
                    )
                    return

                # If cancelled during streaming, break immediately
                if was_cancelled:
                    if thinking_this_turn.strip():
                        timeline.append({"type": "thinking", "content": thinking_this_turn.strip()})
                    break

                # No tool calls — we have the final response
                if not tool_calls_this_turn or finish_reason == "stop":
                    if thinking_this_turn.strip():
                        timeline.append({"type": "thinking", "content": thinking_this_turn.strip()})
                    break

                # Flush thinking that preceded the tool calls
                if thinking_this_turn.strip():
                    timeline.append({"type": "thinking", "content": thinking_this_turn.strip()})

                # Execute tool calls
                tool_results_for_messages: list[dict] = []

                for call in tool_calls_this_turn:
                    if cancel_event.is_set():
                        was_cancelled = True
                        break

                    call_id = call.get("id") or str(uuid.uuid4())
                    fn_name = call.get("name", "")
                    arguments = call.get("arguments", {})

                    tool_info = fn_name_to_tool_info.get(fn_name)
                    if tool_info:
                        tool_id = (
                            f"mcp:{tool_info['server'].id}:{tool_info['tool_name']}"
                            if tool_info["type"] == "mcp"
                            else tool_info["tool_id"]
                        )
                    else:
                        tool_id = _fn_name_to_tool_id(fn_name)

                    call_record = {
                        "call_id": call_id,
                        "tool_name": tool_id,
                        "arguments": arguments,
                    }
                    all_tool_calls_made.append(call_record)
                    tool_calls_count += 1

                    # Append tool_call to timeline BEFORE HITL check
                    tool_entry = {
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
                    timeline.append(tool_entry)
                    tool_entry_idx = len(timeline) - 1

                    # Publish tool_call_start event (before HITL so frontend
                    # renders the tool card first, then HITL inline inside it)
                    await self._publish(
                        execution_id, workspace_id, "agent_tool_call_start",
                        conversation_id=conversation_id,
                        data=call_record,
                    )
                    await self._update_stream_state(
                        execution_id,
                        content=full_response,
                        thinking=full_thinking,
                        tool_calls=all_tool_calls_made,
                        timeline=timeline,
                    )
                    await self._update_execution_record(
                        db, execution_id,
                        tool_calls_count=tool_calls_count,
                        iteration_count=iteration_count,
                    )

                    # HITL policy check (with tool permission overrides)
                    risk_level = (
                        tool_info.get("risk_level", "low")
                        if tool_info and tool_info.get("type") == "builtin"
                        else "medium"
                    )
                    hitl_approved = True
                    hitl_steering = ""

                    # Check rate limits
                    rate_error = rate_limiter.check()
                    if rate_error:
                        timeline[tool_entry_idx]["success"] = False
                        timeline[tool_entry_idx]["error"] = rate_error
                        await self._publish(
                            execution_id, workspace_id, "agent_tool_call_result",
                            conversation_id=conversation_id,
                            data={
                                "call_id": call_id,
                                "tool_name": tool_id,
                                "success": False,
                                "error": rate_error,
                            },
                        )
                        tool_results_for_messages.append({
                            "tool_call_id": call_id,
                            "content": f"Tool error: {rate_error}",
                        })
                        continue

                    # Check async policy (agent override → global table → risk defaults)
                    from openforge.db.postgres import AsyncSessionLocal
                    async with AsyncSessionLocal() as policy_db:
                        policy_decision = await policy_engine.evaluate_async(
                            tool_id, risk_level, policy_db, agent=agent
                        )

                    if policy_decision == "blocked":
                        block_error = f"Tool '{tool_id}' is blocked by administrator policy."
                        timeline[tool_entry_idx]["success"] = False
                        timeline[tool_entry_idx]["error"] = block_error
                        await self._publish(
                            execution_id, workspace_id, "agent_tool_call_result",
                            conversation_id=conversation_id,
                            data={
                                "call_id": call_id,
                                "tool_name": tool_id,
                                "success": False,
                                "error": block_error,
                            },
                        )
                        tool_results_for_messages.append({
                            "tool_call_id": call_id,
                            "content": f"Tool error: {block_error}",
                        })
                        continue

                    if policy_decision == "hitl_required":
                        action_summary = (
                            f"Agent wants to execute '{tool_id}' with: "
                            f"{json.dumps(arguments, default=str)[:300]}"
                        )
                        async with AsyncSessionLocal() as hitl_db:
                            hitl_req = await hitl_service.create_request(
                                hitl_db,
                                workspace_id=workspace_id,
                                conversation_id=conversation_id,
                                tool_id=tool_id,
                                tool_input=arguments,
                                action_summary=action_summary,
                                risk_level=risk_level,
                                agent_id=agent.id,
                            )
                        hitl_id = str(hitl_req.id)
                        hitl_service.register_event(hitl_id)

                        # Embed HITL as sub-object of the tool_call entry
                        timeline[tool_entry_idx]["hitl"] = {
                            "hitl_id": hitl_id,
                            "action_summary": action_summary,
                            "risk_level": risk_level,
                            "agent_id": agent.id,
                            "status": "pending",
                            "resolution_note": None,
                        }

                        await self._publish(
                            execution_id, workspace_id, "agent_tool_hitl",
                            conversation_id=conversation_id,
                            data={
                                "call_id": call_id,
                                "hitl_id": hitl_id,
                                "action_summary": action_summary,
                                "risk_level": risk_level,
                                "agent_id": agent.id,
                                "status": "pending",
                            },
                        )

                        await self._update_stream_state(
                            execution_id,
                            content=full_response,
                            thinking=full_thinking,
                            tool_calls=all_tool_calls_made,
                            timeline=timeline,
                        )
                        await self._update_execution_record(
                            db, execution_id, status="paused_hitl"
                        )

                        # Wait for HITL decision, but also respect cancellation
                        async def _wait_cancel():
                            while not cancel_event.is_set():
                                await asyncio.sleep(0.25)

                        hitl_task = asyncio.create_task(
                            hitl_service.wait_for_decision(hitl_id, timeout=300.0)
                        )
                        cancel_task = asyncio.create_task(_wait_cancel())
                        done, pending = await asyncio.wait(
                            {hitl_task, cancel_task},
                            return_when=asyncio.FIRST_COMPLETED,
                        )
                        for t in pending:
                            t.cancel()
                            try:
                                await t
                            except (asyncio.CancelledError, Exception):
                                pass

                        if cancel_event.is_set():
                            was_cancelled = True
                            try:
                                async with AsyncSessionLocal() as _cancel_hitl_db:
                                    await hitl_service.deny(
                                        _cancel_hitl_db, uuid.UUID(hitl_id),
                                        note="Auto-denied: agent execution was cancelled",
                                    )
                            except Exception:
                                pass
                            break

                        hitl_approved = hitl_task.result() if hitl_task in done else False

                        await self._update_execution_record(
                            db, execution_id, status="running"
                        )

                        # Read resolution note for user steering
                        async with AsyncSessionLocal() as hitl_db:
                            from openforge.db.models import HITLRequest as HITLModel
                            _hitl_row = await hitl_db.get(HITLModel, uuid.UUID(hitl_id))
                            if _hitl_row and _hitl_row.resolution_note:
                                hitl_steering = _hitl_row.resolution_note

                        # Update tool_call entry's HITL sub-object
                        timeline[tool_entry_idx]["hitl"]["status"] = "approved" if hitl_approved else "denied"
                        timeline[tool_entry_idx]["hitl"]["resolution_note"] = hitl_steering or None

                        await self._publish(
                            execution_id, workspace_id, "agent_tool_hitl_resolved",
                            conversation_id=conversation_id,
                            data={
                                "call_id": call_id,
                                "hitl_id": hitl_id,
                                "status": "approved" if hitl_approved else "denied",
                                "resolution_note": hitl_steering or None,
                            },
                        )

                        await self._update_stream_state(
                            execution_id,
                            content=full_response,
                            thinking=full_thinking,
                            tool_calls=all_tool_calls_made,
                            timeline=timeline,
                        )

                        if not hitl_approved:
                            deny_msg = f"Tool '{tool_id}' was denied by user approval check."
                            if hitl_steering:
                                deny_msg += f"\n\nUser feedback: {hitl_steering}"
                            timeline[tool_entry_idx]["success"] = False
                            timeline[tool_entry_idx]["error"] = deny_msg
                            await self._publish(
                                execution_id, workspace_id, "agent_tool_call_result",
                                conversation_id=conversation_id,
                                data={
                                    "call_id": call_id,
                                    "tool_name": tool_id,
                                    "success": False,
                                    "error": deny_msg,
                                },
                            )
                            tool_results_for_messages.append({
                                "tool_call_id": call_id,
                                "content": f"Tool error: {deny_msg}",
                            })
                            continue

                    # Execute via the appropriate backend (timed)
                    tool_started_at = datetime.now(timezone.utc)
                    call_start_perf = time.perf_counter()

                    # Inject scope_path for agent.invoke so subagent can
                    # emit nested events targeting the correct timeline slot
                    _exec_arguments = arguments
                    if tool_id == "agent.invoke":
                        _exec_arguments = {**arguments, "_scope_path": [tool_entry_idx]}

                    if not tool_info:
                        result = await tool_dispatcher.execute(
                            tool_id=tool_id,
                            params=_exec_arguments,
                            workspace_id=str(workspace_id),
                            execution_id=execution_id,
                            conversation_id=str(conversation_id) if conversation_id else "",
                            agent_id=agent.id,
                        )
                        if not result.get("success"):
                            available = ", ".join(
                                _fn_name_to_tool_id(k)
                                for k in sorted(fn_name_to_tool_info.keys())
                            )
                            result = {
                                "success": False,
                                "error": (
                                    f"Tool '{tool_id}' is not available. "
                                    f"Do NOT retry this same tool name. "
                                    f"Available tools: {available}"
                                ),
                            }
                    elif tool_info["type"] == "mcp":
                        from openforge.services.mcp_service import execute_mcp_tool
                        result = await execute_mcp_tool(
                            server=tool_info["server"],
                            tool_name=tool_info["tool_name"],
                            arguments=_exec_arguments,
                        )
                    else:
                        result = await tool_dispatcher.execute(
                            tool_id=tool_id,
                            params=_exec_arguments,
                            workspace_id=str(workspace_id),
                            execution_id=execution_id,
                            conversation_id=str(conversation_id) if conversation_id else "",
                            agent_id=agent.id,
                        )

                    call_duration_ms = int((time.perf_counter() - call_start_perf) * 1000)
                    tool_finished_at = datetime.now(timezone.utc)
                    rate_limiter.record()

                    # Update timeline entry with result
                    if tool_id == "agent.invoke" and result.get("success"):
                        subagent_out = result.get("output") or {}
                        subagent_response = subagent_out.get("response", "")
                        subagent_timeline = subagent_out.get("timeline", [])
                        subagent_conv_id = subagent_out.get("conversation_id")

                        timeline[tool_entry_idx]["success"] = True
                        timeline[tool_entry_idx]["output"] = subagent_response
                        timeline[tool_entry_idx]["duration_ms"] = call_duration_ms
                        timeline[tool_entry_idx]["nested_timeline"] = subagent_timeline
                        timeline[tool_entry_idx]["subagent_conversation_id"] = subagent_conv_id

                        await self._publish(
                            execution_id, workspace_id, "agent_tool_call_result",
                            conversation_id=conversation_id,
                            data={
                                "call_id": call_id,
                                "tool_name": tool_id,
                                "success": True,
                                "output": subagent_response,
                                "duration_ms": call_duration_ms,
                                "nested_timeline": subagent_timeline,
                                "subagent_conversation_id": subagent_conv_id,
                            },
                        )

                        result_content = (
                            f"Subagent completed. Response:\n\n{subagent_response}"
                            if subagent_response
                            else "Subagent completed with no text response."
                        )
                        tool_results_for_messages.append({
                            "tool_call_id": call_id,
                            "content": result_content,
                        })
                        asyncio.create_task(
                            _persist_tool_call_log(
                                workspace_id=workspace_id,
                                conversation_id=conversation_id,
                                call_id=call_id,
                                tool_name=tool_id,
                                arguments=arguments,
                                success=True,
                                output=result_content[:_MAX_OUTPUT_LOG_CHARS],
                                error=None,
                                duration_ms=call_duration_ms,
                                started_at=tool_started_at,
                                finished_at=tool_finished_at,
                            )
                        )
                    else:
                        _output = result.get("output")
                        if isinstance(_output, str) and len(_output) > 2000:
                            _output = _output[:2000] + "…"
                        timeline[tool_entry_idx]["success"] = result.get("success", False)
                        timeline[tool_entry_idx]["output"] = _output
                        timeline[tool_entry_idx]["error"] = result.get("error")
                        timeline[tool_entry_idx]["duration_ms"] = call_duration_ms

                        await self._publish(
                            execution_id, workspace_id, "agent_tool_call_result",
                            conversation_id=conversation_id,
                            data={
                                "call_id": call_id,
                                "tool_name": tool_id,
                                "success": result.get("success", False),
                                "output": result.get("output"),
                                "error": result.get("error"),
                                "duration_ms": call_duration_ms,
                            },
                        )
                        await self._update_stream_state(
                            execution_id,
                            content=full_response,
                            thinking=full_thinking,
                            tool_calls=all_tool_calls_made,
                            timeline=timeline,
                        )

                        asyncio.create_task(
                            _persist_tool_call_log(
                                workspace_id=workspace_id,
                                conversation_id=conversation_id,
                                call_id=call_id,
                                tool_name=tool_id,
                                arguments=arguments,
                                success=result.get("success", False),
                                output=result.get("output"),
                                error=result.get("error"),
                                duration_ms=call_duration_ms,
                                started_at=tool_started_at,
                                finished_at=tool_finished_at,
                            )
                        )

                        # Format result content for message injection
                        if result.get("success"):
                            output = result.get("output")
                            if output is None:
                                result_content = "Tool executed successfully with no output."
                            elif isinstance(output, (dict, list)):
                                result_content = json.dumps(output, indent=2, default=str)
                            else:
                                result_content = str(output)
                            if result.get("truncated"):
                                result_content += f"\n[Output truncated at {result.get('original_length')} chars]"
                        else:
                            result_content = f"Tool error: {result.get('error', 'Unknown error')}"

                        # Summarize large tool outputs to keep context manageable
                        result_content = await self._maybe_summarize_tool_output(
                            db, workspace_id, result_content, tool_id,
                        )

                        if hitl_steering:
                            result_content += f"\n\n[User guidance at approval time]: {hitl_steering}"

                        tool_results_for_messages.append({
                            "tool_call_id": call_id,
                            "content": result_content,
                        })

                    # Check cancellation between tool calls
                    if cancel_event.is_set():
                        was_cancelled = True
                        break

                if was_cancelled:
                    break

                # Inject assistant message with tool_calls into the loop messages
                assistant_tool_message: dict = {"role": "assistant", "content": response_this_turn or ""}
                assistant_tool_message["tool_calls"] = [
                    {
                        "id": c.get("id") or c.get("call_id", ""),
                        "type": "function",
                        "function": {
                            "name": _tool_id_to_fn_name(c.get("name") or c.get("tool_name", "")),
                            "arguments": json.dumps(c.get("arguments", {}), default=str),
                        },
                    }
                    for c in tool_calls_this_turn
                ]
                loop_messages.append(assistant_tool_message)

                for tr in tool_results_for_messages:
                    loop_messages.append({
                        "role": "tool",
                        "tool_call_id": tr["tool_call_id"],
                        "content": tr["content"],
                    })

            # 9a. Final summary turn if no text response
            if not was_cancelled and not full_response.strip() and (all_tool_calls_made or full_thinking.strip()):
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
                                    execution_id, workspace_id, "agent_token",
                                    conversation_id=conversation_id,
                                    data=token,
                                )
                except Exception as e:
                    logger.warning("Final summary turn failed: %s", e)

            # 9. Save assistant message
            generation_ms = int((time.perf_counter() - generation_started) * 1000)

            msg = await conversation_service.add_message(
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
                trigger_auto_title=False,
                tool_calls=all_tool_calls_made if all_tool_calls_made else None,
                timeline=timeline if timeline else None,
                is_interrupted=was_cancelled,
            )

            # 10. Update execution record to completed
            final_status = "cancelled" if was_cancelled else "completed"
            await self._update_execution_record(
                db, execution_id,
                status=final_status,
                iteration_count=iteration_count,
                tool_calls_count=tool_calls_count,
                timeline=timeline,
                completed_at=datetime.now(timezone.utc),
            )

            # 11. Notify completion
            await self._publish(
                execution_id, workspace_id, "agent_done",
                conversation_id=conversation_id,
                message_id=str(msg.id),
                generation_ms=generation_ms,
                interrupted=was_cancelled,
            )

            # Publish execution_completed event
            await self._publish(
                execution_id, workspace_id, "execution_completed",
                conversation_id=conversation_id,
                agent_id=agent.id,
                status=final_status,
                iteration_count=iteration_count,
                tool_calls_count=tool_calls_count,
                duration_ms=generation_ms,
            )

            # Refresh conversation title using workspace default LLM (not the
            # runtime override) so it always works regardless of chat provider.
            try:
                from openforge.db.postgres import AsyncSessionLocal
                async with AsyncSessionLocal() as title_db:
                    await conversation_service.refresh_conversation_title(
                        title_db,
                        workspace_id=workspace_id,
                        conversation_id=conversation_id,
                    )
            except Exception as e:
                logger.warning(
                    "Chat title refresh failed for conversation %s: %s",
                    conversation_id, e,
                )

            # Embed the chat exchange for searchability
            if not was_cancelled and full_response and isinstance(user_content, str):
                from openforge.services.chat_embedding_service import chat_embedding_service

                _conv_title = conversation.title or ""
                _msg_id = msg.id

                try:
                    await chat_embedding_service.embed_exchange(
                        conversation_id=conversation_id,
                        workspace_id=workspace_id,
                        user_message=user_content,
                        assistant_response=full_response,
                        conversation_title=_conv_title,
                        message_id=_msg_id,
                    )
                except Exception as e:
                    logger.warning(
                        "Chat embedding failed for conversation %s: %s",
                        conversation_id, e,
                    )

        except Exception as e:
            logger.error(
                "Agent pipeline error for conversation %s: %s", conversation_id, e
            )
            await self._publish(
                execution_id, workspace_id, "agent_error",
                conversation_id=conversation_id,
                detail=str(e),
            )
            await self._update_execution_record(
                db, execution_id, status="failed", error_message=str(e),
                completed_at=datetime.now(timezone.utc),
            )
        finally:
            # Clean up Redis cancel subscription
            if _cancel_listener_task and not _cancel_listener_task.done():
                _cancel_listener_task.cancel()
                try:
                    await _cancel_listener_task
                except (asyncio.CancelledError, Exception):
                    pass
            if _cancel_redis_sub:
                try:
                    await _cancel_redis_sub.unsubscribe(f"agent_cancel:{conversation_id}")
                    await _cancel_redis_sub.aclose()
                except Exception:
                    pass
            if _cancel_redis_conn:
                try:
                    await _cancel_redis_conn.aclose()
                except Exception:
                    pass
            # Clean up Redis stream state
            if await self._should_use_redis():
                try:
                    from openforge.db.redis_client import get_redis
                    redis = await get_redis()
                    await redis.delete(f"stream_state:{execution_id}")
                except Exception:
                    pass
            self._cancel_events.pop(str(conversation_id), None)

    async def execute_subagent(
        self,
        *,
        workspace_id: UUID,
        instruction: str,
        db: AsyncSession,
        agent_id: Optional[str] = None,
        parent_execution_id: Optional[str] = None,
        parent_conversation_id: Optional[UUID] = None,
        parent_workspace_id: Optional[UUID] = None,
        cancel_event: Optional[asyncio.Event] = None,
        scope_path: Optional[list[int]] = None,
        execution_chain_id: Optional[str] = None,
    ) -> dict:
        """Run a subagent in collect mode — no streaming.

        If parent_conversation_id and parent_workspace_id are provided,
        progress events are wrapped as ``agent_nested_event`` with
        ``scope_path`` so the UI can render them at the correct nesting
        depth inside the parent timeline.

        ``execution_chain_id`` is the root execution ID shared by all
        agents in the chain; used for cascading cancel via Redis.
        """
        # Inherit parent's cancel event so subagent stops when parent is cancelled
        if cancel_event is None and parent_conversation_id:
            cancel_event = self._cancel_events.get(str(parent_conversation_id))

        execution_id = parent_execution_id or str(uuid.uuid4())

        # Subscribe to cascading cancel via execution_chain_id
        _chain_cancel_conn = None
        _chain_cancel_sub = None
        _chain_cancel_task = None
        if execution_chain_id and cancel_event:
            try:
                _chain_cancel_conn, _chain_cancel_sub, _chain_cancel_task = (
                    await self._subscribe_redis_cancel(execution_chain_id, cancel_event)
                )
            except Exception:
                pass

        # Validate agent_id against registry; fall back to workspace_agent if unknown
        target_agent: AgentDefinition | None = None
        if agent_id:
            from openforge.core.agent_registry import agent_registry as _sub_reg
            target_agent = _sub_reg.get(agent_id)
            if not target_agent:
                logger.warning(
                    "Unknown agent_id '%s' requested for subagent, falling back to workspace_agent",
                    agent_id,
                )
                agent_id = "workspace_agent"

        resolved_agent_id = agent_id or "workspace_agent"

        temp_conv = Conversation(
            workspace_id=workspace_id,
            title=f"[subagent] {instruction[:80]}",
            is_subagent=True,
            subagent_agent_id=resolved_agent_id,
        )
        db.add(temp_conv)
        await db.commit()
        await db.refresh(temp_conv)
        conv_id = temp_conv.id

        # Create AgentExecution record for subagent invocations so they appear in Recent Executions
        sub_exec_id = uuid.uuid4()
        sub_exec = AgentExecution(
            id=sub_exec_id,
            workspace_id=workspace_id,
            conversation_id=conv_id,
            agent_id=resolved_agent_id,
            status="running",
        )
        db.add(sub_exec)
        await db.commit()

        try:
            await conversation_service.add_message(db, conv_id, role="user", content=instruction)

            try:
                provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
                    db, workspace_id
                )
            except Exception as exc:
                try:
                    await db.refresh(sub_exec)
                    sub_exec.status = "failed"
                    sub_exec.error_message = f"Could not get LLM provider: {exc}"
                    sub_exec.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                except Exception:
                    pass
                return {
                    "response": f"Error: could not get LLM provider: {exc}",
                    "timeline": [],
                    "conversation_id": str(conv_id),
                }

            openai_tools: list[dict] = []
            fn_name_to_tool_info_sub: dict[str, dict] = {}
            # Tool-less agents (e.g. optimizer) skip tool loading
            if not target_agent or target_agent.tools_enabled:
                try:
                    raw_tools = await tool_dispatcher.list_tools()
                    for t in raw_tools:
                        fn = _tool_id_to_fn_name(t["id"])
                        fn_name_to_tool_info_sub[fn] = {
                            "type": "builtin",
                            "tool_id": t["id"],
                            "risk_level": t.get("risk_level", "low"),
                        }
                    openai_tools = _tools_to_openai_schema(raw_tools)
                except Exception:
                    pass

            if target_agent:
                system_prompt = await resolve_agent_system_prompt(db, target_agent)
            else:
                system_prompt = await resolve_prompt_text(
                    db,
                    "subagent_system",
                    workspace_id=workspace_id,
                )

            loop_messages = list(
                context_assembler.assemble(
                    system_prompt=system_prompt,
                    conversation_messages=[{"role": "user", "content": instruction}],
                )
            )

            full_response = ""
            timeline: list[dict] = []
            max_loops = 10
            _depth = len(scope_path) if scope_path else 0
            _last_progress_publish = 0.0
            _PROGRESS_INTERVAL = 0.1 * (_depth + 1)  # throttle scales with depth

            _sub_cancelled = False

            # Helper: publish a nested event to the parent timeline
            async def _emit_nested(inner_event: dict) -> None:
                nonlocal _last_progress_publish
                if not (parent_conversation_id and parent_workspace_id and scope_path is not None):
                    return
                now = time.monotonic()
                if now - _last_progress_publish < _PROGRESS_INTERVAL:
                    return
                _last_progress_publish = now
                await self._publish(
                    execution_id, parent_workspace_id, "agent_nested_event",
                    conversation_id=parent_conversation_id,
                    data={
                        "scope_path": scope_path,
                        "event": inner_event,
                    },
                )

            # Emit model_selection as the first nested event
            _sub_model_entry = {
                "type": "model_selection",
                "provider_name": provider_name,
                "provider_display_name": provider_name,
                "model": model,
                "is_override": False,
            }
            timeline.append(_sub_model_entry)
            if parent_conversation_id and parent_workspace_id and scope_path is not None:
                # Force publish model_selection (bypass throttle)
                _last_progress_publish = 0.0
                await _emit_nested({"type": "agent_model_selection", "data": _sub_model_entry})

            for _ in range(max_loops):
                if cancel_event and cancel_event.is_set():
                    _sub_cancelled = True
                    break

                tool_calls_this_turn: list[dict] = []
                response_this_turn = ""
                thinking_this_turn = ""
                finish_reason = "stop"

                try:
                    async for event in llm_gateway.stream_with_tools(
                        messages=loop_messages,
                        tools=openai_tools,
                        provider_name=provider_name,
                        api_key=api_key,
                        model=model,
                        base_url=base_url,
                        include_thinking=True,
                    ):
                        if cancel_event and cancel_event.is_set():
                            _sub_cancelled = True
                            break
                        etype = event.get("type")
                        if etype == "thinking":
                            chunk = event.get("content", "")
                            if chunk:
                                thinking_this_turn += chunk
                                if timeline and timeline[-1].get("type") == "thinking" and not timeline[-1].get("done"):
                                    timeline[-1]["content"] = timeline[-1].get("content", "") + chunk
                                else:
                                    timeline.append({"type": "thinking", "content": chunk})
                                await _emit_nested({"type": "agent_thinking", "data": chunk})
                        elif etype == "token":
                            tok = event.get("content", "")
                            full_response += tok
                            response_this_turn += tok
                            if timeline and timeline[-1].get("type") == "thinking" and not timeline[-1].get("done"):
                                timeline[-1]["done"] = True
                            await _emit_nested({"type": "agent_token", "data": tok})
                        elif etype == "tool_calls":
                            tool_calls_this_turn = event.get("calls", [])
                            if timeline and timeline[-1].get("type") == "thinking" and not timeline[-1].get("done"):
                                timeline[-1]["done"] = True
                        elif etype == "done":
                            finish_reason = event.get("finish_reason", "stop")
                except Exception as exc:
                    logger.warning("Subagent LLM error: %s", exc)
                    break

                if _sub_cancelled:
                    break

                if not tool_calls_this_turn or finish_reason == "stop":
                    break

                tool_results_msgs: list[dict] = []
                for call in tool_calls_this_turn:
                    if cancel_event and cancel_event.is_set():
                        _sub_cancelled = True
                        break

                    call_id = call.get("id") or str(uuid.uuid4())
                    fn_name = call.get("name", "")
                    args = call.get("arguments", {})

                    sub_tool_info = fn_name_to_tool_info_sub.get(fn_name)
                    sub_tool_id = sub_tool_info["tool_id"] if sub_tool_info else _fn_name_to_tool_id(fn_name)

                    # Append tool_call entry BEFORE policy check (same pattern as run())
                    tool_call_entry = {
                        "type": "tool_call",
                        "call_id": call_id,
                        "tool_name": sub_tool_id,
                        "arguments": args,
                        "hitl": None,
                        "success": None,
                        "output": None,
                        "error": None,
                        "duration_ms": None,
                        "nested_timeline": None,
                        "subagent_conversation_id": None,
                    }
                    timeline.append(tool_call_entry)
                    _tc_idx = len(timeline) - 1

                    # Emit tool_call_start via nested event
                    _last_progress_publish = 0.0  # force publish
                    await _emit_nested({
                        "type": "agent_tool_call_start",
                        "data": {"call_id": call_id, "tool_name": sub_tool_id, "arguments": args},
                    })

                    # HITL policy check (mirrors run() logic)
                    sub_risk_level = (
                        sub_tool_info.get("risk_level", "low")
                        if sub_tool_info and sub_tool_info.get("type") == "builtin"
                        else "medium"
                    )
                    _sub_hitl_approved = True
                    _sub_hitl_steering = ""

                    from openforge.db.postgres import AsyncSessionLocal
                    async with AsyncSessionLocal() as _sub_policy_db:
                        _sub_policy_decision = await policy_engine.evaluate_async(
                            sub_tool_id, sub_risk_level, _sub_policy_db, agent=target_agent
                        )

                    if _sub_policy_decision == "blocked":
                        block_err = f"Tool '{sub_tool_id}' is blocked by administrator policy."
                        timeline[_tc_idx]["success"] = False
                        timeline[_tc_idx]["error"] = block_err
                        _last_progress_publish = 0.0
                        await _emit_nested({
                            "type": "agent_tool_call_result",
                            "data": {"call_id": call_id, "tool_name": sub_tool_id, "success": False, "error": block_err},
                        })
                        tool_results_msgs.append({"tool_call_id": call_id, "content": f"Tool error: {block_err}"})
                        continue

                    if _sub_policy_decision == "hitl_required" and parent_conversation_id and parent_workspace_id:
                        _sub_action_summary = (
                            f"Subagent wants to execute '{sub_tool_id}' with: "
                            f"{json.dumps(args, default=str)[:300]}"
                        )
                        async with AsyncSessionLocal() as _sub_hitl_db:
                            _sub_hitl_req = await hitl_service.create_request(
                                _sub_hitl_db,
                                workspace_id=parent_workspace_id,
                                conversation_id=parent_conversation_id,
                                tool_id=sub_tool_id,
                                tool_input=args,
                                action_summary=_sub_action_summary,
                                risk_level=sub_risk_level,
                                agent_id=resolved_agent_id,
                            )
                        _sub_hitl_id = str(_sub_hitl_req.id)
                        hitl_service.register_event(_sub_hitl_id)

                        # Embed HITL as sub-object of the tool_call entry
                        timeline[_tc_idx]["hitl"] = {
                            "hitl_id": _sub_hitl_id,
                            "action_summary": _sub_action_summary,
                            "risk_level": sub_risk_level,
                            "agent_id": resolved_agent_id,
                            "status": "pending",
                            "resolution_note": None,
                        }

                        _last_progress_publish = 0.0
                        await _emit_nested({
                            "type": "agent_tool_hitl",
                            "data": {
                                "call_id": call_id,
                                "hitl_id": _sub_hitl_id,
                                "action_summary": _sub_action_summary,
                                "risk_level": sub_risk_level,
                                "agent_id": resolved_agent_id,
                                "status": "pending",
                            },
                        })

                        # Wait for HITL decision, respecting cancellation
                        async def _sub_wait_cancel():
                            while not (cancel_event and cancel_event.is_set()):
                                await asyncio.sleep(0.25)

                        _sub_hitl_task = asyncio.create_task(
                            hitl_service.wait_for_decision(_sub_hitl_id, timeout=300.0)
                        )
                        _sub_cancel_task = asyncio.create_task(_sub_wait_cancel())
                        _sub_done, _sub_pending = await asyncio.wait(
                            {_sub_hitl_task, _sub_cancel_task},
                            return_when=asyncio.FIRST_COMPLETED,
                        )
                        for _t in _sub_pending:
                            _t.cancel()
                            try:
                                await _t
                            except (asyncio.CancelledError, Exception):
                                pass

                        if cancel_event and cancel_event.is_set():
                            _sub_cancelled = True
                            try:
                                async with AsyncSessionLocal() as _sub_cancel_db:
                                    await hitl_service.deny(
                                        _sub_cancel_db, uuid.UUID(_sub_hitl_id),
                                        note="Auto-denied: agent execution was cancelled",
                                    )
                            except Exception:
                                pass
                            break

                        _sub_hitl_approved = _sub_hitl_task.result() if _sub_hitl_task in _sub_done else False

                        # Read resolution note
                        async with AsyncSessionLocal() as _sub_hitl_db:
                            from openforge.db.models import HITLRequest as HITLModel
                            _sub_hitl_row = await _sub_hitl_db.get(HITLModel, uuid.UUID(_sub_hitl_id))
                            if _sub_hitl_row and _sub_hitl_row.resolution_note:
                                _sub_hitl_steering = _sub_hitl_row.resolution_note

                        # Update tool_call entry's HITL sub-object
                        timeline[_tc_idx]["hitl"]["status"] = "approved" if _sub_hitl_approved else "denied"
                        timeline[_tc_idx]["hitl"]["resolution_note"] = _sub_hitl_steering or None

                        _last_progress_publish = 0.0
                        await _emit_nested({
                            "type": "agent_tool_hitl_resolved",
                            "data": {
                                "call_id": call_id,
                                "hitl_id": _sub_hitl_id,
                                "status": "approved" if _sub_hitl_approved else "denied",
                                "resolution_note": _sub_hitl_steering or None,
                            },
                        })

                        if not _sub_hitl_approved:
                            _deny_msg = f"Tool '{sub_tool_id}' was denied by user approval check."
                            if _sub_hitl_steering:
                                _deny_msg += f"\n\nUser feedback: {_sub_hitl_steering}"
                            timeline[_tc_idx]["success"] = False
                            timeline[_tc_idx]["error"] = _deny_msg
                            _last_progress_publish = 0.0
                            await _emit_nested({
                                "type": "agent_tool_call_result",
                                "data": {"call_id": call_id, "tool_name": sub_tool_id, "success": False, "error": _deny_msg},
                            })
                            tool_results_msgs.append({"tool_call_id": call_id, "content": f"Tool error: {_deny_msg}"})
                            continue

                    # Inject scope_path for nested agent.invoke calls
                    _sub_exec_args = args
                    if sub_tool_id == "agent.invoke" and scope_path is not None:
                        _sub_exec_args = {**args, "_scope_path": list(scope_path) + [_tc_idx]}

                    if not sub_tool_info:
                        sub_result = {"success": False, "error": f"Tool '{sub_tool_id}' not available"}
                    else:
                        sub_result = await tool_dispatcher.execute(
                            tool_id=sub_tool_id,
                            params=_sub_exec_args,
                            workspace_id=str(workspace_id),
                            execution_id=execution_id,
                            agent_id=target_agent.id if target_agent else "",
                        )

                    # Update the tool_call entry with result
                    if sub_tool_id == "agent.invoke" and sub_result.get("success"):
                        subagent_out = sub_result.get("output") or {}
                        subagent_response = subagent_out.get("response", "")
                        subagent_timeline = subagent_out.get("timeline", [])
                        subagent_conv_id = subagent_out.get("conversation_id")

                        timeline[_tc_idx]["success"] = True
                        timeline[_tc_idx]["output"] = subagent_response
                        timeline[_tc_idx]["nested_timeline"] = subagent_timeline
                        timeline[_tc_idx]["subagent_conversation_id"] = subagent_conv_id
                    else:
                        _out = sub_result.get("output")
                        if isinstance(_out, str) and len(_out) > 2000:
                            _out = _out[:2000] + "…"
                        timeline[_tc_idx]["success"] = sub_result.get("success", False)
                        timeline[_tc_idx]["output"] = _out
                        timeline[_tc_idx]["error"] = sub_result.get("error")

                    _last_progress_publish = 0.0
                    await _emit_nested({
                        "type": "agent_tool_call_result",
                        "data": {
                            "call_id": call_id,
                            "tool_name": sub_tool_id,
                            "success": timeline[_tc_idx].get("success", False),
                            "output": timeline[_tc_idx].get("output"),
                            "error": timeline[_tc_idx].get("error"),
                            "nested_timeline": timeline[_tc_idx].get("nested_timeline"),
                            "subagent_conversation_id": timeline[_tc_idx].get("subagent_conversation_id"),
                        },
                    })

                    if sub_tool_id == "agent.invoke" and sub_result.get("success"):
                        subagent_resp = (sub_result.get("output") or {}).get("response", "")
                        rc = (
                            f"Subagent completed. Response:\n\n{subagent_resp}"
                            if subagent_resp
                            else "Subagent completed with no text response."
                        )
                    elif sub_result.get("success"):
                        out = sub_result.get("output")
                        if out is None:
                            rc = "Tool executed successfully with no output."
                        elif isinstance(out, (dict, list)):
                            rc = json.dumps(out, indent=2, default=str)
                        else:
                            rc = str(out)
                    else:
                        rc = f"Tool error: {sub_result.get('error', 'Unknown error')}"

                    if _sub_hitl_steering:
                        rc += f"\n\n[User guidance at approval time]: {_sub_hitl_steering}"

                    tool_results_msgs.append({"tool_call_id": call_id, "content": rc})

                if _sub_cancelled:
                    break

                asst_msg: dict = {"role": "assistant", "content": response_this_turn or ""}
                asst_msg["tool_calls"] = [
                    {
                        "id": c.get("id") or c.get("call_id", ""),
                        "type": "function",
                        "function": {
                            "name": _tool_id_to_fn_name(c.get("name") or c.get("tool_name", "")),
                            "arguments": json.dumps(c.get("arguments", {}), default=str),
                        },
                    }
                    for c in tool_calls_this_turn
                ]
                loop_messages.append(asst_msg)
                for tr in tool_results_msgs:
                    loop_messages.append({
                        "role": "tool",
                        "tool_call_id": tr["tool_call_id"],
                        "content": tr["content"],
                    })

            # Final summary turn if no text response
            if not full_response.strip():
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
                            full_response += event.get("content", "")
                except Exception:
                    pass

            await conversation_service.add_message(
                db, conv_id, role="assistant", content=full_response, timeline=timeline
            )

            # Update execution record on success
            tool_count = sum(1 for t in timeline if t.get("type") == "tool_call")
            iter_count = sum(1 for t in timeline if t.get("type") == "thinking")
            try:
                await db.refresh(sub_exec)
                sub_exec.status = "completed"
                sub_exec.timeline = timeline
                sub_exec.tool_calls_count = tool_count
                sub_exec.iteration_count = max(iter_count, 1)
                sub_exec.completed_at = datetime.now(timezone.utc)
                await db.commit()
            except Exception:
                logger.warning("Failed to update subagent execution record")

            return {
                "response": full_response,
                "timeline": timeline,
                "conversation_id": str(conv_id),
            }
        except Exception as exc:
            logger.error("Subagent execution error: %s", exc)
            try:
                await db.refresh(sub_exec)
                sub_exec.status = "failed"
                sub_exec.error_message = str(exc)
                sub_exec.completed_at = datetime.now(timezone.utc)
                await db.commit()
            except Exception:
                logger.warning("Failed to update subagent execution record on error")
            return {
                "response": f"Subagent error: {exc}",
                "timeline": [],
                "conversation_id": str(conv_id),
            }
        finally:
            # Clean up chain cancel subscription
            if _chain_cancel_task and not _chain_cancel_task.done():
                _chain_cancel_task.cancel()
                try:
                    await _chain_cancel_task
                except (asyncio.CancelledError, Exception):
                    pass
            if _chain_cancel_sub:
                try:
                    await _chain_cancel_sub.unsubscribe(f"agent_cancel:{execution_chain_id}")
                    await _chain_cancel_sub.aclose()
                except Exception:
                    pass
            if _chain_cancel_conn:
                try:
                    await _chain_cancel_conn.aclose()
                except Exception:
                    pass


agent_engine = AgentExecutionEngine()
