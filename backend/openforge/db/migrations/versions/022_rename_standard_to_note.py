"""Rename knowledge type 'standard' to 'note'.

Revision ID: 022_rename_standard_to_note
Revises: 021_agent_framework_tables
"""
from alembic import op

revision = "022_rename_standard_to_note"
down_revision = "021_agent_framework_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE knowledge SET type = 'note' WHERE type = 'standard'")
    op.execute("ALTER TABLE knowledge ALTER COLUMN type SET DEFAULT 'note'")


def downgrade() -> None:
    op.execute("UPDATE knowledge SET type = 'standard' WHERE type = 'note'")
    op.execute("ALTER TABLE knowledge ALTER COLUMN type SET DEFAULT 'standard'")
