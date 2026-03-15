"""Evidence packet assembly."""

from __future__ import annotations

from typing import Any

from .summarization import clip_text
from .types import EvidenceItem, EvidencePacket, EvidenceItemType


class EvidenceAssembler:
    def build(self, request) -> EvidencePacket:
        items: list[EvidenceItem] = []
        for raw_item in request.items:
            items.append(
                EvidenceItem(
                    item_type=raw_item.get("item_type", EvidenceItemType.EXCERPT),
                    source_type=raw_item["source_type"],
                    source_id=str(raw_item["source_id"]),
                    title=raw_item["title"],
                    excerpt=clip_text(str(raw_item.get("excerpt", "")), 1200),
                    parent_excerpt=clip_text(str(raw_item.get("parent_excerpt", "")), 1600)
                    if raw_item.get("parent_excerpt")
                    else None,
                    citation=raw_item.get("citation"),
                    selection_reason_codes=raw_item.get("selection_reason_codes", []),
                    metadata=raw_item.get("metadata", {}),
                )
            )

        summary = request.summary or self._default_summary(items)
        return EvidencePacket(
            workspace_id=request.workspace_id,
            query_id=request.query_id,
            conversation_id=request.conversation_id,
            run_id=request.run_id,
            summary=summary,
            item_count=len(items),
            items=items,
            metadata=request.metadata,
        )

    def _default_summary(self, items: list[EvidenceItem]) -> str | None:
        if not items:
            return None
        titles = ", ".join(item.title for item in items[:3])
        return f"Evidence assembled from {len(items)} items: {titles}"
