"""PDF Processing Pipeline.

Full pipeline:
1. Extract PDF metadata (page count, author, title, creation date) via PyMuPDF
2. Extract text content via Marker (layout-aware, run in subprocess) with PyMuPDF fallback
3. Generate first-page thumbnail via PyMuPDF pixmap render
4. Chunk text → embed → store in Qdrant
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import Optional
from uuid import UUID

logger = logging.getLogger("openforge.processors.pdf")

# Timeout for the Marker subprocess (seconds).
# Includes model download on first run, so generous limit.
MARKER_SUBPROCESS_TIMEOUT = 300


class PDFProcessor:
    """Complete PDF knowledge processing pipeline."""

    async def process(
        self,
        knowledge_id: UUID,
        file_path: str,
        workspace_id: UUID,
        db_session=None,
    ) -> dict:
        """Run the full PDF processing pipeline. Returns metadata dict."""
        from openforge.config import get_settings

        settings = get_settings()
        result = {
            "metadata": {},
            "text": "",
        }

        # ── Step 1: Metadata ──
        try:
            result["metadata"] = self._extract_metadata(file_path)
        except Exception as e:
            logger.warning("PDF metadata extraction failed for %s: %s", knowledge_id, e)

        # ── Step 2: Text extraction (Marker subprocess with PyMuPDF fallback) ──
        try:
            result["text"] = await self._extract_text(file_path)
        except Exception as e:
            logger.warning("PDF text extraction failed for %s: %s", knowledge_id, e)

        # ── Step 3: Thumbnail ──
        thumbnail_path = None
        try:
            thumbnails_dir = os.path.join(
                settings.uploads_root, "knowledge-thumbnails"
            )
            os.makedirs(thumbnails_dir, exist_ok=True)
            thumbnail_path = os.path.join(
                thumbnails_dir, f"{knowledge_id}.webp"
            )
            self._generate_thumbnail(file_path, thumbnail_path)
        except Exception as e:
            logger.warning("PDF thumbnail generation failed for %s: %s", knowledge_id, e)
            thumbnail_path = None

        # ── Step 4: Embed text ──
        if result["text"] and len(result["text"].strip()) >= 20:
            try:
                await self._embed_text(knowledge_id, workspace_id, result["text"])
            except Exception as e:
                logger.warning("PDF text embedding failed for %s: %s", knowledge_id, e)

        # Build content
        content = result["text"] if result["text"] else ""

        metadata = result["metadata"]
        return {
            "thumbnail_path": thumbnail_path,
            "file_metadata": {
                "page_count": metadata.get("page_count"),
                "author": metadata.get("author"),
                "pdf_title": metadata.get("title"),
                "creation_date": metadata.get("creation_date"),
                "producer": metadata.get("producer"),
                "file_size_mb": metadata.get("file_size_mb"),
            },
            "content": content,
            "ai_title": metadata.get("title") or Path(file_path).stem.replace("_", " ").replace("-", " ").title(),
        }

    def _extract_metadata(self, file_path: str) -> dict:
        """Extract PDF metadata using PyMuPDF."""
        import fitz

        doc = fitz.open(file_path)
        metadata = doc.metadata or {}
        page_count = doc.page_count

        file_size = os.path.getsize(file_path)

        result = {
            "page_count": page_count,
            "author": metadata.get("author", ""),
            "title": metadata.get("title", ""),
            "creation_date": metadata.get("creationDate", ""),
            "producer": metadata.get("producer", ""),
            "file_size_mb": round(file_size / (1024 * 1024), 2),
        }

        doc.close()
        return result

    async def _extract_text(self, file_path: str) -> str:
        """Extract text using Marker (in subprocess) with PyMuPDF fallback."""
        marker_text = await self._extract_text_marker_subprocess(file_path)
        if marker_text:
            return marker_text
        return self._extract_text_fallback(file_path)

    async def _extract_text_marker_subprocess(self, file_path: str) -> str:
        """Run Marker in an isolated subprocess so OOM/crash can't kill the API server."""
        from openforge.config import get_settings

        script = _MARKER_SUBPROCESS_SCRIPT
        marker_dir = str(Path(get_settings().models_root) / "marker")

        try:
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            ) as out_file:
                out_path = out_file.name

            env = {**os.environ, "DATALAB_MODELS_DIR": marker_dir}

            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-c", script, file_path, out_path,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=MARKER_SUBPROCESS_TIMEOUT
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                logger.warning(
                    "Marker subprocess timed out after %ds, falling back to PyMuPDF",
                    MARKER_SUBPROCESS_TIMEOUT,
                )
                return ""

            if proc.returncode != 0:
                stderr_text = stderr.decode(errors="replace")[-500:] if stderr else ""
                logger.warning(
                    "Marker subprocess failed (exit %d): %s — falling back to PyMuPDF",
                    proc.returncode, stderr_text,
                )
                return ""

            # Read the output JSON
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                with open(out_path, "r") as f:
                    data = json.load(f)
                text = data.get("text", "")
                if text:
                    logger.info("Marker extraction succeeded (%d chars)", len(text))
                return text[:100000]
            return ""

        except Exception as e:
            logger.warning("Marker subprocess error: %s — falling back to PyMuPDF", e)
            return ""
        finally:
            try:
                if os.path.exists(out_path):
                    os.unlink(out_path)
            except Exception:
                pass

    def _extract_text_fallback(self, file_path: str) -> str:
        """Extract text from all pages using PyMuPDF (basic fallback)."""
        import fitz

        doc = fitz.open(file_path)
        text_parts = []

        for page_num in range(doc.page_count):
            page = doc[page_num]
            text = page.get_text("text")
            if text and text.strip():
                text_parts.append(f"--- Page {page_num + 1} ---\n{text.strip()}")

        doc.close()

        full_text = "\n\n".join(text_parts)
        return full_text[:100000]

    def _generate_thumbnail(
        self, file_path: str, thumbnail_path: str, max_width: int = 300
    ) -> None:
        """Generate a WEBP thumbnail from the first page using PyMuPDF."""
        import fitz

        doc = fitz.open(file_path)
        if doc.page_count == 0:
            doc.close()
            return

        page = doc[0]

        # Calculate zoom for target width
        page_width = page.rect.width
        zoom = max_width / page_width if page_width > 0 else 1.0
        mat = fitz.Matrix(zoom, zoom)

        pix = page.get_pixmap(matrix=mat, alpha=False)

        # Save as PNG first, then convert to WEBP with Pillow
        from PIL import Image
        import io

        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        img.save(thumbnail_path, "WEBP", quality=80)

        doc.close()

    async def _embed_text(
        self, knowledge_id: UUID, workspace_id: UUID, text: str
    ) -> None:
        """Embed extracted text into openforge_knowledge collection."""
        from openforge.core.knowledge_processor import knowledge_processor

        await knowledge_processor.process_knowledge(
            knowledge_id=knowledge_id,
            workspace_id=workspace_id,
            content=text,
            knowledge_type="pdf",
            title=None,
            tags=[],
        )


# ── Marker subprocess script ──
# This runs in a separate Python process. If it OOMs or crashes,
# only the subprocess dies — the FastAPI server stays alive.
_MARKER_SUBPROCESS_SCRIPT = """
import sys
import json

file_path = sys.argv[1]
out_path = sys.argv[2]

try:
    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict

    models = create_model_dict()
    converter = PdfConverter(artifact_dict=models)
    rendered = converter(file_path)
    text = rendered.markdown or ""

    with open(out_path, "w") as f:
        json.dump({"text": text[:100000]}, f)

except Exception as e:
    # Write empty result so the parent knows it failed gracefully
    with open(out_path, "w") as f:
        json.dump({"text": "", "error": str(e)}, f)
    sys.exit(1)
"""


pdf_processor = PDFProcessor()
