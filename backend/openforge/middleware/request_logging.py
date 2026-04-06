"""Structured request/response logging middleware.

Logs every HTTP request with timing, status, correlation ID, and error details.
Integrates with the existing TraceContext system for distributed correlation.
"""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from openforge.observability.tracing import TraceContext, set_trace_context, clear_trace_context

logger = logging.getLogger("openforge.http")

# Paths to skip detailed logging (health checks, static assets)
_QUIET_PATHS = frozenset({"/api/health"})

# Paths logged at DEBUG instead of INFO (high-frequency, low-value)
_DEBUG_PATHS_PREFIXES = ("/assets/", "/favicon")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs structured request/response data for every HTTP call."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Skip health checks entirely
        if path in _QUIET_PATHS:
            return await call_next(request)

        # Assign or propagate a request correlation ID
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]

        # Create a trace context for this request
        ctx = TraceContext(trace_id=request_id)
        token = set_trace_context(ctx)

        method = request.method
        client_ip = request.client.host if request.client else "-"
        query = str(request.query_params) if request.query_params else ""

        start_time = time.perf_counter()
        status_code = 500
        error_detail = None

        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["x-request-id"] = request_id
            return response
        except Exception as exc:
            error_detail = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 1)
            clear_trace_context(token)

            # Choose log level based on path and status
            if any(path.startswith(p) for p in _DEBUG_PATHS_PREFIXES):
                log_level = logging.DEBUG
            elif status_code >= 500:
                log_level = logging.ERROR
            elif status_code >= 400:
                log_level = logging.WARNING
            else:
                log_level = logging.INFO

            log_msg = (
                f'{method} {path}'
                f'{"?" + query if query else ""}'
                f' -> {status_code}'
                f' ({duration_ms}ms)'
                f' client={client_ip}'
                f' req_id={request_id}'
            )
            if error_detail:
                log_msg += f' error="{error_detail}"'

            logger.log(log_level, log_msg)
