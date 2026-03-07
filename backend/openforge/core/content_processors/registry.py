"""
Content Processor Registry for OpenForge.

Central registry for all content processors, enabling dynamic discovery
and routing of content to appropriate processors.
"""
import logging
from typing import Optional, Type

from .base import ContentProcessor, ProcessorResult
from uuid import UUID

logger = logging.getLogger("openforge.content_processor_registry")


class ContentProcessorRegistry:
    """
    Registry for content processors.

    Manages processor registration and content routing.
    """

    def __init__(self):
        self._processors: dict[str, ContentProcessor] = {}
        self._initialized = False

    def register(self, processor: ContentProcessor) -> None:
        """Register a processor instance."""
        self._processors[processor.name] = processor
        logger.debug(f"Registered content processor: {processor.name}")

    def get(self, name: str) -> Optional[ContentProcessor]:
        """Get a processor by name."""
        return self._processors.get(name)

    def resolve(
        self, content_type: Optional[str], filename: Optional[str]
    ) -> tuple[Optional[ContentProcessor], str]:
        """
        Resolve the appropriate processor for content.

        Args:
            content_type: MIME type
            filename: File name

        Returns:
            Tuple of (processor or None, pipeline name)
        """
        for name, processor in self._processors.items():
            if processor.can_handle(content_type, filename):
                return processor, name

        # No processor found
        return None, "deferred"

    async def process(
        self,
        file_path: str,
        workspace_id: UUID,
        content_type: Optional[str] = None,
        filename: Optional[str] = None,
        knowledge_id: Optional[UUID] = None,
        **kwargs,
    ) -> ProcessorResult:
        """
        Process content using the appropriate processor.

        Args:
            file_path: Path to the content file
            workspace_id: Workspace UUID
            content_type: MIME type
            filename: File name
            knowledge_id: Optional knowledge UUID
            **kwargs: Additional processor options

        Returns:
            ProcessorResult from the appropriate processor
        """
        processor, pipeline_name = self.resolve(content_type, filename)

        if not processor:
            return ProcessorResult(
                success=False,
                error=f"No processor available for content_type={content_type}, filename={filename}",
            )

        try:
            result = await processor.process(
                file_path=file_path,
                workspace_id=workspace_id,
                knowledge_id=knowledge_id,
                **kwargs,
            )
            return result
        except Exception as e:
            logger.exception(f"Processor {processor.name} failed: {e}")
            return ProcessorResult(success=False, error=str(e))

    def list_processors(self) -> list[dict]:
        """List all registered processors with their capabilities."""
        return [
            {
                "name": p.name,
                "supported_types": p.supported_types,
                "supported_extensions": p.supported_extensions,
            }
            for p in self._processors.values()
        ]

    def initialize(self) -> None:
        """Initialize the registry with default processors."""
        if self._initialized:
            return

        # Import and register processors
        from .text_processor import TextProcessor
        from .bookmark_processor import BookmarkProcessor

        self.register(TextProcessor())
        self.register(BookmarkProcessor())

        # Import knowledge processors if available
        try:
            from openforge.core.knowledge_processors import ImageProcessor, AudioProcessor, PDFProcessor
            self.register(ImageProcessor())
            self.register(AudioProcessor())
            self.register(PDFProcessor())
        except ImportError as e:
            logger.warning(f"Could not import knowledge processors: {e}")

        self._initialized = True
        logger.info(f"Content processor registry initialized with {len(self._processors)} processors")


# Global registry instance
content_processor_registry = ContentProcessorRegistry()
