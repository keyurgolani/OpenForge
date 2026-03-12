"""add agent_memory, agent_schedules, and continuous_targets tables

Revision ID: 026_memory_schedules_targets
Revises: 025_conversation_is_subagent
Create Date: 2026-03-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "026_memory_schedules_targets"
down_revision: Union[str, None] = "025_conversation_is_subagent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "agent_memory" not in existing_tables:
        op.create_table(
            "agent_memory",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("agent_id", sa.String(100), nullable=True),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("memory_type", sa.String(20), nullable=False, server_default="observation"),
            sa.Column("decay_rate", sa.Float(), nullable=False, server_default="0.01"),
            sa.Column("confidence", sa.Float(), nullable=False, server_default="1.0"),
            sa.Column("access_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_agent_memory_workspace", "agent_memory", ["workspace_id", "is_active"])
        op.create_index("idx_agent_memory_agent", "agent_memory", ["agent_id", "is_active"])

    if "agent_schedules" not in existing_tables:
        op.create_table(
            "agent_schedules",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("agent_id", sa.String(100), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("instruction", sa.Text(), nullable=False),
            sa.Column("cron_expression", sa.String(100), nullable=False),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_agent_schedules_workspace", "agent_schedules", ["workspace_id"])
        op.create_index("idx_agent_schedules_next_run", "agent_schedules", ["is_enabled", "next_run_at"])

    if "continuous_targets" not in existing_tables:
        op.create_table(
            "continuous_targets",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("knowledge_id", UUID(as_uuid=True), sa.ForeignKey("knowledge.id", ondelete="SET NULL"), nullable=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("workspace_id", "name", name="uq_continuous_target_name"),
        )


def downgrade() -> None:
    op.drop_table("continuous_targets")
    op.drop_table("agent_schedules")
    op.drop_table("agent_memory")
