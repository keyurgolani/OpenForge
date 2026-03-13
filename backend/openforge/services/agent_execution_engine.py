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
from openforge.core.search_engine import search_engine
from openforge.core.context_assembler import ContextAssembler
from openforge.core.agent_definition import AgentDefinition
from openforge.services.conversation_service import conversation_service
from openforge.services.llm_service import llm_service
from openforge.services.chat_retrieval import (
    build_context_sources,
    select_relevant_rag_results,
)
from openforge.services.attachment_pipeline import (
    extract_http_urls,
    get_extractor,
    resolve_attachment_pipeline,
)
from openforge.services.tool_dispatcher import tool_dispatcher
from openforge.services.policy_engine import policy_engine
from openforge.services.hitl_service import hitl_service
from openforge.db.models import (
    AgentExecution, Config, Conversation, Knowledge,
    MessageAttachment, TaskLog, ToolCallLog, Workspace,
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

        # Fallback: direct WebSocket
        from openforge.api.websocket import ws_manager
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
                                "type": "chat_stream_snapshot",
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

                        summary_result = await self.execute_subagent(
                            workspace_id=workspace_id,
                            instruction=(
                                f"You are given the complete history of a chat conversation called '{mname}'.\n\n"
                                f"Conversation History:\n{history_text[:12000]}\n\n"
                                f"Provide a comprehensive summary of this conversation including:\n"
                                f"- Main topics discussed\n"
                                f"- Key decisions or conclusions reached\n"
                                f"- Important information, data, or facts mentioned\n"
                                f"- Any action items or next steps if mentioned\n\n"
                                f"Be thorough but concise. This summary will be used as context for another agent."
                            ),
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
                execution_id, workspace_id, "chat_error",
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

        # 1. Save user message
        _user_metadata = {"optimize": True} if optimize else None
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
                    execution_id, workspace_id, "chat_attachments_processed",
                    conversation_id=conversation_id,
                    data=all_attachments_processed,
                )
                await self._update_stream_state(
                    execution_id,
                    attachments_processed=all_attachments_processed,
                )

            # 4. RAG context retrieval (if agent has RAG enabled)
            context_sources: list[dict] = []
            rag_results: list = []
            if agent.rag_enabled:
                rag_query = user_content
                if attachment_context:
                    rag_query = f"{rag_query}\n{attachment_context}"
                if url_context:
                    rag_query = f"{rag_query}\n{url_context}"

                raw_rag_results = search_engine.search(
                    query=rag_query,
                    workspace_id=str(workspace_id),
                    limit=agent.rag_limit * 2 + 2,
                    score_threshold=agent.rag_score_threshold,
                )
                rag_results = select_relevant_rag_results(raw_rag_results, limit=agent.rag_limit)
                context_sources = build_context_sources(rag_results)

            if context_sources:
                await self._publish(
                    execution_id, workspace_id, "chat_sources",
                    conversation_id=conversation_id,
                    data=context_sources,
                )
                await self._update_stream_state(execution_id, sources=context_sources)

            # 5. Assemble initial prompt
            history = await conversation_service.get_recent_messages(
                db, conversation_id, limit=agent.history_limit
            )

            # Load agent system prompt — use DB override if set, otherwise catalogue default
            from openforge.api.prompts import PROMPT_CATALOGUE
            _agent_prompt_entry = next((p for p in PROMPT_CATALOGUE if p["id"] == "agent_system"), None)
            _agent_prompt_default = _agent_prompt_entry["default"] if _agent_prompt_entry else ""
            _prompt_cfg = await db.execute(
                select(Config).where(Config.key == "prompt.agent_system")
            )
            _prompt_row = _prompt_cfg.scalar_one_or_none()

            # Use agent's system_prompt if set, otherwise fall back to catalogue
            if agent.system_prompt:
                system_prompt = agent.system_prompt
            else:
                system_prompt = (
                    _prompt_row.value.get("text")
                    if _prompt_row and _prompt_row.value and "text" in _prompt_row.value
                    else _agent_prompt_default
                )

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
                rag_results=rag_results,
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
                    execution_id, workspace_id, "chat_error",
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

            loop_messages = list(assembled)

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
                                    execution_id, workspace_id, "chat_thinking",
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
                                    execution_id, workspace_id, "chat_token",
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
                        execution_id, workspace_id, "chat_error",
                        conversation_id=conversation_id,
                        detail=str(e),
                    )
                    await self._update_execution_record(
                        db, execution_id, status="failed", error_message=str(e),
                        completed_at=datetime.now(timezone.utc),
                    )
                    return

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

                    # Update execution tracking (defer chat_tool_call publish
                    # until after HITL check so HITL card appears first)
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

                    # Check async policy (includes ToolPermission table)
                    from openforge.db.postgres import AsyncSessionLocal
                    async with AsyncSessionLocal() as policy_db:
                        policy_decision = await policy_engine.evaluate_async(
                            tool_id, risk_level, policy_db
                        )

                    if policy_decision == "blocked":
                        # Tool is blocked — publish tool_call then result
                        await self._publish(
                            execution_id, workspace_id, "chat_tool_call",
                            conversation_id=conversation_id,
                            data=call_record,
                        )
                        result = {
                            "success": False,
                            "error": f"Tool '{tool_id}' is blocked by administrator policy.",
                        }
                        tool_results_for_messages.append({
                            "tool_call_id": call_id,
                            "content": f"Tool error: {result['error']}",
                        })
                        timeline.append({
                            "type": "tool_call",
                            "call_id": call_id,
                            "tool_name": tool_id,
                            "arguments": arguments,
                            "success": False,
                            "error": result["error"],
                        })
                        await self._publish(
                            execution_id, workspace_id, "chat_tool_result",
                            conversation_id=conversation_id,
                            data={
                                "call_id": call_id,
                                "tool_name": tool_id,
                                "success": False,
                                "error": result["error"],
                            },
                        )
                        continue

                    hitl_steering = ""
                    if tool_info and policy_decision == "hitl_required":
                        action_summary = (
                            f"Agent wants to execute '{tool_id}' with: "
                            f"{json.dumps(arguments, default=str)[:300]}"
                        )
                        from openforge.db.postgres import AsyncSessionLocal
                        async with AsyncSessionLocal() as hitl_db:
                            hitl_req = await hitl_service.create_request(
                                hitl_db,
                                workspace_id=workspace_id,
                                conversation_id=conversation_id,
                                tool_id=tool_id,
                                tool_input=arguments,
                                action_summary=action_summary,
                                risk_level=risk_level,
                            )
                        hitl_id = str(hitl_req.id)

                        hitl_event_obj = hitl_service.register_event(hitl_id)

                        hitl_entry = {
                            "type": "hitl_request",
                            "hitl_id": hitl_id,
                            "tool_id": tool_id,
                            "tool_input": arguments,
                            "action_summary": action_summary,
                            "risk_level": risk_level,
                            "status": "pending",
                        }
                        timeline.append(hitl_entry)

                        await self._publish(
                            execution_id, workspace_id, "chat_hitl_request",
                            conversation_id=conversation_id,
                            data={
                                "hitl_id": hitl_id,
                                "tool_id": tool_id,
                                "tool_input": arguments,
                                "action_summary": action_summary,
                                "risk_level": risk_level,
                            },
                        )

                        # Persist timeline with HITL entry so reconnecting clients see it
                        await self._update_stream_state(
                            execution_id,
                            content=full_response,
                            thinking=full_thinking,
                            tool_calls=all_tool_calls_made,
                            timeline=timeline,
                        )

                        # Update execution status to paused
                        await self._update_execution_record(
                            db, execution_id, status="paused_hitl"
                        )

                        hitl_approved = await hitl_service.wait_for_decision(hitl_id, timeout=300.0)

                        # Update execution status back to running
                        await self._update_execution_record(
                            db, execution_id, status="running"
                        )

                        # Read resolution note for user steering
                        async with AsyncSessionLocal() as hitl_db:
                            from openforge.db.models import HITLRequest as HITLModel
                            _hitl_row = await hitl_db.get(HITLModel, uuid.UUID(hitl_id))
                            if _hitl_row and _hitl_row.resolution_note:
                                hitl_steering = _hitl_row.resolution_note

                        # Update timeline entry with resolution
                        for i, entry in enumerate(timeline):
                            if entry.get("type") == "hitl_request" and entry.get("hitl_id") == hitl_id:
                                timeline[i] = {
                                    **entry,
                                    "status": "approved" if hitl_approved else "denied",
                                }
                                break

                        await self._publish(
                            execution_id, workspace_id, "chat_hitl_resolved",
                            conversation_id=conversation_id,
                            data={
                                "hitl_id": hitl_id,
                                "status": "approved" if hitl_approved else "denied",
                            },
                        )

                        # Persist resolved timeline for reconnecting clients
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
                            result = {
                                "success": False,
                                "error": deny_msg,
                            }
                            tool_results_for_messages.append({
                                "tool_call_id": call_id,
                                "content": f"Tool error: {result['error']}",
                            })
                            continue

                    # Publish tool call to frontend (after HITL gate so
                    # the HITL card appears before the tool call badge)
                    # Add pending tool_call to timeline for reconnecting clients
                    timeline.append({
                        "type": "tool_call",
                        "call_id": call_id,
                        "tool_name": tool_id,
                        "arguments": arguments,
                    })
                    await self._publish(
                        execution_id, workspace_id, "chat_tool_call",
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

                    # Execute via the appropriate backend (timed)
                    tool_started_at = datetime.now(timezone.utc)
                    call_start_perf = time.perf_counter()

                    if not tool_info:
                        # Unrecognised function name — forward to tool server
                        # which can resolve aliases before failing.
                        result = await tool_dispatcher.execute(
                            tool_id=tool_id,
                            params=arguments,
                            workspace_id=str(workspace_id),
                            execution_id=execution_id,
                            conversation_id=str(conversation_id) if conversation_id else "",
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
                            arguments=arguments,
                        )
                    else:
                        result = await tool_dispatcher.execute(
                            tool_id=tool_id,
                            params=arguments,
                            workspace_id=str(workspace_id),
                            execution_id=execution_id,
                            conversation_id=str(conversation_id) if conversation_id else "",
                        )

                    call_duration_ms = int((time.perf_counter() - call_start_perf) * 1000)
                    tool_finished_at = datetime.now(timezone.utc)

                    # Helper: find and update pending tool_call entry or append
                    def _update_or_append_tool_timeline(entry: dict) -> None:
                        for idx, t in enumerate(timeline):
                            if t.get("type") == "tool_call" and t.get("call_id") == call_id:
                                timeline[idx] = entry
                                return
                        timeline.append(entry)

                    # Special handling: agent.invoke → subagent_invocation
                    if tool_id == "agent.invoke" and result.get("success"):
                        subagent_out = result.get("output") or {}
                        subagent_response = subagent_out.get("response", "")
                        subagent_timeline = subagent_out.get("timeline", [])
                        subagent_conv_id = subagent_out.get("conversation_id")

                        invocation_entry = {
                            "type": "subagent_invocation",
                            "call_id": call_id,
                            "tool_name": tool_id,
                            "arguments": arguments,
                            "success": True,
                            "subagent_response": subagent_response,
                            "subagent_timeline": subagent_timeline,
                            "subagent_conversation_id": subagent_conv_id,
                        }
                        _update_or_append_tool_timeline(invocation_entry)

                        await self._publish(
                            execution_id, workspace_id, "chat_subagent_invocation",
                            conversation_id=conversation_id,
                            data=invocation_entry,
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
                        continue

                    _output = result.get("output")
                    if isinstance(_output, str) and len(_output) > 2000:
                        _output = _output[:2000] + "…"
                    _update_or_append_tool_timeline({
                        "type": "tool_call",
                        "call_id": call_id,
                        "tool_name": tool_id,
                        "arguments": arguments,
                        "success": result.get("success", False),
                        "output": _output,
                        "error": result.get("error"),
                    })

                    result_record = {
                        "call_id": call_id,
                        "tool_name": tool_id,
                        "success": result.get("success", False),
                        "output": result.get("output"),
                        "error": result.get("error"),
                    }

                    await self._publish(
                        execution_id, workspace_id, "chat_tool_result",
                        conversation_id=conversation_id,
                        data=result_record,
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

                    # Inject HITL steering after tool result for approved requests
                    if hitl_steering:
                        result_content += f"\n\n[User guidance at approval time]: {hitl_steering}"

                    tool_results_for_messages.append({
                        "tool_call_id": call_id,
                        "content": result_content,
                    })

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
                                    execution_id, workspace_id, "chat_token",
                                    conversation_id=conversation_id,
                                    data=token,
                                )
                except Exception as e:
                    logger.warning("Final summary turn failed: %s", e)

            # 9. Save assistant message
            generation_ms = int((time.perf_counter() - generation_started) * 1000)
            has_runtime_override = bool(provider_id or model_id)

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
                execution_id, workspace_id, "chat_done",
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

            # Refresh conversation title directly (not as background task) so it
            # completes before the Celery worker closes the event loop.
            try:
                from openforge.db.postgres import AsyncSessionLocal
                async with AsyncSessionLocal() as title_db:
                    await conversation_service.refresh_conversation_title(
                        title_db,
                        workspace_id=workspace_id,
                        conversation_id=conversation_id,
                        provider_name=provider_name if has_runtime_override else None,
                        api_key=api_key if has_runtime_override else None,
                        model=model if has_runtime_override else None,
                        base_url=base_url if has_runtime_override else None,
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
                execution_id, workspace_id, "chat_error",
                conversation_id=conversation_id,
                detail=str(e),
            )
            await self._update_execution_record(
                db, execution_id, status="failed", error_message=str(e),
                completed_at=datetime.now(timezone.utc),
            )
        finally:
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
    ) -> dict:
        """Run a subagent in collect mode — no streaming.

        If parent_conversation_id and parent_workspace_id are provided,
        progress events are streamed to the parent conversation so the UI
        can show real-time subagent activity.
        """
        execution_id = parent_execution_id or str(uuid.uuid4())

        temp_conv = Conversation(
            workspace_id=workspace_id,
            title=f"[subagent] {instruction[:80]}",
            is_subagent=True,
            subagent_agent_id=agent_id or "workspace_agent",
        )
        db.add(temp_conv)
        await db.commit()
        await db.refresh(temp_conv)
        conv_id = temp_conv.id

        # Resolve specific agent if agent_id is provided
        target_agent: AgentDefinition | None = None
        if agent_id:
            from openforge.core.agent_registry import agent_registry as _sub_reg
            target_agent = _sub_reg.get(agent_id)

        # Create AgentExecution record for subagent invocations so they appear in Recent Executions
        sub_exec_id = uuid.uuid4()
        sub_exec = AgentExecution(
            id=sub_exec_id,
            workspace_id=workspace_id,
            conversation_id=conv_id,
            agent_id=agent_id or "workspace_agent",
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

            # Use the target agent's system prompt if available,
            # otherwise use the default subagent prompt
            if target_agent and target_agent.system_prompt:
                system_prompt = target_agent.system_prompt
            else:
                system_prompt = (
                    "You are an autonomous AI subagent operating inside OpenForge. "
                    "You have been delegated a specific task by another agent. "
                    "You MUST complete the task fully and autonomously — there is NO user present "
                    "and you CANNOT ask for clarification or more details.\n\n"
                    f"**You are already running inside workspace `{workspace_id}`.** "
                    "All `workspace.*` and `filesystem.*` tools targeted at this workspace operate on it directly. "
                    "Do NOT call `agent.invoke` to access this workspace — use your tools directly. "
                    "Only use `agent.invoke` if you need to reach a DIFFERENT workspace.\n\n"
                    "## Tool categories\n"
                    "- `workspace.*` — the user's persistent content: knowledge records and chat conversations\n"
                    "  - `workspace.search` — semantically search knowledge and past chats by topic\n"
                    "  - `workspace.list_chats` — list all conversations to find one by title\n"
                    "  - `workspace.read_chat` — read the full messages of a conversation by ID\n"
                    "  - `workspace.list_knowledge` — browse knowledge records\n"
                    "  - `workspace.save_knowledge` — create a new knowledge record\n"
                    "  - `workspace.delete_knowledge` — delete a knowledge record\n"
                    "- `memory.*` — your private execution scratchpad (ephemeral, invisible to user)\n"
                    "  - `memory.store` / `memory.recall` / `memory.forget`\n"
                    "- `filesystem.*` — files on the workspace disk\n"
                    "- `agent.invoke` — delegate a task to a DIFFERENT workspace's agent (not needed for this workspace)\n\n"
                    "## Rules\n"
                    "1. NEVER say 'I need more details' or ask any questions — search and find the answer yourself.\n"
                    "2. Try at least 2–3 different searches before concluding something cannot be found.\n"
                    "3. When you find a `conversation_id` in search results, immediately call `workspace.read_chat` to read the full content.\n"
                    "4. When asked to summarize a chat: use `workspace.list_chats` to find it by title, then `workspace.read_chat` to read its messages.\n"
                    "5. Return a complete, useful response — not a description of what you attempted.\n"
                    "6. Only call tools listed in your tool schema — never invent tool names.\n"
                )

            rag_results: list = []
            try:
                raw_rag = search_engine.search(
                    query=instruction, workspace_id=str(workspace_id), limit=5, score_threshold=0.35
                )
                rag_results = select_relevant_rag_results(raw_rag, limit=5)
            except Exception:
                pass

            loop_messages = list(
                context_assembler.assemble(
                    system_prompt=system_prompt,
                    conversation_messages=[{"role": "user", "content": instruction}],
                    rag_results=rag_results,
                )
            )

            full_response = ""
            timeline: list[dict] = []
            max_loops = 10
            _last_progress_publish = 0.0
            _PROGRESS_INTERVAL = 0.1  # throttle: max one publish per 100ms

            for _ in range(max_loops):
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
                        etype = event.get("type")
                        if etype == "thinking":
                            chunk = event.get("content", "")
                            if chunk:
                                thinking_this_turn += chunk
                                # Add/update thinking entry in timeline
                                if timeline and timeline[-1].get("type") == "thinking" and not timeline[-1].get("done"):
                                    timeline[-1]["content"] = timeline[-1].get("content", "") + chunk
                                else:
                                    timeline.append({"type": "thinking", "content": chunk})
                                if parent_conversation_id and parent_workspace_id:
                                    now = time.monotonic()
                                    if now - _last_progress_publish >= _PROGRESS_INTERVAL:
                                        _last_progress_publish = now
                                        await self._publish(
                                            execution_id, parent_workspace_id, "chat_subagent_progress",
                                            conversation_id=parent_conversation_id,
                                            data={"timeline": timeline},
                                        )
                        elif etype == "token":
                            tok = event.get("content", "")
                            full_response += tok
                            response_this_turn += tok
                            # Mark any open thinking block as done
                            if timeline and timeline[-1].get("type") == "thinking" and not timeline[-1].get("done"):
                                timeline[-1]["done"] = True
                            # Stream response text to parent conversation (throttled)
                            if parent_conversation_id and parent_workspace_id:
                                now = time.monotonic()
                                if now - _last_progress_publish >= _PROGRESS_INTERVAL:
                                    _last_progress_publish = now
                                    await self._publish(
                                        execution_id, parent_workspace_id, "chat_subagent_progress",
                                        conversation_id=parent_conversation_id,
                                        data={"response_text": full_response, "timeline": timeline},
                                    )
                        elif etype == "tool_calls":
                            tool_calls_this_turn = event.get("calls", [])
                            # Mark any open thinking block as done
                            if timeline and timeline[-1].get("type") == "thinking" and not timeline[-1].get("done"):
                                timeline[-1]["done"] = True
                        elif etype == "done":
                            finish_reason = event.get("finish_reason", "stop")
                except Exception as exc:
                    logger.warning("Subagent LLM error: %s", exc)
                    break

                # Flush final progress (catches anything skipped by throttle)
                if parent_conversation_id and parent_workspace_id:
                    data: dict = {"timeline": timeline}
                    if full_response:
                        data["response_text"] = full_response
                    await self._publish(
                        execution_id, parent_workspace_id, "chat_subagent_progress",
                        conversation_id=parent_conversation_id,
                        data=data,
                    )

                if not tool_calls_this_turn or finish_reason == "stop":
                    break

                tool_results_msgs: list[dict] = []
                for call in tool_calls_this_turn:
                    call_id = call.get("id") or str(uuid.uuid4())
                    fn_name = call.get("name", "")
                    args = call.get("arguments", {})

                    sub_tool_info = fn_name_to_tool_info_sub.get(fn_name)
                    sub_tool_id = sub_tool_info["tool_id"] if sub_tool_info else _fn_name_to_tool_id(fn_name)

                    tool_call_entry = {
                        "type": "tool_call",
                        "call_id": call_id,
                        "tool_name": sub_tool_id,
                        "arguments": args,
                    }
                    timeline.append(tool_call_entry)

                    # Stream tool-call start to parent conversation
                    if parent_conversation_id and parent_workspace_id:
                        await self._publish(
                            execution_id, parent_workspace_id, "chat_subagent_progress",
                            conversation_id=parent_conversation_id,
                            data={"step": tool_call_entry, "timeline": timeline},
                        )

                    if not sub_tool_info:
                        sub_result = {"success": False, "error": f"Tool '{sub_tool_id}' not available"}
                    else:
                        sub_result = await tool_dispatcher.execute(
                            tool_id=sub_tool_id,
                            params=args,
                            workspace_id=str(workspace_id),
                            execution_id=execution_id,
                        )

                    for i, entry in enumerate(timeline):
                        if entry.get("call_id") == call_id:
                            _out = sub_result.get("output")
                            if isinstance(_out, str) and len(_out) > 2000:
                                _out = _out[:2000] + "…"
                            timeline[i] = {
                                **entry,
                                "success": sub_result.get("success", False),
                                "output": _out,
                                "error": sub_result.get("error"),
                            }
                            break

                    # Stream tool-call result to parent conversation
                    if parent_conversation_id and parent_workspace_id:
                        await self._publish(
                            execution_id, parent_workspace_id, "chat_subagent_progress",
                            conversation_id=parent_conversation_id,
                            data={"step": timeline[-1] if timeline else tool_call_entry, "timeline": timeline},
                        )

                    if sub_result.get("success"):
                        out = sub_result.get("output")
                        if out is None:
                            rc = "Tool executed successfully with no output."
                        elif isinstance(out, (dict, list)):
                            rc = json.dumps(out, indent=2, default=str)
                        else:
                            rc = str(out)
                    else:
                        rc = f"Tool error: {sub_result.get('error', 'Unknown error')}"

                    tool_results_msgs.append({"tool_call_id": call_id, "content": rc})

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
            # Update execution record on failure
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


agent_engine = AgentExecutionEngine()
