"""Observability and Evaluation

Revision ID: 012_phase13_observability_evaluation
Revises: 011_phase12_catalog_metadata
Create Date: 2026-03-15
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "012_phase13_observability_evaluation"
down_revision = "011_phase12_catalog_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── usage_records ──
    op.create_table(
        "usage_records",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("run_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("step_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("workflow_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("mission_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("profile_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("record_type", sa.String(50), nullable=False),
        sa.Column("model_name", sa.String(200), nullable=True),
        sa.Column("provider_name", sa.String(100), nullable=True),
        sa.Column("tool_name", sa.String(255), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reasoning_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_usage_records_run_created", "usage_records", ["run_id", "created_at"])
    op.create_index("idx_usage_records_ws_type_created", "usage_records", ["workspace_id", "record_type", "created_at"])
    op.create_index(
        "idx_usage_records_mission_created", "usage_records", ["mission_id", "created_at"],
        postgresql_where=sa.text("mission_id IS NOT NULL"),
    )

    # ── failure_events ──
    op.create_table(
        "failure_events",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("run_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("step_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("workflow_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("mission_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("trigger_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("failure_class", sa.String(100), nullable=False, index=True),
        sa.Column("error_code", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="error"),
        sa.Column("retryability", sa.String(20), nullable=False, server_default="not_retryable"),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("affected_node_key", sa.String(120), nullable=True),
        sa.Column("related_policy_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("related_approval_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_failure_events_ws_class_created", "failure_events", ["workspace_id", "failure_class", "created_at"])
    op.create_index("idx_failure_events_run_created", "failure_events", ["run_id", "created_at"])
    op.create_index(
        "idx_failure_events_mission_created", "failure_events", ["mission_id", "created_at"],
        postgresql_where=sa.text("mission_id IS NOT NULL"),
    )

    # ── evaluation_scenarios ──
    op.create_table(
        "evaluation_scenarios",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("suite_name", sa.String(100), nullable=False, index=True),
        sa.Column("scenario_type", sa.String(50), nullable=False, server_default="golden_task"),
        sa.Column("input_payload", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("expected_behaviors", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("expected_output_constraints", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("workflow_template_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("profile_template_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("mission_template_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("evaluation_metrics", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── evaluation_runs ──
    op.create_table(
        "evaluation_runs",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("suite_name", sa.String(100), nullable=True, index=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("scenario_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("passed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cost_usd", sa.Float(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("baseline_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── evaluation_results ──
    op.create_table(
        "evaluation_results",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("evaluation_run_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("evaluation_runs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("scenario_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("evaluation_scenarios.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("run_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("threshold_results", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("output_summary", sa.Text(), nullable=True),
        sa.Column("comparison_baseline", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("artifacts_produced", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("tokens_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── evaluation_baselines ──
    op.create_table(
        "evaluation_baselines",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("suite_name", sa.String(100), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_evaluation_run_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("evaluation_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("metrics_snapshot", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("thresholds", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("evaluation_baselines")
    op.drop_table("evaluation_results")
    op.drop_table("evaluation_runs")
    op.drop_table("evaluation_scenarios")

    op.drop_index("idx_failure_events_mission_created", "failure_events")
    op.drop_index("idx_failure_events_run_created", "failure_events")
    op.drop_index("idx_failure_events_ws_class_created", "failure_events")
    op.drop_table("failure_events")

    op.drop_index("idx_usage_records_mission_created", "usage_records")
    op.drop_index("idx_usage_records_ws_type_created", "usage_records")
    op.drop_index("idx_usage_records_run_created", "usage_records")
    op.drop_table("usage_records")
