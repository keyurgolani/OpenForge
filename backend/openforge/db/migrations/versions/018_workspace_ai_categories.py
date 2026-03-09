"""Add per-category AI model overrides to workspaces

Revision ID: 018_workspace_ai_categories
Revises: 017_attachment_source_url
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa

revision = "018_workspace_ai_categories"
down_revision = "017_attachment_source_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column("knowledge_intelligence_provider_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "workspaces",
        sa.Column("knowledge_intelligence_model", sa.String(200), nullable=True),
    )
    op.add_column(
        "workspaces",
        sa.Column("vision_provider_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "workspaces",
        sa.Column("vision_model", sa.String(200), nullable=True),
    )
    op.create_foreign_key(
        "fk_workspaces_ki_provider",
        "workspaces", "llm_providers",
        ["knowledge_intelligence_provider_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_workspaces_vision_provider",
        "workspaces", "llm_providers",
        ["vision_provider_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_workspaces_vision_provider", "workspaces", type_="foreignkey")
    op.drop_constraint("fk_workspaces_ki_provider", "workspaces", type_="foreignkey")
    op.drop_column("workspaces", "vision_model")
    op.drop_column("workspaces", "vision_provider_id")
    op.drop_column("workspaces", "knowledge_intelligence_model")
    op.drop_column("workspaces", "knowledge_intelligence_provider_id")
