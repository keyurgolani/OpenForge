"""add agent tools support: tool_calls/provider_metadata on messages, agent fields on workspaces

Revision ID: 011_agent_tools
Revises: 010_msg_attach_nullable_mid
Create Date: 2026-03-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "011_agent_tools"
down_revision: Union[str, None] = "010_msg_attach_nullable_mid"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    msg_columns = {col["name"] for col in inspector.get_columns("messages")}
    if "tool_calls" not in msg_columns:
        op.add_column("messages", sa.Column("tool_calls", postgresql.JSONB(), nullable=True))
    if "provider_metadata" not in msg_columns:
        op.add_column("messages", sa.Column("provider_metadata", postgresql.JSONB(), nullable=True))

    ws_columns = {col["name"] for col in inspector.get_columns("workspaces")}
    if "agent_enabled" not in ws_columns:
        op.add_column(
            "workspaces",
            sa.Column("agent_enabled", sa.Boolean(), nullable=False, server_default="false"),
        )
    if "agent_tool_categories" not in ws_columns:
        op.add_column(
            "workspaces",
            sa.Column("agent_tool_categories", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'")),
        )


def downgrade() -> None:
    op.drop_column("workspaces", "agent_tool_categories")
    op.drop_column("workspaces", "agent_enabled")
    op.drop_column("messages", "provider_metadata")
    op.drop_column("messages", "tool_calls")
