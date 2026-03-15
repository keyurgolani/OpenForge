"""Runtime event publisher."""

from __future__ import annotations

import json
import logging
from typing import Any

from openforge.db.models import RuntimeEventModel

from .events import RuntimeEvent

logger = logging.getLogger("openforge.runtime.event_publisher")


class EventPublisher:
    """Persist and publish runtime events."""

    def __init__(self, db):
        self.db = db

    async def publish(self, event: RuntimeEvent) -> dict[str, Any]:
        record = RuntimeEventModel(
            run_id=event.run_id,
            step_id=event.step_id,
            workflow_id=event.workflow_id,
            workflow_version_id=event.workflow_version_id,
            node_id=event.node_id,
            node_key=event.node_key,
            event_type=event.event_type,
            payload_json=event.payload,
            created_at=event.created_at,
        )
        self.db.add(record)
        await self.db.flush()

        payload = {
            "id": record.id,
            "run_id": record.run_id,
            "step_id": record.step_id,
            "workflow_id": record.workflow_id,
            "workflow_version_id": record.workflow_version_id,
            "node_id": record.node_id,
            "node_key": record.node_key,
            "event_type": record.event_type,
            "payload": record.payload_json or {},
            "created_at": record.created_at,
        }
        await self._publish_transport(payload)
        return payload

    async def _publish_transport(self, payload: dict[str, Any]) -> None:
        try:
            from openforge.db.redis_client import get_redis

            redis = await get_redis()
            await redis.publish(f"runtime:{payload['run_id']}", json.dumps(payload, default=str))
        except Exception as exc:  # pragma: no cover - best effort relay
            logger.debug("Runtime event redis publish skipped: %s", exc)
