"""Remove sink_config from automations table.

Sinks are graph-level nodes, not automation-level configuration.

Revision ID: 011_remove_sink_config
Revises: 010_automation_remove_budget_agent_rename_sink
Create Date: 2026-03-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "011_remove_sink_config"
down_revision = "010_automation_remove_budget_agent_rename_sink"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("automations", "sink_config")


def downgrade() -> None:
    op.add_column(
        "automations",
        sa.Column("sink_config", JSONB, nullable=False, server_default="{}"),
    )
