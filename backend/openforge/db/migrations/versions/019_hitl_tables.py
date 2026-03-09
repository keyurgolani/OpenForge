"""Add HITL request table for human-in-the-loop tool approval flows

Revision ID: 019_hitl_tables
Revises: 018_workspace_ai_categories
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "019_hitl_tables"
down_revision = "018_workspace_ai_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hitl_requests",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "workspace_id", UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "conversation_id", UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("tool_id", sa.String(255), nullable=False),
        sa.Column("tool_input", JSONB, nullable=False),
        sa.Column("action_summary", sa.Text, nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False, server_default="high"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("resolution_note", sa.Text, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_hitl_requests_workspace_status", "hitl_requests", ["workspace_id", "status"])
    op.create_index("idx_hitl_requests_conversation", "hitl_requests", ["conversation_id"])
    op.create_index("idx_hitl_requests_status", "hitl_requests", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("idx_hitl_requests_status")
    op.drop_index("idx_hitl_requests_conversation")
    op.drop_index("idx_hitl_requests_workspace_status")
    op.drop_table("hitl_requests")
