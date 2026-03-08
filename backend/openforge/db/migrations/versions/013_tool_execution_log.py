"""
Tool execution log table.

Adds:
- tool_execution_logs table for auditing tool calls made by the agent
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "013_tool_execution_log"
down_revision = "012_v25_schema"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tool_execution_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("execution_id", sa.String(200), nullable=True),
        sa.Column("tool_id", sa.String(200), nullable=False),
        sa.Column("tool_display_name", sa.String(200), nullable=True),
        sa.Column("tool_category", sa.String(100), nullable=True),
        sa.Column("input_params", postgresql.JSONB, nullable=True),
        sa.Column("output_summary", sa.Text, nullable=True),
        sa.Column("success", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_tool_exec_logs_workspace", "tool_execution_logs", ["workspace_id", "started_at"])
    op.create_index("idx_tool_exec_logs_tool", "tool_execution_logs", ["tool_id", "started_at"])


def downgrade():
    op.drop_index("idx_tool_exec_logs_tool", "tool_execution_logs")
    op.drop_index("idx_tool_exec_logs_workspace", "tool_execution_logs")
    op.drop_table("tool_execution_logs")
