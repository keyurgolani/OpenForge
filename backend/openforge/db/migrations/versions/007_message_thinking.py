"""add thinking to messages

Revision ID: 007_message_thinking
Revises: 006
Create Date: 2026-03-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007_message_thinking"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("messages")]
    if "thinking" not in columns:
        op.add_column("messages", sa.Column("thinking", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "thinking")
