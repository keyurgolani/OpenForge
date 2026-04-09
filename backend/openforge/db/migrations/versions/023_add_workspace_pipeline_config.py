"""Add pipeline_config JSONB column to workspaces table.

Revision ID: 023_add_workspace_pipeline_config
Revises: 022_remove_workspace_scoping
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "023_add_workspace_pipeline_config"
down_revision = "022_remove_workspace_scoping"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workspaces", sa.Column("pipeline_config", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("workspaces", "pipeline_config")
