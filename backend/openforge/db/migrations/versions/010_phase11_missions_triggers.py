"""Phase 11 Missions and Triggers

Revision ID: 010_phase11_missions_triggers
Revises: 009_phase10_composite_workflows
Create Date: 2026-03-15
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "010_phase11_missions_triggers"
down_revision = "009_phase10_composite_workflows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Mission Definition expansions ──
    op.add_column("mission_definitions", sa.Column("workspace_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("idx_mission_definitions_workspace_id", "mission_definitions", ["workspace_id"])
    op.add_column("mission_definitions", sa.Column("workflow_version_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("mission_definitions", sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("mission_definitions", sa.Column("is_template", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("mission_definitions", sa.Column("recommended_use_case", sa.Text(), nullable=True))
    # Health metadata
    op.add_column("mission_definitions", sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("mission_definitions", sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("mission_definitions", sa.Column("last_failure_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("mission_definitions", sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("mission_definitions", sa.Column("health_status", sa.String(50), server_default="unknown", nullable=True))
    op.add_column("mission_definitions", sa.Column("last_error_summary", sa.Text(), nullable=True))

    # ── Trigger Definition expansions ──
    op.add_column("trigger_definitions", sa.Column("workspace_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("idx_trigger_definitions_workspace_id", "trigger_definitions", ["workspace_id"])
    op.add_column("trigger_definitions", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("trigger_definitions", sa.Column("interval_seconds", sa.Integer(), nullable=True))
    op.add_column("trigger_definitions", sa.Column("event_type", sa.String(100), nullable=True))
    op.add_column("trigger_definitions", sa.Column("last_fired_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("trigger_definitions", sa.Column("next_fire_at", sa.DateTime(timezone=True), nullable=True))

    # ── Trigger fire history table ──
    op.create_table(
        "trigger_fire_history",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("trigger_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("mission_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("run_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("fired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("launch_status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    # ── Mission budget policy table ──
    op.create_table(
        "mission_budget_policies",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("max_runs_per_day", sa.Integer(), nullable=True),
        sa.Column("max_runs_per_window", sa.Integer(), nullable=True),
        sa.Column("window_seconds", sa.Integer(), nullable=True),
        sa.Column("max_concurrent_runs", sa.Integer(), nullable=True),
        sa.Column("max_token_budget_per_window", sa.Integer(), nullable=True),
        sa.Column("cooldown_seconds_after_failure", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── Run table: add trigger_id for trigger-to-run traceability ──
    op.add_column("runs", sa.Column("trigger_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True))


def downgrade() -> None:
    op.drop_column("runs", "trigger_id")
    op.drop_table("mission_budget_policies")
    op.drop_table("trigger_fire_history")
    op.drop_column("trigger_definitions", "next_fire_at")
    op.drop_column("trigger_definitions", "last_fired_at")
    op.drop_column("trigger_definitions", "event_type")
    op.drop_column("trigger_definitions", "interval_seconds")
    op.drop_column("trigger_definitions", "description")
    op.drop_index("idx_trigger_definitions_workspace_id", "trigger_definitions")
    op.drop_column("trigger_definitions", "workspace_id")
    op.drop_column("mission_definitions", "last_error_summary")
    op.drop_column("mission_definitions", "health_status")
    op.drop_column("mission_definitions", "last_triggered_at")
    op.drop_column("mission_definitions", "last_failure_at")
    op.drop_column("mission_definitions", "last_success_at")
    op.drop_column("mission_definitions", "last_run_at")
    op.drop_column("mission_definitions", "recommended_use_case")
    op.drop_column("mission_definitions", "is_template")
    op.drop_column("mission_definitions", "is_system")
    op.drop_column("mission_definitions", "workflow_version_id")
    op.drop_index("idx_mission_definitions_workspace_id", "mission_definitions")
    op.drop_column("mission_definitions", "workspace_id")
