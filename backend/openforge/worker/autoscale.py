"""Logarithmic autoscaler for Celery workers.

Growth formula: new_capacity = current + ceil(log2(current + 1))
Shrink: reduce by 1 when idle, floored at min_concurrency.
"""

from __future__ import annotations

import logging
import math

from celery.worker.autoscale import Autoscaler

logger = logging.getLogger("openforge.worker.autoscale")

# Workers are considered busy when utilization exceeds this threshold
_BUSY_THRESHOLD = 0.75


class LogarithmicAutoscaler(Autoscaler):
    """Celery autoscaler with logarithmic growth and linear shrink.

    - Grows capacity as ``ceil(log2(current + 1))`` when utilization > 75%
    - Shrinks by 1 when utilization is 0% (all idle)
    - Never exceeds max_concurrency or drops below min_concurrency
    """

    def _desired_capacity(self, current: int, busy: int) -> int:
        """Calculate desired worker count given *current* pool size and *busy* count."""
        utilization = busy / current if current > 0 else 0.0

        if utilization >= _BUSY_THRESHOLD:
            growth = math.ceil(math.log2(current + 1))
            target = current + growth
            return min(target, self.max_concurrency)

        if busy == 0 and current > self.min_concurrency:
            return max(current - 1, self.min_concurrency)

        return current

    def _maybe_scale(self, req: object = None) -> bool | None:
        """Override Celery's built-in scaling decision with logarithmic logic."""
        try:
            current = self.processes
            busy = self.qty
        except Exception:
            return None

        desired = self._desired_capacity(current, busy)
        if desired > current:
            self.scale_up(desired - current)
            logger.info("Scaling up: %d → %d (busy=%d)", current, desired, busy)
            return True
        elif desired < current:
            self.scale_down(current - desired)
            logger.info("Scaling down: %d → %d (busy=%d)", current, desired, busy)
            return True
        return None
