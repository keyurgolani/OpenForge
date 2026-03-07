"""make message_attachments.message_id nullable for pre-message uploads

Revision ID: 010_msg_attach_nullable_mid
Revises: 009_task_log_target_link
Create Date: 2026-03-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "010_msg_attach_nullable_mid"
down_revision: Union[str, None] = "009_task_log_target_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {col["name"]: col for col in inspector.get_columns("message_attachments")}
    message_id = columns.get("message_id")
    if message_id and message_id.get("nullable") is False:
        op.alter_column(
            "message_attachments",
            "message_id",
            existing_type=postgresql.UUID(as_uuid=True),
            nullable=True,
        )


def downgrade() -> None:
    op.alter_column(
        "message_attachments",
        "message_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
