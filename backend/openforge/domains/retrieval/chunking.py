"""Context-preserving chunk builder for retrieval."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(slots=True)
class ContextualChunk:
    chunk_index: int
    text: str
    header_path: str | None
    parent_text: str
    contextualized_text: str
    chunk_type: str
    char_start: int
    char_end: int
    token_count: int
    parent_token_count: int


def build_contextual_chunks(
    content: str,
    *,
    title: str = "",
    max_chunk_tokens: int = 500,
    min_chunk_tokens: int = 50,
) -> list[ContextualChunk]:
    if not content or not content.strip():
        return []

    sections = _build_sections(content)
    chunks: list[ContextualChunk] = []
    chunk_index = 0

    for section in sections:
        cleaned_parent = _clean_section_text(section["text"])
        if not cleaned_parent:
            continue

        header_path = _combine_title_with_header(title, section.get("header_path"))
        if _looks_like_title_only(cleaned_parent):
            continue
        if _estimate_tokens(cleaned_parent) <= max_chunk_tokens:
            if _estimate_tokens(cleaned_parent) < min_chunk_tokens and chunks:
                previous = chunks[-1]
                merged_text = f"{previous.text}\n\n{cleaned_parent}".strip()
                chunks[-1] = ContextualChunk(
                    chunk_index=previous.chunk_index,
                    text=merged_text,
                    header_path=previous.header_path,
                    parent_text=f"{previous.parent_text}\n\n{cleaned_parent}".strip(),
                    contextualized_text=_contextualize(merged_text, header_path=previous.header_path),
                    chunk_type="child",
                    char_start=previous.char_start,
                    char_end=previous.char_start + len(merged_text),
                    token_count=_estimate_tokens(merged_text),
                    parent_token_count=_estimate_tokens(f"{previous.parent_text}\n\n{cleaned_parent}".strip()),
                )
                continue

            chunks.append(
                ContextualChunk(
                    chunk_index=chunk_index,
                    text=cleaned_parent,
                    header_path=header_path,
                    parent_text=cleaned_parent,
                    contextualized_text=_contextualize(cleaned_parent, header_path=header_path),
                    chunk_type="child",
                    char_start=0,
                    char_end=len(cleaned_parent),
                    token_count=_estimate_tokens(cleaned_parent),
                    parent_token_count=_estimate_tokens(cleaned_parent),
                )
            )
            chunk_index += 1
            continue

        paragraphs = [part.strip() for part in re.split(r"\n{2,}", cleaned_parent) if part.strip()]
        current_parts: list[str] = []
        for paragraph in paragraphs:
            candidate = "\n\n".join(current_parts + [paragraph]).strip()
            if current_parts and _estimate_tokens(candidate) > max_chunk_tokens:
                text = "\n\n".join(current_parts).strip()
                if _estimate_tokens(text) >= min_chunk_tokens:
                    char_start, char_end = _locate_span(cleaned_parent, text)
                    chunks.append(
                        ContextualChunk(
                            chunk_index=chunk_index,
                            text=text,
                            header_path=header_path,
                            parent_text=cleaned_parent,
                            contextualized_text=_contextualize(text, header_path=header_path),
                            chunk_type="child",
                            char_start=char_start,
                            char_end=char_end,
                            token_count=_estimate_tokens(text),
                            parent_token_count=_estimate_tokens(cleaned_parent),
                        )
                    )
                    chunk_index += 1
                current_parts = [paragraph]
                continue
            current_parts.append(paragraph)

        final_text = "\n\n".join(current_parts).strip()
        if final_text and _estimate_tokens(final_text) >= min_chunk_tokens:
            char_start, char_end = _locate_span(cleaned_parent, final_text)
            chunks.append(
                ContextualChunk(
                    chunk_index=chunk_index,
                    text=final_text,
                    header_path=header_path,
                    parent_text=cleaned_parent,
                    contextualized_text=_contextualize(final_text, header_path=header_path),
                    chunk_type="child",
                    char_start=char_start,
                    char_end=char_end,
                    token_count=_estimate_tokens(final_text),
                    parent_token_count=_estimate_tokens(cleaned_parent),
                )
            )
            chunk_index += 1

    return chunks


def _build_sections(content: str) -> list[dict[str, str | None]]:
    header_pattern = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
    sections: list[dict[str, str | None]] = []
    last_end = 0
    header_stack: list[tuple[int, str]] = []

    for match in header_pattern.finditer(content):
        if match.start() > last_end:
            preceding = content[last_end:match.start()].strip()
            if preceding and sections:
                sections[-1]["text"] = f"{sections[-1]['text']}\n\n{preceding}".strip()
            elif preceding:
                sections.append({"text": preceding, "header_path": None})

        level = len(match.group(1))
        header_text = match.group(2).strip()
        header_stack = [(existing_level, title) for existing_level, title in header_stack if existing_level < level]
        header_stack.append((level, header_text))
        sections.append(
            {
                "text": match.group(0),
                "header_path": " > ".join(title for _, title in header_stack),
            }
        )
        last_end = match.end()

    if last_end < len(content):
        remaining = content[last_end:].strip()
        if remaining:
            if sections:
                sections[-1]["text"] = f"{sections[-1]['text']}\n\n{remaining}".strip()
            else:
                sections.append({"text": remaining, "header_path": None})

    return sections or [{"text": content.strip(), "header_path": None}]


def _clean_section_text(text: str) -> str:
    paragraphs = [segment.strip() for segment in re.split(r"\n{2,}", text or "") if segment.strip()]
    kept: list[str] = []
    for paragraph in paragraphs:
        if _looks_like_navigation_only(paragraph):
            continue
        kept.append(paragraph)
    return "\n\n".join(kept).strip()


def _looks_like_navigation_only(paragraph: str) -> bool:
    lines = [line.strip() for line in paragraph.splitlines() if line.strip()]
    if not lines:
        return True
    tokens = sum(len(line.split()) for line in lines)
    if tokens > 12 or len(lines) < 2:
        return False
    return all(len(line.split()) <= 3 for line in lines)


def _combine_title_with_header(title: str, header_path: str | None) -> str | None:
    clean_title = (title or "").strip()
    clean_header = (header_path or "").strip()
    if clean_title and clean_header and clean_title == clean_header:
        return clean_title
    if clean_title and clean_header.startswith(f"{clean_title} >"):
        return clean_header
    if clean_title and clean_header:
        return f"{clean_title} > {clean_header}"
    return clean_title or clean_header or None


def _looks_like_title_only(text: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return len(lines) == 1 and lines[0].startswith("#")


def _contextualize(text: str, *, header_path: str | None) -> str:
    if header_path:
        return f"section '{header_path}':\n{text}"
    return text


def _estimate_tokens(text: str) -> int:
    return len((text or "").split())


def _locate_span(haystack: str, needle: str) -> tuple[int, int]:
    start = haystack.find(needle)
    if start < 0:
        return 0, len(needle)
    return start, start + len(needle)
