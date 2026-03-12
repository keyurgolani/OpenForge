"""add is_subagent to conversations and migrate existing subagent rows

Revision ID: 025_conversation_is_subagent
Revises: 024_rename_docx_pptx
Create Date: 2026-03-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "025_conversation_is_subagent"
down_revision: Union[str, None] = "024_rename_docx_pptx"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("conversations")]
    if "is_subagent" not in columns:
        op.add_column(
            "conversations",
            sa.Column("is_subagent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )

    # Migrate existing subagent conversations: mark them as subagent and un-archive
    conn.execute(
        sa.text(
            "UPDATE conversations SET is_subagent = true, is_archived = false, archived_at = NULL "
            "WHERE title LIKE '[subagent]%' AND is_archived = true"
        )
    )


def downgrade() -> None:
    # Move subagent conversations back to archived before dropping the column
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE conversations SET is_archived = true WHERE is_subagent = true"
        )
    )
    op.drop_column("conversations", "is_subagent")
