"""
Text Processing Utilities

Provides word counting, truncation, and markdown processing utilities.
"""

from __future__ import annotations

import re
from typing import Tuple


_FENCED_CODE_BLOCK_RE = re.compile(r"```[^\n]*\n?(.*?)```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`([^`\n]+)`")
_CODE_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|\d+")


def _count_code_tokens(text: str) -> int:
    return len(_CODE_TOKEN_RE.findall(text))


def count_words(text: str | None, knowledge_type: str | None = None) -> int:
    """
    Count words for knowledge cards.

    - Gists: count code-like tokens so symbol-dense code lines are not counted as one word.
    - Other knowledge types: count prose by whitespace, but count markdown code (fenced/inline)
      using code-like tokenization.
    """
    if not text:
        return 0

    if knowledge_type == "gist":
        return _count_code_tokens(text)

    code_token_total = 0

    def _replace_fenced(match: re.Match[str]) -> str:
        nonlocal code_token_total
        code_token_total += _count_code_tokens(match.group(1))
        return " "

    text_without_fenced = _FENCED_CODE_BLOCK_RE.sub(_replace_fenced, text)

    def _replace_inline(match: re.Match[str]) -> str:
        nonlocal code_token_total
        code_token_total += _count_code_tokens(match.group(1))
        return " "

    text_without_code = _INLINE_CODE_RE.sub(_replace_inline, text_without_fenced)
    prose_words = len(text_without_code.split())
    return prose_words + code_token_total


def normalize_word_count(
    stored_word_count: int | None,
    text: str | None,
    knowledge_type: str | None = None,
) -> Tuple[int, bool]:
    """
    Recompute current word count and report whether stored value is stale.
    Returns: (normalized_count, changed)
    """
    normalized = count_words(text, knowledge_type=knowledge_type)
    current = stored_word_count or 0
    return normalized, normalized != current


def truncate_text(text: str, max_chars: int, ellipsis: str = "...") -> str:
    """Truncate text to max_chars, preserving word boundaries."""
    if not text or len(text) <= max_chars:
        return text
    truncated = text[:max_chars - len(ellipsis)]
    last_space = truncated.rfind(" ")
    if last_space > max_chars // 2:
        truncated = truncated[:last_space]
    return truncated + ellipsis


def strip_markdown(text: str) -> str:
    """Very basic markdown stripping for preview snippets."""
    # Remove code blocks
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"`[^`]+`", "", text)
    # Remove headers
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Remove bold/italic
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}([^_]+)_{1,3}", r"\1", text)
    # Remove links
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove images
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    # Remove blockquotes
    text = re.sub(r"^>\s+", "", text, flags=re.MULTILINE)
    # Collapse whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def highlight_query_terms(text: str, query: str) -> str:
    """Wrap query terms in <mark> tags for search result highlighting."""
    if not query or not text:
        return text
    terms = [re.escape(term) for term in query.split() if len(term) >= 2]
    if not terms:
        return text
    pattern = re.compile("|".join(terms), re.IGNORECASE)
    return pattern.sub(lambda m: f"<mark>{m.group()}</mark>", text)
