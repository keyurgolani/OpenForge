"""Make mission workspace_id nullable

Revision ID: 013_make_mission_workspace_nullable
Revises: 012_phase13_observability_evaluation
Create Date: 2026-03-15
"""

from __future__ import annotations

from alembic import op
from sqlalchemy.dialects import postgresql


revision = "013_make_mission_workspace_nullable"
down_revision = "012_phase13_observability_evaluation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "mission_definitions",
        "workspace_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "mission_definitions",
        "workspace_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
