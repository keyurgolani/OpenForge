"""Output versioning helpers."""

from __future__ import annotations

import difflib
from typing import Any

from .types import ArtifactVersion


def should_create_new_version(payload: dict[str, Any]) -> bool:
    """Return True when an update materially changes output content."""

    if payload.get("body") is not None:
        return True
    if payload.get("content") not in (None, {}):
        return True
    if payload.get("structured_payload") not in (None, {}):
        return True
    return False


def next_version_number(current_version_number: int | None) -> int:
    """Increment a version number safely."""

    return 1 if current_version_number is None else current_version_number + 1


def build_version_diff_summary(
    artifact_id,
    from_version: ArtifactVersion,
    to_version: ArtifactVersion,
) -> dict[str, Any]:
    """Produce a first-pass diff summary for API/UI use."""

    from_text = from_version.content or ""
    to_text = to_version.content or ""
    preview_lines = list(
        difflib.unified_diff(
            from_text.splitlines(),
            to_text.splitlines(),
            fromfile=f"v{from_version.version_number}",
            tofile=f"v{to_version.version_number}",
            lineterm="",
        )
    )
    content_preview = "\n".join(preview_lines[:12])
    return {
        "artifact_id": artifact_id,
        "from_version_id": from_version.id,
        "to_version_id": to_version.id,
        "from_version_number": from_version.version_number,
        "to_version_number": to_version.version_number,
        "content_changed": from_text != to_text,
        "structured_payload_changed": from_version.structured_payload != to_version.structured_payload,
        "summary_changed": from_version.summary != to_version.summary,
        "change_note_changed": from_version.change_note != to_version.change_note,
        "content_preview": content_preview,
    }
