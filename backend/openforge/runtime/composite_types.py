"""Phase 10 composite runtime types."""

from __future__ import annotations

from enum import Enum


class DelegationMode(str, Enum):
    CALL = "call"
    HANDOFF = "handoff"
    SUBWORKFLOW = "subworkflow"
    FANOUT = "fanout"
    JOIN = "join"
    REDUCE = "reduce"


TERMINAL_CHILD_STATUSES = {"completed", "failed", "cancelled", "waiting_approval", "interrupted"}
SUCCESSFUL_CHILD_STATUSES = {"completed"}
INTERRUPTING_CHILD_STATUSES = {"waiting_approval", "interrupted"}
