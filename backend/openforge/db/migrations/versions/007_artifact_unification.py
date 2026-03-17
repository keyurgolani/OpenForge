"""Artifact Unification

Revision ID: 007_phase8_artifact_unification
Revises: 006_phase7_profile_core
Create Date: 2026-03-14

Upgrades the thin artifact CRUD model into a versioned artifact system with:
- artifact visibility and creation modes
- explicit artifact versions
- explicit lineage links
- explicit sink/destination state
- backfill of legacy artifact rows into version records
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "007_phase8_artifact_unification"
down_revision = "006_phase7_profile_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "artifacts",
        sa.Column("source_workflow_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "artifacts",
        sa.Column("source_profile_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "artifacts",
        sa.Column("visibility", sa.String(length=50), nullable=False, server_default="workspace"),
    )
    op.add_column(
        "artifacts",
        sa.Column("creation_mode", sa.String(length=50), nullable=False, server_default="user_created"),
    )
    op.add_column(
        "artifacts",
        sa.Column("current_version_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "artifacts",
        sa.Column("created_by_type", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "artifacts",
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "artifacts",
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.create_index("idx_artifacts_workspace_status", "artifacts", ["workspace_id", "status"])
    op.create_index("idx_artifacts_workspace_type", "artifacts", ["workspace_id", "artifact_type"])
    op.create_index("idx_artifacts_workspace_visibility", "artifacts", ["workspace_id", "visibility"])
    op.create_index("ix_artifacts_source_workflow_id", "artifacts", ["source_workflow_id"])
    op.create_index("ix_artifacts_source_profile_id", "artifacts", ["source_profile_id"])
    op.create_index("ix_artifacts_current_version_id", "artifacts", ["current_version_id"])

    op.create_table(
        "artifact_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("artifact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("content_type", sa.String(length=100), nullable=False, server_default="structured_payload"),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("structured_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("source_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_evidence_packet_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),
        sa.Column("created_by_type", sa.String(length=50), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("artifact_id", "version_number", name="uq_artifact_versions_artifact_version"),
    )
    op.create_index("ix_artifact_versions_artifact_id", "artifact_versions", ["artifact_id"])
    op.create_index("ix_artifact_versions_source_run_id", "artifact_versions", ["source_run_id"])
    op.create_index("ix_artifact_versions_source_evidence_packet_id", "artifact_versions", ["source_evidence_packet_id"])

    op.create_table(
        "artifact_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("artifact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("artifact_versions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("link_type", sa.String(length=50), nullable=False),
        sa.Column("target_type", sa.String(length=50), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_artifact_links_artifact_id", "artifact_links", ["artifact_id"])
    op.create_index("ix_artifact_links_version_id", "artifact_links", ["version_id"])
    op.create_index("idx_artifact_links_artifact_link_type", "artifact_links", ["artifact_id", "link_type"])
    op.create_index("idx_artifact_links_target", "artifact_links", ["target_type", "target_id"])

    op.create_table(
        "artifact_sinks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("artifact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sink_type", sa.String(length=50), nullable=False),
        sa.Column("sink_state", sa.String(length=50), nullable=False, server_default="configured"),
        sa.Column("destination_ref", sa.String(length=1000), nullable=True),
        sa.Column("sync_status", sa.String(length=50), nullable=False, server_default="not_published"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_artifact_sinks_artifact_id", "artifact_sinks", ["artifact_id"])

    bind = op.get_bind()
    artifacts = sa.table(
        "artifacts",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("artifact_type", sa.String()),
        sa.column("workspace_id", postgresql.UUID(as_uuid=True)),
        sa.column("source_run_id", postgresql.UUID(as_uuid=True)),
        sa.column("source_mission_id", postgresql.UUID(as_uuid=True)),
        sa.column("title", sa.String()),
        sa.column("summary", sa.Text()),
        sa.column("content", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("status", sa.String()),
        sa.column("version", sa.Integer()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("created_by", postgresql.UUID(as_uuid=True)),
        sa.column("current_version_id", postgresql.UUID(as_uuid=True)),
        sa.column("visibility", sa.String()),
        sa.column("creation_mode", sa.String()),
        sa.column("created_by_type", sa.String()),
        sa.column("created_by_id", postgresql.UUID(as_uuid=True)),
        sa.column("tags", postgresql.JSONB(astext_type=sa.Text())),
    )
    artifact_versions = sa.table(
        "artifact_versions",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("artifact_id", postgresql.UUID(as_uuid=True)),
        sa.column("version_number", sa.Integer()),
        sa.column("content_type", sa.String()),
        sa.column("content", sa.Text()),
        sa.column("structured_payload", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("summary", sa.Text()),
        sa.column("change_note", sa.Text()),
        sa.column("source_run_id", postgresql.UUID(as_uuid=True)),
        sa.column("source_evidence_packet_id", postgresql.UUID(as_uuid=True)),
        sa.column("status", sa.String()),
        sa.column("created_by_type", sa.String()),
        sa.column("created_by_id", postgresql.UUID(as_uuid=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    artifact_links = sa.table(
        "artifact_links",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("artifact_id", postgresql.UUID(as_uuid=True)),
        sa.column("version_id", postgresql.UUID(as_uuid=True)),
        sa.column("link_type", sa.String()),
        sa.column("target_type", sa.String()),
        sa.column("target_id", postgresql.UUID(as_uuid=True)),
        sa.column("label", sa.String()),
        sa.column("metadata", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    artifact_sinks = sa.table(
        "artifact_sinks",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("artifact_id", postgresql.UUID(as_uuid=True)),
        sa.column("sink_type", sa.String()),
        sa.column("sink_state", sa.String()),
        sa.column("destination_ref", sa.String()),
        sa.column("sync_status", sa.String()),
        sa.column("metadata", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    rows = bind.execute(
        sa.select(
            artifacts.c.id,
            artifacts.c.workspace_id,
            artifacts.c.source_run_id,
            artifacts.c.source_mission_id,
            artifacts.c.summary,
            artifacts.c.content,
            artifacts.c.status,
            artifacts.c.version,
            artifacts.c.created_at,
            artifacts.c.updated_at,
            artifacts.c.created_by,
        )
    ).fetchall()

    for row in rows:
        version_id = uuid.uuid4()
        bind.execute(
            artifact_versions.insert().values(
                id=version_id,
                artifact_id=row.id,
                version_number=row.version or 1,
                content_type="structured_payload",
                content=None,
                structured_payload=row.content or {},
                summary=row.summary,
                change_note="Backfill from legacy artifact row",
                source_run_id=row.source_run_id,
                source_evidence_packet_id=None,
                status=row.status or "draft",
                created_by_type="legacy_backfill",
                created_by_id=row.created_by,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
        )
        bind.execute(
            artifacts.update()
            .where(artifacts.c.id == row.id)
            .values(
                current_version_id=version_id,
                visibility="workspace",
                creation_mode="run_generated" if row.source_run_id else "imported",
                created_by_type="run" if row.source_run_id else "user",
                created_by_id=row.created_by,
                tags=sa.cast(sa.text("'[]'::jsonb"), postgresql.JSONB),
            )
        )
        bind.execute(
            artifact_sinks.insert().values(
                id=uuid.uuid4(),
                artifact_id=row.id,
                sink_type="internal_workspace",
                sink_state="configured",
                destination_ref="workspace://artifacts",
                sync_status="not_published",
                metadata=sa.cast(sa.text("'{}'::jsonb"), postgresql.JSONB),
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
        )
        if row.source_run_id is not None:
            bind.execute(
                artifact_links.insert().values(
                    id=uuid.uuid4(),
                    artifact_id=row.id,
                    version_id=version_id,
                    link_type="source",
                    target_type="run",
                    target_id=row.source_run_id,
                    label="Backfilled source run",
                    metadata=sa.cast(sa.text("'{}'::jsonb"), postgresql.JSONB),
                    created_at=row.created_at,
                )
            )
        if row.source_mission_id is not None:
            bind.execute(
                artifact_links.insert().values(
                    id=uuid.uuid4(),
                    artifact_id=row.id,
                    version_id=version_id,
                    link_type="source",
                    target_type="mission",
                    target_id=row.source_mission_id,
                    label="Backfilled source mission",
                    metadata=sa.cast(sa.text("'{}'::jsonb"), postgresql.JSONB),
                    created_at=row.created_at,
                )
            )


def downgrade() -> None:
    op.drop_index("ix_artifact_sinks_artifact_id", table_name="artifact_sinks")
    op.drop_table("artifact_sinks")

    op.drop_index("idx_artifact_links_target", table_name="artifact_links")
    op.drop_index("idx_artifact_links_artifact_link_type", table_name="artifact_links")
    op.drop_index("ix_artifact_links_version_id", table_name="artifact_links")
    op.drop_index("ix_artifact_links_artifact_id", table_name="artifact_links")
    op.drop_table("artifact_links")

    op.drop_index("ix_artifact_versions_source_evidence_packet_id", table_name="artifact_versions")
    op.drop_index("ix_artifact_versions_source_run_id", table_name="artifact_versions")
    op.drop_index("ix_artifact_versions_artifact_id", table_name="artifact_versions")
    op.drop_table("artifact_versions")

    op.drop_index("ix_artifacts_current_version_id", table_name="artifacts")
    op.drop_index("ix_artifacts_source_profile_id", table_name="artifacts")
    op.drop_index("ix_artifacts_source_workflow_id", table_name="artifacts")
    op.drop_index("idx_artifacts_workspace_visibility", table_name="artifacts")
    op.drop_index("idx_artifacts_workspace_type", table_name="artifacts")
    op.drop_index("idx_artifacts_workspace_status", table_name="artifacts")
    op.drop_column("artifacts", "tags")
    op.drop_column("artifacts", "created_by_id")
    op.drop_column("artifacts", "created_by_type")
    op.drop_column("artifacts", "current_version_id")
    op.drop_column("artifacts", "creation_mode")
    op.drop_column("artifacts", "visibility")
    op.drop_column("artifacts", "source_profile_id")
    op.drop_column("artifacts", "source_workflow_id")
