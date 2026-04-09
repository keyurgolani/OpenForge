"""Pipeline configuration API — exposes the DAG-based pipeline framework to the UI."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.core.pipeline.pipeline_registry import (
    DEFAULT_PIPELINE_CONFIGS,
    PipelineRegistry,
)
from openforge.core.pipeline.types import PipelineDefinition
from openforge.db.postgres import get_db
from openforge.services.config_service import config_service

logger = logging.getLogger(__name__)

router = APIRouter()

_registry = PipelineRegistry()


# ── Response models ──────────────────────────────────────────────────────────


class SlotResponse(BaseModel):
    slot_type: str
    display_name: str
    enabled: bool
    active_backend: str
    available_backends: list[str]
    execution: str
    timeout_seconds: int
    produces_vectors: bool
    backend_config: dict = {}


class PostStep(BaseModel):
    """A system post-processing step shown in the pipeline flow for visibility."""

    name: str
    description: str
    toggleable: bool = False
    enabled: bool = True
    config_key: str | None = None


class PipelineResponse(BaseModel):
    knowledge_type: str
    slots: list[SlotResponse]
    post_steps: list[PostStep] = []
    consolidation_enabled: bool
    consolidation_model: str | None = None


class PipelineSlotUpdate(BaseModel):
    """Update a single slot within a pipeline."""

    enabled: bool | None = None
    active_backend: str | None = None
    backend_config: dict | None = None


class PipelineUpdate(BaseModel):
    """Payload for updating a pipeline's slot configuration."""

    slots: dict[str, PipelineSlotUpdate] = {}  # slot_type -> overrides
    post_step_toggles: dict[str, bool] = {}  # config_key -> enabled


# ── Backend config schemas ──────────────────────────────────────────────────
# Describes what config fields each backend accepts so the frontend
# can render appropriate controls (text input, select, toggle, etc.).

BACKEND_CONFIG_SCHEMAS: dict[str, dict] = {
    "marker": {
        "label": "Marker",
        "fields": {},
    },
    "tesseract": {
        "label": "Tesseract OCR",
        "fields": {
            "language": {
                "label": "Language",
                "type": "select",
                "options": ["eng", "fra", "deu", "spa", "ita", "por", "nld", "jpn", "kor", "chi_sim", "chi_tra", "ara", "hin", "rus"],
                "default": "eng",
            },
        },
    },
    "stt-provider": {
        "label": "Speech-to-Text",
        "fields": {
            "provider": {
                "label": "Provider",
                "type": "select",
                "options": ["faster-whisper", "liquid-audio", "cohere"],
                "default": "faster-whisper",
            },
            "model_size": {
                "label": "Model size",
                "type": "select",
                "options": ["tiny", "base", "small", "medium", "large-v2", "large-v3"],
                "default": "base",
            },
        },
    },
    "openclip": {
        "label": "CLIP Embedding",
        "fields": {
            "model": {
                "label": "Model",
                "type": "select",
                "options": ["clip-ViT-B-32", "clip-ViT-B-16", "clip-ViT-L-14"],
                "default": "clip-ViT-B-32",
            },
        },
    },
}


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/backend-schemas")
async def get_backend_schemas():
    """Return config field schemas for each backend so the UI can render controls."""
    return BACKEND_CONFIG_SCHEMAS


@router.get("", response_model=list[PipelineResponse])
async def list_pipelines(db: AsyncSession = Depends(get_db)):
    """Return resolved pipeline definitions for all knowledge types."""
    pipelines: list[PipelineResponse] = []
    for knowledge_type in DEFAULT_PIPELINE_CONFIGS:
        try:
            defn: PipelineDefinition = await _registry.get_pipeline(
                knowledge_type, db_session=db
            )
            pipelines.append(await _to_response(defn, db))
        except Exception:
            logger.exception("Failed to resolve pipeline for %s", knowledge_type)
    return pipelines


@router.get("/{knowledge_type}", response_model=PipelineResponse)
async def get_pipeline(knowledge_type: str, db: AsyncSession = Depends(get_db)):
    """Return the resolved pipeline definition for a single knowledge type."""
    defn = await _registry.get_pipeline(knowledge_type, db_session=db)
    return await _to_response(defn, db)


@router.put("/{knowledge_type}", response_model=PipelineResponse)
async def update_pipeline(
    knowledge_type: str,
    body: PipelineUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update global pipeline configuration for a knowledge type.

    Persists slot overrides into the ``pipeline_configs`` key in the config
    table, then returns the newly resolved pipeline.
    """
    # Load existing global config
    existing = await config_service.get_config_raw(db, "pipeline_configs")
    all_configs: dict[str, Any] = existing if isinstance(existing, dict) else {}

    # Build the override dict for this knowledge type
    type_overrides = all_configs.get(knowledge_type, {})
    if "slots" not in type_overrides:
        type_overrides["slots"] = {}

    for slot_type, slot_update in body.slots.items():
        if slot_type not in type_overrides["slots"]:
            type_overrides["slots"][slot_type] = {}
        if slot_update.enabled is not None:
            type_overrides["slots"][slot_type]["enabled"] = slot_update.enabled
        if slot_update.active_backend is not None:
            type_overrides["slots"][slot_type]["active_backend"] = slot_update.active_backend
        if slot_update.backend_config is not None:
            existing_cfg = type_overrides["slots"][slot_type].get("backend_config", {})
            existing_cfg.update(slot_update.backend_config)
            type_overrides["slots"][slot_type]["backend_config"] = existing_cfg

    all_configs[knowledge_type] = type_overrides

    # Persist slot overrides
    await config_service.set_config(db, "pipeline_configs", all_configs, "pipeline")

    # Persist post-step toggles (each maps to its own config key)
    for config_key, enabled in body.post_step_toggles.items():
        # Only allow known toggleable keys
        if config_key in _TOGGLEABLE_POST_STEPS:
            await config_service.set_config(db, config_key, {"value": enabled}, "pipeline")

    # Return the freshly resolved pipeline
    defn = await _registry.get_pipeline(knowledge_type, db_session=db)
    return await _to_response(defn, db)


# ── Helpers ──────────────────────────────────────────────────────────────────


# Config keys for toggleable post-processing steps
_TOGGLEABLE_POST_STEPS = {
    "pipeline_consolidation_enabled",
    "auto_knowledge_intelligence",
}


async def _to_response(defn: PipelineDefinition, db: AsyncSession) -> PipelineResponse:
    # Read toggleable config values
    from openforge.services.automation_config import is_auto_knowledge_intelligence_enabled

    intelligence_enabled = await is_auto_knowledge_intelligence_enabled(db)
    consolidation_on = defn.consolidation_enabled

    post_steps: list[PostStep] = []

    # All types get normalization and embedding (not toggleable)
    post_steps.append(PostStep(name="Normalization", description="Standardize markdown output"))

    # Consolidation — toggleable
    post_steps.append(PostStep(
        name="Consolidation", description="LLM merges slot outputs",
        toggleable=True, enabled=consolidation_on, config_key="pipeline_consolidation_enabled",
    ))

    if defn.knowledge_type == "video":
        post_steps.append(PostStep(name="Timestamp Chunking", description="~30s timestamp-aligned segments with keyframe context"))
    else:
        post_steps.append(PostStep(name="Chunking & Embedding", description="Split content into chunks and generate vectors"))

    # Intelligence group — toggleable as one unit
    post_steps.append(PostStep(
        name="Intelligence", description="AI-generated title, summary, tags, and insights",
        toggleable=True, enabled=intelligence_enabled, config_key="auto_knowledge_intelligence",
    ))

    return PipelineResponse(
        knowledge_type=defn.knowledge_type,
        slots=[
            SlotResponse(
                slot_type=s.slot_type,
                display_name=s.display_name,
                enabled=s.enabled,
                active_backend=s.active_backend,
                available_backends=s.available_backends,
                execution=s.execution.value,
                timeout_seconds=s.timeout_seconds,
                produces_vectors=s.produces_vectors,
                backend_config=s.backend_config,
            )
            for s in defn.slots
        ],
        post_steps=post_steps,
        consolidation_enabled=defn.consolidation_enabled,
        consolidation_model=defn.consolidation_model,
    )
