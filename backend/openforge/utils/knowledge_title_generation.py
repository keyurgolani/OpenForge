from __future__ import annotations

import re

from openforge.utils.title_generation import normalize_generated_title


def _strip_markdown_syntax(text: str) -> str:
    """Remove markdown images, links, URLs, and formatting markers."""
    # Strip markdown images ![alt](url) → keep alt text
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    # Strip markdown links [text](url) → keep link text
    text = re.sub(r"\[([^\]]*)\]\([^)]+\)", r"\1", text)
    # Strip bare URLs
    text = re.sub(r"https?://\S+", "", text)
    # Strip backticks, bold/italic markers
    text = re.sub(r"`{1,3}", "", text)
    text = re.sub(r"\*{1,2}", "", text)
    return re.sub(r"\s+", " ", text).strip()


def fallback_knowledge_title(knowledge_content: str, max_words: int = 8, max_length: int = 120) -> str | None:
    raw = str(knowledge_content or "").strip()
    if not raw:
        return None

    # Prefer the first markdown heading as the title — it's the most
    # reliable signal and skips decorative badge/logo noise at the top.
    heading_match = re.search(r"^#{1,6}\s+(.+)$", raw, re.MULTILINE)
    if heading_match:
        text = _strip_markdown_syntax(heading_match.group(1))
        if len(text) >= 3:
            words = text.split(" ")
            truncated = " ".join(words[:max_words]).strip()
            if truncated:
                return truncated[:max_length]

    # No heading found — fall back to first substantive text
    text = re.sub(r"^#{1,6}\s*", "", raw)
    text = _strip_markdown_syntax(text)

    words = text.split(" ")
    truncated = " ".join(words[:max_words]).strip()
    return truncated[:max_length] if truncated else None


def derive_knowledge_title(raw_response: object, knowledge_content: str, max_words: int = 8) -> str | None:
    generated = normalize_generated_title(raw_response)
    if generated:
        return generated[:120]
    return fallback_knowledge_title(knowledge_content, max_words=max_words)
