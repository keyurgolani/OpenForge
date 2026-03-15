"""Centralized LLM input preparation with trust metadata."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .trust_boundaries import (
    ContentSourceType,
    TrustBoundary,
    TrustLevel,
    classify_trust_level,
    wrap_untrusted_content,
)


class PreparedInputBlock(BaseModel):
    label: str
    content: str
    boundary: TrustBoundary


class PreparedInput(BaseModel):
    messages: list[dict[str, Any]]
    trust_metadata: list[dict[str, Any]] = Field(default_factory=list)


def build_context_block(
    *,
    label: str,
    content: str,
    source_type: ContentSourceType,
    source_id: str | None = None,
    promoted: bool = False,
    transformation_path: list[str] | None = None,
) -> PreparedInputBlock:
    return PreparedInputBlock(
        label=label,
        content=content,
        boundary=TrustBoundary(
            source_type=source_type,
            trust_level=classify_trust_level(source_type, promoted=promoted),
            source_id=source_id,
            transformation_path=transformation_path or [],
        ),
    )


def prepare_llm_messages(
    *,
    system_instruction: str,
    conversation_messages: list[dict[str, Any]] | None = None,
    context_blocks: list[PreparedInputBlock] | None = None,
) -> PreparedInput:
    assembled_system = system_instruction
    trust_metadata: list[dict[str, Any]] = []

    for block in context_blocks or []:
        content = block.content
        if block.boundary.trust_level == TrustLevel.UNTRUSTED:
            content = wrap_untrusted_content(content, block.boundary)
        assembled_system = f"{assembled_system}\n\n{content}"
        trust_metadata.append(
            {
                "label": block.label,
                "source_type": block.boundary.source_type.value,
                "source_id": block.boundary.source_id,
                "trust_level": block.boundary.trust_level.value,
                "transformation_path": block.boundary.transformation_path,
            }
        )

    messages = [{"role": "system", "content": assembled_system}]
    messages.extend(conversation_messages or [])
    return PreparedInput(messages=messages, trust_metadata=trust_metadata)
