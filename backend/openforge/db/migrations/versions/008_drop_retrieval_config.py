"""Drop unused retrieval_config column from agents table.

Retrieval configuration was never consumed at runtime. Agents access
workspace knowledge via tool-use (workspace.search), so the column
is dead code.

Revision ID: 008_drop_retrieval_config
Revises: 007_agent_definition_restructure
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "008_drop_retrieval_config"
down_revision = "007_agent_definition_restructure"
branch_labels = None
depends_on = None

JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.drop_column("agents", "retrieval_config")


def downgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("retrieval_config", JSONB, server_default="{}", nullable=False),
    )
