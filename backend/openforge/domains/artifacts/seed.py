"""Deterministic artifact metadata and example artifacts for Phase 8."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

from openforge.domains.common.enums import ArtifactType

from .types import (
    ARTIFACT_TYPE_DISPLAY,
    ArtifactCreationMode,
    ArtifactLinkType,
    ArtifactObjectType,
    ArtifactSinkType,
    ArtifactStatus,
    ArtifactSyncStatus,
    ArtifactVisibility,
)

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase8/artifacts")
DEFAULT_SEED_WORKSPACE_ID = None  # Artifacts are workspace-agnostic in seed data


class ArtifactSeeder(Protocol):
    """Protocol for the artifact service methods used by seed helpers."""

    async def create_artifact(self, artifact_data: dict[str, Any]) -> dict[str, Any]:
        ...

    async def create_version(self, artifact_id: UUID, version_data: dict[str, Any]) -> dict[str, Any] | None:
        ...

    async def add_link(self, artifact_id: UUID, link_data: dict[str, Any]) -> dict[str, Any]:
        ...

    async def add_sink(self, artifact_id: UUID, sink_data: dict[str, Any]) -> dict[str, Any]:
        ...

    async def get_artifact(self, artifact_id: UUID) -> dict[str, Any] | None:
        ...


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def _artifact_type_seed(
    artifact_type: ArtifactType,
    *,
    description: str,
    content_modes: list[str],
    default_visibility: ArtifactVisibility,
    default_status: ArtifactStatus = ArtifactStatus.ACTIVE,
) -> dict[str, Any]:
    display = ARTIFACT_TYPE_DISPLAY[artifact_type.value]
    return {
        "artifact_type": artifact_type.value,
        "label": display["label"],
        "icon": display["icon"],
        "description": description,
        "content_modes": content_modes,
        "default_visibility": default_visibility.value,
        "default_status": default_status.value,
    }


SEED_ARTIFACT_TYPES: list[dict[str, Any]] = [
    _artifact_type_seed(
        ArtifactType.NOTE,
        description="User-authored durable notes for operator context, scratch work, and captured decisions.",
        content_modes=["markdown"],
        default_visibility=ArtifactVisibility.WORKSPACE,
    ),
    _artifact_type_seed(
        ArtifactType.SUMMARY,
        description="Condensed durable output derived from longer artifacts, runs, or evidence sets.",
        content_modes=["markdown", "hybrid"],
        default_visibility=ArtifactVisibility.WORKSPACE,
    ),
    _artifact_type_seed(
        ArtifactType.REPORT,
        description="Structured durable reporting output created by runs, missions, or operators.",
        content_modes=["markdown", "hybrid"],
        default_visibility=ArtifactVisibility.WORKSPACE,
    ),
    _artifact_type_seed(
        ArtifactType.PLAN,
        description="Durable plans, checklists, and execution outlines for later iteration.",
        content_modes=["markdown", "structured_json"],
        default_visibility=ArtifactVisibility.WORKSPACE,
    ),
    _artifact_type_seed(
        ArtifactType.TARGET,
        description="Unified replacement for legacy target objects while preserving target as a valid artifact type.",
        content_modes=["markdown", "structured_json"],
        default_visibility=ArtifactVisibility.WORKSPACE,
    ),
    _artifact_type_seed(
        ArtifactType.EVIDENCE_PACKET_REF,
        description="Reference-oriented artifact that points at curated evidence rather than duplicating raw evidence content.",
        content_modes=["reference_only", "structured_json"],
        default_visibility=ArtifactVisibility.PRIVATE,
    ),
    _artifact_type_seed(
        ArtifactType.RESEARCH_BRIEF,
        description="Reusable research synthesis artifact tied to a run, evidence packet, or knowledge context.",
        content_modes=["markdown", "hybrid"],
        default_visibility=ArtifactVisibility.WORKSPACE,
    ),
    _artifact_type_seed(
        ArtifactType.DATASET,
        description="Structured dataset output that remains an artifact even when exported elsewhere later.",
        content_modes=["structured_json"],
        default_visibility=ArtifactVisibility.PRIVATE,
    ),
    _artifact_type_seed(
        ArtifactType.ALERT,
        description="Durable alert output that may later route into notifications or downstream automation.",
        content_modes=["markdown", "structured_json"],
        default_visibility=ArtifactVisibility.WORKSPACE,
    ),
    _artifact_type_seed(
        ArtifactType.EXPERIMENT_RESULT,
        description="Recorded result of an experiment or evaluation run with supporting structured payload.",
        content_modes=["markdown", "hybrid"],
        default_visibility=ArtifactVisibility.WORKSPACE,
    ),
    _artifact_type_seed(
        ArtifactType.NOTIFICATION_DRAFT,
        description="Draft outbound communication prepared as an artifact before any publish step.",
        content_modes=["markdown"],
        default_visibility=ArtifactVisibility.PRIVATE,
    ),
    _artifact_type_seed(
        ArtifactType.GENERIC_DOCUMENT,
        description="Fallback document artifact for durable content that does not need a narrower specialized type.",
        content_modes=["markdown", "hybrid"],
        default_visibility=ArtifactVisibility.WORKSPACE,
    ),
]


def get_seed_artifact_blueprints(workspace_id: UUID | None = None) -> list[dict[str, Any]]:
    """Return deterministic example artifact blueprints for dev and test environments."""

    resolved_workspace_id = workspace_id or DEFAULT_SEED_WORKSPACE_ID
    weekly_run_id = _seed_uuid("weekly-run")
    weekly_mission_id = _seed_uuid("weekly-mission")
    weekly_workflow_id = _seed_uuid("weekly-workflow")
    researcher_profile_id = _seed_uuid("researcher-profile")
    reviewer_user_id = _seed_uuid("reviewer-user")
    operator_user_id = _seed_uuid("operator-user")
    weekly_evidence_packet_id = _seed_uuid("weekly-evidence-packet")
    knowledge_item_id = _seed_uuid("phase8-knowledge")
    artifact_entity_id = _seed_uuid("artifact-entity")

    return [
        {
            "slug": "operator-note",
            "artifact": {
                "workspace_id": resolved_workspace_id,
                "artifact_type": ArtifactType.NOTE.value,
                "title": "Operator handoff note",
                "summary": "Tracks the Phase 8 durable output cutover.",
                "status": ArtifactStatus.ACTIVE.value,
                "visibility": ArtifactVisibility.WORKSPACE.value,
                "creation_mode": ArtifactCreationMode.USER_CREATED.value,
                "created_by_type": "user",
                "created_by_id": operator_user_id,
                "content_type": "markdown",
                "body": "## Handoff\n\n- Artifact browser is live\n- Legacy target writes route through artifacts",
                "change_note": "Initial operator note",
                "tags": ["phase8", "handoff"],
            },
        },
        {
            "slug": "execution-report",
            "artifact": {
                "workspace_id": resolved_workspace_id,
                "artifact_type": ArtifactType.REPORT.value,
                "title": "Weekly execution report",
                "summary": "Run-generated report for the Phase 8 rollout.",
                "status": ArtifactStatus.ACTIVE.value,
                "visibility": ArtifactVisibility.WORKSPACE.value,
                "creation_mode": ArtifactCreationMode.RUN_GENERATED.value,
                "source_run_id": weekly_run_id,
                "source_workflow_id": weekly_workflow_id,
                "source_mission_id": weekly_mission_id,
                "source_profile_id": researcher_profile_id,
                "created_by_type": "run",
                "created_by_id": weekly_run_id,
                "content_type": "markdown",
                "body": "# Weekly execution report\n\n## Outcome\nPhase 8 durable output unification landed.",
                "structured_payload": {
                    "kpis": {
                        "artifacts_created": 6,
                        "legacy_target_paths_remaining": 0,
                    }
                },
                "change_note": "Generated from the weekly execution run",
                "source_evidence_packet_id": weekly_evidence_packet_id,
                "tags": ["phase8", "report"],
                "links": [
                    {
                        "link_type": ArtifactLinkType.INFORMED_BY.value,
                        "target_type": ArtifactObjectType.KNOWLEDGE.value,
                        "target_id": knowledge_item_id,
                        "label": "Phase 8 design note",
                    }
                ],
                "sinks": [
                    {
                        "sink_type": ArtifactSinkType.INTERNAL_WORKSPACE.value,
                        "destination_ref": "workspace://artifacts/reports",
                        "sync_status": ArtifactSyncStatus.NOT_PUBLISHED.value,
                    }
                ],
            },
        },
        {
            "slug": "execution-plan",
            "artifact": {
                "workspace_id": resolved_workspace_id,
                "artifact_type": ArtifactType.PLAN.value,
                "title": "Phase 8 rollout plan",
                "summary": "Checklist for shipping artifact unification safely.",
                "status": ArtifactStatus.ACTIVE.value,
                "visibility": ArtifactVisibility.WORKSPACE.value,
                "creation_mode": ArtifactCreationMode.USER_CREATED.value,
                "created_by_type": "user",
                "created_by_id": reviewer_user_id,
                "content_type": "markdown",
                "body": "1. Unify artifact contracts\n2. Replace legacy target writes\n3. Ship browser, detail, and history UI",
                "structured_payload": {"checklist_state": {"completed": 2, "remaining": 1}},
                "change_note": "Initial rollout plan",
                "tags": ["phase8", "plan"],
            },
        },
        {
            "slug": "workspace-target",
            "artifact": {
                "workspace_id": resolved_workspace_id,
                "artifact_type": ArtifactType.TARGET.value,
                "title": "Durable output cutover target",
                "summary": "Imported legacy target now represented as an artifact.",
                "status": ArtifactStatus.ACTIVE.value,
                "visibility": ArtifactVisibility.WORKSPACE.value,
                "creation_mode": ArtifactCreationMode.IMPORTED.value,
                "created_by_type": "system",
                "created_by_id": weekly_workflow_id,
                "content_type": "markdown",
                "body": "Keep all meaningful durable outputs inside the artifact system.",
                "structured_payload": {"owner": "platform", "priority": "high"},
                "change_note": "Imported from legacy target path",
                "tags": ["phase8", "target"],
            },
        },
        {
            "slug": "research-brief",
            "artifact": {
                "workspace_id": resolved_workspace_id,
                "artifact_type": ArtifactType.RESEARCH_BRIEF.value,
                "title": "Artifact system research brief",
                "summary": "Research synthesis explaining the target-to-artifact cutover.",
                "status": ArtifactStatus.ACTIVE.value,
                "visibility": ArtifactVisibility.WORKSPACE.value,
                "creation_mode": ArtifactCreationMode.RUN_GENERATED.value,
                "source_run_id": weekly_run_id,
                "source_workflow_id": weekly_workflow_id,
                "source_profile_id": researcher_profile_id,
                "created_by_type": "run",
                "created_by_id": weekly_run_id,
                "content_type": "markdown",
                "body": "# Research brief\n\nArtifacts now unify notes, plans, reports, and targets under one durable model.",
                "structured_payload": {"entities": ["artifact-system", "legacy-targets"]},
                "change_note": "Generated from research synthesis run",
                "source_evidence_packet_id": weekly_evidence_packet_id,
                "tags": ["phase8", "research"],
                "links": [
                    {
                        "link_type": ArtifactLinkType.RELATED.value,
                        "target_type": ArtifactObjectType.ENTITY.value,
                        "target_id": artifact_entity_id,
                        "label": "Artifact system entity",
                    }
                ],
                "sinks": [
                    {
                        "sink_type": ArtifactSinkType.KNOWLEDGE_LINKED.value,
                        "destination_ref": "knowledge://artifacts/phase8-research-brief",
                        "sync_status": ArtifactSyncStatus.PENDING_SYNC.value,
                    }
                ],
            },
        },
        {
            "slug": "execution-summary",
            "artifact": {
                "workspace_id": resolved_workspace_id,
                "artifact_type": ArtifactType.SUMMARY.value,
                "title": "Execution summary",
                "summary": "Initial operator-facing summary of the rollout report.",
                "status": ArtifactStatus.ACTIVE.value,
                "visibility": ArtifactVisibility.WORKSPACE.value,
                "creation_mode": ArtifactCreationMode.DERIVED.value,
                "source_run_id": weekly_run_id,
                "created_by_type": "user",
                "created_by_id": reviewer_user_id,
                "content_type": "markdown",
                "body": "Phase 8 unified durable outputs under the artifact model.",
                "structured_payload": {"confidence": "medium"},
                "change_note": "Initial derived summary",
                "tags": ["phase8", "summary"],
            },
            "versions": [
                {
                    "content_type": "markdown",
                    "body": (
                        "Phase 8 unified durable outputs under a versioned artifact model and "
                        "replaced filesystem target writes with artifact-backed persistence."
                    ),
                    "structured_payload": {"confidence": "high", "reviewed": True},
                    "summary": "Refined summary after review",
                    "change_note": "Refined after human review",
                    "created_by_type": "user",
                    "created_by_id": reviewer_user_id,
                }
            ],
            "post_create_links": [
                {
                    "link_type": ArtifactLinkType.DERIVED_FROM.value,
                    "target_slug": "execution-report",
                    "label": "Derived from the weekly execution report",
                },
                {
                    "link_type": ArtifactLinkType.RELATED.value,
                    "target_type": ArtifactObjectType.ENTITY.value,
                    "target_id": artifact_entity_id,
                    "label": "Tracks the artifact system entity",
                },
            ],
            "post_create_sinks": [
                {
                    "sink_type": ArtifactSinkType.FILE_EXPORT.value,
                    "destination_ref": "export://reports/phase8-execution-summary.md",
                    "sync_status": ArtifactSyncStatus.PENDING_SYNC.value,
                }
            ],
        },
    ]


async def seed_example_artifacts(
    service: ArtifactSeeder,
    *,
    workspace_id: UUID | None = None,
) -> list[dict[str, Any]]:
    """Create the deterministic Phase 8 example artifacts through the shared service layer."""

    created_by_slug: dict[str, dict[str, Any]] = {}
    created_artifacts: list[dict[str, Any]] = []

    for blueprint in get_seed_artifact_blueprints(workspace_id):
        artifact = await service.create_artifact(dict(blueprint["artifact"]))
        created_by_slug[blueprint["slug"]] = artifact

        for version_payload in blueprint.get("versions", []):
            await service.create_version(artifact["id"], dict(version_payload))

        for link_payload in blueprint.get("post_create_links", []):
            resolved_link = dict(link_payload)
            target_slug = resolved_link.pop("target_slug", None)
            if target_slug is not None:
                resolved_link["target_type"] = ArtifactObjectType.ARTIFACT.value
                resolved_link["target_id"] = created_by_slug[target_slug]["id"]
            await service.add_link(artifact["id"], resolved_link)

        for sink_payload in blueprint.get("post_create_sinks", []):
            await service.add_sink(artifact["id"], dict(sink_payload))

        refreshed = await service.get_artifact(artifact["id"])
        created_artifacts.append(refreshed or artifact)

    return created_artifacts
