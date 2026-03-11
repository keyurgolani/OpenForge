"""Shared thumbnail generation for office documents (DOCX, PPTX, XLSX).

Pipeline: LibreOffice headless → PDF → PyMuPDF pixmap → Pillow → WEBP
"""
from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger("openforge.processors.thumbnails")


def generate_office_thumbnail(
    file_path: str,
    thumbnail_path: str,
    max_width: int = 300,
) -> bool:
    """Generate a WEBP thumbnail from an office document via LibreOffice.

    Returns True on success, False on failure.
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Convert to PDF using LibreOffice headless
            result = subprocess.run(
                [
                    "libreoffice",
                    "--headless",
                    "--convert-to", "pdf",
                    "--outdir", tmpdir,
                    file_path,
                ],
                capture_output=True,
                timeout=60,
            )

            if result.returncode != 0:
                logger.warning(
                    "LibreOffice conversion failed (rc=%d): %s",
                    result.returncode,
                    result.stderr.decode(errors="replace")[:200],
                )
                return False

            # Find the generated PDF
            pdf_files = list(Path(tmpdir).glob("*.pdf"))
            if not pdf_files:
                logger.warning("LibreOffice produced no PDF output for %s", file_path)
                return False

            pdf_path = str(pdf_files[0])

            # Render first page to thumbnail
            import fitz
            from PIL import Image
            import io

            doc = fitz.open(pdf_path)
            if doc.page_count == 0:
                doc.close()
                return False

            page = doc[0]
            page_width = page.rect.width
            zoom = max_width / page_width if page_width > 0 else 1.0
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)

            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            img.save(thumbnail_path, "WEBP", quality=80)

            doc.close()
            return True

    except subprocess.TimeoutExpired:
        logger.warning("LibreOffice timed out generating thumbnail for %s", file_path)
        return False
    except Exception as e:
        logger.warning("Office thumbnail generation failed for %s: %s", file_path, e)
        return False
