"""
Security utilities for OpenForge Tool Server.

Provides workspace scoping, path validation, and command validation
to ensure safe tool execution.
"""
import os
from pathlib import Path
import re
import logging

logger = logging.getLogger("tool-server.security")


class WorkspaceSecurity:
    """
    Security boundary for workspace-scoped operations.

    Ensures all file and shell operations are confined to the
    designated workspace directory.
    """

    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root).resolve()

    def resolve_path(self, workspace_id: str, relative_path: str) -> Path:
        """
        Resolve a path within workspace scope.

        Args:
            workspace_id: The workspace UUID
            relative_path: Path relative to workspace root

        Returns:
            Resolved absolute path

        Raises:
            ValueError: If path escapes the workspace directory
        """
        workspace_dir = (self.workspace_root / workspace_id).resolve()
        full_path = (workspace_dir / relative_path).resolve()

        # Security check: ensure resolved path is under workspace directory
        if not str(full_path).startswith(str(workspace_dir)):
            raise ValueError(
                f"Path traversal detected: {relative_path} resolves outside "
                f"workspace {workspace_id}"
            )
        return full_path

    def get_workspace_dir(self, workspace_id: str) -> Path:
        """Get the workspace directory path."""
        return (self.workspace_root / workspace_id).resolve()

    def validate_shell_command(self, command: str) -> tuple[bool, str | None]:
        """
        Check if a shell command is allowed.

        Returns:
            (is_allowed, reason_if_blocked)
        """
        # Blocked command patterns
        blocked_patterns = [
            (r'\brm\s+-rf\s+/\b', "Recursive root deletion"),
            (r'\bsudo\s+', "Sudo commands"),
            (r'\bchmod\s+777\b', "Insecure permissions"),
            (r'>\s*/dev/', "Device manipulation"),
            (r'\bmkfs\b', "Filesystem formatting"),
            (r'\bdd\s+if=', "Disk duplication"),
            (r':\(\)\{\s*:\|:\s*&\s*\}\s*;:', "Fork bomb"),
            (r'\bshutdown\b', "System shutdown"),
            (r'\breboot\b', "System reboot"),
            (r'\binit\s+[06]\b', "Init state change"),
            (r'\b/etc/passwd\b', "Password file access"),
            (r'\b/etc/shadow\b', "Shadow file access"),
            (r'\b>\s*/proc/', "Proc filesystem write"),
            (r'\b>\s*/sys/', "Sys filesystem write"),
            (r'\bcurl\s+.*\|\s*bash\b', "Remote script execution"),
            (r'\bwget\s+.*\|\s*bash\b', "Remote script execution"),
        ]

        cmd_lower = command.lower().strip()

        for pattern, reason in blocked_patterns:
            if re.search(pattern, cmd_lower, re.IGNORECASE):
                logger.warning(f"Blocked shell command: {reason} - {command[:50]}...")
                return False, reason

        return True, None

    def is_safe_url(self, url: str) -> tuple[bool, str | None]:
        """
        Validate that a URL is safe to fetch.

        Blocks internal network addresses and potentially dangerous schemes.
        """
        from urllib.parse import urlparse

        try:
            parsed = urlparse(url)
        except Exception as e:
            return False, f"Invalid URL: {e}"

        # Only allow http and https
        if parsed.scheme not in ("http", "https"):
            return False, f"Blocked scheme: {parsed.scheme}"

        # Block internal network addresses
        hostname = parsed.hostname or ""
        blocked_hosts = [
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "::1",
            "169.254.169.254",  # AWS metadata
            "10.",
            "172.16.",
            "172.17.",
            "172.18.",
            "172.19.",
            "172.20.",
            "172.21.",
            "172.22.",
            "172.23.",
            "172.24.",
            "172.25.",
            "172.26.",
            "172.27.",
            "172.28.",
            "172.29.",
            "172.30.",
            "172.31.",
            "192.168.",
            ".internal",
            ".local",
            ".localhost",
        ]

        for blocked in blocked_hosts:
            if hostname == blocked or hostname.startswith(blocked):
                return False, f"Blocked internal address: {hostname}"

        return True, None
