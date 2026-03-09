from __future__ import annotations

import re
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

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


# ---------------------------------------------------------------------------
# Extractor registry
# ---------------------------------------------------------------------------

class AttachmentExtractor(ABC):
    """Base class for content extractors. Each pipeline type has one concrete extractor."""

    pipeline: str  # e.g. "text", "pdf", "image", "audio"

    @abstractmethod
    def matches(self, content_type: str, extension: str) -> bool:
        """Return True if this extractor handles the given content_type / file extension."""

    @abstractmethod
    async def extract(self, file_path: str) -> Optional[str]:
        """Extract and return text content, or None if nothing could be extracted."""


class TextAttachmentExtractor(AttachmentExtractor):
    """Extracts plain text from text-based file formats."""

    pipeline = "text"

    def matches(self, content_type: str, extension: str) -> bool:
        return content_type.startswith("text/") or extension in TEXT_FILE_EXTENSIONS

    async def extract(self, file_path: str) -> Optional[str]:
        from openforge.api.attachments import extract_text_from_text_file
        raw = await extract_text_from_text_file(file_path)
        return (raw or "").strip() or None


# Future extractors — uncomment and implement when the corresponding pipeline is ready.
# Each will share the same content extraction logic used by the Knowledge system.

# class PDFAttachmentExtractor(AttachmentExtractor):
#     pipeline = "pdf"
#     def matches(self, content_type: str, extension: str) -> bool:
#         return content_type == "application/pdf" or extension == ".pdf"
#     async def extract(self, file_path: str) -> Optional[str]: ...

# class ImageAttachmentExtractor(AttachmentExtractor):
#     pipeline = "image"
#     def matches(self, content_type: str, extension: str) -> bool:
#         return content_type.startswith("image/")
#     async def extract(self, file_path: str) -> Optional[str]: ...

# class AudioAttachmentExtractor(AttachmentExtractor):
#     pipeline = "audio"
#     def matches(self, content_type: str, extension: str) -> bool:
#         return content_type.startswith("audio/")
#     async def extract(self, file_path: str) -> Optional[str]: ...


_EXTRACTORS: list[AttachmentExtractor] = [
    TextAttachmentExtractor(),
    # Future: PDFAttachmentExtractor(), ImageAttachmentExtractor(), AudioAttachmentExtractor(),
]


def get_extractor(content_type: str | None, filename: str | None) -> Optional[AttachmentExtractor]:
    """Return the matching extractor for this file, or None if none is registered yet."""
    ct = (content_type or "").strip().lower()
    ext = Path((filename or "").strip()).suffix.lower()
    for extractor in _EXTRACTORS:
        if extractor.matches(ct, ext):
            return extractor
    return None


def resolve_attachment_pipeline(content_type: str | None, filename: str | None) -> str:
    """Return the pipeline identifier for this attachment.

    Current values:
      "text"     — plain text extraction (implemented)
      "pdf"      — PDF extraction (deferred — not yet implemented)
      "image"    — image understanding (deferred — not yet implemented)
      "audio"    — audio transcription (deferred — not yet implemented)
      "deferred" — unknown / unsupported type
    """
    extractor = get_extractor(content_type, filename)
    if extractor is not None:
        return extractor.pipeline
    # Identify future pipeline types so callers can show meaningful status
    ct = (content_type or "").strip().lower()
    ext = Path((filename or "").strip()).suffix.lower()
    if ct == "application/pdf" or ext == ".pdf":
        return "pdf"
    if ct.startswith("image/"):
        return "image"
    if ct.startswith("audio/"):
        return "audio"
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
