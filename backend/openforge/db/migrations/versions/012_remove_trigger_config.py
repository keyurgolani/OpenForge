"""Remove trigger_config from automations table.

Triggers belong on deployments, not automation definitions.

Revision ID: 012_remove_trigger_config
Revises: 011_remove_sink_config
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "012_remove_trigger_config"
down_revision = "011_remove_sink_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("automations", "trigger_config")


def downgrade() -> None:
    op.add_column(
        "automations",
        sa.Column("trigger_config", JSONB, nullable=False, server_default="{}"),
    )
