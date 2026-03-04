def count_words(text: str) -> int:
    """Count words in text by splitting on whitespace."""
    if not text:
        return 0
    return len(text.split())


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
    import re
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
    import re
    if not query or not text:
        return text
    terms = [re.escape(term) for term in query.split() if len(term) >= 2]
    if not terms:
        return text
    pattern = re.compile("|".join(terms), re.IGNORECASE)
    return pattern.sub(lambda m: f"<mark>{m.group()}</mark>", text)
