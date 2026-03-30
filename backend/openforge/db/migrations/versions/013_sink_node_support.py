"""Add sink node support to automation graph.

Add node_type and sink_type columns to automation_nodes,
make agent_id nullable so sink nodes can be stored.

Revision ID: 013_sink_node_support
Revises: 012_remove_trigger_config
"""

from alembic import op
import sqlalchemy as sa

revision = "013_sink_node_support"
down_revision = "012_remove_trigger_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("automation_nodes", sa.Column("node_type", sa.String(20), nullable=False, server_default="agent"))
    op.add_column("automation_nodes", sa.Column("sink_type", sa.String(50), nullable=True))
    # Make agent_id nullable so sink nodes don't need one
    op.alter_column("automation_nodes", "agent_id", existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    # Remove sink nodes before making agent_id non-nullable again
    op.execute("DELETE FROM automation_nodes WHERE node_type = 'sink'")
    op.alter_column("automation_nodes", "agent_id", existing_type=sa.UUID(), nullable=False)
    op.drop_column("automation_nodes", "sink_type")
    op.drop_column("automation_nodes", "node_type")
