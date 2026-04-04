"""Create missions and mission_cycles tables, add mission_id to runs.

Revision ID: 021_create_missions
Revises: 020_deployment_workspaces
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "021_create_missions"
down_revision = "020_deployment_workspaces"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "missions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("icon", sa.String(100), nullable=True),
        sa.Column("tags", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("goal", sa.Text, nullable=False),
        sa.Column("directives", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("constraints", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("rubric", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("termination_conditions", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("autonomous_agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("agent_access", JSONB, nullable=False, server_default=sa.text("'{\"mode\": \"all\"}'::jsonb")),
        sa.Column("tool_overrides", JSONB, nullable=True),
        sa.Column("phase_sinks", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cadence", JSONB, nullable=True),
        sa.Column("budget", JSONB, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("current_plan", JSONB, nullable=True),
        sa.Column("cycle_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tokens_used", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cost_estimate", sa.Float, nullable=False, server_default="0"),
        sa.Column("last_cycle_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_cycle_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_missions_status_next_cycle", "missions", ["status", "next_cycle_at"])
    op.create_index("ix_missions_slug", "missions", ["slug"], unique=True)

    op.create_table(
        "mission_cycles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("mission_id", UUID(as_uuid=True), sa.ForeignKey("missions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cycle_number", sa.Integer, nullable=False),
        sa.Column("phase", sa.String(20), nullable=False, server_default="perceive"),
        sa.Column("phase_summaries", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("actions_log", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("evaluation_scores", JSONB, nullable=True),
        sa.Column("ratchet_passed", sa.Boolean, nullable=True),
        sa.Column("next_cycle_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_cycle_reason", sa.String(500), nullable=True),
        sa.Column("primary_run_id", UUID(as_uuid=True), sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tokens_used", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cost_estimate", sa.Float, nullable=False, server_default="0"),
        sa.Column("duration_seconds", sa.Float, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_mission_cycles_mission_status", "mission_cycles", ["mission_id", "status"])
    op.create_unique_constraint("uq_mission_cycles_mission_number", "mission_cycles", ["mission_id", "cycle_number"])

    # Add mission_id FK to runs table
    op.add_column("runs", sa.Column("mission_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_runs_mission_id",
        "runs", "missions",
        ["mission_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_runs_mission_id", "runs", ["mission_id"])


def downgrade() -> None:
    op.drop_index("ix_runs_mission_id", table_name="runs")
    op.drop_constraint("fk_runs_mission_id", "runs", type_="foreignkey")
    op.drop_column("runs", "mission_id")
    op.drop_table("mission_cycles")
    op.drop_table("missions")
