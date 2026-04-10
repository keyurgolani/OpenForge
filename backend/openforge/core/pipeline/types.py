from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, model_validator
from sqlalchemy.ext.asyncio import AsyncSession


class SlotExecution(str, Enum):
    PARALLEL = "parallel"
    SEQUENTIAL = "sequential"


class SlotDefinition(BaseModel):
    """A single capability slot in a pipeline."""

    slot_type: str
    display_name: str
    enabled: bool = True
    active_backend: str
    available_backends: list[str]
    execution: SlotExecution = SlotExecution.PARALLEL
    timeout_seconds: int = 300
    produces_vectors: bool = False
    backend_config: dict = {}


class PipelineDefinition(BaseModel):
    """Complete pipeline for a knowledge type."""

    knowledge_type: str
    slots: list[SlotDefinition]
    consolidation_enabled: bool = True
    consolidation_model: str | None = None

    @model_validator(mode="after")
    def _validate_slots(self) -> PipelineDefinition:
        # active_backend must be in available_backends for each slot
        for slot in self.slots:
            if slot.active_backend not in slot.available_backends:
                raise ValueError(
                    f"Slot '{slot.slot_type}': active_backend '{slot.active_backend}' "
                    f"is not in available_backends {slot.available_backends}"
                )

        # At least one slot must be enabled
        if not any(s.enabled for s in self.slots):
            raise ValueError("At least one slot must be enabled")

        # slot_type values must be unique
        slot_types = [s.slot_type for s in self.slots]
        if len(slot_types) != len(set(slot_types)):
            seen: set[str] = set()
            duplicates: list[str] = []
            for st in slot_types:
                if st in seen:
                    duplicates.append(st)
                seen.add(st)
            raise ValueError(f"Duplicate slot_type values: {duplicates}")

        return self


class PipelineConfig(BaseModel):
    """User-facing configuration overrides for a pipeline."""

    slot_overrides: dict[str, dict] = {}


class VectorOutput(BaseModel):
    """A vector produced by a slot (e.g. CLIP embedding)."""

    vector_type: str
    vector: list[float]
    payload: dict = {}


class TimestampSegment(BaseModel):
    """A timestamped text segment from audio/video."""

    start: float
    end: float
    text: str
    speaker: str | None = None


class SlotOutput(BaseModel):
    """Output from a single slot execution."""

    slot_type: str
    backend_name: str
    text: str = ""
    metadata: dict = {}
    vectors: list[VectorOutput] = []
    segments: list[TimestampSegment] = []
    success: bool = True
    error: str | None = None
    duration_ms: int = 0


class PipelineResult(BaseModel):
    """Final output from pipeline execution."""

    content: str
    ai_title: str | None = None
    ai_summary: str | None = None
    metadata: dict = {}
    vectors: list[VectorOutput] = []
    segments: list[TimestampSegment] = []
    slot_results: list[SlotOutput] = []
    thumbnail_path: str | None = None


class TranscriptionResult(BaseModel):
    """Output from a SpeechProvider."""

    text: str
    segments: list[TimestampSegment] = []
    language: str | None = None
    duration: float | None = None


@dataclass
class SlotContext:
    """Runtime context passed to each slot backend."""

    knowledge_id: UUID
    workspace_id: UUID
    db_session: AsyncSession
    backend_config: dict | None = None
    knowledge_type: str = ""
