"""OCR slot backend for the pipeline framework.

Backends:
- TesseractBackend: OCR text extraction from images via pytesseract
"""
from __future__ import annotations

import asyncio
import logging
import time

from openforge.core.pipeline.registry import register_backend
from openforge.core.pipeline.types import SlotContext, SlotOutput

logger = logging.getLogger(__name__)


class TesseractBackend:
    """OCR text extraction from images via pytesseract."""

    slot_type = "ocr"
    backend_name = "tesseract"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            text = await asyncio.to_thread(self._ocr, file_path)
            elapsed = int((time.monotonic() - start) * 1000)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                text=text,
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("TesseractBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    @staticmethod
    def _ocr(file_path: str) -> str:
        """Run Tesseract OCR on an image file."""
        import pytesseract
        from PIL import Image

        img = Image.open(file_path)
        return pytesseract.image_to_string(img).strip()


register_backend("ocr", "tesseract", TesseractBackend())
