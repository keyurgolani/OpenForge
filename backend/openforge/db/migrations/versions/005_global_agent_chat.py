"""Add global agent chat support.

Makes conversations.workspace_id nullable and adds conversations.agent_id FK.

Revision ID: 005_global_agent_chat
Revises: 004_automation_graph
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "005_global_agent_chat"
down_revision = "004_automation_graph"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.alter_column("conversations", "workspace_id", existing_type=UUID, nullable=True)
    op.add_column("conversations", sa.Column(
        "agent_id", UUID,
        sa.ForeignKey("agents.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.create_index("ix_conversations_agent_id", "conversations", ["agent_id"])


def downgrade() -> None:
    op.drop_index("ix_conversations_agent_id", table_name="conversations")
    op.drop_column("conversations", "agent_id")
    op.alter_column("conversations", "workspace_id", existing_type=UUID, nullable=False)
