"""Add is_system column to llm_providers

Revision ID: 014_add_llm_provider_is_system
Revises: 013_make_mission_workspace_nullable
Create Date: 2026-03-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "014_add_llm_provider_is_system"
down_revision = "013_make_mission_workspace_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "llm_providers",
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("llm_providers", "is_system")
