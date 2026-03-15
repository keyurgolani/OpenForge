"""Artifact sink helpers."""

from __future__ import annotations

from typing import Any

from .types import ArtifactSinkType, ArtifactSyncStatus


def build_default_sink() -> dict[str, Any]:
    """Default sink for newly created artifacts."""

    return {
        "sink_type": ArtifactSinkType.INTERNAL_WORKSPACE.value,
        "sink_state": "configured",
        "destination_ref": "workspace://artifacts",
        "sync_status": ArtifactSyncStatus.NOT_PUBLISHED.value,
        "metadata": {},
    }
