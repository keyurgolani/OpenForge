"""mcp_servers and mcp_tool_overrides tables

Revision ID: 013_mcp_servers
Revises: 012_tool_call_logs
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "013_mcp_servers"
down_revision = "012_tool_call_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "mcp_servers" not in tables:
        op.create_table(
            "mcp_servers",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("url", sa.String(500), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("transport", sa.String(10), nullable=False, server_default="http"),
            sa.Column("auth_type", sa.String(20), nullable=False, server_default="none"),
            sa.Column("auth_value_enc", sa.LargeBinary, nullable=True),
            sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("discovered_tools", JSONB, nullable=True),
            sa.Column("last_discovered_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("default_risk_level", sa.String(20), nullable=False, server_default="high"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
        )
        op.create_index("idx_mcp_servers_enabled", "mcp_servers", ["is_enabled"])

    if "mcp_tool_overrides" not in tables:
        op.create_table(
            "mcp_tool_overrides",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "mcp_server_id",
                UUID(as_uuid=True),
                sa.ForeignKey("mcp_servers.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("tool_name", sa.String(200), nullable=False),
            sa.Column("risk_level", sa.String(20), nullable=False),
            sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
            sa.UniqueConstraint("mcp_server_id", "tool_name", name="uq_mcp_tool_overrides"),
        )
        op.create_index(
            "idx_mcp_tool_overrides_server", "mcp_tool_overrides", ["mcp_server_id"]
        )


def downgrade() -> None:
    op.drop_index("idx_mcp_tool_overrides_server", table_name="mcp_tool_overrides")
    op.drop_table("mcp_tool_overrides")
    op.drop_index("idx_mcp_servers_enabled", table_name="mcp_servers")
    op.drop_table("mcp_servers")
