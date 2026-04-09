"""Slot backend protocol and registry for pipeline extraction backends."""

from __future__ import annotations

from typing import Protocol

from openforge.core.pipeline.types import SlotContext, SlotOutput


class SlotBackend(Protocol):
    """Contract every extraction backend must implement."""

    slot_type: str
    backend_name: str

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput: ...


BACKEND_REGISTRY: dict[tuple[str, str], SlotBackend] = {}


def register_backend(
    slot_type: str, backend_name: str, backend: SlotBackend
) -> None:
    """Register a backend, replacing any existing entry for the same key."""
    BACKEND_REGISTRY[(slot_type, backend_name)] = backend


def get_backend(slot_type: str, backend_name: str) -> SlotBackend | None:
    """Return the backend for the given key, or None if not found."""
    return BACKEND_REGISTRY.get((slot_type, backend_name))
