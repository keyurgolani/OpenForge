"""Add file-based knowledge columns.

Revision ID: 020
Revises: 019
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("knowledge", sa.Column("file_path", sa.String(500), nullable=True))
    op.add_column("knowledge", sa.Column("file_size", sa.Integer(), nullable=True))
    op.add_column("knowledge", sa.Column("mime_type", sa.String(100), nullable=True))
    op.add_column("knowledge", sa.Column("thumbnail_path", sa.String(500), nullable=True))
    op.add_column("knowledge", sa.Column("file_metadata", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("knowledge", "file_metadata")
    op.drop_column("knowledge", "thumbnail_path")
    op.drop_column("knowledge", "mime_type")
    op.drop_column("knowledge", "file_size")
    op.drop_column("knowledge", "file_path")
