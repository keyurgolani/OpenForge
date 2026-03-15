"""Shared summarization helpers for Phase 4 retrieval flows."""

from __future__ import annotations

import json
import re
from typing import Any


def estimate_token_count(text: str) -> int:
    return len((text or "").split())


def clip_text(text: str, max_chars: int) -> str:
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    clipped = text[: max(0, max_chars - 3)].rstrip()
    return f"{clipped}..."


def serialize_output(output: Any) -> str:
    if isinstance(output, str):
        return output
    try:
        return json.dumps(output, ensure_ascii=False, default=str, indent=2)
    except Exception:
        return str(output)


def summarize_structured_output(tool_name: str, output: Any) -> str:
    if isinstance(output, dict):
        if isinstance(output.get("results"), list):
            titles = [
                str(item.get("title", "")).strip()
                for item in output["results"]
                if isinstance(item, dict) and str(item.get("title", "")).strip()
            ]
            title_preview = ", ".join(titles[:3])
            return (
                f"{tool_name} returned {len(output['results'])} results."
                + (f" Top titles: {title_preview}." if title_preview else "")
            )
        keys = ", ".join(sorted(output.keys())[:8])
        return f"{tool_name} returned an object with keys: {keys}."
    if isinstance(output, list):
        return f"{tool_name} returned a list with {len(output)} items."

    text = serialize_output(output)
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(sentences[:2]).strip() or clip_text(text, 240)


def summarize_messages(messages: list[dict[str, Any]], max_lines: int = 8) -> str:
    lines: list[str] = []
    for message in messages:
        role = str(message.get("role", "user")).strip().lower() or "user"
        content = clip_text(str(message.get("content", "")).strip(), 240)
        if not content:
            continue
        lines.append(f"{role}: {content}")
        if len(lines) >= max_lines:
            break
    return "\n".join(lines)
