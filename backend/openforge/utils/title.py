from __future__ import annotations

from typing import Any


def normalize_note_title(raw_title: Any, *, max_length: int = 500) -> str | None:
    """Normalize note titles so UI placeholders are never stored as data."""
    cleaned = str(raw_title or "").strip()
    if not cleaned:
        return None
    if cleaned.lower() == "untitled":
        return None
    return cleaned[:max_length]
