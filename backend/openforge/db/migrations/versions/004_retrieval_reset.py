"""Retrieval Reset

Revision ID: 004_phase4_retrieval_reset
Revises: 003_phase3_trust_foundations
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "004_phase4_retrieval_reset"
down_revision = "003_phase3_trust_foundations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "retrieval_queries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("normalized_query", sa.Text(), nullable=False),
        sa.Column("search_strategy", sa.String(length=100), nullable=False, server_default=sa.text("'hybrid_rrf'")),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'completed'")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_retrieval_queries_workspace_id", "retrieval_queries", ["workspace_id"])
    op.create_index("ix_retrieval_queries_conversation_id", "retrieval_queries", ["conversation_id"])
    op.create_index("ix_retrieval_queries_run_id", "retrieval_queries", ["run_id"])

    op.create_table(
        "retrieval_search_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("query_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("knowledge_type", sa.String(length=50), nullable=True),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("header_path", sa.String(length=1000), nullable=True),
        sa.Column("parent_excerpt", sa.Text(), nullable=True),
        sa.Column("score", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("rank_position", sa.Integer(), nullable=False),
        sa.Column("strategy", sa.String(length=100), nullable=False, server_default=sa.text("'hybrid_rrf'")),
        sa.Column("result_status", sa.String(length=50), nullable=False, server_default=sa.text("'candidate'")),
        sa.Column("opened", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("selected", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("summary_status", sa.String(length=50), nullable=True),
        sa.Column("selection_reason_codes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("trust_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["query_id"], ["retrieval_queries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_retrieval_search_results_query_id", "retrieval_search_results", ["query_id"])
    op.create_index("ix_retrieval_search_results_workspace_id", "retrieval_search_results", ["workspace_id"])
    op.create_index("idx_retrieval_search_results_source", "retrieval_search_results", ["source_type", "source_id"])
    op.create_index("idx_retrieval_search_results_status", "retrieval_search_results", ["query_id", "result_status"])

    op.create_table(
        "evidence_packets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("query_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("packet_status", sa.String(length=50), nullable=False, server_default=sa.text("'ready'")),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("item_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["query_id"], ["retrieval_queries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_evidence_packets_workspace_id", "evidence_packets", ["workspace_id"])
    op.create_index("ix_evidence_packets_query_id", "evidence_packets", ["query_id"])
    op.create_index("ix_evidence_packets_conversation_id", "evidence_packets", ["conversation_id"])
    op.create_index("ix_evidence_packets_run_id", "evidence_packets", ["run_id"])

    op.create_table(
        "conversation_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("summary_type", sa.String(length=50), nullable=False, server_default=sa.text("'conversation_memory'")),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'active'")),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("threshold_message_count", sa.Integer(), nullable=False, server_default=sa.text("20")),
        sa.Column("keep_recent_messages", sa.Integer(), nullable=False, server_default=sa.text("10")),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("recent_messages", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("conversation_id", "version", name="uq_conversation_summaries_conversation_version"),
    )
    op.create_index("ix_conversation_summaries_workspace_id", "conversation_summaries", ["workspace_id"])
    op.create_index("ix_conversation_summaries_conversation_id", "conversation_summaries", ["conversation_id"])
    op.create_index("ix_conversation_summaries_run_id", "conversation_summaries", ["run_id"])

    op.create_table(
        "tool_output_summaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tool_name", sa.String(length=255), nullable=False),
        sa.Column("call_id", sa.String(length=255), nullable=True),
        sa.Column("summary_type", sa.String(length=50), nullable=True),
        sa.Column("handling_mode", sa.String(length=50), nullable=False, server_default=sa.text("'inline'")),
        sa.Column("raw_char_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("raw_token_estimate", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("preview", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_tool_output_summaries_workspace_id", "tool_output_summaries", ["workspace_id"])
    op.create_index("ix_tool_output_summaries_conversation_id", "tool_output_summaries", ["conversation_id"])
    op.create_index("ix_tool_output_summaries_run_id", "tool_output_summaries", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_tool_output_summaries_run_id", table_name="tool_output_summaries")
    op.drop_index("ix_tool_output_summaries_conversation_id", table_name="tool_output_summaries")
    op.drop_index("ix_tool_output_summaries_workspace_id", table_name="tool_output_summaries")
    op.drop_table("tool_output_summaries")

    op.drop_index("ix_conversation_summaries_run_id", table_name="conversation_summaries")
    op.drop_index("ix_conversation_summaries_conversation_id", table_name="conversation_summaries")
    op.drop_index("ix_conversation_summaries_workspace_id", table_name="conversation_summaries")
    op.drop_table("conversation_summaries")

    op.drop_index("ix_evidence_packets_run_id", table_name="evidence_packets")
    op.drop_index("ix_evidence_packets_conversation_id", table_name="evidence_packets")
    op.drop_index("ix_evidence_packets_query_id", table_name="evidence_packets")
    op.drop_index("ix_evidence_packets_workspace_id", table_name="evidence_packets")
    op.drop_table("evidence_packets")

    op.drop_index("idx_retrieval_search_results_status", table_name="retrieval_search_results")
    op.drop_index("idx_retrieval_search_results_source", table_name="retrieval_search_results")
    op.drop_index("ix_retrieval_search_results_workspace_id", table_name="retrieval_search_results")
    op.drop_index("ix_retrieval_search_results_query_id", table_name="retrieval_search_results")
    op.drop_table("retrieval_search_results")

    op.drop_index("ix_retrieval_queries_run_id", table_name="retrieval_queries")
    op.drop_index("ix_retrieval_queries_conversation_id", table_name="retrieval_queries")
    op.drop_index("ix_retrieval_queries_workspace_id", table_name="retrieval_queries")
    op.drop_table("retrieval_queries")
