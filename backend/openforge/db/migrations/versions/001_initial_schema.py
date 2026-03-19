"""initial_schema

Revision ID: 001
Revises: None
Create Date: 2026-03-18

Single migration that creates all tables for the OpenForge schema.
Requires: docker compose down -v to reset Postgres before running.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

JSONB = postgresql.JSONB
UUID = postgresql.UUID(as_uuid=True)
DT = sa.DateTime(timezone=True)
NOW = sa.text("now()")
EMPTY_OBJ = sa.text("'{}'::jsonb")
EMPTY_ARR = sa.text("'[]'::jsonb")


def _uuid_pk():
    return sa.Column("id", UUID, primary_key=True)


def _ts():
    """Return standard created_at / updated_at columns."""
    return [
        sa.Column("created_at", DT, nullable=False, server_default=NOW),
        sa.Column("updated_at", DT, nullable=False, server_default=NOW),
    ]


def _ts_created():
    return sa.Column("created_at", DT, nullable=False, server_default=NOW)


# ── Table list for downgrade (reverse order) ──
ALL_TABLES = [
    # Evaluation
    "evaluation_baselines", "evaluation_results", "evaluation_runs", "evaluation_scenarios",
    # Observability
    "failure_events", "usage_records",
    # Profile building blocks
    "output_contracts", "memory_policies", "model_policies", "capability_bundles",
    # Graph
    "graph_provenance_links", "relationship_mentions", "relationships",
    "entity_canonicalization_records", "entity_aliases", "entity_mentions", "entities",
    "graph_extraction_results", "graph_extraction_jobs",
    # Context
    "tool_output_summaries", "conversation_summaries", "evidence_packets",
    "retrieval_search_results", "retrieval_queries",
    # Trust
    "approval_requests", "policy_rule_entries",
    "approval_policies", "safety_policies", "tool_policies",
    # Prompts
    "prompt_usage_logs", "prompt_versions", "prompt_definitions",
    # Artifacts
    "artifact_sinks", "artifact_links", "artifact_versions", "artifacts",
    # Runtime
    "runtime_events", "checkpoints", "run_steps", "runs",
    # Missions / Triggers
    "mission_budget_policies", "trigger_fire_history", "trigger_definitions", "mission_definitions",
    # Workflows
    "workflow_edges", "workflow_nodes", "workflow_versions", "workflow_definitions",
    # Agent-first
    "strategy_plugins", "compiled_automation_specs", "automations",
    "compiled_agent_specs", "agents",
    # Profiles
    "agent_profiles",
    # Core operational
    "agent_memory", "task_logs", "tool_permissions", "agent_executions",
    "hitl_requests", "mcp_tool_overrides", "mcp_servers", "tool_call_logs",
    "message_attachments", "messages", "conversations",
    "knowledge_tags", "knowledge",
    "workspaces", "onboarding", "llm_providers", "config",
]


def upgrade() -> None:
    # ── config ──
    op.create_table("config",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("value", JSONB, nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="general"),
        sa.Column("sensitive", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("updated_at", DT, nullable=False, server_default=NOW),
    )

    # ── llm_providers ──
    op.create_table("llm_providers",
        _uuid_pk(),
        sa.Column("provider_name", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("api_key_enc", sa.LargeBinary, nullable=True),
        sa.Column("endpoint_id", sa.String(50), nullable=False, server_default="default"),
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("default_model", sa.String(200), nullable=True),
        sa.Column("enabled_models", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("is_system_default", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_system", sa.Boolean, server_default=sa.text("false")),
        *_ts(),
    )
    op.create_index("idx_llm_providers_system_default", "llm_providers", ["is_system_default"],
                     unique=True, postgresql_where=sa.text("is_system_default = TRUE"))

    # ── onboarding ──
    op.create_table("onboarding",
        sa.Column("id", sa.Integer, primary_key=True, server_default="1"),
        sa.Column("is_complete", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("current_step", sa.String(50), nullable=False, server_default="welcome"),
        sa.Column("completed_at", DT, nullable=True),
        sa.CheckConstraint("id = 1", name="onboarding_singleton"),
    )

    # ── workspaces ──
    op.create_table("workspaces",
        _uuid_pk(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("icon", sa.String(10), nullable=True),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("llm_provider_id", UUID, sa.ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("llm_model", sa.String(200), nullable=True),
        sa.Column("knowledge_intelligence_provider_id", UUID, sa.ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("knowledge_intelligence_model", sa.String(200), nullable=True),
        sa.Column("vision_provider_id", UUID, sa.ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vision_model", sa.String(200), nullable=True),
        sa.Column("agent_id", sa.String(100), nullable=True, server_default="workspace_agent"),
        sa.Column("default_agent_id", UUID, nullable=True),  # deferred FK to agents
        sa.Column("agent_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("agent_tool_categories", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("agent_max_tool_loops", sa.Integer, nullable=False, server_default="20"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        *_ts(),
    )
    op.create_index("ix_workspaces_default_agent_id", "workspaces", ["default_agent_id"])

    # ── knowledge ──
    op.create_table("knowledge",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(20), nullable=False, server_default="note"),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("url", sa.String(2000), nullable=True),
        sa.Column("url_title", sa.String(500), nullable=True),
        sa.Column("url_description", sa.Text, nullable=True),
        sa.Column("gist_language", sa.String(50), nullable=True),
        sa.Column("is_pinned", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("insights", JSONB, nullable=True),
        sa.Column("ai_title", sa.String(500), nullable=True),
        sa.Column("ai_summary", sa.Text, nullable=True),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("thumbnail_path", sa.String(500), nullable=True),
        sa.Column("file_metadata", JSONB, nullable=True),
        sa.Column("embedding_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("word_count", sa.Integer, nullable=False, server_default="0"),
        *_ts(),
    )
    op.create_index("idx_knowledge_workspace", "knowledge", ["workspace_id"])
    op.create_index("idx_knowledge_type", "knowledge", ["workspace_id", "type"])
    op.create_index("idx_knowledge_updated", "knowledge", ["workspace_id", "updated_at"])
    op.create_index("idx_knowledge_archived", "knowledge", ["workspace_id", "is_archived"])

    # ── knowledge_tags ──
    op.create_table("knowledge_tags",
        sa.Column("knowledge_id", UUID, sa.ForeignKey("knowledge.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag", sa.String(100), primary_key=True),
        sa.Column("source", sa.String(10), nullable=False, server_default="ai"),
    )
    op.create_index("idx_knowledge_tags_tag", "knowledge_tags", ["tag"])
    op.create_index("idx_knowledge_tags_knowledge", "knowledge_tags", ["knowledge_id"])

    # ── conversations ──
    op.create_table("conversations",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("title_locked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_pinned", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("archived_at", DT, nullable=True),
        sa.Column("is_subagent", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("subagent_agent_id", sa.String(100), nullable=True),
        sa.Column("message_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_message_at", DT, nullable=True),
        *_ts(),
    )
    op.create_index("idx_conversations_workspace", "conversations", ["workspace_id", "updated_at"])

    # ── messages ──
    op.create_table("messages",
        _uuid_pk(),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("thinking", sa.Text, nullable=True),
        sa.Column("model_used", sa.String(200), nullable=True),
        sa.Column("provider_used", sa.String(50), nullable=True),
        sa.Column("token_count", sa.Integer, nullable=True),
        sa.Column("generation_ms", sa.Integer, nullable=True),
        sa.Column("context_sources", JSONB, nullable=True),
        sa.Column("tool_calls", JSONB, nullable=True),
        sa.Column("timeline", JSONB, nullable=True),
        sa.Column("provider_metadata", JSONB, nullable=True),
        sa.Column("is_interrupted", sa.Boolean, nullable=False, server_default=sa.text("false")),
        _ts_created(),
    )
    op.create_index("idx_messages_conversation", "messages", ["conversation_id", "created_at"])

    # ── message_attachments ──
    op.create_table("message_attachments",
        _uuid_pk(),
        sa.Column("message_id", UUID, sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=True),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer, nullable=False),
        sa.Column("file_path", sa.String(1000), nullable=False),
        sa.Column("source_url", sa.String(2000), nullable=True),
        sa.Column("extracted_text", sa.Text, nullable=True),
        _ts_created(),
    )
    op.create_index("idx_message_attachments_message", "message_attachments", ["message_id"])

    # ── tool_call_logs ──
    op.create_table("tool_call_logs",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("call_id", sa.String(255), nullable=False),
        sa.Column("tool_name", sa.String(255), nullable=False),
        sa.Column("arguments", JSONB, nullable=True),
        sa.Column("success", sa.Boolean, nullable=True),
        sa.Column("output", sa.Text, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("started_at", DT, nullable=False, server_default=NOW),
        sa.Column("finished_at", DT, nullable=True),
    )
    op.create_index("idx_tool_call_logs_conv", "tool_call_logs", ["conversation_id", "started_at"])
    op.create_index("idx_tool_call_logs_ws", "tool_call_logs", ["workspace_id", "started_at"])
    op.create_index("idx_tool_call_logs_name", "tool_call_logs", ["tool_name", "started_at"])

    # ── mcp_servers ──
    op.create_table("mcp_servers",
        _uuid_pk(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("transport", sa.String(10), nullable=False, server_default="http"),
        sa.Column("auth_type", sa.String(20), nullable=False, server_default="none"),
        sa.Column("auth_value_enc", sa.LargeBinary, nullable=True),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("discovered_tools", JSONB, nullable=True),
        sa.Column("last_discovered_at", DT, nullable=True),
        sa.Column("default_risk_level", sa.String(20), nullable=False, server_default="high"),
        *_ts(),
    )

    # ── mcp_tool_overrides ──
    op.create_table("mcp_tool_overrides",
        _uuid_pk(),
        sa.Column("mcp_server_id", UUID, sa.ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tool_name", sa.String(200), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("mcp_server_id", "tool_name", name="uq_mcp_tool_overrides"),
    )

    # ── hitl_requests ──
    op.create_table("hitl_requests",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tool_id", sa.String(255), nullable=False),
        sa.Column("tool_input", JSONB, nullable=False),
        sa.Column("action_summary", sa.Text, nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False, server_default="high"),
        sa.Column("agent_id", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("resolution_note", sa.Text, nullable=True),
        sa.Column("created_at", DT, nullable=False, server_default=NOW),
        sa.Column("resolved_at", DT, nullable=True),
    )
    op.create_index("idx_hitl_requests_workspace_status", "hitl_requests", ["workspace_id", "status"])
    op.create_index("idx_hitl_requests_conversation", "hitl_requests", ["conversation_id"])
    op.create_index("idx_hitl_requests_status", "hitl_requests", ["status", "created_at"])

    # ── agent_executions ──
    op.create_table("agent_executions",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("iteration_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tool_calls_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("token_usage", JSONB, nullable=True),
        sa.Column("timeline", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", DT, nullable=False, server_default=NOW),
        sa.Column("completed_at", DT, nullable=True),
    )
    op.create_index("idx_agent_exec_workspace", "agent_executions", ["workspace_id", "started_at"])
    op.create_index("idx_agent_exec_status", "agent_executions", ["status"],
                     postgresql_where=sa.text("status IN ('running', 'paused_hitl', 'queued')"))

    # ── tool_permissions ──
    op.create_table("tool_permissions",
        _uuid_pk(),
        sa.Column("tool_id", sa.String(200), nullable=False, unique=True),
        sa.Column("permission", sa.String(20), nullable=False, server_default="default"),
        sa.Column("updated_at", DT, nullable=False, server_default=NOW),
    )

    # ── task_logs ──
    op.create_table("task_logs",
        _uuid_pk(),
        sa.Column("task_type", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("started_at", DT, nullable=False, server_default=NOW),
        sa.Column("finished_at", DT, nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("item_count", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("target_link", sa.Text, nullable=True),
    )
    op.create_index("idx_task_logs_started", "task_logs", ["started_at"])
    op.create_index("idx_task_logs_type", "task_logs", ["task_type", "started_at"])

    # ── agent_memory ──
    op.create_table("agent_memory",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(100), nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("memory_type", sa.String(20), nullable=False, server_default="observation"),
        sa.Column("decay_rate", sa.Float, nullable=False, server_default="0.01"),
        sa.Column("confidence", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("access_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", DT, nullable=False, server_default=NOW),
        sa.Column("last_accessed_at", DT, nullable=False, server_default=NOW),
    )
    op.create_index("idx_agent_memory_workspace", "agent_memory", ["workspace_id", "is_active"])
    op.create_index("idx_agent_memory_agent", "agent_memory", ["agent_id", "is_active"])

    # ── agent_profiles ──
    op.create_table("agent_profiles",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("role", sa.String(50), server_default="assistant"),
        sa.Column("system_prompt_ref", sa.String(500), nullable=True),
        sa.Column("model_policy_id", UUID, nullable=True),
        sa.Column("memory_policy_id", UUID, nullable=True),
        sa.Column("safety_policy_id", UUID, nullable=True),
        sa.Column("capability_bundle_ids", JSONB, server_default=EMPTY_ARR),
        sa.Column("output_contract_id", UUID, nullable=True),
        sa.Column("is_system", sa.Boolean, server_default=sa.text("false")),
        sa.Column("is_template", sa.Boolean, server_default=sa.text("false")),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("icon", sa.String(100), nullable=True),
        sa.Column("tags", JSONB, server_default=EMPTY_ARR),
        sa.Column("catalog_metadata", JSONB, server_default=EMPTY_OBJ),
        sa.Column("is_featured", sa.Boolean, server_default=sa.text("false")),
        sa.Column("is_recommended", sa.Boolean, server_default=sa.text("false")),
        sa.Column("sort_priority", sa.Integer, server_default="0"),
        sa.Column("created_at", DT, server_default=NOW),
        sa.Column("updated_at", DT, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )
    op.create_index("ix_agent_profiles_slug", "agent_profiles", ["slug"])

    # ── agents ──
    op.create_table("agents",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("blueprint_md", sa.Text, nullable=False, server_default=""),
        sa.Column("active_spec_id", UUID, nullable=True),  # deferred FK
        sa.Column("profile_id", UUID, sa.ForeignKey("agent_profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("mode", sa.String(50), nullable=False, server_default="interactive"),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column("icon", sa.String(100), nullable=True),
        sa.Column("is_template", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("tags", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("last_used_at", DT, nullable=True),
        sa.Column("last_error_at", DT, nullable=True),
        sa.Column("health_status", sa.String(50), nullable=False, server_default="unknown"),
        sa.Column("last_error_summary", sa.Text, nullable=True),
        sa.Column("compilation_status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("compilation_error", sa.Text, nullable=True),
        sa.Column("last_compiled_at", DT, nullable=True),
        *_ts(),
    )
    op.create_index("ix_agents_slug", "agents", ["slug"])
    op.create_index("idx_agents_status", "agents", ["status"])
    op.create_index("idx_agents_mode", "agents", ["mode"])

    # ── compiled_agent_specs ──
    op.create_table("compiled_agent_specs",
        _uuid_pk(),
        sa.Column("agent_id", UUID, sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("blueprint_snapshot", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("resolved_config", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("profile_id", UUID, sa.ForeignKey("agent_profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_md_hash", sa.String(64), nullable=False),
        sa.Column("compiler_version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("is_valid", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("validation_errors", JSONB, nullable=False, server_default=EMPTY_ARR),
        _ts_created(),
        sa.UniqueConstraint("agent_id", "version", name="uq_compiled_agent_specs_agent_version"),
    )
    op.create_index("ix_compiled_agent_specs_agent_id", "compiled_agent_specs", ["agent_id"])

    # ── automations ──
    op.create_table("automations",
        _uuid_pk(),
        sa.Column("agent_id", UUID, sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("active_spec_id", UUID, nullable=True),  # deferred FK
        sa.Column("trigger_config", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("budget_config", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("output_config", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column("icon", sa.String(100), nullable=True),
        sa.Column("is_template", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("tags", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("last_run_at", DT, nullable=True),
        sa.Column("last_success_at", DT, nullable=True),
        sa.Column("last_failure_at", DT, nullable=True),
        sa.Column("last_triggered_at", DT, nullable=True),
        sa.Column("health_status", sa.String(50), nullable=False, server_default="unknown"),
        sa.Column("last_error_summary", sa.Text, nullable=True),
        sa.Column("compilation_status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("compilation_error", sa.Text, nullable=True),
        sa.Column("last_compiled_at", DT, nullable=True),
        *_ts(),
    )
    op.create_index("ix_automations_slug", "automations", ["slug"])
    op.create_index("idx_automations_status", "automations", ["status"])
    op.create_index("idx_automations_agent_id", "automations", ["agent_id"])

    # ── compiled_automation_specs ──
    op.create_table("compiled_automation_specs",
        _uuid_pk(),
        sa.Column("automation_id", UUID, sa.ForeignKey("automations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("resolved_config", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("agent_spec_id", UUID, sa.ForeignKey("compiled_agent_specs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("trigger_id", UUID, nullable=True),  # FK added after trigger_definitions
        sa.Column("compiler_version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("is_valid", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("validation_errors", JSONB, nullable=False, server_default=EMPTY_ARR),
        _ts_created(),
        sa.UniqueConstraint("automation_id", "version", name="uq_compiled_automation_specs_automation_version"),
    )
    op.create_index("ix_compiled_automation_specs_automation_id", "compiled_automation_specs", ["automation_id"])

    # ── strategy_plugins ──
    op.create_table("strategy_plugins",
        _uuid_pk(),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("manifest", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("is_builtin", sa.Boolean, nullable=False, server_default=sa.text("false")),
        *_ts(),
    )
    op.create_index("ix_strategy_plugins_name", "strategy_plugins", ["name"])

    # ── workflow_definitions ──
    op.create_table("workflow_definitions",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("current_version_id", UUID, nullable=True),
        sa.Column("version", sa.Integer, server_default="1"),
        sa.Column("entry_node", sa.String(100), nullable=True),
        sa.Column("state_schema", JSONB, server_default=EMPTY_OBJ),
        sa.Column("nodes", JSONB, server_default=EMPTY_ARR),
        sa.Column("edges", JSONB, server_default=EMPTY_ARR),
        sa.Column("default_input_schema", JSONB, server_default=EMPTY_OBJ),
        sa.Column("default_output_schema", JSONB, server_default=EMPTY_OBJ),
        sa.Column("is_system", sa.Boolean, server_default=sa.text("false")),
        sa.Column("is_template", sa.Boolean, server_default=sa.text("false")),
        sa.Column("template_kind", sa.String(80), nullable=True),
        sa.Column("template_metadata", JSONB, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("tags", JSONB, server_default=EMPTY_ARR),
        sa.Column("is_featured", sa.Boolean, server_default=sa.text("false")),
        sa.Column("is_recommended", sa.Boolean, server_default=sa.text("false")),
        sa.Column("sort_priority", sa.Integer, server_default="0"),
        sa.Column("icon", sa.String(100), nullable=True),
        sa.Column("created_at", DT, server_default=NOW),
        sa.Column("updated_at", DT, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )
    op.create_index("ix_workflow_definitions_slug", "workflow_definitions", ["slug"])
    op.create_index("idx_workflow_definitions_workspace_status", "workflow_definitions", ["workspace_id", "status"])

    # ── workflow_versions ──
    op.create_table("workflow_versions",
        _uuid_pk(),
        sa.Column("workflow_id", UUID, sa.ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("state_schema", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("entry_node_id", UUID, nullable=True),
        sa.Column("default_input_schema", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("default_output_schema", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column("change_note", sa.Text, nullable=True),
        *_ts(),
        sa.UniqueConstraint("workflow_id", "version_number", name="uq_workflow_versions_workflow_version"),
    )
    op.create_index("ix_workflow_versions_workflow_id", "workflow_versions", ["workflow_id"])

    # ── workflow_nodes ──
    op.create_table("workflow_nodes",
        _uuid_pk(),
        sa.Column("workflow_version_id", UUID, sa.ForeignKey("workflow_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_key", sa.String(120), nullable=False),
        sa.Column("node_type", sa.String(50), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("config", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("executor_ref", sa.String(150), nullable=True),
        sa.Column("input_mapping", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("output_mapping", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        *_ts(),
        sa.UniqueConstraint("workflow_version_id", "node_key", name="uq_workflow_nodes_version_key"),
    )
    op.create_index("ix_workflow_nodes_workflow_version_id", "workflow_nodes", ["workflow_version_id"])

    # ── workflow_edges ──
    op.create_table("workflow_edges",
        _uuid_pk(),
        sa.Column("workflow_version_id", UUID, sa.ForeignKey("workflow_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_node_id", UUID, sa.ForeignKey("workflow_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_node_id", UUID, sa.ForeignKey("workflow_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("edge_type", sa.String(50), nullable=False, server_default="success"),
        sa.Column("condition", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("priority", sa.Integer, nullable=False, server_default="100"),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        *_ts(),
    )
    op.create_index("idx_workflow_edges_version_priority", "workflow_edges", ["workflow_version_id", "priority"])

    # ── mission_definitions ──
    op.create_table("mission_definitions",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("workflow_id", UUID, nullable=False),
        sa.Column("workflow_version_id", UUID, nullable=True),
        sa.Column("default_profile_ids", JSONB, server_default=EMPTY_ARR),
        sa.Column("default_trigger_ids", JSONB, server_default=EMPTY_ARR),
        sa.Column("autonomy_mode", sa.String(50), server_default="supervised"),
        sa.Column("approval_policy_id", UUID, nullable=True),
        sa.Column("budget_policy_id", UUID, nullable=True),
        sa.Column("output_artifact_types", JSONB, server_default=EMPTY_ARR),
        sa.Column("is_system", sa.Boolean, server_default=sa.text("false")),
        sa.Column("is_template", sa.Boolean, server_default=sa.text("false")),
        sa.Column("recommended_use_case", sa.Text, nullable=True),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("tags", JSONB, server_default=EMPTY_ARR),
        sa.Column("catalog_metadata", JSONB, server_default=EMPTY_OBJ),
        sa.Column("is_featured", sa.Boolean, server_default=sa.text("false")),
        sa.Column("is_recommended", sa.Boolean, server_default=sa.text("false")),
        sa.Column("sort_priority", sa.Integer, server_default="0"),
        sa.Column("icon", sa.String(100), nullable=True),
        sa.Column("last_run_at", DT, nullable=True),
        sa.Column("last_success_at", DT, nullable=True),
        sa.Column("last_failure_at", DT, nullable=True),
        sa.Column("last_triggered_at", DT, nullable=True),
        sa.Column("health_status", sa.String(50), nullable=True, server_default="unknown"),
        sa.Column("last_error_summary", sa.Text, nullable=True),
        sa.Column("created_at", DT, server_default=NOW),
        sa.Column("updated_at", DT, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )
    op.create_index("ix_mission_definitions_slug", "mission_definitions", ["slug"])

    # ── trigger_definitions ──
    op.create_table("trigger_definitions",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("trigger_type", sa.String(50), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", UUID, nullable=False),
        sa.Column("schedule_expression", sa.String(100), nullable=True),
        sa.Column("interval_seconds", sa.Integer, nullable=True),
        sa.Column("event_type", sa.String(100), nullable=True),
        sa.Column("payload_template", JSONB, nullable=True),
        sa.Column("is_enabled", sa.Boolean, server_default=sa.text("true")),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("last_fired_at", DT, nullable=True),
        sa.Column("next_fire_at", DT, nullable=True),
        sa.Column("created_at", DT, server_default=NOW),
        sa.Column("updated_at", DT, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )
    op.create_index("ix_trigger_definitions_workspace_id", "trigger_definitions", ["workspace_id"])
    op.create_index("ix_trigger_definitions_target_id", "trigger_definitions", ["target_id"])

    # ── trigger_fire_history ──
    op.create_table("trigger_fire_history",
        _uuid_pk(),
        sa.Column("trigger_id", UUID, nullable=False),
        sa.Column("mission_id", UUID, nullable=True),
        sa.Column("run_id", UUID, nullable=True),
        sa.Column("fired_at", DT, nullable=False, server_default=NOW),
        sa.Column("launch_status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("payload_snapshot", JSONB, nullable=True),
    )
    op.create_index("ix_trigger_fire_history_trigger_id", "trigger_fire_history", ["trigger_id"])

    # ── mission_budget_policies ──
    op.create_table("mission_budget_policies",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("max_runs_per_day", sa.Integer, nullable=True),
        sa.Column("max_runs_per_window", sa.Integer, nullable=True),
        sa.Column("window_seconds", sa.Integer, nullable=True),
        sa.Column("max_concurrent_runs", sa.Integer, nullable=True),
        sa.Column("max_token_budget_per_window", sa.Integer, nullable=True),
        sa.Column("cooldown_seconds_after_failure", sa.Integer, nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        *_ts(),
    )

    # ── runs ──
    op.create_table("runs",
        _uuid_pk(),
        sa.Column("run_type", sa.String(50), nullable=False),
        sa.Column("workflow_id", UUID, nullable=True),
        sa.Column("workflow_version_id", UUID, nullable=True),
        sa.Column("mission_id", UUID, nullable=True),
        sa.Column("trigger_id", UUID, nullable=True),
        sa.Column("parent_run_id", UUID, nullable=True),
        sa.Column("root_run_id", UUID, nullable=True),
        sa.Column("spawned_by_step_id", UUID, nullable=True),
        sa.Column("workspace_id", UUID, nullable=False),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("state_snapshot", JSONB, server_default=EMPTY_OBJ),
        sa.Column("input_payload", JSONB, server_default=EMPTY_OBJ),
        sa.Column("output_payload", JSONB, server_default=EMPTY_OBJ),
        sa.Column("current_node_id", UUID, nullable=True),
        sa.Column("delegation_mode", sa.String(50), nullable=True),
        sa.Column("merge_strategy", sa.String(100), nullable=True),
        sa.Column("join_group_id", sa.String(120), nullable=True),
        sa.Column("branch_key", sa.String(120), nullable=True),
        sa.Column("branch_index", sa.Integer, nullable=True),
        sa.Column("handoff_reason", sa.Text, nullable=True),
        sa.Column("composite_metadata", JSONB, server_default=EMPTY_OBJ),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", DT, nullable=True),
        sa.Column("completed_at", DT, nullable=True),
        sa.Column("cancelled_at", DT, nullable=True),
        *_ts(),
    )
    op.create_index("idx_runs_workspace_status", "runs", ["workspace_id", "status"])
    op.create_index("idx_runs_root_status", "runs", ["root_run_id", "status"])

    # ── run_steps ──
    op.create_table("run_steps",
        _uuid_pk(),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", UUID, nullable=True),
        sa.Column("node_key", sa.String(120), nullable=True),
        sa.Column("step_index", sa.Integer, nullable=False, server_default="1"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("input_snapshot", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("output_snapshot", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("delegation_mode", sa.String(50), nullable=True),
        sa.Column("merge_strategy", sa.String(100), nullable=True),
        sa.Column("join_group_id", sa.String(120), nullable=True),
        sa.Column("branch_key", sa.String(120), nullable=True),
        sa.Column("branch_index", sa.Integer, nullable=True),
        sa.Column("handoff_reason", sa.Text, nullable=True),
        sa.Column("composite_metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("checkpoint_id", UUID, nullable=True),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("started_at", DT, nullable=True),
        sa.Column("completed_at", DT, nullable=True),
        *_ts(),
        sa.UniqueConstraint("run_id", "step_index", name="uq_run_steps_run_step_index"),
    )

    # ── checkpoints ──
    op.create_table("checkpoints",
        _uuid_pk(),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_id", UUID, sa.ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("checkpoint_type", sa.String(50), nullable=False, server_default="after_step"),
        sa.Column("state_snapshot", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        _ts_created(),
    )
    op.create_index("idx_checkpoints_run_created", "checkpoints", ["run_id", "created_at"])

    # ── runtime_events ──
    op.create_table("runtime_events",
        _uuid_pk(),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_id", UUID, sa.ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workflow_id", UUID, nullable=True),
        sa.Column("workflow_version_id", UUID, nullable=True),
        sa.Column("node_id", UUID, nullable=True),
        sa.Column("node_key", sa.String(120), nullable=True),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("payload", JSONB, nullable=False, server_default=EMPTY_OBJ),
        _ts_created(),
    )
    op.create_index("idx_runtime_events_run_created", "runtime_events", ["run_id", "created_at"])

    # ── artifacts ──
    op.create_table("artifacts",
        _uuid_pk(),
        sa.Column("artifact_type", sa.String(50), nullable=False),
        sa.Column("workspace_id", UUID, nullable=False),
        sa.Column("source_run_id", UUID, nullable=True),
        sa.Column("source_workflow_id", UUID, nullable=True),
        sa.Column("source_mission_id", UUID, nullable=True),
        sa.Column("source_profile_id", UUID, nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("content", JSONB, server_default=EMPTY_OBJ),
        sa.Column("metadata", JSONB, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("visibility", sa.String(50), nullable=False, server_default="workspace"),
        sa.Column("creation_mode", sa.String(50), nullable=False, server_default="user_created"),
        sa.Column("current_version_id", UUID, nullable=True),
        sa.Column("version", sa.Integer, server_default="1"),
        sa.Column("created_by_type", sa.String(50), nullable=True),
        sa.Column("created_by_id", UUID, nullable=True),
        sa.Column("tags", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("created_at", DT, server_default=NOW),
        sa.Column("updated_at", DT, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )
    op.create_index("idx_artifacts_workspace_status", "artifacts", ["workspace_id", "status"])
    op.create_index("idx_artifacts_workspace_type", "artifacts", ["workspace_id", "artifact_type"])

    # ── artifact_versions ──
    op.create_table("artifact_versions",
        _uuid_pk(),
        sa.Column("artifact_id", UUID, sa.ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("content_type", sa.String(100), nullable=False, server_default="structured_payload"),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("structured_payload", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("change_note", sa.Text, nullable=True),
        sa.Column("source_run_id", UUID, nullable=True),
        sa.Column("source_evidence_packet_id", UUID, nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column("created_by_type", sa.String(50), nullable=True),
        sa.Column("created_by_id", UUID, nullable=True),
        *_ts(),
        sa.UniqueConstraint("artifact_id", "version_number", name="uq_artifact_versions_artifact_version"),
    )

    # ── artifact_links ──
    op.create_table("artifact_links",
        _uuid_pk(),
        sa.Column("artifact_id", UUID, sa.ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", UUID, sa.ForeignKey("artifact_versions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("link_type", sa.String(50), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", UUID, nullable=False),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        _ts_created(),
    )

    # ── artifact_sinks ──
    op.create_table("artifact_sinks",
        _uuid_pk(),
        sa.Column("artifact_id", UUID, sa.ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sink_type", sa.String(50), nullable=False),
        sa.Column("sink_state", sa.String(50), nullable=False, server_default="configured"),
        sa.Column("destination_ref", sa.String(1000), nullable=True),
        sa.Column("sync_status", sa.String(50), nullable=False, server_default="not_published"),
        sa.Column("metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("last_synced_at", DT, nullable=True),
        *_ts(),
    )

    # ── prompt_definitions ──
    op.create_table("prompt_definitions",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("prompt_type", sa.String(50), nullable=False),
        sa.Column("template", sa.Text, nullable=False),
        sa.Column("template_format", sa.String(50), nullable=False, server_default="format_string"),
        sa.Column("variable_schema", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("fallback_behavior", sa.String(50), nullable=False, server_default="error"),
        sa.Column("owner_type", sa.String(50), nullable=False, server_default="system"),
        sa.Column("owner_id", sa.String(255), nullable=True),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_template", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", DT, nullable=False, server_default=NOW),
        sa.Column("updated_at", DT, nullable=False, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )

    # ── prompt_versions ──
    op.create_table("prompt_versions",
        _uuid_pk(),
        sa.Column("prompt_definition_id", UUID, sa.ForeignKey("prompt_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("template", sa.Text, nullable=False),
        sa.Column("template_format", sa.String(50), nullable=False, server_default="format_string"),
        sa.Column("variable_schema", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        _ts_created(),
        sa.Column("created_by", UUID, nullable=True),
        sa.UniqueConstraint("prompt_definition_id", "version", name="uq_prompt_versions_definition_version"),
    )

    # ── prompt_usage_logs ──
    op.create_table("prompt_usage_logs",
        _uuid_pk(),
        sa.Column("prompt_definition_id", UUID, sa.ForeignKey("prompt_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("prompt_version_id", UUID, sa.ForeignKey("prompt_versions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("owner_type", sa.String(50), nullable=False, server_default="system"),
        sa.Column("owner_id", sa.String(255), nullable=True),
        sa.Column("render_context", sa.String(100), nullable=True),
        sa.Column("variable_keys", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("rendered_at", DT, nullable=False, server_default=NOW),
        sa.Column("success", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("error_code", sa.String(100), nullable=True),
    )

    # ── Policies ──
    for tbl in ("tool_policies", "safety_policies", "approval_policies"):
        cols = [
            _uuid_pk(),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("scope_type", sa.String(50), nullable=False, server_default="system"),
            sa.Column("scope_id", sa.String(255), nullable=True),
            sa.Column("rules", JSONB, nullable=False, server_default=EMPTY_ARR),
            sa.Column("status", sa.String(50), nullable=False, server_default="active"),
            *_ts(),
            sa.Column("created_by", UUID, nullable=True),
            sa.Column("updated_by", UUID, nullable=True),
        ]
        if tbl == "tool_policies":
            cols.insert(5, sa.Column("default_action", sa.String(50), nullable=False, server_default="allow"))
            cols.insert(6, sa.Column("rate_limits", JSONB, nullable=False, server_default=EMPTY_OBJ))
            cols.insert(7, sa.Column("allowed_tools", JSONB, nullable=False, server_default=EMPTY_ARR))
            cols.insert(8, sa.Column("blocked_tools", JSONB, nullable=False, server_default=EMPTY_ARR))
            cols.insert(9, sa.Column("approval_required_tools", JSONB, nullable=False, server_default=EMPTY_ARR))
        elif tbl == "approval_policies":
            cols.insert(5, sa.Column("default_action", sa.String(50), nullable=False, server_default="requires_approval"))
        op.create_table(tbl, *cols)

    # ── policy_rule_entries ──
    op.create_table("policy_rule_entries",
        _uuid_pk(),
        sa.Column("policy_type", sa.String(50), nullable=False),
        sa.Column("policy_id", UUID, nullable=False),
        sa.Column("rule_name", sa.String(255), nullable=False),
        sa.Column("rule_type", sa.String(50), nullable=False),
        sa.Column("tool_name", sa.String(255), nullable=True),
        sa.Column("risk_category", sa.String(100), nullable=True),
        sa.Column("action", sa.String(50), nullable=True),
        sa.Column("config", JSONB, nullable=False, server_default=EMPTY_OBJ),
        _ts_created(),
    )

    # ── approval_requests ──
    op.create_table("approval_requests",
        _uuid_pk(),
        sa.Column("request_type", sa.String(50), nullable=False, server_default="tool_invocation"),
        sa.Column("scope_type", sa.String(50), nullable=False, server_default="workspace"),
        sa.Column("scope_id", sa.String(255), nullable=True),
        sa.Column("source_run_id", UUID, sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("requested_action", sa.Text, nullable=False),
        sa.Column("tool_name", sa.String(255), nullable=True),
        sa.Column("reason_code", sa.String(100), nullable=False),
        sa.Column("reason_text", sa.Text, nullable=False),
        sa.Column("risk_category", sa.String(100), nullable=False),
        sa.Column("payload_preview", JSONB, nullable=True),
        sa.Column("matched_policy_id", UUID, nullable=True),
        sa.Column("matched_rule_id", UUID, nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("requested_at", DT, nullable=False, server_default=NOW),
        sa.Column("resolved_at", DT, nullable=True),
        sa.Column("resolved_by", sa.String(255), nullable=True),
        sa.Column("resolution_note", sa.Text, nullable=True),
    )
    op.create_index("idx_approval_requests_status", "approval_requests", ["status", "requested_at"])

    # ── retrieval_queries ──
    op.create_table("retrieval_queries",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("query_text", sa.Text, nullable=False),
        sa.Column("normalized_query", sa.Text, nullable=False),
        sa.Column("search_strategy", sa.String(100), nullable=False, server_default="hybrid_rrf"),
        sa.Column("status", sa.String(50), nullable=False, server_default="completed"),
        sa.Column("metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        *_ts(),
    )

    # ── retrieval_search_results ──
    op.create_table("retrieval_search_results",
        _uuid_pk(),
        sa.Column("query_id", UUID, sa.ForeignKey("retrieval_queries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", sa.String(255), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("knowledge_type", sa.String(50), nullable=True),
        sa.Column("excerpt", sa.Text, nullable=False),
        sa.Column("header_path", sa.String(1000), nullable=True),
        sa.Column("parent_excerpt", sa.Text, nullable=True),
        sa.Column("score", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("rank_position", sa.Integer, nullable=False),
        sa.Column("strategy", sa.String(100), nullable=False, server_default="hybrid_rrf"),
        sa.Column("result_status", sa.String(50), nullable=False, server_default="candidate"),
        sa.Column("opened", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("selected", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("summary_status", sa.String(50), nullable=True),
        sa.Column("selection_reason_codes", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("trust_metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        *_ts(),
    )

    # ── evidence_packets ──
    op.create_table("evidence_packets",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("query_id", UUID, sa.ForeignKey("retrieval_queries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("packet_status", sa.String(50), nullable=False, server_default="ready"),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("item_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("items", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        *_ts(),
    )

    # ── conversation_summaries ──
    op.create_table("conversation_summaries",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("summary_type", sa.String(50), nullable=False, server_default="conversation_memory"),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("threshold_message_count", sa.Integer, nullable=False, server_default="20"),
        sa.Column("keep_recent_messages", sa.Integer, nullable=False, server_default="10"),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("recent_messages", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        *_ts(),
        sa.UniqueConstraint("conversation_id", "version", name="uq_conversation_summaries_conversation_version"),
    )

    # ── tool_output_summaries ──
    op.create_table("tool_output_summaries",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tool_name", sa.String(255), nullable=False),
        sa.Column("call_id", sa.String(255), nullable=True),
        sa.Column("summary_type", sa.String(50), nullable=True),
        sa.Column("handling_mode", sa.String(50), nullable=False, server_default="inline"),
        sa.Column("raw_char_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("raw_token_estimate", sa.Integer, nullable=False, server_default="0"),
        sa.Column("preview", sa.Text, nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        *_ts(),
    )

    # ── Graph domain ──
    op.create_table("graph_extraction_jobs",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", UUID, nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="queued"),
        sa.Column("entity_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("relationship_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("metadata", JSONB, nullable=False, server_default=EMPTY_OBJ),
        *_ts(),
    )

    op.create_table("graph_extraction_results",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("extraction_job_id", UUID, sa.ForeignKey("graph_extraction_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_mentions", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("relationship_mentions", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("canonicalization_records", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("errors", JSONB, nullable=False, server_default=EMPTY_ARR),
        sa.Column("notes", JSONB, nullable=False, server_default=EMPTY_ARR),
        *_ts(),
    )

    op.create_table("entities",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canonical_name", sa.String(500), nullable=False),
        sa.Column("normalized_key", sa.String(500), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False, server_default="generic"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("attributes", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("confidence", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("source_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("last_seen_at", DT, nullable=False, server_default=NOW),
        *_ts(),
    )

    op.create_table("entity_mentions",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("extraction_job_id", UUID, sa.ForeignKey("graph_extraction_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canonical_entity_id", UUID, sa.ForeignKey("entities.id", ondelete="SET NULL"), nullable=True),
        sa.Column("mention_text", sa.String(500), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False, server_default="generic"),
        sa.Column("context_snippet", sa.Text, nullable=True),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", UUID, nullable=False),
        sa.Column("extraction_method", sa.String(100), nullable=False, server_default="llm"),
        sa.Column("confidence", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("resolution_status", sa.String(50), nullable=False, server_default="unresolved"),
        _ts_created(),
    )

    op.create_table("entity_aliases",
        _uuid_pk(),
        sa.Column("entity_id", UUID, sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alias", sa.String(500), nullable=False),
        sa.Column("alias_type", sa.String(100), nullable=False, server_default="alternate_name"),
        sa.Column("source_mention_id", UUID, sa.ForeignKey("entity_mentions.id", ondelete="SET NULL"), nullable=True),
        _ts_created(),
    )

    op.create_table("entity_canonicalization_records",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mention_id", UUID, sa.ForeignKey("entity_mentions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canonical_entity_id", UUID, sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canonicalization_state", sa.String(50), nullable=False, server_default="resolved"),
        sa.Column("match_type", sa.String(100), nullable=False),
        sa.Column("match_confidence", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("rationale", sa.Text, nullable=False),
        _ts_created(),
    )

    op.create_table("relationships",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_entity_id", UUID, sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("object_entity_id", UUID, sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("predicate", sa.String(200), nullable=False),
        sa.Column("relationship_type", sa.String(100), nullable=False, server_default="generic"),
        sa.Column("attributes", JSONB, nullable=False, server_default=EMPTY_OBJ),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("confidence", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("support_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("directionality", sa.String(50), nullable=False, server_default="directed"),
        *_ts(),
    )

    op.create_table("relationship_mentions",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("extraction_job_id", UUID, sa.ForeignKey("graph_extraction_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canonical_relationship_id", UUID, sa.ForeignKey("relationships.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject_mention_id", UUID, sa.ForeignKey("entity_mentions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("object_mention_id", UUID, sa.ForeignKey("entity_mentions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("predicate", sa.String(200), nullable=False),
        sa.Column("source_snippet", sa.Text, nullable=True),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", UUID, nullable=False),
        sa.Column("extraction_method", sa.String(100), nullable=False, server_default="llm"),
        sa.Column("confidence", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("resolution_status", sa.String(50), nullable=False, server_default="unresolved"),
        _ts_created(),
    )

    op.create_table("graph_provenance_links",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("graph_object_type", sa.String(50), nullable=False),
        sa.Column("graph_object_id", UUID, nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", UUID, nullable=False),
        sa.Column("excerpt", sa.Text, nullable=True),
        sa.Column("char_start", sa.Integer, nullable=True),
        sa.Column("char_end", sa.Integer, nullable=True),
        sa.Column("confidence", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("extraction_method", sa.String(100), nullable=False, server_default="llm"),
        _ts_created(),
    )

    # ── Profile building blocks ──
    op.create_table("capability_bundles",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("tools_enabled", sa.Boolean, server_default=sa.text("true")),
        sa.Column("allowed_tool_categories", JSONB, nullable=True),
        sa.Column("blocked_tool_ids", JSONB, server_default=EMPTY_ARR),
        sa.Column("tool_overrides", JSONB, server_default=EMPTY_OBJ),
        sa.Column("max_tool_calls_per_minute", sa.Integer, server_default="30"),
        sa.Column("max_tool_calls_per_execution", sa.Integer, server_default="200"),
        sa.Column("skill_ids", JSONB, server_default=EMPTY_ARR),
        sa.Column("retrieval_enabled", sa.Boolean, server_default=sa.text("true")),
        sa.Column("retrieval_limit", sa.Integer, server_default="5"),
        sa.Column("retrieval_score_threshold", sa.Float, server_default="0.35"),
        sa.Column("knowledge_scope", sa.String(50), server_default="workspace"),
        sa.Column("is_system", sa.Boolean, server_default=sa.text("false")),
        sa.Column("status", sa.String(50), server_default="active"),
        sa.Column("created_at", DT, server_default=NOW),
        sa.Column("updated_at", DT, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )

    op.create_table("model_policies",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("default_provider_id", UUID, nullable=True),
        sa.Column("default_model", sa.String(200), nullable=True),
        sa.Column("allow_runtime_override", sa.Boolean, server_default=sa.text("true")),
        sa.Column("allowed_models", JSONB, server_default=EMPTY_ARR),
        sa.Column("blocked_models", JSONB, server_default=EMPTY_ARR),
        sa.Column("max_tokens_per_request", sa.Integer, nullable=True),
        sa.Column("max_tokens_per_day", sa.Integer, nullable=True),
        sa.Column("is_system", sa.Boolean, server_default=sa.text("false")),
        sa.Column("status", sa.String(50), server_default="active"),
        sa.Column("created_at", DT, server_default=NOW),
        sa.Column("updated_at", DT, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )

    op.create_table("memory_policies",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("history_limit", sa.Integer, server_default="20"),
        sa.Column("history_strategy", sa.String(50), server_default="sliding_window"),
        sa.Column("attachment_support", sa.Boolean, server_default=sa.text("true")),
        sa.Column("auto_bookmark_urls", sa.Boolean, server_default=sa.text("true")),
        sa.Column("mention_support", sa.Boolean, server_default=sa.text("true")),
        sa.Column("is_system", sa.Boolean, server_default=sa.text("false")),
        sa.Column("status", sa.String(50), server_default="active"),
        sa.Column("created_at", DT, server_default=NOW),
        sa.Column("updated_at", DT, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )

    op.create_table("output_contracts",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("execution_mode", sa.String(50), server_default="streaming"),
        sa.Column("require_structured_output", sa.Boolean, server_default=sa.text("false")),
        sa.Column("output_schema", JSONB, nullable=True),
        sa.Column("require_citations", sa.Boolean, server_default=sa.text("false")),
        sa.Column("is_system", sa.Boolean, server_default=sa.text("false")),
        sa.Column("status", sa.String(50), server_default="active"),
        sa.Column("created_at", DT, server_default=NOW),
        sa.Column("updated_at", DT, server_default=NOW),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("updated_by", UUID, nullable=True),
    )

    # ── Observability ──
    op.create_table("usage_records",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, nullable=True),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_id", UUID, sa.ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workflow_id", UUID, nullable=True),
        sa.Column("mission_id", UUID, nullable=True),
        sa.Column("profile_id", UUID, nullable=True),
        sa.Column("record_type", sa.String(50), nullable=False),
        sa.Column("model_name", sa.String(200), nullable=True),
        sa.Column("provider_name", sa.String(100), nullable=True),
        sa.Column("tool_name", sa.String(255), nullable=True),
        sa.Column("input_tokens", sa.Integer, server_default="0"),
        sa.Column("output_tokens", sa.Integer, server_default="0"),
        sa.Column("reasoning_tokens", sa.Integer, server_default="0"),
        sa.Column("total_tokens", sa.Integer, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("request_count", sa.Integer, server_default="1"),
        sa.Column("success", sa.Boolean, server_default=sa.text("true")),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("metadata", JSONB, server_default=EMPTY_OBJ),
        sa.Column("created_at", DT, server_default=NOW),
    )

    op.create_table("failure_events",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, nullable=True),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=True),
        sa.Column("step_id", UUID, sa.ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workflow_id", UUID, nullable=True),
        sa.Column("mission_id", UUID, nullable=True),
        sa.Column("trigger_id", UUID, nullable=True),
        sa.Column("failure_class", sa.String(100), nullable=False),
        sa.Column("error_code", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="error"),
        sa.Column("retryability", sa.String(20), nullable=False, server_default="not_retryable"),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("detail", JSONB, server_default=EMPTY_OBJ),
        sa.Column("affected_node_key", sa.String(120), nullable=True),
        sa.Column("related_policy_id", UUID, nullable=True),
        sa.Column("related_approval_id", UUID, nullable=True),
        sa.Column("resolved", sa.Boolean, server_default=sa.text("false")),
        sa.Column("created_at", DT, server_default=NOW),
    )

    # ── Evaluation ──
    op.create_table("evaluation_scenarios",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("suite_name", sa.String(100), nullable=False),
        sa.Column("scenario_type", sa.String(50), nullable=False, server_default="golden_task"),
        sa.Column("input_payload", JSONB, server_default=EMPTY_OBJ),
        sa.Column("expected_behaviors", JSONB, server_default=EMPTY_ARR),
        sa.Column("expected_output_constraints", JSONB, server_default=EMPTY_OBJ),
        sa.Column("workflow_template_id", UUID, nullable=True),
        sa.Column("profile_template_id", UUID, nullable=True),
        sa.Column("mission_template_id", UUID, nullable=True),
        sa.Column("evaluation_metrics", JSONB, server_default=EMPTY_ARR),
        sa.Column("tags", JSONB, server_default=EMPTY_ARR),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        *_ts(),
    )

    op.create_table("evaluation_runs",
        _uuid_pk(),
        sa.Column("workspace_id", UUID, nullable=True),
        sa.Column("suite_name", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("scenario_count", sa.Integer, server_default="0"),
        sa.Column("passed_count", sa.Integer, server_default="0"),
        sa.Column("failed_count", sa.Integer, server_default="0"),
        sa.Column("skipped_count", sa.Integer, server_default="0"),
        sa.Column("total_cost_usd", sa.Float, nullable=True),
        sa.Column("total_tokens", sa.Integer, server_default="0"),
        sa.Column("baseline_id", UUID, nullable=True),
        sa.Column("metadata", JSONB, server_default=EMPTY_OBJ),
        sa.Column("started_at", DT, nullable=True),
        sa.Column("completed_at", DT, nullable=True),
        *_ts(),
    )

    op.create_table("evaluation_results",
        _uuid_pk(),
        sa.Column("evaluation_run_id", UUID, sa.ForeignKey("evaluation_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scenario_id", UUID, sa.ForeignKey("evaluation_scenarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("metrics", JSONB, server_default=EMPTY_OBJ),
        sa.Column("threshold_results", JSONB, server_default=EMPTY_OBJ),
        sa.Column("output_summary", sa.Text, nullable=True),
        sa.Column("comparison_baseline", JSONB, server_default=EMPTY_OBJ),
        sa.Column("artifacts_produced", JSONB, server_default=EMPTY_ARR),
        sa.Column("cost_usd", sa.Float, nullable=True),
        sa.Column("tokens_used", sa.Integer, server_default="0"),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        *_ts(),
    )

    op.create_table("evaluation_baselines",
        _uuid_pk(),
        sa.Column("suite_name", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("source_evaluation_run_id", UUID, sa.ForeignKey("evaluation_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("metrics_snapshot", JSONB, server_default=EMPTY_OBJ),
        sa.Column("thresholds", JSONB, server_default=EMPTY_OBJ),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        *_ts(),
    )

    # ── Deferred foreign keys ──
    op.create_foreign_key(
        "fk_workspaces_default_agent_id", "workspaces", "agents",
        ["default_agent_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_agents_active_spec_id", "agents", "compiled_agent_specs",
        ["active_spec_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_automations_active_spec_id", "automations", "compiled_automation_specs",
        ["active_spec_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_compiled_automation_specs_trigger_id", "compiled_automation_specs", "trigger_definitions",
        ["trigger_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    # Drop deferred FKs first
    op.drop_constraint("fk_compiled_automation_specs_trigger_id", "compiled_automation_specs", type_="foreignkey")
    op.drop_constraint("fk_automations_active_spec_id", "automations", type_="foreignkey")
    op.drop_constraint("fk_agents_active_spec_id", "agents", type_="foreignkey")
    op.drop_constraint("fk_workspaces_default_agent_id", "workspaces", type_="foreignkey")

    for table in ALL_TABLES:
        op.drop_table(table)
