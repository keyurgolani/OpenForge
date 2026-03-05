from __future__ import annotations

import re

from openforge.utils.title_generation import normalize_generated_title


def fallback_chat_title(first_message: str, max_words: int = 7, max_length: int = 120) -> str | None:
    text = str(first_message or "").strip()
    if not text:
        return None

    text = re.sub(r"^#{1,6}\s*", "", text)
    text = re.sub(r"`{1,3}", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    words = text.split(" ")
    truncated = " ".join(words[:max_words]).strip()
    return truncated[:max_length] if truncated else None


def derive_chat_title(raw_response: object, first_message: str) -> str | None:
    generated = normalize_generated_title(raw_response)
    if generated:
        return generated[:120]
    return fallback_chat_title(first_message)
