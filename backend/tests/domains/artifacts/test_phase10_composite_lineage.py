from __future__ import annotations

from uuid import uuid4

from openforge.domains.artifacts.lineage import build_default_links, group_lineage_links
from openforge.domains.artifacts.types import ArtifactLinkType, ArtifactObjectType


def test_build_default_links_includes_branch_artifact_metadata() -> None:
    artifact_id = uuid4()
    version_id = uuid4()
    source_run_id = uuid4()

    links = build_default_links(
        artifact_id=artifact_id,
        version_id=version_id,
        source_run_id=source_run_id,
        composite_sources=[
            {
                "target_type": ArtifactObjectType.ARTIFACT.value,
                "target_id": uuid4(),
                "link_type": ArtifactLinkType.DERIVED_FROM.value,
                "metadata": {"join_group_id": "research-branches", "branch_key": "alpha"},
            }
        ],
    )

    assert any(link["target_id"] == source_run_id for link in links)
    assert any(link["metadata"].get("join_group_id") == "research-branches" for link in links)


def test_group_lineage_links_preserves_composite_derivation_links() -> None:
    artifact_id = uuid4()

    grouped = group_lineage_links(
        artifact_id,
        [
            {
                "id": uuid4(),
                "artifact_id": artifact_id,
                "version_id": None,
                "link_type": ArtifactLinkType.DERIVED_FROM.value,
                "target_type": ArtifactObjectType.ARTIFACT.value,
                "target_id": uuid4(),
                "label": "Reduced from branch artifact",
                "metadata": {"join_group_id": "research-branches"},
                "created_at": None,
            }
        ],
    )

    assert grouped["derivations"][0]["metadata"]["join_group_id"] == "research-branches"
