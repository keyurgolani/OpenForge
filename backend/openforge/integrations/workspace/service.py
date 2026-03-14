"""
Workspace Integration Module

Provides integration with workspace file operations and directory management.
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from uuid import UUID

from openforge.common.config import get_settings

logger = logging.getLogger("openforge.integrations.workspace")


class WorkspaceIntegration:
    """Integration layer for workspace file operations."""

    def __init__(self):
        self._settings = get_settings()

    @property
    def workspace_root(self) -> Path:
        """Root directory for all workspaces."""
        return Path(self._settings.workspace_root)

    @property
    def uploads_root(self) -> Path:
        """Root directory for uploads."""
        return Path(self._settings.uploads_root)

    def get_workspace_path(self, workspace_id: UUID | str) -> Path:
        """Get the filesystem path for a workspace."""
        return self.workspace_root / str(workspace_id)

    def get_uploads_path(self, workspace_id: UUID | str) -> Path:
        """Get the uploads directory for a workspace."""
        return self.get_workspace_path(workspace_id) / "uploads"

    def workspace_exists(self, workspace_id: UUID) -> bool:
        """Check if a workspace directory exists."""
        return self.get_workspace_path(workspace_id).exists()

    def create_workspace_dirs(self, workspace_id: UUID) -> None:
        """Create the workspace directory structure."""
        ws_path = self.get_workspace_path(workspace_id)
        ws_path.mkdir(parents=True, exist_ok=True)
        (ws_path / "uploads").mkdir(parents=True, exist_ok=True)

    def delete_workspace_dirs(self, workspace_id: UUID) -> None:
        """Delete the workspace directory structure."""
        ws_path = self.get_workspace_path(workspace_id)
        if ws_path.exists():
            shutil.rmtree(ws_path, ignore_errors=True)

    def get_knowledge_path(
        self,
        workspace_id: UUID,
        knowledge_id: UUID,
        extension: str = "md",
    ) -> Path:
        """Get the path for a knowledge item file."""
        return self.get_workspace_path(workspace_id) / "knowledge" / f"{knowledge_id}.{extension}"

    def get_attachment_path(
        self,
        workspace_id: UUID,
        attachment_id: UUID,
        filename: str,
    ) -> Path:
        """Get the path for an uploaded attachment."""
        return self.get_uploads_path(workspace_id) / str(attachment_id) / filename

    def list_workspace_files(
        self,
        workspace_id: UUID,
        subdirectory: str = "",
    ) -> list[Path]:
        """List files in a workspace subdirectory."""
        base_path = self.get_workspace_path(workspace_id)
        if subdirectory:
            base_path = base_path / subdirectory
        if not base_path.exists():
            return []
        return [p for p in base_path.rglob("*") if p.is_file()]

    def get_workspace_size(self, workspace_id: UUID) -> int:
        """Get the total size of a workspace in bytes."""
        total_size = 0
        ws_path = self.get_workspace_path(workspace_id)
        if ws_path.exists():
            for path in ws_path.rglob("*"):
                if path.is_file():
                    total_size += path.stat().st_size
        return total_size


# Singleton instance
workspace_integration = WorkspaceIntegration()
