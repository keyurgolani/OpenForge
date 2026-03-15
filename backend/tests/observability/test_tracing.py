"""Tests for trace correlation context."""

from uuid import uuid4

from openforge.observability.tracing import (
    TraceContext,
    Span,
    create_span,
    create_run_trace_context,
    get_trace_context,
    set_trace_context,
    clear_trace_context,
)


class TestTraceContext:
    def test_create_context(self):
        ctx = TraceContext()
        assert ctx.trace_id
        assert ctx.span_id
        assert ctx.parent_span_id is None

    def test_run_trace_context(self):
        run_id = uuid4()
        workflow_id = uuid4()
        ctx = create_run_trace_context(run_id, workflow_id=workflow_id)
        assert ctx.run_id == run_id
        assert ctx.workflow_id == workflow_id
        assert ctx.trace_id

    def test_context_propagation(self):
        ctx = TraceContext(run_id=uuid4())
        token = set_trace_context(ctx)
        assert get_trace_context() is ctx
        clear_trace_context(token)


class TestSpan:
    def test_create_and_end_span(self):
        ctx = TraceContext()
        set_trace_context(ctx)
        span = create_span("test_operation", attributes={"key": "value"})
        assert span.name == "test_operation"
        assert span.trace_context is ctx
        assert span.status == "ok"
        span.end()
        assert span.ended_at is not None
        assert span.duration_ms() is not None
        assert span.duration_ms() >= 0

    def test_span_events(self):
        ctx = TraceContext()
        span = Span(name="test", trace_context=ctx)
        span.add_event("checkpoint", {"step": 1})
        assert len(span.events) == 1
        assert span.events[0]["name"] == "checkpoint"

    def test_span_to_dict(self):
        ctx = TraceContext()
        span = Span(name="test", trace_context=ctx)
        span.end()
        d = span.to_dict()
        assert d["name"] == "test"
        assert d["trace_id"] == ctx.trace_id
        assert d["status"] == "ok"
        assert d["duration_ms"] is not None
