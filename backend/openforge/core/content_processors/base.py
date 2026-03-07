"""
Base content processor class for OpenForge.

Defines the interface and common functionality for all content processors.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional
from uuid import UUID


@dataclass
class ProcessorResult:
    """Result of content processing."""
    success: bool
    content: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    thumbnail_path: Optional[str] = None
    error: Optional[str] = None

    # For processors that extract additional text
    extracted_text: str = ""

    # For processors with AI-generated content
    ai_title: Optional[str] = None
    ai_description: Optional[str] = None
    ai_summary: Optional[str] = None
    ai_tags: list[str] = field(default_factory=list)

    # Embedding status
    embedded: bool = False


class ContentProcessor(ABC):
    """
    Abstract base class for content processors.

    Each processor handles a specific content type (text, image, audio, PDF, bookmark)
    and implements the full pipeline for that type including:
    - Content extraction
    - Metadata extraction
    - AI analysis (optional)
    - Embedding generation (optional)
    """

    # Subclasses should define these
    name: str = "base"
    supported_types: list[str] = []
    supported_extensions: list[str] = []

    @abstractmethod
    async def process(
        self,
        file_path: str,
        workspace_id: UUID,
        knowledge_id: Optional[UUID] = None,
        **kwargs,
    ) -> ProcessorResult:
        """
        Process content and return result.

        Args:
            file_path: Path to the content file
            workspace_id: Workspace UUID
            knowledge_id: Optional knowledge entry UUID
            **kwargs: Additional processor-specific options

        Returns:
            ProcessorResult with extracted content and metadata
        """
        pass

    def can_handle(self, content_type: Optional[str], filename: Optional[str]) -> bool:
        """
        Check if this processor can handle the given content.

        Args:
            content_type: MIME type of the content
            filename: Name of the file

        Returns:
            True if this processor can handle the content
        """
        # Check content type
        if content_type:
            normalized = content_type.strip().lower()
            for supported in self.supported_types:
                if normalized.startswith(supported):
                    return True

        # Check extension
        if filename:
            ext = Path(filename).suffix.lower()
            if ext in self.supported_extensions:
                return True

        return False

    async def extract_content(self, file_path: str) -> str:
        """
        Extract raw content from file.

        Default implementation for text-based files.
        Override for binary files.
        """
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        except Exception:
            return ""

    def _ensure_workspace_dir(
        self, workspace_id: UUID, subdir: str, settings
    ) -> Path:
        """Ensure a workspace subdirectory exists."""
        workspace_dir = Path(settings.workspace_root) / str(workspace_id) / subdir
        workspace_dir.mkdir(parents=True, exist_ok=True)
        return workspace_dir
