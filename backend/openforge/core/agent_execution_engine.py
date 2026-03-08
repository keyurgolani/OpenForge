"""Agent Execution Engine for OpenForge v3.

This engine handles the full chat/agent pipeline for a given AgentDefinition,
using the endpoint-based composable LLM architecture.
"""
import asyncio
import json
import logging
import time
from typing import List, Optional
from uuid import UUID, uuid4

import litellm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from openforge.core.llm_gateway import llm_gateway
from openforge.core.search_engine import search_engine
from openforge.core.context_assembler import ContextAssembler
from openforge.services.conversation_service import conversation_service
from openforge.services.llm_service import llm_service
from openforge.services.endpoint_resolver import endpoint_resolver
from openforge.services.chat_retrieval import (
    build_context_sources,
    select_relevant_rag_results,
)
from openforge.services.automation_config import is_auto_bookmark_content_extraction_enabled
from openforge.services.attachment_pipeline import (
    extract_http_urls,
    resolve_attachment_pipeline,
    process_attachment,
)
from openforge.api.websocket import ws_manager
from openforge.db.models import Conversation, Knowledge, MessageAttachment, ToolDefinition, Workspace

logger = logging.getLogger("openforge.agent_engine")

context_assembler = ContextAssembler()


class AgentExecutionEngine:
    """Executes the full agent pipeline for a chat message."""

    async def execute(
        self,
        workspace_id: UUID,
        conversation_id: UUID,
        user_message: str,
        agent,  # AgentDefinition
        db: AsyncSession,
        *,
        attachment_ids: Optional[List[str]] = None,
        endpoint_id: Optional[str] = None,
    ) -> None:
        """Execute the full agent pipeline for a chat message."""
        workspace_key = str(workspace_id)

        conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conversation = conv_result.scalar_one_or_none()
        if not conversation or conversation.workspace_id != workspace_id or conversation.is_archived:
            await ws_manager.send_to_workspace(workspace_key, {
                "type": "chat_error",
                "conversation_id": str(conversation_id),
                "detail": "Conversation not found",
            })
            return

        # 1. Save user message
        user_msg = await conversation_service.add_message(
            db, conversation_id, role="user", content=user_message
        )

        try:
            # 2. Process attachments if enabled
            attachment_context = ""
            attachments_processed = []
            if agent.attachment_support and attachment_ids:
                attachment_context, attachments_processed = await self._process_attachments(
                    db,
                    user_message_id=user_msg.id,
                    attachment_ids=attachment_ids,
                    workspace_id=workspace_id,
                )
                if attachments_processed:
                    await ws_manager.send_to_workspace(workspace_key, {
                        "type": "chat_attachments_processed",
                        "conversation_id": str(conversation_id),
                        "data": attachments_processed,
                    })

            # 3. Trigger bookmark extraction for HTTP links if enabled
            if agent.auto_bookmark_urls:
                chat_urls = extract_http_urls(user_message)
                if chat_urls:
                    asyncio.create_task(
                        self._trigger_bookmark_extraction(
                            workspace_id=workspace_id,
                            urls=chat_urls,
                        )
                    )

            # 4. RAG retrieval if enabled
            context_sources = []
            rag_results = []
            if agent.rag_enabled:
                rag_query = user_message
                if attachment_context:
                    rag_query = f"{user_message}\n{attachment_context}"

                raw_rag_results = search_engine.search(
                    query=rag_query,
                    workspace_id=str(workspace_id),
                    limit=max(agent.rag_limit * 2, 12),
                    score_threshold=agent.rag_score_threshold,
                )
                rag_results = select_relevant_rag_results(raw_rag_results, limit=agent.rag_limit)
                context_sources = build_context_sources(rag_results)

                if context_sources:
                    await ws_manager.send_to_workspace(workspace_key, {
                        "type": "chat_sources",
                        "conversation_id": str(conversation_id),
                        "data": context_sources,
                    })

            # 5. Assemble system prompt with skill hints
            system_prompt = agent.system_prompt
            if agent.skill_hints:
                skill_hints_text = "\n".join(f"- {hint}" for hint in agent.skill_hints)
                system_prompt = f"{system_prompt}\n\nAvailable skill hints:\n{skill_hints_text}"

            # 6. Build message history
            history = await conversation_service.get_recent_messages(
                db, conversation_id, limit=agent.history_limit
            )

            assembled = context_assembler.assemble(
                system_prompt=system_prompt,
                conversation_messages=history,
                rag_results=rag_results,
                extra_context=attachment_context if attachment_context else None,
            )

            # 7. Resolve the endpoint for this workspace
            try:
                endpoint_override = UUID(endpoint_id) if endpoint_id else None
                active_endpoint = await llm_service.get_endpoint_for_workspace(
                    db, workspace_id, purpose="chat", endpoint_override=endpoint_override
                )
            except Exception as e:
                await ws_manager.send_to_workspace(workspace_key, {
                    "type": "chat_error",
                    "conversation_id": str(conversation_id),
                    "detail": str(e),
                })
                return

            full_response = ""
            full_thinking = ""
            provider_metadata = {}
            generation_started = time.perf_counter()

            # 7b. Resolve tool schemas — only for standard endpoints that support function calling
            tool_schemas: list[dict] = []
            fn_to_id: dict[str, str] = {}
            if active_endpoint.endpoint_type == "standard":
                info = await endpoint_resolver.resolve_provider_info(db, active_endpoint)
                resolved_model = llm_gateway._resolve_model(info["provider_name"], info["model"])
                try:
                    model_supports_tools = litellm.supports_function_calling(model=resolved_model)
                except Exception:
                    model_supports_tools = False
                if model_supports_tools:
                    tool_schemas, fn_to_id = await self._get_tool_schemas(db, agent, workspace_id)

            try:
                if tool_schemas:
                    # 8a. ReAct loop: non-streaming iterations with tool calling, stream the final response
                    info = await endpoint_resolver.resolve_provider_info(db, active_endpoint)
                    execution_id = str(uuid4())
                    loop_messages = list(assembled)

                    from openforge.services.tool_dispatcher import ToolDispatcher, ToolCallRequest

                    for _iteration in range(agent.max_iterations):
                        loop_response = await litellm.acompletion(
                            model=llm_gateway._resolve_model(info["provider_name"], info["model"]),
                            messages=loop_messages,
                            api_key=info["api_key"] or None,
                            api_base=info["base_url"],
                            tools=tool_schemas,
                            tool_choice="auto",
                            max_tokens=4000,
                        )
                        lm = loop_response.choices[0].message

                        if lm.tool_calls:
                            # Append assistant turn (with tool_calls) to message history
                            loop_messages.append({
                                "role": "assistant",
                                "content": lm.content,
                                "tool_calls": [
                                    {
                                        "id": tc.id,
                                        "type": "function",
                                        "function": {
                                            "name": tc.function.name,
                                            "arguments": tc.function.arguments,
                                        },
                                    }
                                    for tc in lm.tool_calls
                                ],
                            })

                            dispatcher = ToolDispatcher(db)
                            for tc in lm.tool_calls:
                                fn_name = tc.function.name
                                actual_tool_id = fn_to_id.get(fn_name, fn_name)
                                try:
                                    args = json.loads(tc.function.arguments)
                                except Exception:
                                    args = {}

                                # Notify frontend that a tool is being called
                                await ws_manager.send_to_workspace(workspace_key, {
                                    "type": "chat_tool_call",
                                    "conversation_id": str(conversation_id),
                                    "tool_id": actual_tool_id,
                                    "arguments": args,
                                })

                                request = ToolCallRequest(
                                    tool_id=actual_tool_id,
                                    params=args,
                                    workspace_id=str(workspace_id),
                                    execution_id=execution_id,
                                    conversation_id=str(conversation_id),
                                )
                                result = await dispatcher.dispatch(request, skip_approval=True)
                                await db.commit()

                                tool_content = (
                                    json.dumps(result.output)
                                    if result.success
                                    else f"Error: {result.error}"
                                )

                                # Notify frontend of tool result
                                await ws_manager.send_to_workspace(workspace_key, {
                                    "type": "chat_tool_result",
                                    "conversation_id": str(conversation_id),
                                    "tool_id": actual_tool_id,
                                    "success": result.success,
                                    "error": result.error,
                                })

                                loop_messages.append({
                                    "role": "tool",
                                    "tool_call_id": tc.id,
                                    "content": tool_content,
                                })
                            # Continue to next iteration
                        else:
                            # Final text response — send as a single token block
                            full_response = lm.content or ""
                            if full_response:
                                await ws_manager.send_to_workspace(workspace_key, {
                                    "type": "chat_token",
                                    "conversation_id": str(conversation_id),
                                    "data": full_response,
                                })
                            break
                    else:
                        # Hit max_iterations without a final response — ask one more time without tools
                        fallback = await litellm.acompletion(
                            model=llm_gateway._resolve_model(info["provider_name"], info["model"]),
                            messages=loop_messages,
                            api_key=info["api_key"] or None,
                            api_base=info["base_url"],
                            max_tokens=2000,
                        )
                        full_response = fallback.choices[0].message.content or ""
                        if full_response:
                            await ws_manager.send_to_workspace(workspace_key, {
                                "type": "chat_token",
                                "conversation_id": str(conversation_id),
                                "data": full_response,
                            })

                else:
                    # 8b. No tools — unified streaming via endpoint resolver
                    async for event in endpoint_resolver.stream_events(
                        db, active_endpoint, assembled,
                        include_thinking=True,
                    ):
                        event_type = event.get("type")

                        if event_type == "thinking":
                            thinking = event.get("content", "")
                            if thinking:
                                full_thinking += thinking
                                await ws_manager.send_to_workspace(workspace_key, {
                                    "type": "chat_thinking",
                                    "conversation_id": str(conversation_id),
                                    "data": thinking,
                                })
                            continue

                        if event_type == "metadata":
                            provider_metadata = {**provider_metadata, **event.get("data", {})}
                            continue

                        token = event.get("content", "")
                        if token:
                            full_response += token
                            await ws_manager.send_to_workspace(workspace_key, {
                                "type": "chat_token",
                                "conversation_id": str(conversation_id),
                                "data": token,
                            })

            except Exception as e:
                logger.error(f"LLM error: {e}")
                await ws_manager.send_to_workspace(workspace_key, {
                    "type": "chat_error",
                    "conversation_id": str(conversation_id),
                    "detail": str(e),
                })
                return

            # 9. Determine display info for the message
            model_used = active_endpoint.display_name or ""
            provider_used = ""
            if active_endpoint.endpoint_type == "standard" and active_endpoint.provider:
                model_used = active_endpoint.model_id or ""
                provider_used = active_endpoint.provider.provider_name or ""
            elif active_endpoint.endpoint_type == "virtual" and active_endpoint.virtual_provider:
                provider_used = f"virtual:{active_endpoint.virtual_provider.virtual_type}"

            generation_ms = int((time.perf_counter() - generation_started) * 1000)

            msg = await conversation_service.add_message(
                db,
                conversation_id,
                role="assistant",
                content=full_response,
                thinking=full_thinking.strip() or None,
                model_used=model_used,
                provider_used=provider_used,
                token_count=llm_gateway.count_tokens(full_response),
                generation_ms=generation_ms,
                context_sources=context_sources,
                trigger_auto_title=not bool(endpoint_id),
                provider_metadata=provider_metadata or None,
            )

            # 10. Notify completion
            await ws_manager.send_to_workspace(workspace_key, {
                "type": "chat_done",
                "conversation_id": str(conversation_id),
                "message_id": str(msg.id),
                "generation_ms": generation_ms,
            })

            if endpoint_id and active_endpoint.endpoint_type == "standard":
                info = await endpoint_resolver.resolve_provider_info(db, active_endpoint)

                async def _refresh_chat_title() -> None:
                    from openforge.db.postgres import AsyncSessionLocal
                    try:
                        async with AsyncSessionLocal() as title_db:
                            await conversation_service.refresh_conversation_title(
                                title_db,
                                workspace_id=workspace_id,
                                conversation_id=conversation_id,
                                provider_name=info["provider_name"],
                                api_key=info["api_key"],
                                model=info["model"],
                                base_url=info["base_url"],
                            )
                    except Exception as e:
                        logger.warning("Chat title refresh failed for conversation %s: %s", conversation_id, e)

                asyncio.create_task(_refresh_chat_title())

        except Exception as e:
            logger.error("Agent pipeline error for conversation %s: %s", conversation_id, e)
            await ws_manager.send_to_workspace(workspace_key, {
                "type": "chat_error",
                "conversation_id": str(conversation_id),
                "detail": str(e),
            })

    async def _get_tool_schemas(
        self,
        db: AsyncSession,
        agent,
        workspace_id: UUID,
    ) -> tuple[list[dict], dict[str, str]]:
        """Return (tool_schemas_for_llm, fn_name_to_tool_id_map).

        Returns empty lists when tools are disabled at the workspace or agent level.
        """
        try:
            if not agent.tools_enabled:
                return [], {}

            ws_result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
            workspace = ws_result.scalar_one_or_none()
            if not workspace or not workspace.tools_enabled:
                return [], {}

            query = select(ToolDefinition).where(ToolDefinition.is_enabled == True)
            if agent.allowed_tool_ids:
                query = query.where(ToolDefinition.id.in_(agent.allowed_tool_ids))
            elif agent.allowed_tool_categories:
                query = query.where(ToolDefinition.category.in_(agent.allowed_tool_categories))

            result = await db.execute(query)
            tools = result.scalars().all()

            schemas: list[dict] = []
            fn_to_id: dict[str, str] = {}
            for t in tools:
                fn_name = t.id.replace(".", "_")
                fn_to_id[fn_name] = t.id
                schemas.append({
                    "type": "function",
                    "function": {
                        "name": fn_name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    },
                })
            return schemas, fn_to_id
        except Exception as exc:
            logger.warning("Failed to fetch tool schemas: %s", exc)
            return [], {}

    async def _process_attachments(
        self,
        db: AsyncSession,
        *,
        user_message_id: UUID,
        attachment_ids: Optional[List[str]],
        workspace_id: Optional[UUID] = None,
    ) -> tuple[str, list[dict]]:
        """Process attachments and return (context_text, processed_list)."""
        if not attachment_ids:
            return "", []

        from openforge.api.attachments import extract_text_from_text_file

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

            pipeline = resolve_attachment_pipeline(
                content_type=attachment.content_type,
                filename=attachment.filename,
            )
            attachment_status = "deferred"
            details = "Pipeline not available yet for this file type"

            if attachment.message_id is None:
                attachment.message_id = user_message_id
                db_updated = True

            if pipeline != "deferred":
                try:
                    proc_result = await process_attachment(
                        file_path=attachment.file_path,
                        workspace_id=workspace_id or UUID("00000000-0000-0000-0000-000000000000"),
                        content_type=attachment.content_type,
                        filename=attachment.filename,
                    )

                    if proc_result.success and proc_result.extracted_text:
                        if not (attachment.extracted_text or "").strip():
                            attachment.extracted_text = proc_result.extracted_text
                            db_updated = True

                        extracted_text = proc_result.extracted_text.strip()
                        if extracted_text:
                            attachment_status = "processed"
                            details = f"Extracted via {pipeline} ({len(extracted_text)} chars)"
                            context_blocks.append(
                                f"\n--- Content from {attachment.filename} ---\n"
                                f"{extracted_text}\n"
                                f"--- End of {attachment.filename} ---\n"
                            )
                        else:
                            attachment_status = "empty"
                            details = "No text extracted from attachment"
                    elif proc_result.error:
                        attachment_status = "error"
                        details = proc_result.error
                except Exception as e:
                    logger.warning(f"Failed to process attachment {attachment_id}: {e}")
                    attachment_status = "error"
                    details = str(e)

            # Fallback for text files
            if pipeline == "text" and attachment_status == "deferred":
                if not (attachment.extracted_text or "").strip():
                    extracted = await extract_text_from_text_file(attachment.file_path)
                    attachment.extracted_text = extracted or None
                    db_updated = True

                extracted_text = (attachment.extracted_text or "").strip()
                if extracted_text:
                    attachment_status = "processed"
                    details = f"Extracted text ({len(extracted_text)} chars)"
                    context_blocks.append(
                        f"\n--- Content from {attachment.filename} ---\n"
                        f"{extracted_text}\n"
                        f"--- End of {attachment.filename} ---\n"
                    )
                else:
                    attachment_status = "empty"
                    details = "No text extracted from attachment"

            processed.append({
                "id": str(attachment.id),
                "filename": attachment.filename,
                "status": attachment_status,
                "pipeline": pipeline,
                "details": details,
            })

        if db_updated:
            await db.commit()

        if not context_blocks:
            return "", processed
        return (
            "\n\nThe user has attached the following files:\n" + "\n".join(context_blocks),
            processed,
        )

    async def _trigger_bookmark_extraction(
        self,
        *,
        workspace_id: UUID,
        urls: list[str],
    ) -> None:
        if not urls:
            return

        from openforge.db.postgres import AsyncSessionLocal
        from openforge.services.knowledge_service import knowledge_service

        try:
            targets: list[tuple[UUID, UUID]] = []
            auto_extraction_enabled = True
            async with AsyncSessionLocal() as db:
                auto_extraction_enabled = await is_auto_bookmark_content_extraction_enabled(db)
                for url in urls:
                    result = await db.execute(
                        select(Knowledge).where(
                            Knowledge.workspace_id == workspace_id,
                            Knowledge.type == "bookmark",
                            Knowledge.url == url,
                        )
                    )
                    bookmark = result.scalar_one_or_none()
                    if not bookmark:
                        bookmark = Knowledge(
                            workspace_id=workspace_id,
                            type="bookmark",
                            content="",
                            url=url,
                            embedding_status="pending",
                            word_count=0,
                        )
                        db.add(bookmark)
                        await db.flush()
                    targets.append((bookmark.id, bookmark.workspace_id))
                await db.commit()

            if not auto_extraction_enabled:
                return

            for knowledge_id, knowledge_workspace_id in targets:
                try:
                    await knowledge_service.run_bookmark_content_extraction_job(
                        knowledge_id=knowledge_id,
                        workspace_id=knowledge_workspace_id,
                        audit_task_type="extract_bookmark_content",
                    )
                except Exception as extraction_error:
                    logger.warning(
                        "Chat URL bookmark extraction failed for %s in workspace %s: %s",
                        knowledge_id,
                        knowledge_workspace_id,
                        extraction_error,
                    )
        except Exception as e:
            logger.warning("Failed to trigger bookmark extraction for chat links: %s", e)


agent_execution_engine = AgentExecutionEngine()
