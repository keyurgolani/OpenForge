"""Artifact publishing and sink-state helpers."""

from __future__ import annotations

from .types import ArtifactSyncStatus


def normalize_sync_status(sync_status: str | None) -> str:
    """Normalize sink sync status to a known Phase 8 value."""

    if sync_status in {member.value for member in ArtifactSyncStatus}:
        return str(sync_status)
    return ArtifactSyncStatus.NOT_PUBLISHED.value
