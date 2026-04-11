"""Create memory table for the OpenForge memory system.

Revision ID: 025_create_memory_table
Revises: 024_remove_workspace_model_agent_columns
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "025_create_memory_table"
down_revision = "024_remove_workspace_model_agent_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memory",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("memory_type", sa.String(20), nullable=False),
        sa.Column("tier", sa.String(15), nullable=False, server_default="short_term"),
        sa.Column("confidence", sa.Float, nullable=False, server_default=sa.text("0.8")),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalidated_by", UUID(as_uuid=True), sa.ForeignKey("memory.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_type", sa.String(10), nullable=False),
        sa.Column("source_agent_id", UUID(as_uuid=True), nullable=True),
        sa.Column("source_run_id", UUID(as_uuid=True), nullable=True),
        sa.Column("source_conversation_id", UUID(as_uuid=True), nullable=True),
        sa.Column("workspace_id", UUID(as_uuid=True), nullable=True),
        sa.Column("knowledge_id", UUID(as_uuid=True), nullable=True),
        sa.Column("parent_memory_id", UUID(as_uuid=True), sa.ForeignKey("memory.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tags", ARRAY(sa.Text), nullable=False, server_default=sa.text("'{}'::text[]")),
        sa.Column("recall_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("last_recalled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_index("idx_memory_type", "memory", ["memory_type"])
    op.create_index("idx_memory_tier", "memory", ["tier"])
    op.create_index("idx_memory_workspace", "memory", ["workspace_id"])
    op.create_index("idx_memory_content_hash", "memory", ["content_hash"])
    op.create_index("idx_memory_invalidated", "memory", ["invalidated_at"])
    op.create_index("idx_memory_observed", "memory", ["observed_at"])
    op.create_index("idx_memory_source_conversation", "memory", ["source_conversation_id"])
    op.create_index("idx_memory_knowledge", "memory", ["knowledge_id"])
    op.execute(
        "CREATE INDEX idx_memory_content_fts ON memory USING GIN (to_tsvector('english', content))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_memory_content_fts")
    op.drop_index("idx_memory_knowledge", table_name="memory")
    op.drop_index("idx_memory_source_conversation", table_name="memory")
    op.drop_index("idx_memory_observed", table_name="memory")
    op.drop_index("idx_memory_invalidated", table_name="memory")
    op.drop_index("idx_memory_content_hash", table_name="memory")
    op.drop_index("idx_memory_workspace", table_name="memory")
    op.drop_index("idx_memory_tier", table_name="memory")
    op.drop_index("idx_memory_type", table_name="memory")
    op.drop_table("memory")
