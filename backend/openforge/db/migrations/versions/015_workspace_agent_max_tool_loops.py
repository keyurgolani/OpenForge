"""Add agent_max_tool_loops column to workspaces

Revision ID: 015_workspace_agent_max_tool_loops
Revises: 014_message_timeline
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "015_agent_max_loops"
down_revision = "014_message_timeline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column("agent_max_tool_loops", sa.Integer(), nullable=False, server_default="20"),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "agent_max_tool_loops")
