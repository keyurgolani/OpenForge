"""add agent_id column to hitl_requests

Revision ID: 028_hitl_agent_id
Revises: 027_subagent_agent_id
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "028_hitl_agent_id"
down_revision: Union[str, None] = "027_subagent_agent_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = [c["name"] for c in inspector.get_columns("hitl_requests")]

    if "agent_id" not in existing_cols:
        op.add_column(
            "hitl_requests",
            sa.Column("agent_id", sa.String(100), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("hitl_requests", "agent_id")
