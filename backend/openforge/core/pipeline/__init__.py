# Pipeline framework for knowledge ingestion and processing.

from .dispatcher import dispatch_processing
from .executor import PipelineExecutor
from .normalizer import normalize_output
from .pipeline_registry import PipelineRegistry
from .registry import (
    BACKEND_REGISTRY,
    SlotBackend,
    get_backend,
    register_backend,
)
from .types import (
    PipelineConfig,
    PipelineDefinition,
    PipelineResult,
    SlotContext,
    SlotDefinition,
    SlotExecution,
    SlotOutput,
    TimestampSegment,
    TranscriptionResult,
    VectorOutput,
)

# Import backends package to trigger register_backend() calls at module scope.
import openforge.core.pipeline.backends as _backends  # noqa: F401

__all__ = [
    "dispatch_processing",
    "PipelineExecutor",
    "PipelineRegistry",
    "normalize_output",
    "BACKEND_REGISTRY",
    "SlotBackend",
    "get_backend",
    "register_backend",
    "SlotExecution",
    "SlotDefinition",
    "PipelineDefinition",
    "PipelineConfig",
    "SlotOutput",
    "VectorOutput",
    "TimestampSegment",
    "PipelineResult",
    "TranscriptionResult",
    "SlotContext",
]
