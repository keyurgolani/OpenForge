from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID


@dataclass
class _ActiveStream:
    workspace_id: UUID
    conversation_id: UUID
    started_at: datetime
    updated_at: datetime
    content: str = ""
    thinking: str = ""
    attachments_processed: list[dict[str, Any]] = field(default_factory=list)
    sources: list[dict[str, Any]] = field(default_factory=list)

    def to_snapshot(self) -> dict[str, Any]:
        return {
            "conversation_id": str(self.conversation_id),
            "data": {
                "content": self.content,
                "thinking": self.thinking,
                "attachments_processed": list(self.attachments_processed),
                "sources": list(self.sources),
                "started_at": self.started_at.isoformat(),
                "updated_at": self.updated_at.isoformat(),
            },
        }


class ChatStreamRegistry:
    """
    Tracks in-flight assistant streams so reconnecting clients can resume UI state.
    """

    def __init__(self) -> None:
        self._streams: dict[UUID, _ActiveStream] = {}

    def start(self, workspace_id: UUID, conversation_id: UUID) -> None:
        now = datetime.now(UTC)
        self._streams[conversation_id] = _ActiveStream(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            started_at=now,
            updated_at=now,
        )

    def set_sources(self, conversation_id: UUID, sources: list[dict[str, Any]]) -> None:
        stream = self._streams.get(conversation_id)
        if not stream:
            return
        stream.sources = list(sources)
        stream.updated_at = datetime.now(UTC)

    def set_attachments_processed(
        self,
        conversation_id: UUID,
        attachments: list[dict[str, Any]],
    ) -> None:
        stream = self._streams.get(conversation_id)
        if not stream:
            return
        stream.attachments_processed = list(attachments)
        stream.updated_at = datetime.now(UTC)

    def append_thinking(self, conversation_id: UUID, chunk: str) -> None:
        if not chunk:
            return
        stream = self._streams.get(conversation_id)
        if not stream:
            return
        stream.thinking += chunk
        stream.updated_at = datetime.now(UTC)

    def append_content(self, conversation_id: UUID, chunk: str) -> None:
        if not chunk:
            return
        stream = self._streams.get(conversation_id)
        if not stream:
            return
        stream.content += chunk
        stream.updated_at = datetime.now(UTC)

    def finish(self, conversation_id: UUID) -> None:
        self._streams.pop(conversation_id, None)

    def snapshot_for_conversation(
        self,
        workspace_id: UUID,
        conversation_id: UUID,
    ) -> dict[str, Any] | None:
        stream = self._streams.get(conversation_id)
        if not stream or stream.workspace_id != workspace_id:
            return None
        return stream.to_snapshot()

    def snapshots_for_workspace(self, workspace_id: UUID) -> list[dict[str, Any]]:
        snapshots = [
            stream.to_snapshot()
            for stream in self._streams.values()
            if stream.workspace_id == workspace_id
        ]
        snapshots.sort(key=lambda item: item["data"]["updated_at"], reverse=True)
        return snapshots
