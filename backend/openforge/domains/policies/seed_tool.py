"""Deterministic seed data for curated tool policies."""

from __future__ import annotations

from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/tool-policies")


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def get_seed_tool_policy_blueprints() -> list[dict[str, Any]]:
    """Return deterministic tool policy blueprints for the product catalog.

    These 6 curated tool policies cover common access-control patterns
    ranging from fully permissive to network-isolated configurations.
    """

    return [
        # ------------------------------------------------------------ 1
        {
            "id": _seed_uuid("tool-policy.permissive-tools"),
            "name": "Permissive Tool Access",
            "description": (
                "Allows all tools without restrictions. No approval "
                "requirements or rate limits."
            ),
            "scope_type": "system",
            "scope_id": "permissive-tools",
            "default_action": "allow",
            "allowed_tools": [],
            "blocked_tools": [],
            "approval_required_tools": [],
            "rate_limits": {},
            "rules": [],
            "status": "active",
        },
        # ------------------------------------------------------------ 2
        {
            "id": _seed_uuid("tool-policy.approval-defaults"),
            "name": "Approval-Required Defaults",
            "description": (
                "Balanced policy requiring human approval for destructive "
                "or sensitive tool operations while allowing safe tools freely."
            ),
            "scope_type": "system",
            "scope_id": "approval-defaults",
            "default_action": "allow",
            "allowed_tools": [],
            "blocked_tools": [],
            "approval_required_tools": [
                "shell.execute",
                "shell.execute_python",
                "http.post",
                "agent.invoke",
                "workspace.delete_knowledge",
                "filesystem.delete_file",
                "memory.forget",
                "skills.remove",
            ],
            "rate_limits": {
                "shell.execute": {"per_run": 2},
                "shell.execute_python": {"per_run": 2},
                "http.post": {"per_run": 2},
                "workspace.delete_knowledge": {"per_run": 1},
                "filesystem.delete_file": {"per_run": 1},
            },
            "rules": [],
            "status": "active",
        },
        # ------------------------------------------------------------ 3
        {
            "id": _seed_uuid("tool-policy.read-only-tools"),
            "name": "Read-Only Tools",
            "description": (
                "Only allows read-only tools. Blocks all write, delete, "
                "and execution operations for maximum safety."
            ),
            "scope_type": "system",
            "scope_id": "read-only-tools",
            "default_action": "deny",
            "allowed_tools": [
                "workspace.search",
                "workspace.list_knowledge",
                "workspace.list_chats",
                "workspace.read_chat",
                "memory.recall",
                "git.status",
                "git.log",
                "git.diff",
                "filesystem.read_file",
                "filesystem.list_directory",
                "filesystem.file_info",
                "filesystem.search_files",
            ],
            "blocked_tools": [],
            "approval_required_tools": [],
            "rate_limits": {},
            "rules": [],
            "status": "active",
        },
        # ------------------------------------------------------------ 4
        {
            "id": _seed_uuid("tool-policy.no-code-exec"),
            "name": "Code Execution Restricted",
            "description": (
                "Allows all tools except direct shell and Python execution. "
                "Prevents arbitrary code execution while keeping other tools "
                "accessible."
            ),
            "scope_type": "system",
            "scope_id": "no-code-exec",
            "default_action": "allow",
            "allowed_tools": [],
            "blocked_tools": [
                "shell.execute",
                "shell.execute_python",
            ],
            "approval_required_tools": [],
            "rate_limits": {},
            "rules": [],
            "status": "active",
        },
        # ------------------------------------------------------------ 5
        {
            "id": _seed_uuid("tool-policy.rate-limited-prod"),
            "name": "Rate-Limited Production",
            "description": (
                "Production-grade policy with strict rate limits on all "
                "mutable operations. Requires approval for destructive actions."
            ),
            "scope_type": "system",
            "scope_id": "rate-limited-prod",
            "default_action": "allow",
            "allowed_tools": [],
            "blocked_tools": [],
            "approval_required_tools": [
                "shell.execute",
                "shell.execute_python",
                "filesystem.delete_file",
                "workspace.delete_knowledge",
            ],
            "rate_limits": {
                "shell.execute": {"per_run": 1},
                "shell.execute_python": {"per_run": 1},
                "http.post": {"per_run": 5},
                "http.get": {"per_run": 10},
                "filesystem.write_file": {"per_run": 3},
                "filesystem.delete_file": {"per_run": 1},
                "agent.invoke": {"per_run": 3},
            },
            "rules": [],
            "status": "active",
        },
        # ------------------------------------------------------------ 6
        {
            "id": _seed_uuid("tool-policy.network-isolated"),
            "name": "Network-Isolated",
            "description": (
                "Blocks all network-accessing tools. For air-gapped or "
                "privacy-sensitive environments where agents must not make "
                "external requests."
            ),
            "scope_type": "system",
            "scope_id": "network-isolated",
            "default_action": "allow",
            "allowed_tools": [],
            "blocked_tools": [
                "http.get",
                "http.post",
                "http.fetch_page",
                "http.search_web",
            ],
            "approval_required_tools": [],
            "rate_limits": {},
            "rules": [],
            "status": "active",
        },
    ]
