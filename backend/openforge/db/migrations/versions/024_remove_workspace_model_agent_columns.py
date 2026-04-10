"""Remove workspace model and per-workspace agent columns.

Revision ID: 024_remove_workspace_model_agent_columns
Revises: 023_add_workspace_pipeline_config
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "024_remove_workspace_model_agent_columns"
down_revision = "023_add_workspace_pipeline_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("workspaces", "llm_provider_id")
    op.drop_column("workspaces", "llm_model")
    op.drop_column("workspaces", "knowledge_intelligence_provider_id")
    op.drop_column("workspaces", "knowledge_intelligence_model")
    op.drop_column("workspaces", "vision_provider_id")
    op.drop_column("workspaces", "vision_model")
    op.drop_index("ix_workspaces_default_agent_id", table_name="workspaces")
    op.drop_column("workspaces", "default_agent_id")
    op.drop_column("workspaces", "agent_id")
    op.drop_column("workspaces", "agent_enabled")
    op.drop_column("workspaces", "agent_tool_categories")
    op.drop_column("workspaces", "agent_max_tool_loops")


def downgrade() -> None:
    op.add_column("workspaces", sa.Column("llm_provider_id", UUID(as_uuid=True), nullable=True))
    op.add_column("workspaces", sa.Column("llm_model", sa.String(200), nullable=True))
    op.add_column("workspaces", sa.Column("knowledge_intelligence_provider_id", UUID(as_uuid=True), nullable=True))
    op.add_column("workspaces", sa.Column("knowledge_intelligence_model", sa.String(200), nullable=True))
    op.add_column("workspaces", sa.Column("vision_provider_id", UUID(as_uuid=True), nullable=True))
    op.add_column("workspaces", sa.Column("vision_model", sa.String(200), nullable=True))
    op.add_column("workspaces", sa.Column("default_agent_id", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_workspaces_default_agent_id", "workspaces", ["default_agent_id"])
    op.add_column("workspaces", sa.Column("agent_id", sa.String(100), nullable=True))
    op.add_column("workspaces", sa.Column("agent_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("workspaces", sa.Column("agent_tool_categories", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column("workspaces", sa.Column("agent_max_tool_loops", sa.Integer(), server_default=sa.text("20"), nullable=False))
    # Re-create foreign key constraints
    op.create_foreign_key("workspaces_llm_provider_id_fkey", "workspaces", "llm_providers", ["llm_provider_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("workspaces_knowledge_intelligence_provider_id_fkey", "workspaces", "llm_providers", ["knowledge_intelligence_provider_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("workspaces_vision_provider_id_fkey", "workspaces", "llm_providers", ["vision_provider_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_workspaces_default_agent_id", "workspaces", "agents", ["default_agent_id"], ["id"], ondelete="SET NULL")
