"""Rename knowledge types docx → document and pptx → slides.

Revision ID: 024_rename_docx_pptx
Revises: 023_rename_xlsx_to_sheet
"""
from alembic import op

revision = "024_rename_docx_pptx"
down_revision = "023_rename_xlsx_to_sheet"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE knowledge SET type = 'document' WHERE type = 'docx'")
    op.execute("UPDATE knowledge SET type = 'slides' WHERE type = 'pptx'")


def downgrade():
    op.execute("UPDATE knowledge SET type = 'docx' WHERE type = 'document'")
    op.execute("UPDATE knowledge SET type = 'pptx' WHERE type = 'slides'")
