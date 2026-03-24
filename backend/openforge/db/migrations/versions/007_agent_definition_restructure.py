"""Restructure agents and compiled_agent_specs tables.

Move from blueprint_md (monolithic markdown) to structured columns for
system_prompt, llm_config, tools_config, etc.  Rename active_spec_id to
active_version_id.  Slim down compiled_agent_specs to a single snapshot
JSONB column.

Revision ID: 007_agent_definition_restructure
Revises: 006_nullable_execution_workspace
Create Date: 2026-03-22
"""
from __future__ import annotations

import json
import re
from typing import Any

import yaml
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "007_agent_definition_restructure"
down_revision = "006_nullable_execution_workspace"
branch_labels = None
depends_on = None

JSONB = postgresql.JSONB(astext_type=sa.Text())
UUID = postgresql.UUID(as_uuid=True)

# ---------------------------------------------------------------------------
# Frontmatter parsing helpers (standalone — no app imports)
# ---------------------------------------------------------------------------

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)", re.DOTALL)


def _parse_blueprint_md(md: str | None) -> dict[str, Any]:
    """Extract structured fields from blueprint markdown."""
    result: dict[str, Any] = {
        "system_prompt": "",
        "llm_config": {},
        "tools_config": [],
        "memory_config": {},
        "retrieval_config": {},
        "parameters": [],
        "output_definitions": [],
    }
    if not md:
        return result

    match = _FRONTMATTER_RE.match(md)
    if not match:
        result["system_prompt"] = md.strip()
        return result

    frontmatter_str, body = match.group(1), match.group(2)
    try:
        fm = yaml.safe_load(frontmatter_str) or {}
    except yaml.YAMLError:
        result["system_prompt"] = md.strip()
        return result

    if not isinstance(fm, dict):
        result["system_prompt"] = md.strip()
        return result

    # system_prompt = markdown body
    result["system_prompt"] = body.strip()

    # llm_config from model block
    model_raw = fm.get("model")
    if isinstance(model_raw, dict):
        result["llm_config"] = model_raw

    # tools_config — normalise strings and dicts into structured list
    tools_raw = fm.get("tools") or []
    tools_list = []
    for t in tools_raw:
        if isinstance(t, str):
            name = t
            confirm = False
        elif isinstance(t, dict):
            name = t.get("name", "")
            confirm = bool(t.get("confirm_before", False))
        else:
            continue
        category = name.split(".")[0] if "." in name else ""
        mode = "hitl" if confirm else "allowed"
        tools_list.append({"name": name, "category": category, "mode": mode})
    result["tools_config"] = tools_list

    # Also handle top-level confirm_before list
    confirm_before = fm.get("confirm_before") or []
    if isinstance(confirm_before, list):
        for cb_name in confirm_before:
            if isinstance(cb_name, str):
                # Update existing tool entry or add new one
                found = False
                for t in tools_list:
                    if t["name"] == cb_name:
                        t["mode"] = "hitl"
                        found = True
                        break
                if not found:
                    category = cb_name.split(".")[0] if "." in cb_name else ""
                    tools_list.append({"name": cb_name, "category": category, "mode": "hitl"})

    # memory_config
    memory_raw = fm.get("memory")
    if isinstance(memory_raw, dict):
        result["memory_config"] = memory_raw

    # retrieval_config
    retrieval_raw = fm.get("retrieval")
    if isinstance(retrieval_raw, dict):
        result["retrieval_config"] = retrieval_raw

    # parameters
    params_raw = fm.get("parameters") or []
    if isinstance(params_raw, list):
        result["parameters"] = [p for p in params_raw if isinstance(p, dict)]

    # output_definitions
    outputs_raw = fm.get("outputs") or []
    if isinstance(outputs_raw, list):
        result["output_definitions"] = [o for o in outputs_raw if isinstance(o, dict)]

    return result


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. Add new columns to agents table
    # -----------------------------------------------------------------------
    op.add_column("agents", sa.Column("system_prompt", sa.Text(), server_default="", nullable=False))
    op.add_column("agents", sa.Column("llm_config", JSONB, server_default="{}", nullable=False))
    op.add_column("agents", sa.Column("tools_config", JSONB, server_default="[]", nullable=False))
    op.add_column("agents", sa.Column("memory_config", JSONB, server_default="{}", nullable=False))
    op.add_column("agents", sa.Column("retrieval_config", JSONB, server_default="{}", nullable=False))
    op.add_column("agents", sa.Column("parameters", JSONB, server_default="[]", nullable=False))
    op.add_column("agents", sa.Column("output_definitions", JSONB, server_default="[]", nullable=False))

    # -----------------------------------------------------------------------
    # 2. Migrate existing data from blueprint_md → structured columns
    # -----------------------------------------------------------------------
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, blueprint_md FROM agents")).fetchall()
    for row in rows:
        agent_id, blueprint_md = row[0], row[1]
        parsed = _parse_blueprint_md(blueprint_md)
        conn.execute(
            sa.text(
                "UPDATE agents SET "
                "system_prompt = :system_prompt, "
                "llm_config = :llm_config, "
                "tools_config = :tools_config, "
                "memory_config = :memory_config, "
                "retrieval_config = :retrieval_config, "
                "parameters = :parameters, "
                "output_definitions = :output_definitions "
                "WHERE id = :id"
            ),
            {
                "id": agent_id,
                "system_prompt": parsed["system_prompt"],
                "llm_config": json.dumps(parsed["llm_config"]),
                "tools_config": json.dumps(parsed["tools_config"]),
                "memory_config": json.dumps(parsed["memory_config"]),
                "retrieval_config": json.dumps(parsed["retrieval_config"]),
                "parameters": json.dumps(parsed["parameters"]),
                "output_definitions": json.dumps(parsed["output_definitions"]),
            },
        )

    # -----------------------------------------------------------------------
    # 3. Rename FK: active_spec_id → active_version_id
    # -----------------------------------------------------------------------
    op.alter_column("agents", "active_spec_id", new_column_name="active_version_id")

    # -----------------------------------------------------------------------
    # 4. Drop indexes (must happen before dropping indexed columns)
    # -----------------------------------------------------------------------
    op.drop_index("idx_agents_status", table_name="agents")
    op.drop_index("idx_agents_mode", table_name="agents")

    # -----------------------------------------------------------------------
    # 5. Drop removed columns from agents
    # -----------------------------------------------------------------------
    op.drop_column("agents", "blueprint_md")
    op.drop_column("agents", "status")
    op.drop_column("agents", "mode")
    op.drop_column("agents", "is_template")
    op.drop_column("agents", "is_system")
    op.drop_column("agents", "health_status")
    op.drop_column("agents", "last_used_at")
    op.drop_column("agents", "last_error_at")
    op.drop_column("agents", "last_error_summary")
    op.drop_column("agents", "compilation_status")
    op.drop_column("agents", "compilation_error")
    op.drop_column("agents", "last_compiled_at")
    op.drop_column("agents", "profile_id")

    # -----------------------------------------------------------------------
    # 6. Add snapshot column to compiled_agent_specs and migrate data
    # -----------------------------------------------------------------------
    op.add_column("compiled_agent_specs", sa.Column("snapshot", JSONB, server_default="{}", nullable=False))

    # Migrate: copy resolved_config into snapshot
    conn.execute(
        sa.text("UPDATE compiled_agent_specs SET snapshot = resolved_config")
    )

    # -----------------------------------------------------------------------
    # 7. Drop old columns from compiled_agent_specs
    # -----------------------------------------------------------------------
    op.drop_column("compiled_agent_specs", "blueprint_snapshot")
    op.drop_column("compiled_agent_specs", "resolved_config")
    op.drop_column("compiled_agent_specs", "source_md_hash")
    op.drop_column("compiled_agent_specs", "compiler_version")
    op.drop_column("compiled_agent_specs", "is_valid")
    op.drop_column("compiled_agent_specs", "validation_errors")
    op.drop_column("compiled_agent_specs", "profile_id")


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    # -----------------------------------------------------------------------
    # 7. Re-add old columns to compiled_agent_specs
    # -----------------------------------------------------------------------
    op.add_column("compiled_agent_specs", sa.Column("profile_id", UUID, nullable=True))
    op.add_column("compiled_agent_specs", sa.Column("validation_errors", JSONB, server_default="[]", nullable=False))
    op.add_column("compiled_agent_specs", sa.Column("is_valid", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("compiled_agent_specs", sa.Column("compiler_version", sa.String(20), server_default="1.0.0", nullable=False))
    op.add_column("compiled_agent_specs", sa.Column("source_md_hash", sa.String(64), server_default="", nullable=False))
    op.add_column("compiled_agent_specs", sa.Column("resolved_config", JSONB, server_default="{}", nullable=False))
    op.add_column("compiled_agent_specs", sa.Column("blueprint_snapshot", JSONB, server_default="{}", nullable=False))

    # Migrate snapshot back into resolved_config
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE compiled_agent_specs SET resolved_config = snapshot")
    )

    # -----------------------------------------------------------------------
    # 6. Drop snapshot column
    # -----------------------------------------------------------------------
    op.drop_column("compiled_agent_specs", "snapshot")

    # -----------------------------------------------------------------------
    # 5. Re-add removed columns to agents
    # -----------------------------------------------------------------------
    op.add_column("agents", sa.Column("profile_id", UUID, nullable=True))
    op.add_column("agents", sa.Column("last_compiled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agents", sa.Column("compilation_error", sa.Text(), nullable=True))
    op.add_column("agents", sa.Column("compilation_status", sa.String(50), server_default="pending", nullable=False))
    op.add_column("agents", sa.Column("last_error_summary", sa.Text(), nullable=True))
    op.add_column("agents", sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agents", sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agents", sa.Column("health_status", sa.String(50), server_default="unknown", nullable=False))
    op.add_column("agents", sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("agents", sa.Column("is_template", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("agents", sa.Column("mode", sa.String(50), server_default="interactive", nullable=False))
    op.add_column("agents", sa.Column("status", sa.String(50), server_default="draft", nullable=False))
    op.add_column("agents", sa.Column("blueprint_md", sa.Text(), server_default="", nullable=False))

    # -----------------------------------------------------------------------
    # 4. Re-create indexes (after columns exist)
    # -----------------------------------------------------------------------
    op.create_index("idx_agents_mode", "agents", ["mode"])
    op.create_index("idx_agents_status", "agents", ["status"])

    # -----------------------------------------------------------------------
    # 3. Rename back: active_version_id → active_spec_id
    # -----------------------------------------------------------------------
    op.alter_column("agents", "active_version_id", new_column_name="active_spec_id")

    # -----------------------------------------------------------------------
    # 1. Drop new columns from agents
    # -----------------------------------------------------------------------
    op.drop_column("agents", "output_definitions")
    op.drop_column("agents", "parameters")
    op.drop_column("agents", "retrieval_config")
    op.drop_column("agents", "memory_config")
    op.drop_column("agents", "tools_config")
    op.drop_column("agents", "llm_config")
    op.drop_column("agents", "system_prompt")
