"""
Content Processors for OpenForge.

Unified processor architecture for handling different content types:
- TextProcessor: Plain text and code files
- ImageProcessor: OCR, CLIP, vision LLM
- AudioProcessor: Whisper transcription
- PDFProcessor: Marker extraction
- BookmarkProcessor: Web scraping and content extraction
"""
from .base import ContentProcessor, ProcessorResult
from .registry import content_processor_registry
from .text_processor import TextProcessor
from .bookmark_processor import BookmarkProcessor

__all__ = [
    "ContentProcessor",
    "ProcessorResult",
    "content_processor_registry",
    "TextProcessor",
    "BookmarkProcessor",
]
