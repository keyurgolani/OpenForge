"""Drop deprecated tables.

Drops all tables for removed domains:
workflows, missions, policies, prompts, profiles, graph,
evaluation, observability, capability bundles, model/memory policies,
output contracts, and catalog-related tables.

Revision ID: 002_wave3_drop
Revises: 001
Create Date: 2026-03-18
"""

from alembic import op

revision = "002_wave3_drop"
down_revision = "001"
branch_labels = None
depends_on = None


# Tables to drop, ordered to respect foreign key constraints (children first)
_TABLES_TO_DROP = [
    # Graph domain
    "graph_provenance_links",
    "relationship_mentions",
    "relationships",
    "entity_canonicalization_records",
    "entity_aliases",
    "entity_mentions",
    "entities",
    "graph_extraction_results",
    "graph_extraction_jobs",
    # Evaluation domain
    "evaluation_baselines",
    "evaluation_results",
    "evaluation_runs",
    "evaluation_scenarios",
    # Prompt domain
    "prompt_usage_logs",
    "prompt_versions",
    "prompt_definitions",
    # Policy domain
    "policy_rule_entries",
    "approval_policies",
    "safety_policies",
    "tool_policies",
    # Profile building blocks
    "output_contracts",
    "memory_policies",
    "model_policies",
    "capability_bundles",
    # Mission domain
    "mission_budget_policies",
    "mission_definitions",
    # Workflow domain
    "workflow_edges",
    "workflow_nodes",
    "workflow_versions",
    "workflow_definitions",
    # Misc deprecated
    "artifact_sinks",
    "artifact_links",
    "tool_permissions",
]


def upgrade() -> None:
    for table in _TABLES_TO_DROP:
        op.drop_table(table)


def downgrade() -> None:
    # No downgrade — these tables are permanently removed.
    # To restore, re-run 001_initial_schema.py in a fresh database.
    pass
