"""Add timeline JSONB column to messages

Revision ID: 014_message_timeline
Revises: 013_mcp_servers
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "014_message_timeline"
down_revision = "013_mcp_servers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("timeline", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "timeline")
