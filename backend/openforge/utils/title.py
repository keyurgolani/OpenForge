from __future__ import annotations

from typing import Any


def normalize_note_title(raw_title: Any, *, max_length: int = 500) -> str | None:
    """Normalize knowledge titles so UI placeholders are never stored as data."""
    cleaned = str(raw_title or "").strip()
    if not cleaned:
        return None
    if cleaned.lower() == "untitled":
        return None
    return cleaned[:max_length]


def normalize_knowledge_title(raw_title: Any, *, max_length: int = 500) -> str | None:
    """Knowledge-first alias for title normalization."""
    return normalize_note_title(raw_title, max_length=max_length)
