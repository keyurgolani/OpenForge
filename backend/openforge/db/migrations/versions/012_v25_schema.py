"""
v2.5 Schema Migration

Adds:
- provider_metadata JSONB column to messages table
- tools_enabled BOOLEAN column to workspaces table
- agent_id VARCHAR(100) column to workspaces table
- agent_definitions table
- llm_optimizer_config table
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "012_v25_schema"
down_revision = "011_v2_schema"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add provider_metadata to messages
    op.add_column(
        "messages",
        sa.Column("provider_metadata", postgresql.JSONB, nullable=True)
    )

    # 2. Add tools_enabled and agent_id to workspaces
    op.add_column(
        "workspaces",
        sa.Column("tools_enabled", sa.Boolean, nullable=False, server_default="false")
    )
    op.add_column(
        "workspaces",
        sa.Column("agent_id", sa.String(100), nullable=True)
    )

    # 3. Create agent_definitions table
    op.create_table(
        "agent_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("agent_id", sa.String(100), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("system_prompt", sa.Text, nullable=False),
        sa.Column("tools_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("rag_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("rag_limit", sa.Integer, nullable=False, server_default="5"),
        sa.Column("rag_score_threshold", sa.Float, nullable=False, server_default="0.3"),
        sa.Column("history_limit", sa.Integer, nullable=False, server_default="20"),
        sa.Column("max_iterations", sa.Integer, nullable=False, server_default="10"),
        sa.Column("allowed_tool_categories", postgresql.JSONB, nullable=True),
        sa.Column("allowed_tool_ids", postgresql.JSONB, nullable=True),
        sa.Column("skill_hints", postgresql.JSONB, nullable=True),
        sa.Column("attachment_support", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("auto_bookmark_urls", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 4. Create llm_optimizer_config table
    op.create_table(
        "llm_optimizer_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "llm_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id", ondelete="CASCADE"),
            nullable=False,
            unique=True
        ),
        sa.Column(
            "optimizer_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id"),
            nullable=False
        ),
        sa.Column("optimizer_model", sa.String(200), nullable=False),
        sa.Column(
            "target_provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("llm_providers.id"),
            nullable=False
        ),
        sa.Column("target_model", sa.String(200), nullable=False),
        sa.Column("optimization_prompt", sa.Text, nullable=True),
        sa.Column("additional_context", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("llm_optimizer_config")
    op.drop_table("agent_definitions")
    op.drop_column("workspaces", "agent_id")
    op.drop_column("workspaces", "tools_enabled")
    op.drop_column("messages", "provider_metadata")
