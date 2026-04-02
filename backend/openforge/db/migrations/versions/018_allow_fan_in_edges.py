"""Allow fan-in edges (multiple sources to same target input).

Drop the unique constraint on (automation_id, target_node_id, target_input_key)
to support DAG fan-in patterns where multiple upstream nodes wire their outputs
to the same input on a downstream node (e.g., 3 researchers → 1 synthesizer).

Revision ID: 018_allow_fan_in_edges
Revises: 017_create_skill_templates
"""

from alembic import op

revision = "018_allow_fan_in_edges"
down_revision = "017_create_skill_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_automation_edges_target_input", "automation_edges", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_automation_edges_target_input",
        "automation_edges",
        ["automation_id", "target_node_id", "target_input_key"],
    )
