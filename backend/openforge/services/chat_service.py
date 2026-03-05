from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
import logging
from typing import List, Optional

from openforge.core.llm_gateway import llm_gateway
from openforge.core.search_engine import search_engine
from openforge.core.context_assembler import ContextAssembler
from openforge.services.conversation_service import conversation_service
from openforge.services.llm_service import llm_service
from openforge.api.websocket import ws_manager
from openforge.db.models import MessageAttachment

logger = logging.getLogger("openforge.chat")

context_assembler = ContextAssembler()


class ChatService:
    async def handle_chat_message(
        self,
        websocket: WebSocket,
        workspace_id: UUID,
        conversation_id: UUID,
        user_content: str,
        db: AsyncSession,
        attachment_ids: Optional[List[str]] = None,
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
    ):
        """Full chat message handling pipeline."""
        # Build enhanced content with attachments
        enhanced_content = user_content
        attachment_context = ""

        if attachment_ids:
            attachment_texts = []
            for att_id in attachment_ids:
                try:
                    result = await db.execute(
                        select(MessageAttachment).where(MessageAttachment.id == UUID(att_id))
                    )
                    attachment = result.scalar_one_or_none()
                    if attachment and attachment.extracted_text:
                        attachment_texts.append(
                            f"\n--- Content from {attachment.filename} ---\n{attachment.extracted_text}\n--- End of {attachment.filename} ---\n"
                        )
                except Exception as e:
                    logger.warning(f"Failed to load attachment {att_id}: {e}")

            if attachment_texts:
                attachment_context = "\n\nThe user has attached the following files:\n" + "\n".join(attachment_texts)

        # 1. Save user message
        msg = await conversation_service.add_message(
            db, conversation_id, role="user", content=user_content
        )

        # 2. RAG context retrieval (use enhanced content if attachments present)
        rag_query = user_content
        if attachment_context:
            rag_query = f"{user_content}\n{attachment_context}"

        rag_results = search_engine.search(
            query=rag_query,
            workspace_id=str(workspace_id),
            limit=5,
        )

        # 3. Assemble prompt
        history = await conversation_service.get_recent_messages(db, conversation_id, limit=20)
        system_prompt = (
            "You are a helpful AI assistant integrated into OpenForge, a self-hosted knowledge management workspace. "
            "Answer questions based on the user's notes when relevant context is available. "
            "If the user has attached files, use their content to answer questions. "
            "If the context doesn't contain relevant information, answer from your general knowledge and say so. "
            "Be concise, clear, and helpful."
        )

        assembled = context_assembler.assemble(
            system_prompt=system_prompt,
            conversation_messages=history,
            rag_results=rag_results,
            extra_context=attachment_context if attachment_context else None,
        )

        # 4. Get provider and stream response
        try:
            provider_name, api_key, model, base_url = await llm_service.get_provider_for_workspace(
                db, workspace_id, provider_id=provider_id, model_override=model_id
            )
        except Exception as e:
            await ws_manager.send_to_connection(websocket, {
                "type": "chat_error",
                "conversation_id": str(conversation_id),
                "detail": str(e),
            })
            return

        full_response = ""
        try:
            async for token in llm_gateway.stream(
                messages=assembled,
                provider_name=provider_name,
                api_key=api_key,
                model=model,
                base_url=base_url,
            ):
                full_response += token
                await ws_manager.send_to_connection(websocket, {
                    "type": "chat_token",
                    "conversation_id": str(conversation_id),
                    "data": token,
                })
        except Exception as e:
            logger.error(f"LLM streaming error: {e}")
            await ws_manager.send_to_connection(websocket, {
                "type": "chat_error",
                "conversation_id": str(conversation_id),
                "detail": str(e),
            })
            return

        # 5. Save assistant message
        context_sources = [
            {"note_id": r["note_id"], "title": r["title"], "snippet": r["chunk_text"][:200], "score": r["score"]}
            for r in rag_results[:5]
        ]
        msg = await conversation_service.add_message(
            db,
            conversation_id,
            role="assistant",
            content=full_response,
            model_used=model,
            provider_used=provider_name,
            token_count=llm_gateway.count_tokens(full_response),
            context_sources=context_sources,
        )

        # 6. Send sources + done
        if rag_results:
            await ws_manager.send_to_connection(websocket, {
                "type": "chat_sources",
                "conversation_id": str(conversation_id),
                "data": context_sources,
            })

        await ws_manager.send_to_connection(websocket, {
            "type": "chat_done",
            "conversation_id": str(conversation_id),
            "message_id": str(msg.id),
        })


chat_service = ChatService()
