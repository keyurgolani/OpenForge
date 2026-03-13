"""cleanup legacy timeline entries (hitl_request, subagent_invocation)

Removes messages and agent executions whose timeline JSONB contains
old-format entries (hitl_request, subagent_invocation, sources) that are
no longer renderable by the redesigned frontend components. Rather than
attempt a lossy conversion, we clear the timeline array so the messages
still display their content but without broken step cards.

Revision ID: 029_cleanup_legacy_timeline
Revises: 028_hitl_agent_id
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "029_cleanup_legacy_timeline"
down_revision: Union[str, None] = "028_hitl_agent_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Legacy timeline entry types that are no longer supported
LEGACY_TYPES = ["hitl_request", "subagent_invocation", "sources"]


def upgrade() -> None:
    conn = op.get_bind()

    # Clear timeline on messages with legacy entry types.
    # Use a CTE to pre-filter rows that actually have a JSON array,
    # avoiding "cannot extract elements from a scalar" errors.
    for legacy_type in LEGACY_TYPES:
        conn.execute(sa.text(
            """
            UPDATE messages m
            SET timeline = '[]'::jsonb
            FROM (
                SELECT id
                FROM messages
                WHERE timeline IS NOT NULL
                  AND jsonb_typeof(timeline) = 'array'
            ) AS arr
            WHERE m.id = arr.id
              AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(m.timeline) AS elem
                  WHERE elem->>'type' = :legacy_type
              )
            """
        ), {"legacy_type": legacy_type})

    # Clear timeline on agent_executions with legacy entry types
    for legacy_type in LEGACY_TYPES:
        conn.execute(sa.text(
            """
            UPDATE agent_executions ae
            SET timeline = '[]'::jsonb
            FROM (
                SELECT id
                FROM agent_executions
                WHERE timeline IS NOT NULL
                  AND jsonb_typeof(timeline) = 'array'
            ) AS arr
            WHERE ae.id = arr.id
              AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(ae.timeline) AS elem
                  WHERE elem->>'type' = :legacy_type
              )
            """
        ), {"legacy_type": legacy_type})


def downgrade() -> None:
    # Data migration — cannot restore deleted timeline data
    pass
