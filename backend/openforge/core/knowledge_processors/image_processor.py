"""Image Processing Pipeline.

Full 6-step pipeline:
1. Extract EXIF metadata (Pillow)
2. Generate thumbnail (300px wide, WEBP)
3. Run Tesseract OCR
4. Generate CLIP visual embedding → openforge_visual
5. Call vision LLM for description + tags + title
6. Embed combined text (OCR + description) → openforge_knowledge
"""
from __future__ import annotations

import base64
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4

logger = logging.getLogger("openforge.processors.image")


class ImageProcessor:
    """Complete image knowledge processing pipeline."""

    _clip_model = None

    _clip_model_id: str | None = None

    @classmethod
    async def _resolve_clip_model_id(cls) -> str:
        """Resolve the active CLIP model — DB config overrides env default."""
        from openforge.config import get_settings
        settings = get_settings()
        try:
            from openforge.db.postgres import AsyncSessionLocal
            from openforge.services.config_service import config_service
            async with AsyncSessionLocal() as db:
                cfg = await config_service.get_config(db, "clip_model")
                if cfg and cfg.value:
                    val = cfg.value
                    if isinstance(val, dict):
                        val = val.get("value", "")
                    if val:
                        return str(val)
        except Exception:
            pass
        return settings.clip_model

    @classmethod
    async def _get_clip_model_async(cls):
        """Lazy-load CLIP model (cached at class level), reading config from DB."""
        if cls._clip_model is None:
            try:
                from sentence_transformers import SentenceTransformer
                from openforge.config import get_settings
                settings = get_settings()
                cache_dir = str(Path(settings.models_root) / "clip")
                model_id = await cls._resolve_clip_model_id()
                logger.info("Loading CLIP model: %s from %s", model_id, cache_dir)
                import asyncio
                cls._clip_model = await asyncio.to_thread(
                    SentenceTransformer, model_id, cache_folder=cache_dir
                )
                cls._clip_model_id = model_id
                logger.info("CLIP model loaded.")
            except Exception as e:
                logger.error("Failed to load CLIP model: %s", e)
                raise
        return cls._clip_model

    @classmethod
    def _get_clip_model(cls):
        """Sync access to the cached CLIP model (must be loaded first via _get_clip_model_async)."""
        if cls._clip_model is None:
            try:
                from sentence_transformers import SentenceTransformer
                from openforge.config import get_settings
                settings = get_settings()
                cache_dir = str(Path(settings.models_root) / "clip")
                logger.info("Loading CLIP model (sync fallback): %s from %s", settings.clip_model, cache_dir)
                cls._clip_model = SentenceTransformer(
                    settings.clip_model, cache_folder=cache_dir
                )
                logger.info("CLIP model loaded.")
            except Exception as e:
                logger.error("Failed to load CLIP model: %s", e)
                raise
        return cls._clip_model

    async def process(
        self,
        knowledge_id: UUID,
        file_path: str,
        workspace_id: UUID,
        db_session=None,
    ) -> dict:
        """Run the full image processing pipeline. Returns metadata dict."""
        from openforge.config import get_settings

        settings = get_settings()
        result = {
            "exif": {},
            "ocr_text": "",
            "clip_embedded": False,
            "vision_description": "",
            "vision_tags": [],
            "dimensions": None,
        }

        # ── Step 1: EXIF metadata ──
        try:
            result["exif"] = self._extract_exif(file_path)
        except Exception as e:
            logger.warning("EXIF extraction failed for %s: %s", knowledge_id, e)

        # ── Step 2: Thumbnail ──
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
            logger.warning("Thumbnail generation failed for %s: %s", knowledge_id, e)
            thumbnail_path = None

        # ── Step 3: Tesseract OCR ──
        try:
            result["ocr_text"] = self._run_ocr(file_path)
        except Exception as e:
            logger.warning("OCR failed for %s: %s", knowledge_id, e)

        # ── Step 4: CLIP visual embedding ──
        try:
            self._embed_clip(knowledge_id, workspace_id, file_path)
            result["clip_embedded"] = True
        except Exception as e:
            logger.warning("CLIP embedding failed for %s: %s", knowledge_id, e)

        # ── Step 5: Vision LLM description ──
        try:
            vision_result = await self._vision_describe(
                file_path, workspace_id, db_session
            )
            result["vision_description"] = vision_result.get("description", "")
            result["vision_tags"] = vision_result.get("tags", [])
        except Exception as e:
            logger.warning("Vision LLM failed for %s: %s", knowledge_id, e)

        # ── Step 6: Embed combined text ──
        combined_text = self._build_combined_text(result)
        if combined_text and len(combined_text.strip()) >= 20:
            try:
                self._embed_text(knowledge_id, workspace_id, combined_text)
            except Exception as e:
                logger.warning("Text embedding failed for %s: %s", knowledge_id, e)

        return {
            "thumbnail_path": thumbnail_path,
            "file_metadata": {
                "exif": result["exif"],
                "dimensions": result.get("dimensions"),
                "ocr_text": result["ocr_text"][:10000] if result["ocr_text"] else "",
                "clip_embedded": result["clip_embedded"],
            },
            "content": self._build_content(result),
            "ai_title": self._derive_title(result, file_path),
            "ai_summary": result["vision_description"][:2000] if result["vision_description"] else None,
            "tags": result["vision_tags"],
        }

    def _extract_exif(self, file_path: str) -> dict:
        """Extract EXIF metadata from image."""
        from PIL import Image
        from PIL.ExifTags import TAGS

        img = Image.open(file_path)
        exif_data = {}

        # Basic dimensions
        exif_data["width"] = img.width
        exif_data["height"] = img.height
        exif_data["format"] = img.format or Path(file_path).suffix.upper().lstrip(".")

        # EXIF tags
        raw_exif = img.getexif()
        if raw_exif:
            for tag_id, value in raw_exif.items():
                tag_name = TAGS.get(tag_id, str(tag_id))
                try:
                    # Convert to JSON-serializable type
                    if isinstance(value, bytes):
                        continue
                    if isinstance(value, (int, float, str)):
                        exif_data[tag_name] = value
                except Exception:
                    continue

        return exif_data

    def _generate_thumbnail(
        self, file_path: str, thumbnail_path: str, max_width: int = 300
    ) -> None:
        """Generate a WEBP thumbnail at max_width."""
        from PIL import Image

        img = Image.open(file_path)

        # Convert RGBA to RGB for WEBP compatibility
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        # Calculate proportional height
        ratio = max_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
        img.save(thumbnail_path, "WEBP", quality=80)

    def _run_ocr(self, file_path: str) -> str:
        """Run Tesseract OCR on the image."""
        import pytesseract
        from PIL import Image

        img = Image.open(file_path)
        text = pytesseract.image_to_string(img)
        return (text or "").strip()

    def _embed_clip(
        self, knowledge_id: UUID, workspace_id: UUID, file_path: str
    ) -> None:
        """Encode image with CLIP and store in openforge_visual collection."""
        from PIL import Image
        from openforge.config import get_settings
        from openforge.db.qdrant_client import get_qdrant
        from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue

        settings = get_settings()
        client = get_qdrant()
        collection = settings.qdrant_visual_collection

        clip_model = await self._get_clip_model_async()
        img = Image.open(file_path)
        if img.mode != "RGB":
            img = img.convert("RGB")

        embedding = clip_model.encode(img, normalize_embeddings=True).tolist()

        # Delete old vectors for this knowledge
        client.delete(
            collection_name=collection,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="knowledge_id",
                        match=MatchValue(value=str(knowledge_id)),
                    )
                ]
            ),
        )

        now_str = datetime.now(timezone.utc).isoformat()
        client.upsert(
            collection_name=collection,
            points=[
                PointStruct(
                    id=str(uuid4()),
                    vector=embedding,
                    payload={
                        "knowledge_id": str(knowledge_id),
                        "workspace_id": str(workspace_id),
                        "created_at": now_str,
                    },
                )
            ],
        )
        logger.info("CLIP embedding stored for knowledge %s", knowledge_id)

    async def _vision_describe(
        self, file_path: str, workspace_id: UUID, db_session=None
    ) -> dict:
        """Call vision LLM to describe the image."""
        import json
        import re

        if db_session is None:
            return {"description": "", "tags": []}

        try:
            from openforge.core.llm_gateway import llm_gateway
            from openforge.core.prompt_catalogue import resolve_prompt_text
            from openforge.services.llm_service import llm_service

            provider_name, api_key, model, base_url = (
                await llm_service.get_vision_provider_for_workspace(
                    db_session, workspace_id
                )
            )
        except Exception:
            # No vision provider configured
            return {"description": "", "tags": []}

        # Encode image as base64
        with open(file_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        ext = Path(file_path).suffix.lower().lstrip(".")
        mime_map = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "gif": "gif", "webp": "webp"}
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

            # Parse JSON from response
            json_match = re.search(r"\{[\s\S]*\}", response)
            if json_match:
                parsed = json.loads(json_match.group())
                description = parsed.get("description", "")
                # Discard descriptions that indicate the LLM didn't receive the image
                _failure_phrases = (
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
                desc_lower = description.lower()
                if any(phrase in desc_lower for phrase in _failure_phrases):
                    logger.warning(
                        "Vision LLM returned failure response for %s, discarding: %r",
                        "image",
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

    def _build_combined_text(self, result: dict) -> str:
        """Combine OCR text and vision description for text embedding."""
        parts = []
        if result.get("vision_description"):
            parts.append(result["vision_description"])
        if result.get("ocr_text"):
            parts.append(f"OCR Text:\n{result['ocr_text']}")
        return "\n\n".join(parts)

    def _build_content(self, result: dict) -> str:
        """Build the content field for the knowledge record.
        Stores vision description + OCR text for intelligence/search.
        EXIF metadata is stored separately in file_metadata.
        """
        parts = []
        if result.get("vision_description"):
            parts.append(result["vision_description"])
        if result.get("ocr_text"):
            parts.append(result["ocr_text"])
        return "\n\n".join(parts) if parts else ""

    def _derive_title(self, result: dict, file_path: str) -> Optional[str]:
        """Derive a title from vision LLM result or filename."""
        if result.get("vision_description"):
            # Try to extract title from vision response
            desc = result["vision_description"]
            if len(desc) > 60:
                return desc[:57] + "..."
            return desc
        return Path(file_path).stem.replace("_", " ").replace("-", " ").title()

    def _embed_text(
        self, knowledge_id: UUID, workspace_id: UUID, text: str
    ) -> None:
        """Embed combined text into openforge_knowledge collection."""
        from openforge.core.knowledge_processor import knowledge_processor

        import asyncio

        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're already in an async context — schedule directly
            asyncio.ensure_future(
                knowledge_processor.process_knowledge(
                    knowledge_id=knowledge_id,
                    workspace_id=workspace_id,
                    content=text,
                    knowledge_type="image",
                    title=None,
                    tags=[],
                )
            )
        else:
            loop.run_until_complete(
                knowledge_processor.process_knowledge(
                    knowledge_id=knowledge_id,
                    workspace_id=workspace_id,
                    content=text,
                    knowledge_type="image",
                    title=None,
                    tags=[],
                )
            )


image_processor = ImageProcessor()
