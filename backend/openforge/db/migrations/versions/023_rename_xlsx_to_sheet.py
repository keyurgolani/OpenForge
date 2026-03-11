"""Rename knowledge type 'xlsx' to 'sheet'.

Revision ID: 023_rename_xlsx_to_sheet
Revises: 022_rename_standard_to_note
"""
from alembic import op

revision = "023_rename_xlsx_to_sheet"
down_revision = "022_rename_standard_to_note"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE knowledge SET type = 'sheet' WHERE type = 'xlsx'")


def downgrade() -> None:
    op.execute("UPDATE knowledge SET type = 'xlsx' WHERE type = 'sheet'")
