from __future__ import annotations

import re
from pathlib import Path

TEXT_FILE_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".csv",
    ".xml",
    ".yaml",
    ".yml",
}

URL_TRAILING_PUNCTUATION = ".,!?;:)]}\"'"
HTTP_URL_PATTERN = re.compile(r"https?://[^\s<>]+")


def resolve_attachment_pipeline(content_type: str | None, filename: str | None) -> str:
    normalized_content_type = (content_type or "").strip().lower()
    extension = Path((filename or "").strip()).suffix.lower()

    if normalized_content_type.startswith("text/") or extension in TEXT_FILE_EXTENSIONS:
        return "text"

    return "deferred"


def extract_http_urls(text: str) -> list[str]:
    ordered_unique: list[str] = []
    seen: set[str] = set()

    for match in HTTP_URL_PATTERN.findall(text or ""):
        cleaned = match.rstrip(URL_TRAILING_PUNCTUATION)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            ordered_unique.append(cleaned)

    return ordered_unique
