"""Image processing slot backends for the pipeline framework.

Backends:
- ExifBackend: EXIF metadata extraction from images via Pillow
- ThumbnailBackend: WEBP thumbnail generation via Pillow
- VisionLLMBackend: Image description via vision LLM
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
from pathlib import Path
from uuid import UUID

from openforge.core.pipeline.registry import register_backend
from openforge.core.pipeline.types import SlotContext, SlotOutput

logger = logging.getLogger(__name__)

_FAILURE_PHRASES = (
    "not provided",
    "no image",
    "unable to analyze",
    "cannot see",
    "can't see",
    "don't see an image",
    "no visual",
    "image was not",
    "image is not",
    "didn't receive",
    "did not receive",
)


# ---------------------------------------------------------------------------
# ExifBackend — EXIF metadata extraction
# ---------------------------------------------------------------------------

class ExifBackend:
    """Extract EXIF metadata from images via Pillow."""

    slot_type = "metadata_extraction"
    backend_name = "pillow-exif"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            metadata = await asyncio.to_thread(self._extract_exif, file_path)
            elapsed = int((time.monotonic() - start) * 1000)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                metadata=metadata,
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("ExifBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    @staticmethod
    def _extract_exif(file_path: str) -> dict:
        """Extract EXIF metadata from image."""
        from PIL import Image
        from PIL.ExifTags import TAGS

        img = Image.open(file_path)
        exif_data: dict = {}

        exif_data["width"] = img.width
        exif_data["height"] = img.height
        exif_data["format"] = img.format or Path(file_path).suffix.upper().lstrip(".")

        raw_exif = img.getexif()
        if raw_exif:
            for tag_id, value in raw_exif.items():
                tag_name = TAGS.get(tag_id, str(tag_id))
                try:
                    if isinstance(value, bytes):
                        continue
                    if isinstance(value, (int, float, str)):
                        exif_data[tag_name] = value
                except Exception:
                    continue

        return exif_data


# ---------------------------------------------------------------------------
# ThumbnailBackend — WEBP thumbnail generation
# ---------------------------------------------------------------------------

class ThumbnailBackend:
    """Generate WEBP thumbnail at max_width=300 via Pillow."""

    slot_type = "thumbnail"
    backend_name = "pillow"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            thumbnail_path = await asyncio.to_thread(
                self._generate_thumbnail, file_path, context.knowledge_id
            )
            elapsed = int((time.monotonic() - start) * 1000)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                metadata={"thumbnail_path": thumbnail_path},
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("ThumbnailBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    @staticmethod
    def _generate_thumbnail(
        file_path: str, knowledge_id: UUID, max_width: int = 300
    ) -> str:
        """Generate a WEBP thumbnail and return the output path."""
        from PIL import Image

        from openforge.common.config import get_settings

        settings = get_settings()
        thumbnails_dir = os.path.join(settings.uploads_root, "knowledge-thumbnails")
        os.makedirs(thumbnails_dir, exist_ok=True)
        thumbnail_path = os.path.join(thumbnails_dir, f"{knowledge_id}.webp")

        img = Image.open(file_path)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        ratio = max_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
        img.save(thumbnail_path, "WEBP", quality=80)

        return thumbnail_path


# ---------------------------------------------------------------------------
# VisionLLMBackend — Image description via vision LLM
# ---------------------------------------------------------------------------

class VisionLLMBackend:
    """Describe an image using a vision LLM."""

    slot_type = "vision_description"
    backend_name = "vision-llm"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            result = await self._vision_describe(
                file_path, context.workspace_id, context.db_session,
                knowledge_type=context.knowledge_type or "image",
            )
            elapsed = int((time.monotonic() - start) * 1000)
            description = result.get("description", "")
            tags = result.get("tags", [])
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                text=description,
                metadata={"tags": tags, "title": result.get("title", "")},
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("VisionLLMBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    async def _vision_describe(
        self, file_path: str, workspace_id: UUID, db_session,
        knowledge_type: str = "image",
    ) -> dict:
        """Call vision LLM to describe the image."""
        if db_session is None:
            return {"description": "", "tags": []}

        try:
            from openforge.core.llm_gateway import llm_gateway
            from openforge.core.prompt_resolution import resolve_prompt_text
            from openforge.services.llm_service import llm_service

            provider_name, api_key, model, base_url = (
                await llm_service.resolve_vision_provider_for_pipeline(
                    db_session, knowledge_type=knowledge_type,
                    slot_type="vision_description",
                )
            )
        except Exception:
            return {"description": "", "tags": []}

        # Encode image as base64
        with open(file_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        ext = Path(file_path).suffix.lower().lstrip(".")
        mime_map = {
            "jpg": "jpeg", "jpeg": "jpeg", "png": "png",
            "gif": "gif", "webp": "webp",
        }
        mime_subtype = mime_map.get(ext, "jpeg")

        prompt = await resolve_prompt_text(db_session, "image_vision_analysis")

        try:
            response = await llm_gateway.chat(
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/{mime_subtype};base64,{image_data}"
                                },
                            },
                        ],
                    }
                ],
                provider_name=provider_name,
                api_key=api_key,
                model=model,
                base_url=base_url,
                max_tokens=500,
            )

            json_match = re.search(r"\{[\s\S]*\}", response)
            if json_match:
                parsed = json.loads(json_match.group())
                description = parsed.get("description", "")
                desc_lower = description.lower()
                if any(phrase in desc_lower for phrase in _FAILURE_PHRASES):
                    logger.warning(
                        "Vision LLM returned failure response, discarding: %r",
                        description[:120],
                    )
                    return {"description": "", "tags": []}
                return {
                    "description": description,
                    "title": parsed.get("title", ""),
                    "tags": parsed.get("tags", []),
                }
        except Exception as e:
            logger.warning("Vision LLM response parsing failed: %s", e)

        return {"description": "", "tags": []}


# ---------------------------------------------------------------------------
# Register all backends
# ---------------------------------------------------------------------------

register_backend("metadata_extraction", "pillow-exif", ExifBackend())
register_backend("thumbnail", "pillow", ThumbnailBackend())
register_backend("vision_description", "vision-llm", VisionLLMBackend())
