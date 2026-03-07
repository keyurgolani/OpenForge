"""
Attachment pipeline for OpenForge.

Routes attachments to appropriate content processors based on content type
and file extension.
"""
from __future__ import annotations

import re
import logging
from pathlib import Path
from uuid import UUID
from typing import Optional

logger = logging.getLogger("openforge.attachment_pipeline")

# Legacy extension sets for backwards compatibility
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
    """
    Resolve the pipeline name for an attachment.

    Uses the content processor registry to find the appropriate processor.
    Falls back to "deferred" if no processor is found.
    """
    # Initialize registry if needed
    from openforge.core.content_processors.registry import content_processor_registry
    content_processor_registry.initialize()

    processor, pipeline_name = content_processor_registry.resolve(content_type, filename)
    return pipeline_name


async def process_attachment(
    file_path: str,
    workspace_id: UUID,
    content_type: Optional[str] = None,
    filename: Optional[str] = None,
    knowledge_id: Optional[UUID] = None,
    **kwargs,
):
    """
    Process an attachment using the appropriate processor.

    Args:
        file_path: Path to the attachment file
        workspace_id: Workspace UUID
        content_type: MIME type
        filename: File name
        knowledge_id: Optional knowledge UUID
        **kwargs: Additional processor options

    Returns:
        ProcessorResult from the appropriate processor
    """
    from openforge.core.content_processors.registry import content_processor_registry
    content_processor_registry.initialize()

    return await content_processor_registry.process(
        file_path=file_path,
        workspace_id=workspace_id,
        content_type=content_type,
        filename=filename,
        knowledge_id=knowledge_id,
        **kwargs,
    )


def extract_http_urls(text: str) -> list[str]:
    """Extract HTTP URLs from text."""
    ordered_unique: list[str] = []
    seen: set[str] = set()

    for match in HTTP_URL_PATTERN.findall(text or ""):
        cleaned = match.rstrip(URL_TRAILING_PUNCTUATION)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            ordered_unique.append(cleaned)

    return ordered_unique


def get_processor_for_attachment(
    content_type: Optional[str], filename: Optional[str]
) -> Optional[str]:
    """Get the processor name for an attachment."""
    return resolve_attachment_pipeline(content_type, filename)
