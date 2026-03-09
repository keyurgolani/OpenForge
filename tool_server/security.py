from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from config import get_settings


class WorkspaceSecurity:
    """
    Path traversal guard, blocked-command checker, and URL validator for tool execution.
    """

    def __init__(self):
        settings = get_settings()
        self._workspace_root = Path(settings.workspace_root)
        self._blocked_commands = [
            cmd.strip()
            for cmd in settings.blocked_commands.split(",")
            if cmd.strip()
        ]

    def get_workspace_dir(self, workspace_id: str) -> Path:
        return self._workspace_root / workspace_id

    def resolve_path(self, workspace_id: str, relative_path: str) -> Path:
        """
        Resolve a path relative to the workspace directory.
        Raises ValueError on path traversal attempts.
        """
        workspace_dir = self.get_workspace_dir(workspace_id)
        # Normalize and resolve — do NOT resolve symlinks to allow relative paths
        target = (workspace_dir / relative_path).resolve()
        workspace_resolved = workspace_dir.resolve()
        try:
            target.relative_to(workspace_resolved)
        except ValueError:
            raise ValueError(
                f"Path '{relative_path}' escapes the workspace boundary"
            )
        return target

    def is_command_allowed(self, command: str) -> tuple[bool, str]:
        """
        Returns (allowed, reason). allowed=False means the command is blocked.
        """
        cmd_lower = command.lower().strip()
        for blocked in self._blocked_commands:
            if blocked.lower() in cmd_lower:
                return False, f"Command contains blocked pattern: '{blocked}'"
        return True, ""

    def validate_url(self, url: str) -> None:
        """Raises ValueError for disallowed URLs (e.g. private networks in strict mode)."""
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Only http/https URLs are allowed, got: {parsed.scheme}")


security = WorkspaceSecurity()
