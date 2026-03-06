"""add target_link to task_logs

Revision ID: 009_task_log_target_link
Revises: 008_conversation_archived_at
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009_task_log_target_link"
down_revision: Union[str, None] = "008_conversation_archived_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("task_logs")]
    if "target_link" not in columns:
        op.add_column("task_logs", sa.Column("target_link", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("task_logs", "target_link")
