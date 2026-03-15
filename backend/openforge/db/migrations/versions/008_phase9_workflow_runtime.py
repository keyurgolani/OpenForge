"""Phase 9 Workflow Runtime

Revision ID: 008_phase9_workflow_runtime
Revises: 007_phase8_artifact_unification
Create Date: 2026-03-15

Phase 9 turns workflow execution into a durable, inspectable runtime by adding:
- explicit workflow versions, nodes, and edges
- run lineage and current-node state
- durable run steps, checkpoints, and runtime events
- backfill of legacy inline workflow graphs into versioned workflow records
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "008_phase9_workflow_runtime"
down_revision = "007_phase8_artifact_unification"
branch_labels = None
depends_on = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_uuid(value: Any) -> uuid.UUID | None:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _resolve_node_id(reference: Any, *, by_key: dict[str, uuid.UUID], by_legacy_id: dict[str, uuid.UUID]) -> uuid.UUID | None:
    if reference is None:
        return None
    resolved = _coerce_uuid(reference)
    if resolved is not None and str(resolved) in by_legacy_id:
        return by_legacy_id[str(resolved)]
    return by_legacy_id.get(str(reference)) or by_key.get(str(reference))


def upgrade() -> None:
    op.add_column(
        "workflow_definitions",
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "workflow_definitions",
        sa.Column("current_version_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "workflow_definitions",
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "workflow_definitions",
        sa.Column("is_template", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_workflow_definitions_workspace_id", "workflow_definitions", ["workspace_id"])
    op.create_index("ix_workflow_definitions_current_version_id", "workflow_definitions", ["current_version_id"])
    op.create_index("idx_workflow_definitions_workspace_status", "workflow_definitions", ["workspace_id", "status"])

    op.create_table(
        "workflow_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "workflow_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_definitions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("state_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("entry_node_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("default_input_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("default_output_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("workflow_id", "version_number", name="uq_workflow_versions_workflow_version"),
    )
    op.create_index("ix_workflow_versions_workflow_id", "workflow_versions", ["workflow_id"])
    op.create_index("ix_workflow_versions_entry_node_id", "workflow_versions", ["entry_node_id"])

    op.create_table(
        "workflow_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "workflow_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("node_key", sa.String(length=120), nullable=False),
        sa.Column("node_type", sa.String(length=50), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("executor_ref", sa.String(length=150), nullable=True),
        sa.Column("input_mapping", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("output_mapping", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("workflow_version_id", "node_key", name="uq_workflow_nodes_version_key"),
    )
    op.create_index("ix_workflow_nodes_workflow_version_id", "workflow_nodes", ["workflow_version_id"])

    op.create_table(
        "workflow_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "workflow_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "from_node_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "to_node_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_nodes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("edge_type", sa.String(length=50), nullable=False, server_default="success"),
        sa.Column("condition", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_workflow_edges_workflow_version_id", "workflow_edges", ["workflow_version_id"])
    op.create_index("ix_workflow_edges_from_node_id", "workflow_edges", ["from_node_id"])
    op.create_index("ix_workflow_edges_to_node_id", "workflow_edges", ["to_node_id"])
    op.create_index("idx_workflow_edges_version_priority", "workflow_edges", ["workflow_version_id", "priority"])

    op.add_column(
        "runs",
        sa.Column("workflow_version_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "runs",
        sa.Column("root_run_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "runs",
        sa.Column("spawned_by_step_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "runs",
        sa.Column("current_node_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "runs",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "runs",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.add_column(
        "runs",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_runs_workflow_version_id", "runs", ["workflow_version_id"])
    op.create_index("ix_runs_root_run_id", "runs", ["root_run_id"])
    op.create_index("ix_runs_spawned_by_step_id", "runs", ["spawned_by_step_id"])
    op.create_index("ix_runs_current_node_id", "runs", ["current_node_id"])
    op.create_index("idx_runs_workspace_status", "runs", ["workspace_id", "status"])
    op.create_index("idx_runs_root_status", "runs", ["root_run_id", "status"])

    op.create_table(
        "run_steps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("node_key", sa.String(length=120), nullable=True),
        sa.Column("step_index", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="pending"),
        sa.Column("input_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("output_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("checkpoint_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("run_id", "step_index", name="uq_run_steps_run_step_index"),
    )
    op.create_index("ix_run_steps_run_id", "run_steps", ["run_id"])
    op.create_index("ix_run_steps_node_id", "run_steps", ["node_id"])
    op.create_index("ix_run_steps_checkpoint_id", "run_steps", ["checkpoint_id"])

    op.create_table(
        "checkpoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "step_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("run_steps.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("checkpoint_type", sa.String(length=50), nullable=False, server_default="after_step"),
        sa.Column("state_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_checkpoints_run_id", "checkpoints", ["run_id"])
    op.create_index("ix_checkpoints_step_id", "checkpoints", ["step_id"])
    op.create_index("idx_checkpoints_run_created", "checkpoints", ["run_id", "created_at"])

    op.create_table(
        "runtime_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "step_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("run_steps.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("workflow_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("node_key", sa.String(length=120), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_runtime_events_run_id", "runtime_events", ["run_id"])
    op.create_index("ix_runtime_events_step_id", "runtime_events", ["step_id"])
    op.create_index("ix_runtime_events_workflow_id", "runtime_events", ["workflow_id"])
    op.create_index("ix_runtime_events_workflow_version_id", "runtime_events", ["workflow_version_id"])
    op.create_index("ix_runtime_events_node_id", "runtime_events", ["node_id"])
    op.create_index("ix_runtime_events_event_type", "runtime_events", ["event_type"])
    op.create_index("idx_runtime_events_run_created", "runtime_events", ["run_id", "created_at"])

    bind = op.get_bind()
    workflow_definitions = sa.table(
        "workflow_definitions",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("workspace_id", postgresql.UUID(as_uuid=True)),
        sa.column("version", sa.Integer()),
        sa.column("entry_node", sa.String()),
        sa.column("state_schema", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("nodes", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("edges", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("default_input_schema", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("default_output_schema", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("status", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("current_version_id", postgresql.UUID(as_uuid=True)),
        sa.column("is_system", sa.Boolean()),
        sa.column("is_template", sa.Boolean()),
    )
    workflow_versions = sa.table(
        "workflow_versions",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("workflow_id", postgresql.UUID(as_uuid=True)),
        sa.column("version_number", sa.Integer()),
        sa.column("state_schema", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("entry_node_id", postgresql.UUID(as_uuid=True)),
        sa.column("default_input_schema", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("default_output_schema", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("status", sa.String()),
        sa.column("change_note", sa.Text()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    workflow_nodes = sa.table(
        "workflow_nodes",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("workflow_version_id", postgresql.UUID(as_uuid=True)),
        sa.column("node_key", sa.String()),
        sa.column("node_type", sa.String()),
        sa.column("label", sa.String()),
        sa.column("description", sa.Text()),
        sa.column("config", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("executor_ref", sa.String()),
        sa.column("input_mapping", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("output_mapping", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("status", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    workflow_edges = sa.table(
        "workflow_edges",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("workflow_version_id", postgresql.UUID(as_uuid=True)),
        sa.column("from_node_id", postgresql.UUID(as_uuid=True)),
        sa.column("to_node_id", postgresql.UUID(as_uuid=True)),
        sa.column("edge_type", sa.String()),
        sa.column("condition", postgresql.JSONB(astext_type=sa.Text())),
        sa.column("priority", sa.Integer()),
        sa.column("label", sa.String()),
        sa.column("status", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    runs = sa.table(
        "runs",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("parent_run_id", postgresql.UUID(as_uuid=True)),
        sa.column("workflow_version_id", postgresql.UUID(as_uuid=True)),
        sa.column("root_run_id", postgresql.UUID(as_uuid=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("started_at", sa.DateTime(timezone=True)),
        sa.column("completed_at", sa.DateTime(timezone=True)),
    )

    workflow_rows = bind.execute(
        sa.select(
            workflow_definitions.c.id,
            workflow_definitions.c.workspace_id,
            workflow_definitions.c.version,
            workflow_definitions.c.entry_node,
            workflow_definitions.c.state_schema,
            workflow_definitions.c.nodes,
            workflow_definitions.c.edges,
            workflow_definitions.c.default_input_schema,
            workflow_definitions.c.default_output_schema,
            workflow_definitions.c.status,
            workflow_definitions.c.created_at,
            workflow_definitions.c.updated_at,
        )
    ).fetchall()

    for row in workflow_rows:
        version_id = uuid.uuid4()
        created_at = row.created_at or _now()
        updated_at = row.updated_at or created_at
        legacy_nodes = row.nodes or []
        legacy_edges = row.edges or []
        by_key: dict[str, uuid.UUID] = {}
        by_legacy_id: dict[str, uuid.UUID] = {}
        normalized_nodes: list[dict[str, Any]] = []

        for index, raw_node in enumerate(legacy_nodes):
            node = raw_node or {}
            node_id = _coerce_uuid(node.get("id")) or uuid.uuid4()
            node_key = str(node.get("node_key") or node.get("key") or node.get("name") or f"node_{index + 1}")
            legacy_id = node.get("id")
            if legacy_id is not None:
                by_legacy_id[str(legacy_id)] = node_id
            by_key[node_key] = node_id
            normalized_nodes.append(
                {
                    "id": node_id,
                    "workflow_version_id": version_id,
                    "node_key": node_key,
                    "node_type": node.get("node_type") or node.get("type") or "tool",
                    "label": node.get("label") or node_key.replace(".", " ").title(),
                    "description": node.get("description"),
                    "config": node.get("config") or {},
                    "executor_ref": node.get("executor_ref"),
                    "input_mapping": node.get("input_mapping") or {},
                    "output_mapping": node.get("output_mapping") or {},
                    "status": node.get("status") or "active",
                    "created_at": created_at,
                    "updated_at": updated_at,
                }
            )

        entry_node_id = _resolve_node_id(row.entry_node, by_key=by_key, by_legacy_id=by_legacy_id)
        if entry_node_id is None and normalized_nodes:
            entry_node_id = normalized_nodes[0]["id"]

        bind.execute(
            workflow_versions.insert().values(
                id=version_id,
                workflow_id=row.id,
                version_number=row.version or 1,
                state_schema=row.state_schema or {},
                entry_node_id=entry_node_id,
                default_input_schema=row.default_input_schema or {},
                default_output_schema=row.default_output_schema or {},
                status=row.status or "draft",
                change_note="Phase 9 backfill from legacy inline workflow graph",
                created_at=created_at,
                updated_at=updated_at,
            )
        )

        for node in normalized_nodes:
            bind.execute(workflow_nodes.insert().values(**node))

        for raw_edge in legacy_edges:
            edge = raw_edge or {}
            from_reference = (
                edge.get("from_node_id")
                or edge.get("from")
                or edge.get("source")
                or edge.get("from_node_key")
            )
            to_reference = (
                edge.get("to_node_id")
                or edge.get("to")
                or edge.get("target")
                or edge.get("to_node_key")
            )
            from_node_id = _resolve_node_id(from_reference, by_key=by_key, by_legacy_id=by_legacy_id)
            to_node_id = _resolve_node_id(to_reference, by_key=by_key, by_legacy_id=by_legacy_id)
            if from_node_id is None or to_node_id is None:
                continue
            bind.execute(
                workflow_edges.insert().values(
                    id=_coerce_uuid(edge.get("id")) or uuid.uuid4(),
                    workflow_version_id=version_id,
                    from_node_id=from_node_id,
                    to_node_id=to_node_id,
                    edge_type=edge.get("edge_type") or edge.get("type") or "success",
                    condition=edge.get("condition") or {},
                    priority=edge.get("priority") or 100,
                    label=edge.get("label"),
                    status=edge.get("status") or "active",
                    created_at=created_at,
                    updated_at=updated_at,
                )
            )

        bind.execute(
            workflow_definitions.update()
            .where(workflow_definitions.c.id == row.id)
            .values(
                current_version_id=version_id,
                is_system=False,
                is_template=False,
            )
        )

    run_rows = bind.execute(
        sa.select(
            runs.c.id,
            runs.c.parent_run_id,
            runs.c.started_at,
            runs.c.completed_at,
        )
    ).fetchall()
    parent_by_id = {row.id: row.parent_run_id for row in run_rows}

    def resolve_root_run_id(run_id: uuid.UUID) -> uuid.UUID:
        current = run_id
        seen: set[uuid.UUID] = set()
        while current not in seen:
            seen.add(current)
            parent = parent_by_id.get(current)
            if parent is None:
                return current
            current = parent
        return run_id

    for row in run_rows:
        created_at = row.started_at or row.completed_at or _now()
        updated_at = row.completed_at or created_at
        bind.execute(
            runs.update()
            .where(runs.c.id == row.id)
            .values(
                root_run_id=resolve_root_run_id(row.id),
                created_at=created_at,
                updated_at=updated_at,
            )
        )


def downgrade() -> None:
    op.drop_index("idx_runtime_events_run_created", table_name="runtime_events")
    op.drop_index("ix_runtime_events_event_type", table_name="runtime_events")
    op.drop_index("ix_runtime_events_node_id", table_name="runtime_events")
    op.drop_index("ix_runtime_events_workflow_version_id", table_name="runtime_events")
    op.drop_index("ix_runtime_events_workflow_id", table_name="runtime_events")
    op.drop_index("ix_runtime_events_step_id", table_name="runtime_events")
    op.drop_index("ix_runtime_events_run_id", table_name="runtime_events")
    op.drop_table("runtime_events")

    op.drop_index("idx_checkpoints_run_created", table_name="checkpoints")
    op.drop_index("ix_checkpoints_step_id", table_name="checkpoints")
    op.drop_index("ix_checkpoints_run_id", table_name="checkpoints")
    op.drop_table("checkpoints")

    op.drop_index("ix_run_steps_checkpoint_id", table_name="run_steps")
    op.drop_index("ix_run_steps_node_id", table_name="run_steps")
    op.drop_index("ix_run_steps_run_id", table_name="run_steps")
    op.drop_table("run_steps")

    op.drop_index("idx_runs_root_status", table_name="runs")
    op.drop_index("idx_runs_workspace_status", table_name="runs")
    op.drop_index("ix_runs_current_node_id", table_name="runs")
    op.drop_index("ix_runs_spawned_by_step_id", table_name="runs")
    op.drop_index("ix_runs_root_run_id", table_name="runs")
    op.drop_index("ix_runs_workflow_version_id", table_name="runs")
    op.drop_column("runs", "updated_at")
    op.drop_column("runs", "created_at")
    op.drop_column("runs", "cancelled_at")
    op.drop_column("runs", "current_node_id")
    op.drop_column("runs", "spawned_by_step_id")
    op.drop_column("runs", "root_run_id")
    op.drop_column("runs", "workflow_version_id")

    op.drop_index("idx_workflow_edges_version_priority", table_name="workflow_edges")
    op.drop_index("ix_workflow_edges_to_node_id", table_name="workflow_edges")
    op.drop_index("ix_workflow_edges_from_node_id", table_name="workflow_edges")
    op.drop_index("ix_workflow_edges_workflow_version_id", table_name="workflow_edges")
    op.drop_table("workflow_edges")

    op.drop_index("ix_workflow_nodes_workflow_version_id", table_name="workflow_nodes")
    op.drop_table("workflow_nodes")

    op.drop_index("ix_workflow_versions_entry_node_id", table_name="workflow_versions")
    op.drop_index("ix_workflow_versions_workflow_id", table_name="workflow_versions")
    op.drop_table("workflow_versions")

    op.drop_index("idx_workflow_definitions_workspace_status", table_name="workflow_definitions")
    op.drop_index("ix_workflow_definitions_current_version_id", table_name="workflow_definitions")
    op.drop_index("ix_workflow_definitions_workspace_id", table_name="workflow_definitions")
    op.drop_column("workflow_definitions", "is_template")
    op.drop_column("workflow_definitions", "is_system")
    op.drop_column("workflow_definitions", "current_version_id")
    op.drop_column("workflow_definitions", "workspace_id")
