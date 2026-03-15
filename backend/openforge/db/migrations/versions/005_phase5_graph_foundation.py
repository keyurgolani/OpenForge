"""Phase 5 GraphRAG Foundation.

Revision ID: 005_phase5_graph_foundation
Revises: 004_phase4_retrieval_reset
Create Date: 2026-03-14

This migration creates the graph domain tables for Phase 5 architecture.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "005_phase5_graph_foundation"
down_revision = "004_phase4_retrieval_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extraction Jobs - tracks all extraction operations
    op.create_table(
        "graph_extraction_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("entity_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("relationship_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_graph_extraction_jobs_workspace_id", "graph_extraction_jobs", ["workspace_id"])
    op.create_index("ix_graph_extraction_jobs_source", "graph_extraction_jobs", ["source_type", "source_id"])
    op.create_index("ix_graph_extraction_jobs_status", "graph_extraction_jobs", ["status"])

    op.create_table(
        "graph_extraction_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("extraction_job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_mentions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("relationship_mentions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("canonicalization_records", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("errors", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("notes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["extraction_job_id"], ["graph_extraction_jobs.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_graph_extraction_results_workspace_id", "graph_extraction_results", ["workspace_id"])
    op.create_index("ix_graph_extraction_results_job_id", "graph_extraction_results", ["extraction_job_id"])

    # Canonical Entities
    op.create_table(
        "entities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_name", sa.String(length=500), nullable=False),
        sa.Column("normalized_key", sa.String(length=500), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=False, server_default=sa.text("'generic'")),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'active'")),
        sa.Column("confidence", sa.Float(), nullable=False, server_default=sa.text("1.0")),
        sa.Column("source_count", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_entities_workspace_id", "entities", ["workspace_id"])
    op.create_index("ix_entities_normalized_key", "entities", ["normalized_key"])
    op.create_index("ix_entities_entity_type", "entities", ["entity_type"])
    op.create_index("ix_entities_status", "entities", ["status"])

    # Entity Mentions - raw extractions before canonicalization
    op.create_table(
        "entity_mentions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("extraction_job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("mention_text", sa.String(length=500), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=False, server_default=sa.text("'generic'")),
        sa.Column("context_snippet", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("extraction_method", sa.String(length=100), nullable=False, server_default=sa.text("'llm'")),
        sa.Column("confidence", sa.Float(), nullable=False, server_default=sa.text("1.0")),
        sa.Column("resolution_status", sa.String(length=50), nullable=False, server_default=sa.text("'unresolved'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["extraction_job_id"], ["graph_extraction_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["canonical_entity_id"], ["entities.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_entity_mentions_workspace_id", "entity_mentions", ["workspace_id"])
    op.create_index("ix_entity_mentions_extraction_job_id", "entity_mentions", ["extraction_job_id"])
    op.create_index("ix_entity_mentions_canonical_entity_id", "entity_mentions", ["canonical_entity_id"])
    op.create_index("ix_entity_mentions_source", "entity_mentions", ["source_type", "source_id"])
    op.create_index("ix_entity_mentions_resolution_status", "entity_mentions", ["resolution_status"])

    # Entity Aliases - alternative names for canonical entities
    op.create_table(
        "entity_aliases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("alias", sa.String(length=500), nullable=False),
        sa.Column("alias_type", sa.String(length=100), nullable=False, server_default=sa.text("'alternate_name'")),
        sa.Column("source_mention_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_mention_id"], ["entity_mentions.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_entity_aliases_entity_id", "entity_aliases", ["entity_id"])
    op.create_index("ix_entity_aliases_alias", "entity_aliases", ["alias"])

    op.create_table(
        "entity_canonicalization_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mention_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonicalization_state", sa.String(length=50), nullable=False, server_default=sa.text("'resolved'")),
        sa.Column("match_type", sa.String(length=100), nullable=False),
        sa.Column("match_confidence", sa.Float(), nullable=False, server_default=sa.text("1.0")),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["mention_id"], ["entity_mentions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["canonical_entity_id"], ["entities.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_entity_canonicalization_records_workspace_id", "entity_canonicalization_records", ["workspace_id"])
    op.create_index("ix_entity_canonicalization_records_mention_id", "entity_canonicalization_records", ["mention_id"])
    op.create_index("ix_entity_canonicalization_records_entity_id", "entity_canonicalization_records", ["canonical_entity_id"])

    # Canonical Relationships
    op.create_table(
        "relationships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject_entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("object_entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("predicate", sa.String(length=200), nullable=False),
        sa.Column("relationship_type", sa.String(length=100), nullable=False, server_default=sa.text("'generic'")),
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'active'")),
        sa.Column("confidence", sa.Float(), nullable=False, server_default=sa.text("1.0")),
        sa.Column("support_count", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("directionality", sa.String(length=50), nullable=False, server_default=sa.text("'directed'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["object_entity_id"], ["entities.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_relationships_workspace_id", "relationships", ["workspace_id"])
    op.create_index("ix_relationships_subject_entity_id", "relationships", ["subject_entity_id"])
    op.create_index("ix_relationships_object_entity_id", "relationships", ["object_entity_id"])
    op.create_index("ix_relationships_predicate", "relationships", ["predicate"])
    op.create_index("ix_relationships_status", "relationships", ["status"])

    # Relationship Mentions - raw extractions before canonicalization
    op.create_table(
        "relationship_mentions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("extraction_job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_relationship_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("subject_mention_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("object_mention_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("predicate", sa.String(length=200), nullable=False),
        sa.Column("source_snippet", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("extraction_method", sa.String(length=100), nullable=False, server_default=sa.text("'llm'")),
        sa.Column("confidence", sa.Float(), nullable=False, server_default=sa.text("1.0")),
        sa.Column("resolution_status", sa.String(length=50), nullable=False, server_default=sa.text("'unresolved'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["extraction_job_id"], ["graph_extraction_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["canonical_relationship_id"], ["relationships.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subject_mention_id"], ["entity_mentions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["object_mention_id"], ["entity_mentions.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_relationship_mentions_workspace_id", "relationship_mentions", ["workspace_id"])
    op.create_index("ix_relationship_mentions_extraction_job_id", "relationship_mentions", ["extraction_job_id"])
    op.create_index("ix_relationship_mentions_canonical_relationship_id", "relationship_mentions", ["canonical_relationship_id"])
    op.create_index("ix_relationship_mentions_source", "relationship_mentions", ["source_type", "source_id"])
    op.create_index("ix_relationship_mentions_resolution_status", "relationship_mentions", ["resolution_status"])

    # Graph Provenance Links - tracks source evidence for all graph objects
    op.create_table(
        "graph_provenance_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("graph_object_type", sa.String(length=50), nullable=False),
        sa.Column("graph_object_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=True),
        sa.Column("char_start", sa.Integer(), nullable=True),
        sa.Column("char_end", sa.Integer(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False, server_default=sa.text("1.0")),
        sa.Column("extraction_method", sa.String(length=100), nullable=False, server_default=sa.text("'llm'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_graph_provenance_links_workspace_id", "graph_provenance_links", ["workspace_id"])
    op.create_index("ix_graph_provenance_links_graph_object", "graph_provenance_links", ["graph_object_type", "graph_object_id"])
    op.create_index("ix_graph_provenance_links_source", "graph_provenance_links", ["source_type", "source_id"])


def downgrade() -> None:
    op.drop_index("ix_entity_canonicalization_records_entity_id", table_name="entity_canonicalization_records")
    op.drop_index("ix_entity_canonicalization_records_mention_id", table_name="entity_canonicalization_records")
    op.drop_index("ix_entity_canonicalization_records_workspace_id", table_name="entity_canonicalization_records")
    op.drop_table("entity_canonicalization_records")

    op.drop_index("ix_graph_provenance_links_source", table_name="graph_provenance_links")
    op.drop_index("ix_graph_provenance_links_graph_object", table_name="graph_provenance_links")
    op.drop_index("ix_graph_provenance_links_workspace_id", table_name="graph_provenance_links")
    op.drop_table("graph_provenance_links")

    op.drop_index("ix_relationship_mentions_resolution_status", table_name="relationship_mentions")
    op.drop_index("ix_relationship_mentions_source", table_name="relationship_mentions")
    op.drop_index("ix_relationship_mentions_canonical_relationship_id", table_name="relationship_mentions")
    op.drop_index("ix_relationship_mentions_extraction_job_id", table_name="relationship_mentions")
    op.drop_index("ix_relationship_mentions_workspace_id", table_name="relationship_mentions")
    op.drop_table("relationship_mentions")

    op.drop_index("ix_relationships_status", table_name="relationships")
    op.drop_index("ix_relationships_predicate", table_name="relationships")
    op.drop_index("ix_relationships_object_entity_id", table_name="relationships")
    op.drop_index("ix_relationships_subject_entity_id", table_name="relationships")
    op.drop_index("ix_relationships_workspace_id", table_name="relationships")
    op.drop_table("relationships")

    op.drop_index("ix_entity_aliases_alias", table_name="entity_aliases")
    op.drop_index("ix_entity_aliases_entity_id", table_name="entity_aliases")
    op.drop_table("entity_aliases")

    op.drop_index("ix_entity_mentions_resolution_status", table_name="entity_mentions")
    op.drop_index("ix_entity_mentions_source", table_name="entity_mentions")
    op.drop_index("ix_entity_mentions_canonical_entity_id", table_name="entity_mentions")
    op.drop_index("ix_entity_mentions_extraction_job_id", table_name="entity_mentions")
    op.drop_index("ix_entity_mentions_workspace_id", table_name="entity_mentions")
    op.drop_table("entity_mentions")

    op.drop_index("ix_entities_status", table_name="entities")
    op.drop_index("ix_entities_entity_type", table_name="entities")
    op.drop_index("ix_entities_normalized_key", table_name="entities")
    op.drop_index("ix_entities_workspace_id", table_name="entities")
    op.drop_table("entities")

    op.drop_index("ix_graph_extraction_results_job_id", table_name="graph_extraction_results")
    op.drop_index("ix_graph_extraction_results_workspace_id", table_name="graph_extraction_results")
    op.drop_table("graph_extraction_results")

    op.drop_index("ix_graph_extraction_jobs_status", table_name="graph_extraction_jobs")
    op.drop_index("ix_graph_extraction_jobs_source", table_name="graph_extraction_jobs")
    op.drop_index("ix_graph_extraction_jobs_workspace_id", table_name="graph_extraction_jobs")
    op.drop_table("graph_extraction_jobs")
