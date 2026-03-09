"""Add source_url column to message_attachments

Revision ID: 017_message_attachment_source_url
Revises: 016_message_is_interrupted
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa

revision = "017_attachment_source_url"
down_revision = "016_message_is_interrupted"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "message_attachments",
        sa.Column("source_url", sa.String(2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("message_attachments", "source_url")
