"""Create first-class sinks table.

Sinks are standalone entities that define what happens with agent output
values in automations (Article, Knowledge Create/Update, REST API,
Notification, Log).

Revision ID: 014_create_sinks_table
Revises: 013_sink_node_support
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "014_create_sinks_table"
down_revision = "013_sink_node_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sinks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sink_type", sa.String(50), nullable=False),
        sa.Column("config", JSONB, nullable=False, server_default="{}"),
        sa.Column("icon", sa.String(100), nullable=True),
        sa.Column("tags", JSONB, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_sinks_sink_type", "sinks", ["sink_type"])
    op.create_index("idx_sinks_slug", "sinks", ["slug"], unique=True)

    # Add optional sink_id FK on automation_nodes for sink nodes that reference a sink definition
    op.add_column("automation_nodes", sa.Column("sink_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_automation_nodes_sink_id",
        "automation_nodes",
        "sinks",
        ["sink_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_automation_nodes_sink_id", "automation_nodes", type_="foreignkey")
    op.drop_column("automation_nodes", "sink_id")
    op.drop_index("idx_sinks_slug", table_name="sinks")
    op.drop_index("idx_sinks_sink_type", table_name="sinks")
    op.drop_table("sinks")
