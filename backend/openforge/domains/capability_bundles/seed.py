"""Deterministic seed data for curated capability bundles."""

from __future__ import annotations

from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/capability-bundles")


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def get_seed_bundle_blueprints() -> list[dict[str, Any]]:
    """Return deterministic capability bundle blueprints for the product catalog.

    These 19 curated bundles cover core, tool-focused, retrieval-focused,
    composite, coordination, and safety-restricted capability profiles that
    users can assign to agents out of the box.
    """

    return [
        # =================================================================
        # CORE (3)
        # =================================================================
        # ------------------------------------------------------------ 1
        {
            "id": _seed_uuid("bundle.full-assistant"),
            "name": "Full Assistant",
            "slug": "full-assistant",
            "description": (
                "A comprehensive capability bundle that grants access to all "
                "available tools and enables knowledge retrieval. This is the "
                "recommended default for general-purpose agents that need the "
                "widest possible latitude to accomplish diverse tasks."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": None,
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 2
        {
            "id": _seed_uuid("bundle.chat-only"),
            "name": "Chat Only",
            "slug": "chat-only",
            "description": (
                "A minimal bundle that disables all tools and knowledge retrieval, "
                "restricting the agent to pure conversational interaction. Use this "
                "when you want an agent that relies solely on its language model "
                "capabilities without any external actions or data lookups."
            ),
            "tools_enabled": False,
            "allowed_tool_categories": None,
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": False,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 3
        {
            "id": _seed_uuid("bundle.retrieval-only"),
            "name": "Retrieval Only",
            "slug": "retrieval-only",
            "description": (
                "A knowledge-focused bundle that enables retrieval from the "
                "workspace knowledge base but disables all tool execution. Ideal "
                "for agents that should answer questions grounded in existing "
                "documents without performing any external actions."
            ),
            "tools_enabled": False,
            "allowed_tool_categories": None,
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # =================================================================
        # TOOL-FOCUSED (6)
        # =================================================================
        # ------------------------------------------------------------ 4
        {
            "id": _seed_uuid("bundle.tool-executor"),
            "name": "Tool Executor",
            "slug": "tool-executor",
            "description": (
                "A tool-centric bundle that enables all tool categories but "
                "disables knowledge retrieval. Best suited for agents whose "
                "primary purpose is to execute actions through tools rather "
                "than retrieve and synthesise stored knowledge."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": None,
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": False,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 5
        {
            "id": _seed_uuid("bundle.read-only-tools"),
            "name": "Read-Only Tools",
            "slug": "read-only-tools",
            "description": (
                "A conservative bundle that limits tool access to read-only "
                "categories such as workspace browsing, memory access, and git "
                "inspection. Combined with retrieval, this is ideal for agents "
                "that need to observe and report without modifying anything."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["workspace", "memory", "git"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 6
        {
            "id": _seed_uuid("bundle.code-tools"),
            "name": "Code Tools",
            "slug": "code-tools",
            "description": (
                "A developer-oriented bundle that provides access to filesystem "
                "operations, git commands, language-specific tooling, and shell "
                "execution. Designed for agents that write, review, or refactor "
                "code without needing knowledge retrieval."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["filesystem", "git", "language", "shell"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": False,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 7
        {
            "id": _seed_uuid("bundle.web-research-tools"),
            "name": "Web Research Tools",
            "slug": "web-research-tools",
            "description": (
                "A research-oriented bundle that provides HTTP-based tools for "
                "fetching web content alongside workspace and memory access. "
                "Use this for agents that need to gather information from "
                "external URLs, APIs, or web pages during their workflow."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["http", "workspace", "memory"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": False,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 8
        {
            "id": _seed_uuid("bundle.shell-scripting"),
            "name": "Shell Scripting",
            "slug": "shell-scripting",
            "description": (
                "A focused bundle that restricts tool access to shell commands "
                "and filesystem operations. Designed for agents that automate "
                "system administration tasks, run scripts, or perform batch "
                "file processing without broader tool or retrieval access."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["shell", "filesystem"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": False,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 9
        {
            "id": _seed_uuid("bundle.workspace-tools"),
            "name": "Workspace Tools",
            "slug": "workspace-tools",
            "description": (
                "A lightweight bundle that limits tool access to workspace "
                "management and memory operations. Suitable for agents that "
                "organize workspace resources, manage notes, or interact "
                "with stored context without broader system access."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["workspace", "memory"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": False,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # =================================================================
        # RETRIEVAL-FOCUSED (3)
        # =================================================================
        # ------------------------------------------------------------ 10
        {
            "id": _seed_uuid("bundle.deep-retrieval"),
            "name": "Deep Retrieval",
            "slug": "deep-retrieval",
            "description": (
                "A high-recall retrieval bundle that fetches up to 15 results "
                "with a low similarity threshold of 0.2. Designed for thorough "
                "knowledge exploration where casting a wide net is more important "
                "than precision, such as background research or discovery tasks."
            ),
            "tools_enabled": False,
            "allowed_tool_categories": None,
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 15,
            "retrieval_score_threshold": 0.2,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 11
        {
            "id": _seed_uuid("bundle.semantic-search"),
            "name": "Semantic Search",
            "slug": "semantic-search",
            "description": (
                "A balanced retrieval bundle tuned for semantic similarity "
                "searches. It returns up to 8 results with a moderate threshold "
                "of 0.3, striking a balance between recall and relevance for "
                "question-answering and contextual lookup tasks."
            ),
            "tools_enabled": False,
            "allowed_tool_categories": None,
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 8,
            "retrieval_score_threshold": 0.3,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 12
        {
            "id": _seed_uuid("bundle.keyword-search"),
            "name": "Keyword Search",
            "slug": "keyword-search",
            "description": (
                "A precision-oriented retrieval bundle that returns up to 10 "
                "results with a higher threshold of 0.4. Best for cases where "
                "exact term matching is important and only highly relevant "
                "documents should surface, such as compliance lookups or "
                "reference checks."
            ),
            "tools_enabled": False,
            "allowed_tool_categories": None,
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 10,
            "retrieval_score_threshold": 0.4,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # =================================================================
        # COMPOSITE (3)
        # =================================================================
        # ------------------------------------------------------------ 13
        {
            "id": _seed_uuid("bundle.research-assistant"),
            "name": "Research Assistant",
            "slug": "research-assistant",
            "description": (
                "A composite bundle combining web research tools with knowledge "
                "retrieval. Agents with this bundle can fetch information from "
                "HTTP sources, access workspace data, consult memory, and "
                "retrieve up to 8 relevant documents to produce well-grounded "
                "research outputs."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["http", "workspace", "memory"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 8,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 14
        {
            "id": _seed_uuid("bundle.knowledge-worker"),
            "name": "Knowledge Worker",
            "slug": "knowledge-worker",
            "description": (
                "A productivity bundle that pairs workspace, filesystem, and "
                "memory tools with knowledge retrieval. Ideal for agents that "
                "need to read and organize files, manage notes, and cross-reference "
                "stored knowledge to complete everyday information work."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["workspace", "filesystem", "memory"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 15
        {
            "id": _seed_uuid("bundle.autonomous-agent"),
            "name": "Autonomous Agent",
            "slug": "autonomous-agent",
            "description": (
                "A fully-featured bundle for long-running autonomous agents that "
                "need unrestricted tool access combined with deep knowledge "
                "retrieval. It retrieves up to 10 documents per query, enabling "
                "the agent to plan, execute, and self-correct over extended "
                "multi-step workflows."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": None,
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 10,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # =================================================================
        # COORDINATION (2)
        # =================================================================
        # ------------------------------------------------------------ 16
        {
            "id": _seed_uuid("bundle.coordinator"),
            "name": "Coordinator",
            "slug": "coordinator",
            "description": (
                "A coordination bundle that grants access to agent management "
                "and task delegation tools. Designed for orchestrator agents that "
                "dispatch work to other agents, monitor progress, and aggregate "
                "results without performing direct knowledge retrieval."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["agent", "task"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": False,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 17
        {
            "id": _seed_uuid("bundle.planner"),
            "name": "Planner",
            "slug": "planner",
            "description": (
                "A planning-oriented bundle that combines agent and task "
                "coordination tools with workspace access and knowledge retrieval. "
                "Use this for agents that decompose objectives into sub-tasks, "
                "assign them to other agents, and consult stored knowledge to "
                "inform their planning decisions."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["agent", "task", "workspace"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # =================================================================
        # SAFETY-RESTRICTED (2)
        # =================================================================
        # ------------------------------------------------------------ 18
        {
            "id": _seed_uuid("bundle.sandboxed-executor"),
            "name": "Sandboxed Executor",
            "slug": "sandboxed-executor",
            "description": (
                "A rate-limited, sandboxed bundle that restricts tool access to "
                "filesystem and language tooling with aggressive rate limits of "
                "10 calls per minute and 50 per execution. Designed for untrusted "
                "or experimental agents that should operate under tight safety "
                "constraints."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["filesystem", "language"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 10,
            "max_tool_calls_per_execution": 50,
            "skill_ids": [],
            "retrieval_enabled": False,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
        # ------------------------------------------------------------ 19
        {
            "id": _seed_uuid("bundle.audit-observer"),
            "name": "Audit Observer",
            "slug": "audit-observer",
            "description": (
                "An observation-focused bundle that provides read-only access to "
                "workspace, git, and memory tools alongside knowledge retrieval. "
                "Designed for audit and compliance agents that need to inspect "
                "system state, review change history, and cross-reference stored "
                "policies without making modifications."
            ),
            "tools_enabled": True,
            "allowed_tool_categories": ["workspace", "git", "memory"],
            "blocked_tool_ids": [],
            "tool_overrides": {},
            "max_tool_calls_per_minute": 30,
            "max_tool_calls_per_execution": 200,
            "skill_ids": [],
            "retrieval_enabled": True,
            "retrieval_limit": 5,
            "retrieval_score_threshold": 0.35,
            "knowledge_scope": "workspace",
            "is_system": True,
            "status": "active",
        },
    ]
