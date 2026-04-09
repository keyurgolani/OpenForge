"""CLIP embedding slot backend for the pipeline framework.

Backends:
- CLIPBackend: CLIP visual embedding via sentence-transformers (OpenCLIP)
"""
from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path

from openforge.core.pipeline.registry import register_backend
from openforge.core.pipeline.types import SlotContext, SlotOutput, VectorOutput

logger = logging.getLogger(__name__)


class CLIPBackend:
    """Encode images with CLIP and return a VectorOutput."""

    slot_type = "clip_embedding"
    backend_name = "openclip"

    _clip_model = None
    _clip_model_id: str | None = None

    @classmethod
    async def _resolve_clip_model_id(cls) -> str:
        """Resolve the active CLIP model — DB config overrides env default."""
        from openforge.common.config import get_settings

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
    async def _get_clip_model(cls):
        """Lazy-load CLIP model (cached at class level)."""
        if cls._clip_model is None:
            from sentence_transformers import SentenceTransformer

            from openforge.common.config import get_settings

            settings = get_settings()
            cache_dir = str(Path(settings.models_root) / "clip")
            model_id = await cls._resolve_clip_model_id()
            logger.info("Loading CLIP model: %s from %s", model_id, cache_dir)
            cls._clip_model = await asyncio.to_thread(
                SentenceTransformer, model_id, cache_folder=cache_dir
            )
            cls._clip_model_id = model_id
            logger.info("CLIP model loaded.")
        return cls._clip_model

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            clip_model = await self._get_clip_model()
            embedding = await asyncio.to_thread(
                self._encode_image, clip_model, file_path
            )
            elapsed = int((time.monotonic() - start) * 1000)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                vectors=[
                    VectorOutput(
                        vector_type="clip",
                        vector=embedding,
                        payload={},
                    )
                ],
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.error("CLIPBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    @staticmethod
    def _encode_image(clip_model, file_path: str) -> list[float]:
        """Encode an image file with CLIP and return the embedding vector."""
        from PIL import Image

        img = Image.open(file_path)
        if img.mode != "RGB":
            img = img.convert("RGB")
        embedding = clip_model.encode(img, normalize_embeddings=True)
        return embedding.tolist()


# ---------------------------------------------------------------------------
# Register backend
# ---------------------------------------------------------------------------

register_backend("clip_embedding", "openclip", CLIPBackend())
