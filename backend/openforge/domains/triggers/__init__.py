"""
Triggers domain package.

Trigger Definitions - automation rules that initiate mission execution.
"""

from .event_dispatch import TriggerEventDispatcher
from .router import router
from .scheduler import TriggerScheduler, trigger_scheduler
from .schemas import (
    TriggerCreate,
    TriggerDiagnosticsResponse,
    TriggerFireRecord,
    TriggerListResponse,
    TriggerResponse,
    TriggerUpdate,
)
from .service import TriggerService
from .types import (
    TriggerDefinition,
    TriggerStatus,
    TriggerTargetType,
)

__all__ = [
    "TriggerDefinition",
    "TriggerStatus",
    "TriggerTargetType",
    "TriggerCreate",
    "TriggerUpdate",
    "TriggerResponse",
    "TriggerListResponse",
    "TriggerFireRecord",
    "TriggerDiagnosticsResponse",
    "TriggerService",
    "TriggerScheduler",
    "trigger_scheduler",
    "TriggerEventDispatcher",
    "router",
]
