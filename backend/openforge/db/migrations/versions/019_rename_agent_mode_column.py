"""Add agent_mode column to agents table.

Uses 'agent_mode' instead of 'mode' because PostgreSQL's MODE() ordered-set
aggregate function conflicts with an unqualified column named 'mode'.

Revision ID: 019_rename_agent_mode_column
Revises: 018_allow_fan_in_edges
"""

from alembic import op
import sqlalchemy as sa

revision = "019_rename_agent_mode_column"
down_revision = "018_allow_fan_in_edges"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agents", sa.Column("agent_mode", sa.String(50), server_default="interactive", nullable=False))


def downgrade():
    op.drop_column("agents", "agent_mode")
