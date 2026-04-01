"""Sinks domain — first-class entities defining what happens with agent output values."""

from openforge.domains.sinks.router import router as sinks_router
from openforge.domains.sinks.service import SinkService
from openforge.domains.sinks.schemas import (
    SinkCreate,
    SinkUpdate,
    SinkResponse,
    SinkListResponse,
)

__all__ = [
    "SinkCreate",
    "SinkListResponse",
    "SinkResponse",
    "SinkService",
    "SinkUpdate",
    "sinks_router",
]
