"""Add is_interrupted column to messages

Revision ID: 016_message_is_interrupted
Revises: 015_agent_max_loops
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa

revision = "016_message_is_interrupted"
down_revision = "015_agent_max_loops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("is_interrupted", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("messages", "is_interrupted")
