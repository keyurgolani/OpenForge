"""
PDF processor for OpenForge Knowledge System.

Processes uploaded PDFs through:
1. Metadata extraction (page count, author, title)
2. Markdown extraction via Marker
3. First-page thumbnail generation
4. Chunking and embedding
"""
import asyncio
import logging
from pathlib import Path
from uuid import UUID
from typing import Optional
import subprocess
import json

from openforge.config import get_settings
from openforge.core.knowledge_processor import knowledge_processor
from openforge.core.markdown_utils import chunk_markdown
from openforge.core.embedding import embed_texts
from openforge.core.content_processors.base import ContentProcessor, ProcessorResult

logger = logging.getLogger("openforge.pdf_processor")


class PDFProcessor(ContentProcessor):
    """Process PDF files for knowledge storage and retrieval."""

    name = "pdf"
    supported_types = ["application/pdf"]
    supported_extensions = [".pdf"]

    def __init__(self):
        self.settings = get_settings()

    async def process(
        self,
        file_path: str,
        workspace_id: UUID,
        knowledge_id: Optional[UUID] = None,
        **kwargs,
    ) -> ProcessorResult:
        """
        Full PDF processing pipeline.

        Args:
            file_path: Path to the PDF file
            workspace_id: UUID of the workspace
            knowledge_id: Optional UUID of the knowledge entry
            **kwargs: Additional options

        Returns:
            ProcessorResult with extracted metadata, markdown content, and thumbnail path
        """
        result = ProcessorResult(success=False)

        pdf_path = Path(file_path)
        if not pdf_path.exists():
            result.error = f"PDF file not found: {file_path}"
            logger.error(f"PDF file not found: {file_path}")
            return result

        try:
            # Step 1: Extract PDF metadata
            result.metadata = await self._extract_metadata(pdf_path)
            page_count = result.metadata.get("page_count", 0)

            # Step 2: Extract markdown via Marker
            markdown_content = await self._extract_markdown(pdf_path)
            result.content = markdown_content
            result.extracted_text = markdown_content
            result.metadata["word_count"] = len(markdown_content.split())

            # Use PDF title if available
            if result.metadata.get("title"):
                result.ai_title = result.metadata["title"]

            # Step 3: Generate first-page thumbnail
            result.thumbnail_path = await self._generate_thumbnail(
                pdf_path, workspace_id, knowledge_id
            )

            result.success = True

            # Step 4: Chunk and embed
            if knowledge_id and markdown_content.strip():
                await knowledge_processor.process_knowledge(
                    knowledge_id=knowledge_id,
                    workspace_id=workspace_id,
                    content=markdown_content,
                    knowledge_type="pdf",
                    title=result.metadata.get("title"),
                    tags=[],
                )
                result.embedded = True

        except Exception as e:
            logger.exception(f"Error processing PDF {knowledge_id}: {e}")
            result.error = str(e)

        return result

    async def _extract_metadata(self, pdf_path: Path) -> dict:
        """Extract PDF metadata using pypdf."""
        metadata = {}

        try:
            from pypdf import PdfReader

            reader = PdfReader(str(pdf_path))

            # Page count
            metadata["page_count"] = len(reader.pages)

            # Document info
            if reader.metadata:
                info = reader.metadata
                metadata["title"] = info.get("/Title", "")
                metadata["author"] = info.get("/Author", "")
                metadata["subject"] = info.get("/Subject", "")
                metadata["creator"] = info.get("/Creator", "")
                metadata["producer"] = info.get("/Producer", "")
                metadata["creation_date"] = str(info.get("/CreationDate", ""))

        except Exception as e:
            logger.error(f"Failed to extract PDF metadata: {e}")

        return metadata

    async def _extract_markdown(self, pdf_path: Path) -> str:
        """Extract structured markdown from PDF using Marker."""
        try:
            # Try to use Marker for extraction
            loop = asyncio.get_event_loop()
            markdown = await loop.run_in_executor(
                None,
                self._run_marker_sync,
                str(pdf_path),
            )
            return markdown

        except ImportError:
            logger.warning("Marker not available, falling back to pypdf")
            return await self._extract_text_fallback(pdf_path)
        except Exception as e:
            logger.error(f"Marker extraction failed: {e}")
            return await self._extract_text_fallback(pdf_path)

    def _run_marker_sync(self, pdf_path: str) -> str:
        """Run Marker synchronously to extract markdown."""
        try:
            from marker.converters.pdf import PdfConverter
            from marker.models import create_model_dict
            from marker.output import text_from_rendered

            # Create models (downloads if needed)
            models = create_model_dict()

            # Convert PDF
            converter = PdfConverter(artifact_dict=models)
            rendered = converter(str(pdf_path))

            # Extract text
            text, _, images = text_from_rendered(rendered)

            return text

        except Exception as e:
            logger.error(f"Marker sync extraction failed: {e}")
            raise

    async def _extract_text_fallback(self, pdf_path: Path) -> str:
        """Fallback text extraction using pypdf."""
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(pdf_path))
            text_parts = []

            for page in reader.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)

            return "\n\n".join(text_parts)

        except Exception as e:
            logger.error(f"Fallback PDF extraction failed: {e}")
            return ""

    async def _generate_thumbnail(
        self, pdf_path: Path, workspace_id: UUID, knowledge_id: UUID
    ) -> Optional[str]:
        """Generate a thumbnail of the first page."""
        try:
            workspace_dir = Path(self.settings.workspace_root) / str(workspace_id)
            thumbnail_dir = workspace_dir / "thumbnails"
            thumbnail_dir.mkdir(parents=True, exist_ok=True)

            thumbnail_path = thumbnail_dir / f"{knowledge_id}.webp"

            # Use pdftoppm to render first page
            cmd = [
                "pdftoppm",
                "-png",
                "-singlefile",
                "-r", "150",  # 150 DPI
                "-f", "1",
                "-l", "1",
                str(pdf_path),
                str(thumbnail_path.with_suffix("")),
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()

            # Check if PNG was created
            png_path = thumbnail_path.with_suffix(".png")
            if png_path.exists():
                # Convert to WEBP for smaller size
                from PIL import Image

                with Image.open(png_path) as img:
                    # Resize to max 300px wide
                    max_width = 300
                    if img.width > max_width:
                        ratio = max_width / img.width
                        new_height = int(img.height * ratio)
                        img.thumbnail((max_width, new_height), Image.Resampling.LANCZOS)

                    # Convert to RGB if necessary
                    if img.mode in ("RGBA", "P"):
                        img = img.convert("RGB")

                    img.save(thumbnail_path, "WEBP", quality=85)

                # Remove the PNG
                png_path.unlink()

                logger.info(f"Generated PDF thumbnail: {thumbnail_path}")
                return f"thumbnails/{knowledge_id}.webp"

            return None

        except Exception as e:
            logger.error(f"Failed to generate PDF thumbnail: {e}")
            return None
