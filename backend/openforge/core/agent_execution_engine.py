"""Agent Execution Engine for OpenForge v2.5.

This engine handles the full chat/agent pipeline for a given AgentDefinition,
replacing the direct use of chat_service in the WebSocket handler.
"""
import asyncio
import logging
import time
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from openforge.core.llm_gateway import llm_gateway
from openforge.core.search_engine import search_engine
from openforge.core.context_assembler import ContextAssembler
from openforge.core.llm_router import LLMRouter
from openforge.core.llm_council import LLMCouncil
from openforge.core.llm_optimizer import LLMOptimizer
from openforge.services.conversation_service import conversation_service
from openforge.services.llm_service import llm_service
from openforge.services.llm_router_service import llm_router_service
from openforge.services.llm_council_service import llm_council_service
from openforge.services.llm_optimizer_service import llm_optimizer_service
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
from openforge.db.models import Conversation, Knowledge, MessageAttachment

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
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
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

            # 7. Get provider and stream response
            try:
                provider_name, api_key, model, base_url, provider_type = await llm_service.get_provider_for_workspace(
                    db, workspace_id, provider_id=provider_id, model_override=model_id
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
            generation_started = time.perf_counter()

            try:
                # Dispatch through virtual provider if applicable
                if provider_type in ("router", "council", "optimizer"):
                    event_generator = self._stream_via_virtual_provider(
                        assembled, provider_type, provider_id, db, workspace_id
                    )
                else:
                    event_generator = llm_gateway.stream_events(
                        messages=assembled,
                        provider_name=provider_name,
                        api_key=api_key,
                        model=model,
                        base_url=base_url,
                        include_thinking=True,
                    )

                async for event in event_generator:
                    if event.get("type") == "thinking":
                        thinking = event.get("content", "")
                        if thinking:
                            full_thinking += thinking
                            await ws_manager.send_to_workspace(workspace_key, {
                                "type": "chat_thinking",
                                "conversation_id": str(conversation_id),
                                "data": thinking,
                            })
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
                logger.error(f"LLM streaming error: {e}")
                await ws_manager.send_to_workspace(workspace_key, {
                    "type": "chat_error",
                    "conversation_id": str(conversation_id),
                    "detail": str(e),
                })
                return

            # 8. Save assistant message
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
            )

            # 9. Notify completion
            await ws_manager.send_to_workspace(workspace_key, {
                "type": "chat_done",
                "conversation_id": str(conversation_id),
                "message_id": str(msg.id),
                "generation_ms": generation_ms,
            })

            if has_runtime_override:
                async def _refresh_chat_title() -> None:
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
                        logger.warning("Chat title refresh failed for conversation %s: %s", conversation_id, e)

                asyncio.create_task(_refresh_chat_title())

        except Exception as e:
            logger.error("Agent pipeline error for conversation %s: %s", conversation_id, e)
            await ws_manager.send_to_workspace(workspace_key, {
                "type": "chat_error",
                "conversation_id": str(conversation_id),
                "detail": str(e),
            })

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

    async def _stream_via_virtual_provider(
        self,
        messages: list[dict],
        provider_type: str,
        provider_id: Optional[str],
        db: AsyncSession,
        workspace_id: UUID,
    ):
        """
        Route messages through a virtual provider (router, council, optimizer).
        Yields events in the same format as llm_gateway.stream_events().
        """
        if not provider_id:
            logger.error("Virtual provider requires explicit provider_id")
            yield {"type": "error", "detail": "Virtual provider requires explicit provider configuration"}
            return

        try:
            provider_uuid = UUID(str(provider_id))
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid provider_id for virtual provider: {provider_id}: {e}")
            yield {"type": "error", "detail": "Invalid virtual provider configuration"}
            return

        try:
            if provider_type == "router":
                config = await llm_router_service.get_config(db, provider_uuid)
                if not config:
                    logger.error(f"Router config not found for provider {provider_uuid}")
                    yield {"type": "error", "detail": "Router configuration not found"}
                    return

                router = LLMRouter(config)
                async for token in router.stream(messages, db):
                    yield {"type": "content", "content": token}

            elif provider_type == "council":
                config = await llm_council_service.get_config(db, provider_uuid)
                if not config:
                    logger.error(f"Council config not found for provider {provider_uuid}")
                    yield {"type": "error", "detail": "Council configuration not found"}
                    return

                council = LLMCouncil(config)
                async for token in council.stream(messages, db):
                    yield {"type": "content", "content": token}

            elif provider_type == "optimizer":
                config = await llm_optimizer_service.get_config(db, provider_uuid)
                if not config:
                    logger.error(f"Optimizer config not found for provider {provider_uuid}")
                    yield {"type": "error", "detail": "Optimizer configuration not found"}
                    return

                optimizer = LLMOptimizer(config)
                async for token in optimizer.stream_via_target(messages, db):
                    yield {"type": "content", "content": token}

            else:
                logger.error(f"Unknown virtual provider type: {provider_type}")
                yield {"type": "error", "detail": f"Unknown provider type: {provider_type}"}

        except Exception as e:
            logger.error(f"Error streaming via virtual provider {provider_type}: {e}", exc_info=True)
            yield {"type": "error", "detail": f"Virtual provider error: {str(e)}"}

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
