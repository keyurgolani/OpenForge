"""Drop dead tables and vestigial columns from removed systems.

Removes tables and columns from the mission, workflow, agent profile,
agent memory, and checkpoint systems that were deprecated and never
actively used at runtime.

Revision ID: 016_drop_dead_tables_and_columns
Revises: 015_drop_strategy_plugins
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "016_drop_dead_tables_and_columns"
down_revision = "015_drop_strategy_plugins"
branch_labels = None
depends_on = None


def _drop_index_if_exists(name: str) -> None:
    """Drop an index only if it exists (avoids errors on missing indexes)."""
    op.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))


def upgrade() -> None:
    # Drop dead tables (cascade drops their indexes)
    op.drop_table("agent_memory")
    op.drop_table("agent_profiles")
    op.drop_table("checkpoints")

    # Drop vestigial workflow/mission columns from active tables
    # runs
    _drop_index_if_exists("ix_runs_workflow_id")
    op.drop_column("runs", "workflow_id")
    op.drop_column("runs", "workflow_version_id")
    _drop_index_if_exists("ix_runs_mission_id")
    op.drop_column("runs", "mission_id")

    # runtime_events
    _drop_index_if_exists("ix_runtime_events_workflow_id")
    op.drop_column("runtime_events", "workflow_id")
    op.drop_column("runtime_events", "workflow_version_id")

    # artifacts
    _drop_index_if_exists("ix_artifacts_source_workflow_id")
    op.drop_column("artifacts", "source_workflow_id")
    _drop_index_if_exists("ix_artifacts_source_mission_id")
    op.drop_column("artifacts", "source_mission_id")

    # trigger_fire_history
    op.drop_column("trigger_fire_history", "mission_id")

    # usage_records
    _drop_index_if_exists("ix_usage_records_workflow_id")
    op.drop_column("usage_records", "workflow_id")
    _drop_index_if_exists("ix_usage_records_mission_id")
    op.drop_column("usage_records", "mission_id")

    # failure_events
    _drop_index_if_exists("ix_failure_events_workflow_id")
    op.drop_column("failure_events", "workflow_id")
    _drop_index_if_exists("ix_failure_events_mission_id")
    op.drop_column("failure_events", "mission_id")


def downgrade() -> None:
    # Re-add columns (all nullable, so safe)
    op.add_column("failure_events", sa.Column("mission_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_failure_events_mission_id", "failure_events", ["mission_id"])
    op.add_column("failure_events", sa.Column("workflow_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_failure_events_workflow_id", "failure_events", ["workflow_id"])

    op.add_column("usage_records", sa.Column("mission_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_usage_records_mission_id", "usage_records", ["mission_id"])
    op.add_column("usage_records", sa.Column("workflow_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_usage_records_workflow_id", "usage_records", ["workflow_id"])

    op.add_column("trigger_fire_history", sa.Column("mission_id", UUID(as_uuid=True), nullable=True))

    op.add_column("artifacts", sa.Column("source_mission_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_artifacts_source_mission_id", "artifacts", ["source_mission_id"])
    op.add_column("artifacts", sa.Column("source_workflow_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_artifacts_source_workflow_id", "artifacts", ["source_workflow_id"])

    op.add_column("runtime_events", sa.Column("workflow_version_id", UUID(as_uuid=True), nullable=True))
    op.add_column("runtime_events", sa.Column("workflow_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_runtime_events_workflow_id", "runtime_events", ["workflow_id"])

    op.add_column("runs", sa.Column("mission_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_runs_mission_id", "runs", ["mission_id"])
    op.add_column("runs", sa.Column("workflow_version_id", UUID(as_uuid=True), nullable=True))
    op.add_column("runs", sa.Column("workflow_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_runs_workflow_id", "runs", ["workflow_id"])

    # Re-create dropped tables
    op.create_table(
        "checkpoints",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_id", UUID(as_uuid=True), sa.ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("checkpoint_type", sa.String(50), nullable=False, server_default="after_step"),
        sa.Column("state_snapshot", JSONB, nullable=False, server_default="{}"),
        sa.Column("metadata", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_checkpoints_run_created", "checkpoints", ["run_id", "created_at"])

    op.create_table(
        "agent_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("role", sa.String(50), server_default="assistant"),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_agent_profiles_slug", "agent_profiles", ["slug"])

    op.create_table(
        "agent_memory",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(100), nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("memory_type", sa.String(20), nullable=False, server_default="observation"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_agent_memory_workspace", "agent_memory", ["workspace_id", "is_active"])
    op.create_index("idx_agent_memory_agent", "agent_memory", ["agent_id", "is_active"])
