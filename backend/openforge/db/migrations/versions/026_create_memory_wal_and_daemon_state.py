"""Create memory WAL and daemon state tables.

Revision ID: 026_create_memory_wal_and_daemon_state
Revises: 025_create_memory_table
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "026_create_memory_wal_and_daemon_state"
down_revision = "025_create_memory_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memory_wal",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("operation", sa.String(20), nullable=False),
        sa.Column("daemon", sa.String(25), nullable=False),
        sa.Column("memory_id", UUID(as_uuid=True), nullable=False),
        sa.Column("before_content", sa.Text, nullable=True),
        sa.Column("after_content", sa.Text, nullable=True),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_index("idx_wal_memory", "memory_wal", ["memory_id"])
    op.create_index("idx_wal_created", "memory_wal", ["created_at"])
    op.create_index("idx_wal_operation", "memory_wal", ["operation"])

    op.create_table(
        "memory_daemon_state",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("daemon_name", sa.String(50), nullable=False, unique=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cursor_position", sa.DateTime(timezone=True), nullable=True),
        sa.Column("state_json", JSONB, nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("memory_daemon_state")
    op.drop_index("idx_wal_operation", table_name="memory_wal")
    op.drop_index("idx_wal_created", table_name="memory_wal")
    op.drop_index("idx_wal_memory", table_name="memory_wal")
    op.drop_table("memory_wal")
