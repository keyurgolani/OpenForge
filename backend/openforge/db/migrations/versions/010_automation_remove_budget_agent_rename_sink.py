"""Remove budget_config and agent_id from automations, rename output_config to sink_config.

Per vision: automations are graph-only (no single-agent path),
budget is removed (not enforced), output becomes sink.

Revision ID: 010_automation_remove_budget_agent_rename_sink
Revises: 009_add_intelligence_categories
Create Date: 2026-03-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "010_automation_remove_budget_agent_rename_sink"
down_revision = "009_add_intelligence_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove single-agent automations (those with agent_id set but no graph)
    op.execute("""
        DELETE FROM automations
        WHERE agent_id IS NOT NULL
        AND graph_version = 0
    """)

    # Drop budget_config column
    op.drop_column("automations", "budget_config")

    # Drop agent_id column (and its index)
    op.drop_index("idx_automations_agent_id", table_name="automations")
    op.drop_constraint("automations_agent_id_fkey", "automations", type_="foreignkey")
    op.drop_column("automations", "agent_id")

    # Rename output_config to sink_config
    op.alter_column("automations", "output_config", new_column_name="sink_config")


def downgrade() -> None:
    # Rename sink_config back to output_config
    op.alter_column("automations", "sink_config", new_column_name="output_config")

    # Re-add agent_id column
    op.add_column(
        "automations",
        sa.Column("agent_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "automations_agent_id_fkey",
        "automations",
        "agents",
        ["agent_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("idx_automations_agent_id", "automations", ["agent_id"])

    # Re-add budget_config column
    op.add_column(
        "automations",
        sa.Column("budget_config", JSONB, nullable=False, server_default="{}"),
    )
