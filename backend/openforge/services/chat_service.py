import asyncio
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
import logging
import time
from typing import List, Optional

from openforge.core.llm_gateway import llm_gateway
from openforge.core.search_engine import search_engine
from openforge.core.context_assembler import ContextAssembler
from openforge.core.llm_router import LLMRouter
from openforge.core.llm_council import LLMCouncil
from openforge.core.llm_optimizer import LLMOptimizer
from openforge.services.llm_router_service import llm_router_service
from openforge.services.llm_council_service import llm_council_service
from openforge.services.llm_optimizer_service import llm_optimizer_service
from openforge.services.conversation_service import conversation_service
from openforge.services.llm_service import llm_service
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
from openforge.services.chat_stream_registry import ChatStreamRegistry
from openforge.api.websocket import ws_manager
from openforge.db.models import Conversation, Knowledge, MessageAttachment

logger = logging.getLogger("openforge.chat")

context_assembler = ContextAssembler()


class ChatService:
    def __init__(self) -> None:
        self.stream_registry = ChatStreamRegistry()

    async def _process_message_attachments(
        self,
        db: AsyncSession,
        *,
        user_message_id: UUID,
        attachment_ids: Optional[List[str]],
        workspace_id: Optional[UUID] = None,
    ) -> tuple[str, list[dict]]:
        if not attachment_ids:
            return "", []

        from openforge.api.attachments import extract_text_from_text_file
        from openforge.services.attachment_pipeline import process_attachment

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

            # Use content processor registry for all pipelines
            if pipeline != "deferred":
                try:
                    # Process using the content processor
                    proc_result = await process_attachment(
                        file_path=attachment.file_path,
                        workspace_id=workspace_id or UUID("00000000-0000-0000-0000-000000000000"),
                        content_type=attachment.content_type,
                        filename=attachment.filename,
                    )

                    if proc_result.success and proc_result.extracted_text:
                        # Store extracted text
                        if not (attachment.extracted_text or "").strip():
                            attachment.extracted_text = proc_result.extracted_text
                            db_updated = True

                        extracted_text = proc_result.extracted_text.strip()
                        if extracted_text:
                            attachment_status = "processed"
                            details = f"Extracted via {pipeline} ({len(extracted_text)} chars)"
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
                    elif proc_result.error:
                        attachment_status = "error"
                        details = proc_result.error
                except Exception as e:
                    logger.warning(f"Failed to process attachment {attachment_id}: {e}")
                    attachment_status = "error"
                    details = str(e)

            # Fallback for text files (legacy path)
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
                        (
                            f"\n--- Content from {attachment.filename} ---\n"
                            f"{extracted_text}\n"
                            f"--- End of {attachment.filename} ---\n"
                        )
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

    async def _trigger_bookmark_extraction_for_links(
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

    async def _stream_via_virtual_provider(
        self,
        messages: list[dict],
        provider_type: str,
        provider_id: UUID | str,
        db: AsyncSession,
        workspace_id: UUID,
    ):
        """
        Route messages through a virtual provider (router, council, optimizer).
        Yields events in the same format as llm_gateway.stream_events().
        """
        try:
            provider_uuid = provider_id if isinstance(provider_id, UUID) else UUID(str(provider_id))
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

    async def handle_chat_message(
        self,
        workspace_id: UUID,
        conversation_id: UUID,
        user_content: str,
        db: AsyncSession,
        attachment_ids: Optional[List[str]] = None,
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
    ):
        """Full chat message handling pipeline."""
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
        user_message = await conversation_service.add_message(
            db, conversation_id, role="user", content=user_content
        )
        self.stream_registry.start(workspace_id=workspace_id, conversation_id=conversation_id)

        try:
            # 2. Process attachments and surface their pipeline status before retrieval.
            attachment_context, attachments_processed = await self._process_message_attachments(
                db,
                user_message_id=user_message.id,
                attachment_ids=attachment_ids,
            )
            if attachments_processed:
                self.stream_registry.set_attachments_processed(
                    conversation_id=conversation_id,
                    attachments=attachments_processed,
                )
                await ws_manager.send_to_workspace(workspace_key, {
                    "type": "chat_attachments_processed",
                    "conversation_id": str(conversation_id),
                    "data": attachments_processed,
                })

            # 3. Trigger bookmark extraction for HTTP links mentioned in chat.
            chat_urls = extract_http_urls(user_content)
            if chat_urls:
                asyncio.create_task(
                    self._trigger_bookmark_extraction_for_links(
                        workspace_id=workspace_id,
                        urls=chat_urls,
                    )
                )

            # 4. RAG context retrieval (use enhanced content if attachments present)
            rag_query = user_content
            if attachment_context:
                rag_query = f"{user_content}\n{attachment_context}"

            raw_rag_results = search_engine.search(
                query=rag_query,
                workspace_id=str(workspace_id),
                limit=12,
                score_threshold=0.35,
            )
            rag_results = select_relevant_rag_results(raw_rag_results, limit=5)
            context_sources = build_context_sources(rag_results)

            # Emit selected sources before generation starts so UI can mirror
            # the actual sequence: retrieval -> thinking -> response.
            if context_sources:
                self.stream_registry.set_sources(conversation_id=conversation_id, sources=context_sources)
                await ws_manager.send_to_workspace(workspace_key, {
                    "type": "chat_sources",
                    "conversation_id": str(conversation_id),
                    "data": context_sources,
                })

            # 5. Assemble prompt
            history = await conversation_service.get_recent_messages(db, conversation_id, limit=20)
            system_prompt = (
                "You are a helpful AI assistant integrated into OpenForge, a self-hosted knowledge management workspace. "
                "Answer questions using the user's workspace knowledge when relevant context is available. "
                "If the user has attached files, use their content to answer questions. "
                "If the knowledge does not contain relevant information, answer from your general knowledge and say so clearly. "
                "Write naturally and conversationally. Do NOT begin responses with formulaic phrases like "
                "\"Based on the provided context,\" \"According to the context,\" or similar variants. "
                "Never call the retrieved material \"provided context\" or \"the context above.\" "
                "When referencing retrieved material, refer to it as \"Workspace Knowledge\" and/or \"Referenced Sources\" naturally "
                "(for example: \"In your Workspace Knowledge, <title> says...\" or "
                "\"One of the Referenced Sources notes...\"). "
                "When source material is irrelevant or insufficient, state that you did not find enough in Workspace Knowledge or Referenced Sources, "
                "then continue helpfully from general knowledge if appropriate. "
                "Be concise, clear, and helpful."
            )

            assembled = context_assembler.assemble(
                system_prompt=system_prompt,
                conversation_messages=history,
                rag_results=rag_results,
                extra_context=attachment_context if attachment_context else None,
            )

            # 6. Get provider and stream response
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
                    if not provider_id:
                        await ws_manager.send_to_workspace(workspace_key, {
                            "type": "chat_error",
                            "conversation_id": str(conversation_id),
                            "detail": "Virtual provider requires explicit provider configuration",
                        })
                        return
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
                            self.stream_registry.append_thinking(conversation_id=conversation_id, chunk=thinking)
                            await ws_manager.send_to_workspace(workspace_key, {
                                "type": "chat_thinking",
                                "conversation_id": str(conversation_id),
                                "data": thinking,
                            })
                        continue

                    token = event.get("content", "")
                    if token:
                        full_response += token
                        self.stream_registry.append_content(conversation_id=conversation_id, chunk=token)
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

            # 7. Save assistant message
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

            # 8. Notify completion
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
            logger.error("Chat pipeline error for conversation %s: %s", conversation_id, e)
            await ws_manager.send_to_workspace(workspace_key, {
                "type": "chat_error",
                "conversation_id": str(conversation_id),
                "detail": str(e),
            })
        finally:
            self.stream_registry.finish(conversation_id)


chat_service = ChatService()
