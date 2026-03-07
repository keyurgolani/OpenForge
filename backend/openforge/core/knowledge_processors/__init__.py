"""
Knowledge processors for different content types.

Each processor handles the full pipeline for a specific knowledge type:
- ImageProcessor: OCR, CLIP embedding, vision LLM description
- AudioProcessor: Whisper transcription, embedding
- PDFProcessor: Marker extraction, chunking, embedding
"""
from .image_processor import ImageProcessor
from .audio_processor import AudioProcessor
from .pdf_processor import PDFProcessor

# Re-export base for convenience
from openforge.core.content_processors.base import ContentProcessor, ProcessorResult

__all__ = [
    "ImageProcessor",
    "AudioProcessor",
    "PDFProcessor",
    "ContentProcessor",
    "ProcessorResult",
]
