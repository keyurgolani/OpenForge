"""Add task_logs table and enabled_models column

Revision ID: 002
Revises: 001
Create Date: 2026-03-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add enabled_models column to llm_providers if it doesn't exist
    # Use batch_alter to handle existing column gracefully
    from alembic import context
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('llm_providers')]

    if 'enabled_models' not in columns:
        op.add_column(
            "llm_providers",
            sa.Column(
                "enabled_models",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="[]",
            ),
        )

    # Create task_logs table (check if exists first)
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'task_logs' not in tables:
        op.create_table(
            "task_logs",
            sa.Column(
                "id",
                postgresql.UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column("task_type", sa.String(100), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column(
                "started_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("item_count", sa.Integer(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
        )
        op.create_index("idx_task_logs_started", "task_logs", ["started_at"])
        op.create_index("idx_task_logs_type", "task_logs", ["task_type", "started_at"])


def downgrade() -> None:
    op.drop_index("idx_task_logs_type", "task_logs")
    op.drop_index("idx_task_logs_started", "task_logs")
    op.drop_table("task_logs")
    op.drop_column("llm_providers", "enabled_models")
