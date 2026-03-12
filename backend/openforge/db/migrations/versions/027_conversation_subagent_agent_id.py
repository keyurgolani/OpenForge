"""add subagent_agent_id column to conversations

Revision ID: 027_subagent_agent_id
Revises: 026_memory_schedules_targets
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "027_subagent_agent_id"
down_revision: Union[str, None] = "026_memory_schedules_targets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = [c["name"] for c in inspector.get_columns("conversations")]

    if "subagent_agent_id" not in existing_cols:
        op.add_column(
            "conversations",
            sa.Column("subagent_agent_id", sa.String(100), nullable=True),
        )
        # Backfill: existing subagent conversations are assumed to be workspace_agent
        op.execute(
            "UPDATE conversations SET subagent_agent_id = 'workspace_agent' WHERE is_subagent = true"
        )


def downgrade() -> None:
    op.drop_column("conversations", "subagent_agent_id")
