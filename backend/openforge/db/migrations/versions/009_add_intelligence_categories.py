"""Add intelligence_categories JSONB column to workspaces table.

Stores per-workspace custom intelligence extraction categories.
NULL means use the system defaults.

Revision ID: 009_add_intelligence_categories
Revises: 008_drop_retrieval_config
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "009_add_intelligence_categories"
down_revision = "008_drop_retrieval_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column("intelligence_categories", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "intelligence_categories")
