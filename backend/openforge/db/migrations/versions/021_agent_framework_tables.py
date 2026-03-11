"""Add agent framework tables: agent_definitions, agent_executions, tool_permissions, workspace agent_id.

Revision ID: 021_agent_framework_tables
Revises: 020_knowledge_file_columns
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "021_agent_framework_tables"
down_revision = "020_knowledge_file_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Agent definitions table
    op.create_table(
        "agent_definitions",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("config", JSONB(), nullable=False, server_default="{}"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("icon", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Agent executions table
    op.create_table(
        "agent_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("iteration_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tool_calls_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("token_usage", JSONB(), nullable=True),
        sa.Column("timeline", JSONB(), nullable=False, server_default="[]"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_agent_exec_workspace", "agent_executions", ["workspace_id", "started_at"])
    op.create_index(
        "idx_agent_exec_status",
        "agent_executions",
        ["status"],
        postgresql_where=sa.text("status IN ('running', 'paused_hitl', 'queued')"),
    )

    # Tool permissions table
    op.create_table(
        "tool_permissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tool_id", sa.String(200), nullable=False, unique=True),
        sa.Column("permission", sa.String(20), nullable=False, server_default="default"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Add agent_id to workspaces
    op.add_column("workspaces", sa.Column("agent_id", sa.String(100), nullable=True, server_default="workspace_agent"))


def downgrade() -> None:
    op.drop_column("workspaces", "agent_id")
    op.drop_table("tool_permissions")
    op.drop_index("idx_agent_exec_status", table_name="agent_executions")
    op.drop_index("idx_agent_exec_workspace", table_name="agent_executions")
    op.drop_table("agent_executions")
    op.drop_table("agent_definitions")
