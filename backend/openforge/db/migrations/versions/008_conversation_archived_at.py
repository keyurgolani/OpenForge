"""add archived_at to conversations

Revision ID: 008_conversation_archived_at
Revises: 007_message_thinking
Create Date: 2026-03-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "008_conversation_archived_at"
down_revision: Union[str, None] = "007_message_thinking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("conversations")]
    if "archived_at" not in columns:
        op.add_column("conversations", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("conversations", "archived_at")
