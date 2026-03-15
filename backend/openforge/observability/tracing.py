"""Trace correlation and span context helpers for OpenForge observability."""

from __future__ import annotations

import contextvars
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from openforge.common.time import utc_now


# Context variable for propagating trace correlation through async call chains
_current_trace_context: contextvars.ContextVar["TraceContext | None"] = contextvars.ContextVar(
    "openforge_trace_context", default=None
)


@dataclass(slots=True)
class TraceContext:
    """Propagated correlation context for a single execution chain."""
    trace_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    span_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    parent_span_id: str | None = None
    run_id: uuid.UUID | None = None
    step_id: uuid.UUID | None = None
    workflow_id: uuid.UUID | None = None
    mission_id: uuid.UUID | None = None
    trigger_id: uuid.UUID | None = None
    attributes: dict[str, Any] = field(default_factory=dict)


def get_trace_context() -> TraceContext | None:
    return _current_trace_context.get()


def set_trace_context(ctx: TraceContext) -> contextvars.Token:
    return _current_trace_context.set(ctx)


def clear_trace_context(token: contextvars.Token) -> None:
    _current_trace_context.reset(token)


@dataclass(slots=True)
class Span:
    """Lightweight span for structured tracing."""
    name: str
    trace_context: TraceContext
    span_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    parent_span_id: str | None = None
    started_at: datetime = field(default_factory=utc_now)
    ended_at: datetime | None = None
    status: str = "ok"
    attributes: dict[str, Any] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)

    def end(self, status: str = "ok") -> None:
        self.ended_at = utc_now()
        self.status = status

    def add_event(self, name: str, attributes: dict[str, Any] | None = None) -> None:
        self.events.append({"name": name, "timestamp": utc_now().isoformat(), "attributes": attributes or {}})

    def duration_ms(self) -> int | None:
        if self.ended_at and self.started_at:
            return int((self.ended_at - self.started_at).total_seconds() * 1000)
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "trace_id": self.trace_context.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_ms": self.duration_ms(),
            "status": self.status,
            "attributes": self.attributes,
            "events": self.events,
        }


def create_span(name: str, *, attributes: dict[str, Any] | None = None) -> Span:
    """Create a new span linked to the current trace context."""
    ctx = get_trace_context()
    if ctx is None:
        ctx = TraceContext()
        set_trace_context(ctx)
    return Span(
        name=name,
        trace_context=ctx,
        parent_span_id=ctx.span_id,
        attributes=attributes or {},
    )


def create_run_trace_context(
    run_id: uuid.UUID,
    *,
    workflow_id: uuid.UUID | None = None,
    mission_id: uuid.UUID | None = None,
    trigger_id: uuid.UUID | None = None,
    parent_trace_id: str | None = None,
) -> TraceContext:
    """Create a new trace context for a run, optionally linked to a parent trace."""
    return TraceContext(
        trace_id=parent_trace_id or uuid.uuid4().hex,
        run_id=run_id,
        workflow_id=workflow_id,
        mission_id=mission_id,
        trigger_id=trigger_id,
    )
