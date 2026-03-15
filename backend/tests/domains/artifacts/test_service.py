from __future__ import annotations

from uuid import uuid4

import pytest

from openforge.db.models import ArtifactLinkModel, ArtifactModel, ArtifactSinkModel, ArtifactVersionModel
from openforge.domains.artifacts.service import ArtifactService
from openforge.domains.artifacts.types import (
    ArtifactCreationMode,
    ArtifactLinkType,
    ArtifactObjectType,
    ArtifactSinkType,
    ArtifactStatus,
    ArtifactSyncStatus,
    ArtifactVisibility,
)
from tests.domains.graph._helpers import FakeAsyncSession, FakeExecuteResult


@pytest.mark.asyncio
async def test_create_artifact_creates_initial_version_links_and_sinks() -> None:
    workspace_id = uuid4()
    run_id = uuid4()
    mission_id = uuid4()
    workflow_id = uuid4()
    profile_id = uuid4()
    evidence_packet_id = uuid4()
    knowledge_id = uuid4()

    db = FakeAsyncSession()
    service = ArtifactService(db)

    artifact = await service.create_artifact(
        {
            "workspace_id": workspace_id,
            "artifact_type": "report",
            "title": "Weekly execution report",
            "summary": "Phase 8 rollout summary",
            "status": ArtifactStatus.ACTIVE,
            "visibility": ArtifactVisibility.WORKSPACE,
            "creation_mode": ArtifactCreationMode.RUN_GENERATED,
            "source_run_id": run_id,
            "source_mission_id": mission_id,
            "source_workflow_id": workflow_id,
            "source_profile_id": profile_id,
            "created_by_type": "run",
            "created_by_id": run_id,
            "content_type": "markdown",
            "body": "# Weekly execution report\n\nEverything shipped.",
            "structured_payload": {"kpis": {"artifacts_created": 3}},
            "change_note": "Initial run output",
            "source_evidence_packet_id": evidence_packet_id,
            "tags": ["phase8", "reporting"],
            "links": [
                {
                    "link_type": ArtifactLinkType.INFORMED_BY,
                    "target_type": ArtifactObjectType.KNOWLEDGE,
                    "target_id": knowledge_id,
                    "label": "Primary source document",
                }
            ],
            "sinks": [
                {
                    "sink_type": ArtifactSinkType.INTERNAL_WORKSPACE,
                    "destination_ref": "workspace://artifacts",
                    "sync_status": ArtifactSyncStatus.NOT_PUBLISHED,
                }
            ],
        }
    )

    assert artifact["artifact_type"] == "report"
    assert artifact["title"] == "Weekly execution report"
    assert artifact["version"] == 1
    assert artifact["current_version"]["version_number"] == 1
    assert artifact["current_version"]["content_type"] == "markdown"
    assert artifact["current_version"]["content"] == "# Weekly execution report\n\nEverything shipped."
    assert artifact["current_version"]["structured_payload"] == {"kpis": {"artifacts_created": 3}}
    assert artifact["visibility"] == ArtifactVisibility.WORKSPACE
    assert artifact["status"] == ArtifactStatus.ACTIVE
    assert artifact["tags"] == ["phase8", "reporting"]

    created_versions = [obj for obj in db.added if isinstance(obj, ArtifactVersionModel)]
    created_links = [obj for obj in db.added if isinstance(obj, ArtifactLinkModel)]
    created_sinks = [obj for obj in db.added if isinstance(obj, ArtifactSinkModel)]

    assert len(created_versions) == 1
    assert created_versions[0].version_number == 1
    assert created_versions[0].source_run_id == run_id
    assert created_versions[0].source_evidence_packet_id == evidence_packet_id

    assert len(created_sinks) == 1
    assert created_sinks[0].sink_type == ArtifactSinkType.INTERNAL_WORKSPACE
    assert created_sinks[0].destination_ref == "workspace://artifacts"
    assert created_sinks[0].sync_status == ArtifactSyncStatus.NOT_PUBLISHED

    link_pairs = {(link.link_type, link.target_type, link.target_id) for link in created_links}
    assert (ArtifactLinkType.SOURCE, ArtifactObjectType.RUN, run_id) in link_pairs
    assert (ArtifactLinkType.SOURCE, ArtifactObjectType.MISSION, mission_id) in link_pairs
    assert (ArtifactLinkType.SOURCE, ArtifactObjectType.WORKFLOW, workflow_id) in link_pairs
    assert (ArtifactLinkType.SOURCE, ArtifactObjectType.PROFILE, profile_id) in link_pairs
    assert (ArtifactLinkType.INFORMED_BY, ArtifactObjectType.EVIDENCE_PACKET, evidence_packet_id) in link_pairs
    assert (ArtifactLinkType.INFORMED_BY, ArtifactObjectType.KNOWLEDGE, knowledge_id) in link_pairs


@pytest.mark.asyncio
async def test_update_artifact_metadata_only_does_not_create_new_version() -> None:
    artifact_id = uuid4()
    workspace_id = uuid4()
    version_id = uuid4()

    artifact_model = ArtifactModel(
        id=artifact_id,
        workspace_id=workspace_id,
        artifact_type="note",
        title="Operator note",
        summary="Original summary",
        status=ArtifactStatus.DRAFT.value,
        visibility=ArtifactVisibility.PRIVATE.value,
        version=1,
        current_version_id=version_id,
        created_by_type="user",
        created_by_id=uuid4(),
        tags_json=["ops"],
        metadata_json={"channel": "ops"},
    )
    version_model = ArtifactVersionModel(
        id=version_id,
        artifact_id=artifact_id,
        version_number=1,
        content_type="markdown",
        content="Initial note",
        structured_payload={},
        summary="Original summary",
        change_note="Initial draft",
        status=ArtifactStatus.DRAFT.value,
    )
    db = FakeAsyncSession(objects={
        (ArtifactModel, artifact_id): artifact_model,
        (ArtifactVersionModel, version_id): version_model,
    })
    service = ArtifactService(db)

    updated = await service.update_artifact(
        artifact_id,
        {
            "title": "Operator note - renamed",
            "summary": "Tightened summary",
            "status": ArtifactStatus.ACTIVE,
            "visibility": ArtifactVisibility.WORKSPACE,
            "tags": ["ops", "handoff"],
            "metadata": {"channel": "ops", "priority": "high"},
        },
    )

    assert updated is not None
    assert updated["title"] == "Operator note - renamed"
    assert updated["summary"] == "Tightened summary"
    assert updated["status"] == ArtifactStatus.ACTIVE
    assert updated["visibility"] == ArtifactVisibility.WORKSPACE
    assert updated["version"] == 1
    assert updated["current_version"]["id"] == version_id
    assert not [obj for obj in db.added if isinstance(obj, ArtifactVersionModel)]


@pytest.mark.asyncio
async def test_update_artifact_content_change_creates_new_version_and_promotes_it() -> None:
    artifact_id = uuid4()
    workspace_id = uuid4()
    original_version_id = uuid4()
    evidence_packet_id = uuid4()

    artifact_model = ArtifactModel(
        id=artifact_id,
        workspace_id=workspace_id,
        artifact_type="summary",
        title="Run summary",
        summary="Version one",
        status=ArtifactStatus.ACTIVE.value,
        visibility=ArtifactVisibility.WORKSPACE.value,
        version=1,
        current_version_id=original_version_id,
        created_by_type="run",
        created_by_id=uuid4(),
        tags_json=["phase8"],
    )
    version_model = ArtifactVersionModel(
        id=original_version_id,
        artifact_id=artifact_id,
        version_number=1,
        content_type="markdown",
        content="Version one body",
        structured_payload={"score": 1},
        summary="Version one",
        change_note="Initial generation",
        status=ArtifactStatus.ACTIVE.value,
    )
    db = FakeAsyncSession(objects={
        (ArtifactModel, artifact_id): artifact_model,
        (ArtifactVersionModel, original_version_id): version_model,
    })
    service = ArtifactService(db)

    updated = await service.update_artifact(
        artifact_id,
        {
            "body": "Version two body",
            "structured_payload": {"score": 2},
            "content_type": "markdown",
            "change_note": "Refined after review",
            "summary": "Version two",
            "source_evidence_packet_id": evidence_packet_id,
        },
    )

    assert updated is not None
    assert updated["version"] == 2
    assert updated["summary"] == "Version two"
    assert updated["current_version"]["version_number"] == 2
    assert updated["current_version"]["content"] == "Version two body"
    assert updated["current_version"]["structured_payload"] == {"score": 2}

    created_versions = [obj for obj in db.added if isinstance(obj, ArtifactVersionModel)]
    assert len(created_versions) == 1
    assert created_versions[0].version_number == 2
    assert created_versions[0].source_evidence_packet_id == evidence_packet_id
    assert artifact_model.current_version_id == created_versions[0].id


@pytest.mark.asyncio
async def test_list_versions_lineage_and_sinks_return_structured_phase8_views() -> None:
    artifact_id = uuid4()
    version_one_id = uuid4()
    version_two_id = uuid4()
    sink_id = uuid4()
    run_id = uuid4()
    derived_artifact_id = uuid4()

    version_one = ArtifactVersionModel(
        id=version_one_id,
        artifact_id=artifact_id,
        version_number=1,
        content_type="markdown",
        content="v1",
        structured_payload={},
        summary="v1",
        change_note="Initial",
        status=ArtifactStatus.DRAFT.value,
    )
    version_two = ArtifactVersionModel(
        id=version_two_id,
        artifact_id=artifact_id,
        version_number=2,
        content_type="markdown",
        content="v2",
        structured_payload={},
        summary="v2",
        change_note="Revised",
        status=ArtifactStatus.ACTIVE.value,
    )
    run_link = ArtifactLinkModel(
        id=uuid4(),
        artifact_id=artifact_id,
        version_id=version_two_id,
        link_type=ArtifactLinkType.SOURCE.value,
        target_type=ArtifactObjectType.RUN.value,
        target_id=run_id,
        label="Produced by run",
    )
    derived_link = ArtifactLinkModel(
        id=uuid4(),
        artifact_id=artifact_id,
        version_id=version_two_id,
        link_type=ArtifactLinkType.DERIVED_FROM.value,
        target_type=ArtifactObjectType.ARTIFACT.value,
        target_id=derived_artifact_id,
        label="Derived from draft",
    )
    sink = ArtifactSinkModel(
        id=sink_id,
        artifact_id=artifact_id,
        sink_type=ArtifactSinkType.FILE_EXPORT.value,
        sink_state="configured",
        destination_ref="export://weekly-report.md",
        sync_status=ArtifactSyncStatus.PENDING_SYNC.value,
    )
    db = FakeAsyncSession(
        execute_results=[
            FakeExecuteResult([version_two, version_one]),
            FakeExecuteResult([run_link, derived_link]),
            FakeExecuteResult([sink]),
        ]
    )
    service = ArtifactService(db)

    versions = await service.list_versions(artifact_id)
    lineage = await service.get_lineage(artifact_id)
    sinks = await service.list_sinks(artifact_id)

    assert [item["version_number"] for item in versions] == [2, 1]
    assert lineage["artifact_id"] == artifact_id
    assert lineage["sources"][0]["target_type"] == ArtifactObjectType.RUN
    assert lineage["derivations"][0]["target_type"] == ArtifactObjectType.ARTIFACT
    assert sinks[0]["sink_type"] == ArtifactSinkType.FILE_EXPORT
    assert sinks[0]["sync_status"] == ArtifactSyncStatus.PENDING_SYNC
