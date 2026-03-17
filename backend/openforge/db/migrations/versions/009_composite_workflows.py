"""Composite Workflows

Revision ID: 009_phase10_composite_workflows
Revises: 008_phase9_workflow_runtime
Create Date: 2026-03-15
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "009_phase10_composite_workflows"
down_revision = "008_phase9_workflow_runtime"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workflow_definitions", sa.Column("template_kind", sa.String(length=80), nullable=True))
    op.add_column(
        "workflow_definitions",
        sa.Column(
            "template_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    for table_name in ("runs",):
        op.add_column(table_name, sa.Column("delegation_mode", sa.String(length=50), nullable=True))
        op.add_column(table_name, sa.Column("merge_strategy", sa.String(length=100), nullable=True))
        op.add_column(table_name, sa.Column("join_group_id", sa.String(length=120), nullable=True))
        op.add_column(table_name, sa.Column("branch_key", sa.String(length=120), nullable=True))
        op.add_column(table_name, sa.Column("branch_index", sa.Integer(), nullable=True))
        op.add_column(table_name, sa.Column("handoff_reason", sa.Text(), nullable=True))
        op.add_column(
            table_name,
            sa.Column(
                "composite_metadata",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )

    for table_name in ("run_steps",):
        op.add_column(table_name, sa.Column("delegation_mode", sa.String(length=50), nullable=True))
        op.add_column(table_name, sa.Column("merge_strategy", sa.String(length=100), nullable=True))
        op.add_column(table_name, sa.Column("join_group_id", sa.String(length=120), nullable=True))
        op.add_column(table_name, sa.Column("branch_key", sa.String(length=120), nullable=True))
        op.add_column(table_name, sa.Column("branch_index", sa.Integer(), nullable=True))
        op.add_column(table_name, sa.Column("handoff_reason", sa.Text(), nullable=True))
        op.add_column(
            table_name,
            sa.Column(
                "composite_metadata",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )

    op.create_index("ix_runs_delegation_mode", "runs", ["delegation_mode"])
    op.create_index("ix_runs_join_group_id", "runs", ["join_group_id"])
    op.create_index("ix_run_steps_delegation_mode", "run_steps", ["delegation_mode"])
    op.create_index("ix_run_steps_join_group_id", "run_steps", ["join_group_id"])


def downgrade() -> None:
    op.drop_index("ix_run_steps_join_group_id", table_name="run_steps")
    op.drop_index("ix_run_steps_delegation_mode", table_name="run_steps")
    op.drop_index("ix_runs_join_group_id", table_name="runs")
    op.drop_index("ix_runs_delegation_mode", table_name="runs")

    for table_name in ("run_steps",):
        op.drop_column(table_name, "composite_metadata")
        op.drop_column(table_name, "handoff_reason")
        op.drop_column(table_name, "branch_index")
        op.drop_column(table_name, "branch_key")
        op.drop_column(table_name, "join_group_id")
        op.drop_column(table_name, "merge_strategy")
        op.drop_column(table_name, "delegation_mode")

    for table_name in ("runs",):
        op.drop_column(table_name, "composite_metadata")
        op.drop_column(table_name, "handoff_reason")
        op.drop_column(table_name, "branch_index")
        op.drop_column(table_name, "branch_key")
        op.drop_column(table_name, "join_group_id")
        op.drop_column(table_name, "merge_strategy")
        op.drop_column(table_name, "delegation_mode")

    op.drop_column("workflow_definitions", "template_metadata")
    op.drop_column("workflow_definitions", "template_kind")
