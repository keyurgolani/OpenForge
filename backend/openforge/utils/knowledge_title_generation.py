from __future__ import annotations

import re

from openforge.utils.title_generation import normalize_generated_title


def fallback_knowledge_title(knowledge_content: str, max_words: int = 8, max_length: int = 120) -> str | None:
    text = str(knowledge_content or "").strip()
    if not text:
        return None

    text = re.sub(r"^#{1,6}\s*", "", text)
    text = re.sub(r"`{1,3}", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    words = text.split(" ")
    truncated = " ".join(words[:max_words]).strip()
    return truncated[:max_length] if truncated else None


def derive_knowledge_title(raw_response: object, knowledge_content: str, max_words: int = 8) -> str | None:
    generated = normalize_generated_title(raw_response)
    if generated:
        return generated[:120]
    return fallback_knowledge_title(knowledge_content, max_words=max_words)
