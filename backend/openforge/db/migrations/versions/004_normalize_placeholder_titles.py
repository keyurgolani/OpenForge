"""Normalize placeholder note titles to NULL.

Revision ID: 004
Revises: 003
Create Date: 2026-03-05
"""

from typing import Sequence, Union

from alembic import op


revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE notes
        SET title = NULL
        WHERE title IS NOT NULL AND btrim(lower(title)) = 'untitled'
        """
    )
    op.execute(
        """
        UPDATE notes
        SET ai_title = NULL
        WHERE ai_title IS NOT NULL AND btrim(lower(ai_title)) = 'untitled'
        """
    )


def downgrade() -> None:
    # Data normalization is irreversible.
    pass
