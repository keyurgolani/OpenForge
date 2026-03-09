"""tool_call_logs table

Revision ID: 012_tool_call_logs
Revises: 011_agent_tools
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "012_tool_call_logs"
down_revision = "011_agent_tools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "tool_call_logs" not in tables:
        op.create_table(
            "tool_call_logs",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "workspace_id",
                UUID(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column(
                "conversation_id",
                UUID(as_uuid=True),
                sa.ForeignKey("conversations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("call_id", sa.String(255), nullable=False),
            sa.Column("tool_name", sa.String(255), nullable=False),
            sa.Column("arguments", JSONB, nullable=True),
            sa.Column("success", sa.Boolean, nullable=True),
            sa.Column("output", sa.Text, nullable=True),
            sa.Column("error", sa.Text, nullable=True),
            sa.Column("duration_ms", sa.Integer, nullable=True),
            sa.Column(
                "started_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index(
            "idx_tool_call_logs_conv", "tool_call_logs", ["conversation_id", "started_at"]
        )
        op.create_index(
            "idx_tool_call_logs_ws", "tool_call_logs", ["workspace_id", "started_at"]
        )
        op.create_index(
            "idx_tool_call_logs_name", "tool_call_logs", ["tool_name", "started_at"]
        )


def downgrade() -> None:
    op.drop_index("idx_tool_call_logs_name", table_name="tool_call_logs")
    op.drop_index("idx_tool_call_logs_ws", table_name="tool_call_logs")
    op.drop_index("idx_tool_call_logs_conv", table_name="tool_call_logs")
    op.drop_table("tool_call_logs")
