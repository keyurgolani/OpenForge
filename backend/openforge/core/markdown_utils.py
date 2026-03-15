import re
from typing import Optional

from openforge.domains.retrieval.chunking import build_contextual_chunks

def chunk_markdown(
    content: str,
    max_chunk_tokens: int = 500,
    overlap_tokens: int = 50,
    min_chunk_tokens: int = 50,
) -> list[dict]:
    """
    Split markdown content into chunks, preferring header boundaries.

    Returns list of:
    {
        "chunk_index": int,
        "text": str,
        "header_path": str | None,
    }
    """
    if not content or not content.strip():
        return []

    # Split on markdown headers (H1-H6)
    header_pattern = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
    sections = []
    last_end = 0
    header_stack: list[tuple[int, str]] = []  # (level, title)

    for match in header_pattern.finditer(content):
        # Save text before this header as part of previous section
        if match.start() > last_end:
            preceding_text = content[last_end:match.start()].strip()
            if preceding_text and sections:
                sections[-1]["text"] += "\n\n" + preceding_text
            elif preceding_text:
                sections.append({"text": preceding_text, "header_path": None})

        level = len(match.group(1))
        title = match.group(2).strip()

        # Update header stack
        header_stack = [(l, t) for l, t in header_stack if l < level]
        header_stack.append((level, title))
        header_path = " > ".join(t for _, t in header_stack)

        sections.append({"text": match.group(0), "header_path": header_path})
        last_end = match.end()

    # Remaining text after last header
    if last_end < len(content):
        remaining = content[last_end:].strip()
        if remaining:
            if sections:
                sections[-1]["text"] += "\n\n" + remaining
            else:
                sections.append({"text": remaining, "header_path": None})

    if not sections:
        # No headers found — treat entire content as one section
        sections = [{"text": content.strip(), "header_path": None}]

    # Split oversized sections and merge undersized ones
    chunks = []
    for section in sections:
        section_tokens = _estimate_tokens(section["text"])

        if section_tokens <= max_chunk_tokens:
            if section_tokens >= min_chunk_tokens:
                chunks.append(section)
            elif chunks:
                # Merge into previous
                chunks[-1]["text"] += "\n\n" + section["text"]
            else:
                chunks.append(section)
        else:
            # Split by paragraphs
            paragraphs = re.split(r"\n{2,}", section["text"])
            current_chunk = {"text": "", "header_path": section["header_path"]}
            overlap_text = ""

            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue

                combined = (current_chunk["text"] + "\n\n" + para).strip()
                if _estimate_tokens(combined) <= max_chunk_tokens:
                    current_chunk["text"] = combined
                else:
                    if current_chunk["text"] and _estimate_tokens(current_chunk["text"]) >= min_chunk_tokens:
                        # Save with overlap from end
                        words = current_chunk["text"].split()
                        overlap_text = " ".join(words[-overlap_tokens:]) if len(words) > overlap_tokens else ""
                        chunks.append(dict(current_chunk))

                    current_chunk = {
                        "text": (overlap_text + " " + para).strip() if overlap_text else para,
                        "header_path": section["header_path"],
                    }

            if current_chunk["text"] and _estimate_tokens(current_chunk["text"]) >= min_chunk_tokens:
                chunks.append(current_chunk)

    # Assign indexes
    return [{"chunk_index": i, "text": c["text"], "header_path": c.get("header_path")} for i, c in enumerate(chunks)]


def chunk_markdown_with_parents(
    content: str,
    title: str = "",
    max_chunk_tokens: int = 500,
    min_chunk_tokens: int = 50,
) -> list[dict]:
    chunks = build_contextual_chunks(
        content,
        title=title,
        max_chunk_tokens=max_chunk_tokens,
        min_chunk_tokens=min_chunk_tokens,
    )
    return [
        {
            "chunk_index": chunk.chunk_index,
            "text": chunk.text,
            "header_path": chunk.header_path,
            "parent_text": chunk.parent_text,
            "contextualized_text": chunk.contextualized_text,
            "chunk_type": chunk.chunk_type,
            "char_start": chunk.char_start,
            "char_end": chunk.char_end,
            "token_count": chunk.token_count,
            "parent_token_count": chunk.parent_token_count,
        }
        for chunk in chunks
    ]


def _contextualize(text: str, title: str, header_path: str | None) -> str:
    """Build a contextualized version of chunk text for dense embedding."""
    parts: list[str] = []
    if title:
        parts.append(f"From '{title}'")
    if header_path:
        parts.append(f"section '{header_path}'")
    prefix = ", ".join(parts)
    if prefix:
        return f"{prefix}:\n{text}"
    return text


def _estimate_tokens(text: str) -> int:
    """Fast token estimate: word count (roughly 1.3 tokens per word on average)."""
    return len(text.split())
