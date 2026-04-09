"""Pipeline registry: resolves pipeline definitions with global + workspace overrides."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.core.pipeline.types import PipelineDefinition
from openforge.db.models import Config, Workspace

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Default pipeline configurations for every knowledge type
# ---------------------------------------------------------------------------

DEFAULT_PIPELINE_CONFIGS: dict[str, dict] = {
    "note": {
        "knowledge_type": "note",
        "slots": [
            {
                "slot_type": "text_extraction",
                "display_name": "Text Extraction",
                "enabled": True,
                "active_backend": "plaintext",
                "available_backends": ["plaintext"],
            },
        ],
    },
    "bookmark": {
        "knowledge_type": "bookmark",
        "slots": [
            {
                "slot_type": "text_extraction",
                "display_name": "Text Extraction",
                "enabled": True,
                "active_backend": "plaintext",
                "available_backends": ["plaintext"],
            },
        ],
    },
    "file": {
        "knowledge_type": "file",
        "slots": [
            {
                "slot_type": "text_extraction",
                "display_name": "Text Extraction",
                "enabled": True,
                "active_backend": "plaintext",
                "available_backends": ["plaintext"],
            },
        ],
    },
    "document": {
        "knowledge_type": "document",
        "slots": [
            {
                "slot_type": "text_extraction",
                "display_name": "Text Extraction",
                "enabled": True,
                "active_backend": "python-docx",
                "available_backends": ["python-docx"],
            },
        ],
    },
    "sheet": {
        "knowledge_type": "sheet",
        "slots": [
            {
                "slot_type": "text_extraction",
                "display_name": "Text Extraction",
                "enabled": True,
                "active_backend": "openpyxl",
                "available_backends": ["openpyxl"],
            },
        ],
    },
    "slides": {
        "knowledge_type": "slides",
        "slots": [
            {
                "slot_type": "text_extraction",
                "display_name": "Text Extraction",
                "enabled": True,
                "active_backend": "python-pptx",
                "available_backends": ["python-pptx"],
            },
        ],
    },
    "pdf": {
        "knowledge_type": "pdf",
        "slots": [
            {
                "slot_type": "text_extraction",
                "display_name": "Text Extraction",
                "enabled": True,
                "active_backend": "marker",
                "available_backends": ["marker"],
                "backend_config": {},
            },
            {
                "slot_type": "ocr",
                "display_name": "OCR",
                "enabled": True,
                "active_backend": "tesseract",
                "available_backends": ["tesseract"],
                "backend_config": {
                    "language": "eng",
                },
            },
        ],
    },
    "image": {
        "knowledge_type": "image",
        "slots": [
            {
                "slot_type": "ocr",
                "display_name": "OCR",
                "enabled": True,
                "active_backend": "tesseract",
                "available_backends": ["tesseract"],
                "backend_config": {
                    "language": "eng",
                },
            },
            {
                "slot_type": "vision_description",
                "display_name": "Vision Description",
                "enabled": True,
                "active_backend": "vision-llm",
                "available_backends": ["vision-llm"],
            },
            {
                "slot_type": "clip_embedding",
                "display_name": "CLIP Embedding",
                "enabled": True,
                "active_backend": "openclip",
                "available_backends": ["openclip"],
                "produces_vectors": True,
                "backend_config": {
                    "model": "clip-ViT-B-32",
                },
            },
            {
                "slot_type": "metadata_extraction",
                "display_name": "Metadata Extraction",
                "enabled": True,
                "active_backend": "pillow-exif",
                "available_backends": ["pillow-exif"],
            },
            {
                "slot_type": "thumbnail",
                "display_name": "Thumbnail",
                "enabled": True,
                "active_backend": "pillow",
                "available_backends": ["pillow"],
            },
        ],
    },
    "audio": {
        "knowledge_type": "audio",
        "slots": [
            {
                "slot_type": "transcription",
                "display_name": "Transcription",
                "enabled": True,
                "active_backend": "stt-provider",
                "available_backends": ["stt-provider"],
                "backend_config": {
                    "provider": "faster-whisper",
                    "model_size": "base",
                },
            },
            {
                "slot_type": "metadata_extraction",
                "display_name": "Metadata Extraction",
                "enabled": True,
                "active_backend": "mutagen",
                "available_backends": ["mutagen"],
            },
            {
                "slot_type": "audio_compression",
                "display_name": "Audio Compression",
                "enabled": True,
                "active_backend": "ffmpeg-opus",
                "available_backends": ["ffmpeg-opus"],
            },
        ],
    },
    "gist": {
        "knowledge_type": "gist",
        "slots": [
            {
                "slot_type": "text_extraction",
                "display_name": "Text Extraction",
                "enabled": True,
                "active_backend": "plaintext",
                "available_backends": ["plaintext"],
            },
        ],
    },
    "journal": {
        "knowledge_type": "journal",
        "slots": [
            {
                "slot_type": "text_extraction",
                "display_name": "Text Extraction",
                "enabled": True,
                "active_backend": "plaintext",
                "available_backends": ["plaintext"],
            },
        ],
    },
    "video": {
        "knowledge_type": "video",
        "slots": [
            {
                "slot_type": "audio_extraction",
                "display_name": "Audio Extraction",
                "enabled": True,
                "active_backend": "ffmpeg",
                "available_backends": ["ffmpeg"],
            },
            {
                "slot_type": "transcription",
                "display_name": "Transcription",
                "enabled": True,
                "active_backend": "stt-provider",
                "available_backends": ["stt-provider"],
                "execution": "sequential",
                "backend_config": {
                    "provider": "faster-whisper",
                    "model_size": "base",
                },
            },
            {
                "slot_type": "scene_detection",
                "display_name": "Scene Detection",
                "enabled": True,
                "active_backend": "pyscenedetect",
                "available_backends": ["pyscenedetect"],
            },
            {
                "slot_type": "frame_description",
                "display_name": "Frame Description",
                "enabled": True,
                "active_backend": "vision-llm",
                "available_backends": ["vision-llm"],
                "execution": "sequential",
            },
            {
                "slot_type": "clip_embedding",
                "display_name": "CLIP Embedding",
                "enabled": True,
                "active_backend": "openclip",
                "available_backends": ["openclip"],
                "produces_vectors": True,
            },
            {
                "slot_type": "metadata_extraction",
                "display_name": "Metadata Extraction",
                "enabled": True,
                "active_backend": "ffprobe",
                "available_backends": ["ffprobe"],
            },
        ],
    },
}


# ---------------------------------------------------------------------------
# Pipeline Registry
# ---------------------------------------------------------------------------


class PipelineRegistry:
    """Resolves pipeline definitions by merging global defaults with workspace overrides."""

    async def get_pipeline(
        self,
        knowledge_type: str,
        workspace_id: UUID | None = None,
        db_session: AsyncSession | None = None,
    ) -> PipelineDefinition:
        """Resolve pipeline config: defaults → global config → workspace overrides."""

        # 1. Start with hardcoded defaults
        default_raw = DEFAULT_PIPELINE_CONFIGS.get(knowledge_type)
        if default_raw is None:
            raise ValueError(f"No default pipeline config for knowledge type: {knowledge_type}")

        # Deep-copy so we don't mutate the module-level dict
        import copy

        pipeline_data = copy.deepcopy(default_raw)

        # 2. Overlay global config from the Config table (if db_session provided)
        if db_session is not None:
            global_overrides = await self._load_global_config(
                knowledge_type, db_session
            )
            if global_overrides:
                self._apply_overrides(pipeline_data, global_overrides)

        # 3. Overlay workspace-level overrides (if workspace_id provided)
        if workspace_id is not None and db_session is not None:
            ws_overrides = await self._load_workspace_config(
                workspace_id, db_session
            )
            if ws_overrides:
                self._apply_overrides(pipeline_data, ws_overrides)

        # 4. Validate via Pydantic model_validator (active_backend in
        #    available_backends, at least one enabled, unique slot_types)
        return PipelineDefinition(**pipeline_data)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _load_global_config(
        self, knowledge_type: str, db_session: AsyncSession
    ) -> dict | None:
        """Load global pipeline overrides from the Config table."""
        result = await db_session.execute(
            select(Config).where(Config.key == "pipeline_configs")
        )
        config_row = result.scalar_one_or_none()
        if config_row is None or not config_row.value:
            return None

        all_configs: dict = config_row.value
        return all_configs.get(knowledge_type)

    async def _load_workspace_config(
        self, workspace_id: UUID, db_session: AsyncSession
    ) -> dict | None:
        """Load workspace-level pipeline overrides from Workspace.pipeline_config."""
        result = await db_session.execute(
            select(Workspace).where(Workspace.id == workspace_id)
        )
        workspace = result.scalar_one_or_none()
        if workspace is None:
            return None

        # pipeline_config column added in task 6.2
        if not workspace.pipeline_config:
            return None

        return workspace.pipeline_config

    @staticmethod
    def _apply_overrides(pipeline_data: dict, overrides: dict) -> None:
        """Merge override dict into pipeline_data in-place.

        Overrides format (from global config or workspace):
        ``{"slot_type_name": {"enabled": bool, "active_backend": str}, ...}``

        Or the full format with a ``"slots"`` key wrapping the per-slot dicts.
        """
        # Support both flat ``{slot_type: {...}}`` and nested ``{"slots": {slot_type: {...}}}``
        slot_overrides: dict = overrides.get("slots", overrides)

        # Build a lookup of existing slots by slot_type
        slots_by_type: dict[str, dict] = {}
        for slot in pipeline_data.get("slots", []):
            slots_by_type[slot["slot_type"]] = slot

        for slot_type, override_values in slot_overrides.items():
            if not isinstance(override_values, dict):
                continue
            if slot_type in slots_by_type:
                # Merge individual fields into the existing slot dict
                for key, value in override_values.items():
                    slots_by_type[slot_type][key] = value
