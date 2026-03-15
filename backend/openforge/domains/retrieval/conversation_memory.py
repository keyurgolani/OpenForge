"""Conversation summary and memory helpers."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from .summarization import summarize_messages
from .types import ConversationSummary, SummaryType


class ConversationMemoryService:
    def build_summary(
        self,
        *,
        workspace_id: UUID,
        conversation_id: UUID,
        messages: list[dict[str, Any]],
        max_messages_before_summary: int = 20,
        keep_recent_messages: int = 10,
        run_id: UUID | None = None,
        version: int = 1,
    ) -> ConversationSummary:
        if len(messages) <= max_messages_before_summary:
            summary_messages = messages
            recent_messages = messages
        else:
            recent_messages = messages[-keep_recent_messages:]
            summary_messages = messages[:-keep_recent_messages]

        summary = summarize_messages(summary_messages)
        return ConversationSummary(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            run_id=run_id,
            summary_type=SummaryType.CONVERSATION_MEMORY,
            version=version,
            summary=summary,
            recent_messages=recent_messages,
            metadata={
                "message_count": len(messages),
                "summarized_count": len(summary_messages),
                "kept_recent_count": len(recent_messages),
            },
        )
