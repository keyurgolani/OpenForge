from __future__ import annotations

import asyncio
import json
import logging
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
from openforge.services.chat_stream_registry import ChatStreamRegistry
from openforge.services.tool_dispatcher import tool_dispatcher
from openforge.api.websocket import ws_manager
from openforge.db.models import Config, Conversation, Knowledge, MessageAttachment, TaskLog, ToolCallLog, Workspace

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

import re

# Tool name separator: OpenAI rejects dots in function names, so we use double-underscore.
_TOOL_NAME_SEP = "__"


def _tool_id_to_fn_name(tool_id: str) -> str:
    return tool_id.replace(".", _TOOL_NAME_SEP)


def _fn_name_to_tool_id(fn_name: str) -> str:
    return fn_name.replace(_TOOL_NAME_SEP, ".")


def _mcp_tool_fn_name(server_id: str, tool_name: str) -> str:
    """Stable, LLM-safe function name for an MCP tool.
    Replaces all non-alphanumeric characters with underscores."""
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


class AgentExecutionEngine:
    """
    Unified execution engine for all agent chat interactions.
    Replaces chat_service.handle_chat_message() with a tool-capable agent loop.
    """

    MAX_TOOL_LOOPS = 20

    def __init__(self) -> None:
        self.stream_registry = ChatStreamRegistry()
        self._cancel_events: dict[str, asyncio.Event] = {}

    def cancel(self, conversation_id: UUID) -> None:
        """Signal the running agent loop for this conversation to stop."""
        key = str(conversation_id)
        event = self._cancel_events.get(key)
        if event:
            event.set()

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
        """Extract content from URLs mentioned in a chat message.

        Extracts content without creating Knowledge entries — content is stored
        as MessageAttachment records so the user can later choose to save them.

        Each extraction is logged as an 'extract_url_content' task in job history.
        At most 3 URLs are processed; each has a 20-second timeout.

        Returns ``(context_str, url_attachments_processed)`` for WS broadcast.
        """
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
                # Create running TaskLog
                async with AsyncSessionLocal() as audit_db:
                    task_log = await start_task_log(
                        audit_db,
                        task_type="extract_url_content",
                        workspace_id=workspace_id,
                        target_link=url,
                    )
                    task_log_id = task_log.id
                    await audit_db.commit()

                # Extract content without saving to Knowledge
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

                # Store as MessageAttachment so user can "Save to Knowledge" later.
                # Use the resolved (canonical) URL so short links are unwound.
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

                # Mark TaskLog done
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

    async def send_stream_snapshot(
        self,
        websocket: WebSocket,
        workspace_id: UUID,
        conversation_id: UUID | None = None,
    ) -> None:
        if conversation_id:
            snapshot = self.stream_registry.snapshot_for_conversation(workspace_id, conversation_id)
            if not snapshot:
                return
            await ws_manager.send_to_connection(websocket, {
                "type": "chat_stream_snapshot",
                **snapshot,
            })
            return

        snapshots = self.stream_registry.snapshots_for_workspace(workspace_id)
        for snapshot in snapshots:
            await ws_manager.send_to_connection(websocket, {
                "type": "chat_stream_snapshot",
                **snapshot,
            })

    async def run(
        self,
        workspace_id: UUID,
        conversation_id: UUID,
        user_content: str,
        db: AsyncSession,
        attachment_ids: Optional[List[str]] = None,
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
    ):
        """Full agent execution pipeline, replacing the old chat_service pipeline."""
        workspace_key = str(workspace_id)
        execution_id = str(uuid.uuid4())
        cancel_event = asyncio.Event()
        self._cancel_events[str(conversation_id)] = cancel_event

        # Validate conversation
        conv_result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conversation = conv_result.scalar_one_or_none()
        if not conversation or conversation.workspace_id != workspace_id or conversation.is_archived:
            await ws_manager.send_to_workspace(workspace_key, {
                "type": "chat_error",
                "conversation_id": str(conversation_id),
                "detail": "Conversation not found",
            })
            return

        # Load workspace to check agent settings
        ws_result = await db.execute(
            select(Workspace).where(Workspace.id == workspace_id)
        )
        workspace = ws_result.scalar_one_or_none()
        agent_enabled = bool(workspace and workspace.agent_enabled)
        agent_tool_categories: list[str] = list(workspace.agent_tool_categories) if workspace else []
        max_tool_loops: int = int(workspace.agent_max_tool_loops) if workspace else self.MAX_TOOL_LOOPS

        # 1. Save user message
        user_message = await conversation_service.add_message(
            db, conversation_id, role="user", content=user_content
        )
        self.stream_registry.start(workspace_id=workspace_id, conversation_id=conversation_id)

        try:
            # 2. Process attachments
            attachment_context, attachments_processed = await self._process_message_attachments(
                db,
                workspace_id=workspace_id,
                conversation_id=conversation_id,
                user_message_id=user_message.id,
                attachment_ids=attachment_ids,
            )
            # 3. Extract content from HTTP links mentioned in chat
            chat_urls = extract_http_urls(user_content)
            url_context = ""
            url_attachments_processed: list[dict] = []
            if chat_urls:
                url_context, url_attachments_processed = await self._extract_urls_for_chat(
                    workspace_id=workspace_id,
                    user_message_id=user_message.id,
                    urls=chat_urls,
                )

            all_attachments_processed = attachments_processed + url_attachments_processed
            if all_attachments_processed:
                self.stream_registry.set_attachments_processed(
                    conversation_id=conversation_id,
                    attachments=all_attachments_processed,
                )
                await ws_manager.send_to_workspace(workspace_key, {
                    "type": "chat_attachments_processed",
                    "conversation_id": str(conversation_id),
                    "data": all_attachments_processed,
                })

            # 4. RAG context retrieval
            rag_query = user_content
            if attachment_context:
                rag_query = f"{rag_query}\n{attachment_context}"
            if url_context:
                rag_query = f"{rag_query}\n{url_context}"

            raw_rag_results = search_engine.search(
                query=rag_query,
                workspace_id=str(workspace_id),
                limit=12,
                score_threshold=0.35,
            )
            rag_results = select_relevant_rag_results(raw_rag_results, limit=5)
            context_sources = build_context_sources(rag_results)

            if context_sources:
                self.stream_registry.set_sources(
                    conversation_id=conversation_id, sources=context_sources
                )
                await ws_manager.send_to_workspace(workspace_key, {
                    "type": "chat_sources",
                    "conversation_id": str(conversation_id),
                    "data": context_sources,
                })

            # 5. Assemble initial prompt
            history = await conversation_service.get_recent_messages(db, conversation_id, limit=20)

            # Load agent system prompt — use DB override if set, otherwise catalogue default
            from openforge.api.prompts import PROMPT_CATALOGUE
            _agent_prompt_entry = next((p for p in PROMPT_CATALOGUE if p["id"] == "agent_system"), None)
            _agent_prompt_default = _agent_prompt_entry["default"] if _agent_prompt_entry else ""
            _prompt_cfg = await db.execute(
                select(Config).where(Config.key == "prompt.agent_system")
            )
            _prompt_row = _prompt_cfg.scalar_one_or_none()
            system_prompt = (
                _prompt_row.value.get("text")
                if _prompt_row and _prompt_row.value and "text" in _prompt_row.value
                else _agent_prompt_default
            )

            # 5b. Append installed skills to system prompt
            installed_skills = await tool_dispatcher.list_skills()
            if installed_skills:
                skills_section = "\n\n## Installed Skills\n"
                skills_section += (
                    "The following skills are installed in this workspace. "
                    "Apply their guidance automatically when relevant.\n\n"
                )
                for skill in installed_skills:
                    skills_section += f"### {skill['name']}\n"
                    if skill.get("description"):
                        skills_section += f"_{skill['description']}_\n\n"
                    if skill.get("content"):
                        skills_section += skill["content"].strip() + "\n\n"
                system_prompt = system_prompt + skills_section

            extra_context_parts = [p for p in [attachment_context, url_context] if p]
            assembled = context_assembler.assemble(
                system_prompt=system_prompt,
                conversation_messages=history,
                rag_results=rag_results,
                extra_context="\n".join(extra_context_parts) if extra_context_parts else None,
            )

            # 6. Get provider
            try:
                provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
                    db, workspace_id, provider_id=provider_id, model_override=model_id
                )
            except Exception as e:
                await ws_manager.send_to_workspace(workspace_key, {
                    "type": "chat_error",
                    "conversation_id": str(conversation_id),
                    "detail": str(e),
                })
                return

            # 7. Load tool definitions if agent mode is enabled
            openai_tools: list[dict] = []
            all_tool_defs: list[dict] = []
            # Maps LLM function name → routing info
            fn_name_to_tool_info: dict[str, dict] = {}

            if agent_enabled:
                # 7a. Built-in tools from tool server
                try:
                    raw_tools = await tool_dispatcher.list_tools()
                    if agent_tool_categories:
                        raw_tools = [
                            t for t in raw_tools
                            if t.get("category") in agent_tool_categories
                        ]
                    for t in raw_tools:
                        fn = _tool_id_to_fn_name(t["id"])
                        fn_name_to_tool_info[fn] = {"type": "builtin", "tool_id": t["id"]}
                    all_tool_defs = raw_tools
                    openai_tools = _tools_to_openai_schema(raw_tools)
                except Exception as e:
                    logger.warning("Could not load tools from tool server: %s", e)

                # 7b. External MCP tools from configured servers
                try:
                    from openforge.services.mcp_service import get_enabled_servers_with_overrides
                    mcp_server_pairs = await get_enabled_servers_with_overrides(db)
                    for mcp_server, overrides in mcp_server_pairs:
                        for raw_tool in (mcp_server.discovered_tools or []):
                            t_name = raw_tool.get("name", "")
                            if not t_name:
                                continue
                            # Respect per-tool disabled overrides
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

            # 8. Agent loop
            full_response = ""
            full_thinking = ""
            all_tool_calls_made: list[dict] = []
            timeline: list[dict] = []   # ordered sequence of thinking/tool_call events
            generation_started = time.perf_counter()
            was_cancelled = False

            # messages list grows as tool results are injected
            loop_messages = list(assembled)

            for loop_iteration in range(max_tool_loops):
                if cancel_event.is_set():
                    was_cancelled = True
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
                        if cancel_event.is_set():
                            was_cancelled = True
                            break
                        event_type = event.get("type")

                        if event_type == "thinking":
                            chunk = event.get("content", "")
                            if chunk:
                                full_thinking += chunk
                                thinking_this_turn += chunk
                                self.stream_registry.append_thinking(
                                    conversation_id=conversation_id, chunk=chunk
                                )
                                await ws_manager.send_to_workspace(workspace_key, {
                                    "type": "chat_thinking",
                                    "conversation_id": str(conversation_id),
                                    "data": chunk,
                                })

                        elif event_type == "token":
                            token = event.get("content", "")
                            if token:
                                full_response += token
                                response_this_turn += token
                                self.stream_registry.append_content(
                                    conversation_id=conversation_id, chunk=token
                                )
                                await ws_manager.send_to_workspace(workspace_key, {
                                    "type": "chat_token",
                                    "conversation_id": str(conversation_id),
                                    "data": token,
                                })

                        elif event_type == "tool_calls":
                            tool_calls_this_turn = event.get("calls", [])

                        elif event_type == "done":
                            finish_reason = event.get("finish_reason", "stop")

                except Exception as e:
                    logger.error("LLM streaming error: %s", e)
                    await ws_manager.send_to_workspace(workspace_key, {
                        "type": "chat_error",
                        "conversation_id": str(conversation_id),
                        "detail": str(e),
                    })
                    return

                # No tool calls — we have the final response
                if not tool_calls_this_turn or finish_reason == "stop":
                    # Flush any thinking from this final turn into the timeline
                    if thinking_this_turn.strip():
                        timeline.append({"type": "thinking", "content": thinking_this_turn.strip()})
                    break

                # Flush thinking that preceded the tool calls in this turn
                if thinking_this_turn.strip():
                    timeline.append({"type": "thinking", "content": thinking_this_turn.strip()})

                # Execute tool calls
                tool_results_for_messages: list[dict] = []

                for call in tool_calls_this_turn:
                    call_id = call.get("id") or str(uuid.uuid4())
                    fn_name = call.get("name", "")
                    arguments = call.get("arguments", {})

                    # Resolve tool info from our fn_name map
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
                    self.stream_registry.append_tool_call(
                        conversation_id=conversation_id, call=call_record
                    )

                    await ws_manager.send_to_workspace(workspace_key, {
                        "type": "chat_tool_call",
                        "conversation_id": str(conversation_id),
                        "data": call_record,
                    })

                    # Execute via the appropriate backend (timed)
                    tool_started_at = datetime.now(timezone.utc)
                    call_start_perf = time.perf_counter()

                    if tool_info and tool_info["type"] == "mcp":
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
                        )

                    call_duration_ms = int((time.perf_counter() - call_start_perf) * 1000)
                    tool_finished_at = datetime.now(timezone.utc)

                    result_record = {
                        "call_id": call_id,
                        "tool_name": tool_id,
                        "success": result.get("success", False),
                        "output": result.get("output"),
                        "error": result.get("error"),
                    }
                    # Record in ordered timeline (truncate output for storage efficiency)
                    _output = result.get("output")
                    if isinstance(_output, (dict, list)):
                        _output = json.dumps(_output, default=str)
                    if isinstance(_output, str) and len(_output) > 500:
                        _output = _output[:500] + "…"
                    timeline.append({
                        "type": "tool_call",
                        "call_id": call_id,
                        "tool_name": tool_id,
                        "arguments": arguments,
                        "success": result.get("success", False),
                        "output": _output,
                        "error": result.get("error"),
                    })
                    self.stream_registry.set_tool_result(
                        conversation_id=conversation_id,
                        call_id=call_id,
                        result=result_record,
                    )

                    await ws_manager.send_to_workspace(workspace_key, {
                        "type": "chat_tool_result",
                        "conversation_id": str(conversation_id),
                        "data": result_record,
                    })

                    # Persist tool call log asynchronously
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

                    tool_results_for_messages.append({
                        "tool_call_id": call_id,
                        "content": result_content,
                    })

                # Inject assistant message with tool_calls into the loop messages
                assistant_tool_message: dict = {"role": "assistant", "content": response_this_turn or ""}
                # Build tool_calls in OpenAI format for the message
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

                # Inject tool results
                for tr in tool_results_for_messages:
                    loop_messages.append({
                        "role": "tool",
                        "tool_call_id": tr["tool_call_id"],
                        "content": tr["content"],
                    })

            # 9a. If the model produced no text response (only thinking, or only tool calls),
            #     do one final tools-disabled, thinking-disabled turn to force a text summary.
            #     Skip this if the user cancelled — we don't want to start another LLM call.
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
                                self.stream_registry.append_content(
                                    conversation_id=conversation_id, chunk=token
                                )
                                await ws_manager.send_to_workspace(workspace_key, {
                                    "type": "chat_token",
                                    "conversation_id": str(conversation_id),
                                    "data": token,
                                })
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
                trigger_auto_title=not has_runtime_override,
                tool_calls=all_tool_calls_made if all_tool_calls_made else None,
                timeline=timeline if timeline else None,
                is_interrupted=was_cancelled,
            )

            # 10. Notify completion
            await ws_manager.send_to_workspace(workspace_key, {
                "type": "chat_done",
                "conversation_id": str(conversation_id),
                "message_id": str(msg.id),
                "generation_ms": generation_ms,
                "interrupted": was_cancelled,
            })

            if has_runtime_override:
                async def _refresh_title() -> None:
                    from openforge.db.postgres import AsyncSessionLocal

                    try:
                        async with AsyncSessionLocal() as title_db:
                            await conversation_service.refresh_conversation_title(
                                title_db,
                                workspace_id=workspace_id,
                                conversation_id=conversation_id,
                                provider_name=provider_name,
                                api_key=api_key,
                                model=model,
                                base_url=base_url,
                            )
                    except Exception as e:
                        logger.warning(
                            "Chat title refresh failed for conversation %s: %s",
                            conversation_id,
                            e,
                        )

                asyncio.create_task(_refresh_title())

            # Embed the chat exchange for searchability (fire-and-forget)
            if not was_cancelled and full_response and isinstance(user_content, str):
                from openforge.services.chat_embedding_service import chat_embedding_service

                _conv_title = conversation.title or ""
                _msg_id = msg.id

                async def _embed_chat() -> None:
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
                            conversation_id,
                            e,
                        )

                asyncio.create_task(_embed_chat())

        except Exception as e:
            logger.error(
                "Agent pipeline error for conversation %s: %s", conversation_id, e
            )
            await ws_manager.send_to_workspace(workspace_key, {
                "type": "chat_error",
                "conversation_id": str(conversation_id),
                "detail": str(e),
            })
        finally:
            self.stream_registry.finish(conversation_id)
            self._cancel_events.pop(str(conversation_id), None)


agent_engine = AgentExecutionEngine()
