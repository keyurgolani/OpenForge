"""Drop strategy_plugins table.

The strategy plugin system has been replaced by agent_executor which calls
execute_tool_loop directly. The strategy_plugins table was never populated
at runtime.

Revision ID: 015_drop_strategy_plugins
Revises: 014_create_sinks_table
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "015_drop_strategy_plugins"
down_revision = "014_create_sinks_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_strategy_plugins_name", table_name="strategy_plugins")
    op.drop_table("strategy_plugins")


def downgrade() -> None:
    op.create_table(
        "strategy_plugins",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("manifest", JSONB, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("is_builtin", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_strategy_plugins_name", "strategy_plugins", ["name"])
