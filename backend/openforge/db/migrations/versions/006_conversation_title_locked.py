"""add title_locked to conversations

Revision ID: 006
Revises: 005_message_generation_ms
Create Date: 2026-03-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006"
down_revision: Union[str, None] = "005_message_generation_ms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("conversations")]
    if "title_locked" not in columns:
        op.add_column(
            "conversations",
            sa.Column("title_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    # Backfill complete; remove server default to match model-level default behavior.
    op.alter_column("conversations", "title_locked", server_default=None)


def downgrade() -> None:
    op.drop_column("conversations", "title_locked")
