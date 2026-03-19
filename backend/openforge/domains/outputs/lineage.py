"""Output lineage helpers."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from .types import ArtifactLinkType, ArtifactObjectType


def build_default_links(
    *,
    artifact_id: UUID,
    version_id: UUID,
    source_run_id: UUID | None = None,
    source_workflow_id: UUID | None = None,
    source_mission_id: UUID | None = None,
    source_profile_id: UUID | None = None,
    source_evidence_packet_id: UUID | None = None,
    composite_sources: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Create automatic lineage links from top-level source fields."""

    links: list[dict[str, Any]] = []
    mapping = (
        (ArtifactLinkType.SOURCE, ArtifactObjectType.RUN, source_run_id),
        (ArtifactLinkType.SOURCE, ArtifactObjectType.WORKFLOW, source_workflow_id),
        (ArtifactLinkType.SOURCE, ArtifactObjectType.MISSION, source_mission_id),
        (ArtifactLinkType.SOURCE, ArtifactObjectType.PROFILE, source_profile_id),
        (ArtifactLinkType.INFORMED_BY, ArtifactObjectType.EVIDENCE_PACKET, source_evidence_packet_id),
    )
    for link_type, target_type, target_id in mapping:
        if target_id is None:
            continue
        links.append(
            {
                "artifact_id": artifact_id,
                "version_id": version_id,
                "link_type": link_type.value,
                "target_type": target_type.value,
                "target_id": target_id,
                "metadata": {},
            }
        )
    for source in composite_sources or []:
        links.append(
            {
                "artifact_id": artifact_id,
                "version_id": version_id,
                "link_type": source.get("link_type", ArtifactLinkType.RELATED.value),
                "target_type": source["target_type"],
                "target_id": source["target_id"],
                "metadata": source.get("metadata", {}),
            }
        )
    return links


def group_lineage_links(artifact_id: UUID, serialized_links: list[dict[str, Any]]) -> dict[str, Any]:
    """Group serialized links for the lineage endpoint."""

    grouped = {"artifact_id": artifact_id, "sources": [], "derivations": [], "related": []}
    for link in serialized_links:
        if link["link_type"] == ArtifactLinkType.SOURCE.value:
            grouped["sources"].append(link)
        elif link["link_type"] == ArtifactLinkType.DERIVED_FROM.value:
            grouped["derivations"].append(link)
        else:
            grouped["related"].append(link)
    return grouped
