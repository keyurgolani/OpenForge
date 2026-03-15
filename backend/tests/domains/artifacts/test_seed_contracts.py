from __future__ import annotations

import pytest

from openforge.db.models import ArtifactLinkModel, ArtifactSinkModel, ArtifactVersionModel
from openforge.domains.artifacts.seed import (
    DEFAULT_SEED_WORKSPACE_ID,
    SEED_ARTIFACT_TYPES,
    get_seed_artifact_blueprints,
    seed_example_artifacts,
)
from openforge.domains.artifacts.service import ArtifactService
from openforge.domains.artifacts.types import ARTIFACT_TYPE_DISPLAY, ArtifactLinkType, ArtifactObjectType, ArtifactSinkType
from tests.domains.graph._helpers import FakeAsyncSession


def _seed_type(artifact_type: str) -> dict[str, object]:
    return next(seed for seed in SEED_ARTIFACT_TYPES if seed["artifact_type"] == artifact_type)


def test_seed_artifact_types_cover_phase8_core_output_categories() -> None:
    required_types = {
        "note",
        "summary",
        "report",
        "plan",
        "target",
        "evidence_packet_ref",
        "research_brief",
        "dataset",
        "alert",
        "experiment_result",
        "notification_draft",
        "generic_document",
    }

    seeded_types = {seed["artifact_type"] for seed in SEED_ARTIFACT_TYPES}
    assert required_types.issubset(seeded_types)

    for artifact_type in required_types:
        seed = _seed_type(artifact_type)
        assert seed["label"] == ARTIFACT_TYPE_DISPLAY[artifact_type]["label"]
        assert seed["content_modes"]


def test_seed_blueprints_cover_versions_lineage_and_sources() -> None:
    blueprints = get_seed_artifact_blueprints()
    blueprint_by_slug = {blueprint["slug"]: blueprint for blueprint in blueprints}

    assert len(blueprints) >= 6
    assert blueprint_by_slug["operator-note"]["artifact"]["workspace_id"] == DEFAULT_SEED_WORKSPACE_ID
    assert blueprint_by_slug["execution-report"]["artifact"]["source_run_id"] is not None
    assert blueprint_by_slug["research-brief"]["artifact"]["source_evidence_packet_id"] is not None
    assert blueprint_by_slug["execution-summary"]["versions"]
    assert blueprint_by_slug["execution-summary"]["post_create_links"][0]["target_slug"] == "execution-report"


@pytest.mark.asyncio
async def test_seed_example_artifacts_create_linked_versions_and_sinks() -> None:
    db = FakeAsyncSession()
    service = ArtifactService(db)

    created_artifacts = await seed_example_artifacts(service)

    created_types = {artifact["artifact_type"] for artifact in created_artifacts}
    assert {"note", "report", "plan", "target", "research_brief", "summary"}.issubset(created_types)
    assert any(artifact["artifact_type"] == "summary" and artifact["version"] == 2 for artifact in created_artifacts)

    created_versions = [obj for obj in db.added if isinstance(obj, ArtifactVersionModel)]
    created_links = [obj for obj in db.added if isinstance(obj, ArtifactLinkModel)]
    created_sinks = [obj for obj in db.added if isinstance(obj, ArtifactSinkModel)]

    assert len(created_versions) >= 7
    assert any(
        link.link_type == ArtifactLinkType.DERIVED_FROM.value and link.target_type == ArtifactObjectType.ARTIFACT.value
        for link in created_links
    )
    assert any(sink.sink_type == ArtifactSinkType.KNOWLEDGE_LINKED.value for sink in created_sinks)
    assert any(sink.sink_type == ArtifactSinkType.FILE_EXPORT.value for sink in created_sinks)
