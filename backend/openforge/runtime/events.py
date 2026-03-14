"""
Runtime Events.

TODO: Implement event publishing for workflow execution.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional
from uuid import UUID


@dataclass
class RuntimeEvent:
    """Base class for runtime events."""

    run_id: UUID
    timestamp: datetime
    event_type: str
    data: dict[str, Any]


class EventPublisher:
    """
    Publisher for runtime events.

    This will be implemented in Phase 2+ to handle:
    - Event publishing
    - Event subscription
    - Event streaming
    """

    async def publish(self, event: RuntimeEvent) -> None:
        """Publish a runtime event."""
        raise NotImplementedError("Event publisher will be implemented in Phase 2")

    async def subscribe(self, run_id: UUID, callback: callable) -> None:
        """Subscribe to events for a specific run."""
        raise NotImplementedError("Event publisher will be implemented in Phase 2")
