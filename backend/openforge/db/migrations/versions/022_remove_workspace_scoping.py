"""Remove workspace_id scoping from workspace-agnostic entities.

Delete all rows from affected tables (dev environment clean slate), drop
workspace_id columns and associated FK constraints / indexes from
deployments, runs, trigger_definitions, conversations, agent_executions,
conversation_summaries, and hitl_requests.  Rename missions.workspace_id
to missions.owned_workspace_id.  Add workspaces.owner_mission_id.

Revision ID: 022_remove_workspace_scoping
Revises: 021_create_missions
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "022_remove_workspace_scoping"
down_revision = "021_create_missions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Truncate all affected tables (dev clean-slate) ──
    # CASCADE propagates to child tables (run_steps, runtime_events,
    # messages, mission_cycles, tool_call_logs, etc.).
    op.execute(sa.text(
        "TRUNCATE conversation_summaries, hitl_requests, agent_executions, "
        "trigger_definitions, runs, deployments, conversations, missions CASCADE"
    ))

    # ── 2. Drop workspace_id columns (with FK constraints and indexes) ──

    # --- deployments.workspace_id ---
    op.drop_constraint("deployments_workspace_id_fkey", "deployments", type_="foreignkey")
    op.drop_index("ix_deployments_workspace_id", table_name="deployments")
    op.drop_column("deployments", "workspace_id")

    # --- runs.workspace_id ---
    # runs.workspace_id has no FK constraint (plain UUID column)
    op.drop_index("idx_runs_workspace_status", table_name="runs")
    op.execute(sa.text("DROP INDEX IF EXISTS ix_runs_workspace_id"))
    op.drop_column("runs", "workspace_id")

    # --- trigger_definitions.workspace_id ---
    # No FK constraint, only an index
    op.drop_index("ix_trigger_definitions_workspace_id", table_name="trigger_definitions")
    op.drop_column("trigger_definitions", "workspace_id")

    # --- conversations.workspace_id ---
    op.drop_index("idx_conversations_workspace", table_name="conversations")
    op.drop_constraint("conversations_workspace_id_fkey", "conversations", type_="foreignkey")
    op.drop_column("conversations", "workspace_id")

    # --- agent_executions.workspace_id ---
    op.drop_index("idx_agent_exec_workspace", table_name="agent_executions")
    op.drop_constraint("agent_executions_workspace_id_fkey", "agent_executions", type_="foreignkey")
    op.drop_column("agent_executions", "workspace_id")

    # --- conversation_summaries.workspace_id ---
    op.execute(sa.text("DROP INDEX IF EXISTS ix_conversation_summaries_workspace_id"))
    op.drop_constraint("conversation_summaries_workspace_id_fkey", "conversation_summaries", type_="foreignkey")
    op.drop_column("conversation_summaries", "workspace_id")

    # --- hitl_requests.workspace_id ---
    op.drop_index("idx_hitl_requests_workspace_status", table_name="hitl_requests")
    op.drop_constraint("hitl_requests_workspace_id_fkey", "hitl_requests", type_="foreignkey")
    op.drop_column("hitl_requests", "workspace_id")

    # ── 3. Rename missions.workspace_id → missions.owned_workspace_id ──
    op.alter_column("missions", "workspace_id", new_column_name="owned_workspace_id")

    # ── 4. Add workspaces.owner_mission_id ──
    op.add_column(
        "workspaces",
        sa.Column(
            "owner_mission_id",
            UUID(as_uuid=True),
            nullable=True,
            comment="If ownership_type='mission', the mission that owns this workspace",
        ),
    )
    op.create_foreign_key(
        "fk_workspaces_owner_mission_id",
        "workspaces", "missions",
        ["owner_mission_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_workspaces_owner_mission_id", "workspaces", ["owner_mission_id"])


def downgrade() -> None:
    # ── Reverse 4: Drop workspaces.owner_mission_id ──
    op.drop_index("ix_workspaces_owner_mission_id", table_name="workspaces")
    op.drop_constraint("fk_workspaces_owner_mission_id", "workspaces", type_="foreignkey")
    op.drop_column("workspaces", "owner_mission_id")

    # ── Reverse 3: Rename missions.owned_workspace_id → missions.workspace_id ──
    op.alter_column("missions", "owned_workspace_id", new_column_name="workspace_id")

    # ── Reverse 2: Re-add workspace_id columns ──

    # --- hitl_requests.workspace_id ---
    op.add_column("hitl_requests", sa.Column("workspace_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "hitl_requests_workspace_id_fkey",
        "hitl_requests", "workspaces",
        ["workspace_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("idx_hitl_requests_workspace_status", "hitl_requests", ["workspace_id", "status"])

    # --- conversation_summaries.workspace_id ---
    op.add_column("conversation_summaries", sa.Column("workspace_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "conversation_summaries_workspace_id_fkey",
        "conversation_summaries", "workspaces",
        ["workspace_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_conversation_summaries_workspace_id", "conversation_summaries", ["workspace_id"])

    # --- agent_executions.workspace_id ---
    op.add_column("agent_executions", sa.Column("workspace_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "agent_executions_workspace_id_fkey",
        "agent_executions", "workspaces",
        ["workspace_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("idx_agent_exec_workspace", "agent_executions", ["workspace_id", "started_at"])

    # --- conversations.workspace_id ---
    op.add_column("conversations", sa.Column("workspace_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "conversations_workspace_id_fkey",
        "conversations", "workspaces",
        ["workspace_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("idx_conversations_workspace", "conversations", ["workspace_id", "updated_at"])

    # --- trigger_definitions.workspace_id ---
    op.add_column("trigger_definitions", sa.Column("workspace_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_trigger_definitions_workspace_id", "trigger_definitions", ["workspace_id"])

    # --- runs.workspace_id ---
    op.add_column("runs", sa.Column("workspace_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_runs_workspace_id", "runs", ["workspace_id"])
    op.create_index("idx_runs_workspace_status", "runs", ["workspace_id", "status"])

    # --- deployments.workspace_id ---
    op.add_column("deployments", sa.Column("workspace_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "deployments_workspace_id_fkey",
        "deployments", "workspaces",
        ["workspace_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_deployments_workspace_id", "deployments", ["workspace_id"])
