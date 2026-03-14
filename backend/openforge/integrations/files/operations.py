"""
File Operations Integration

Provides integration for file handling utilities (upload, download, delete).
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Optional
from uuid import UUID

from openforge.common.config import get_settings

logger = logging.getLogger("openforge.integrations.files")


class FileOperationsIntegration:
    """Integration layer for file operations."""

    def __init__(self):
        self._settings = get_settings()

    @property
    def workspace_root(self) -> Path:
        return Path(self._settings.workspace_root)

    @property
    def uploads_root(self) -> Path:
        return Path(self._settings.uploads_root)

    async def save_upload(
        self,
        workspace_id: UUID,
        file_id: UUID,
        filename: str,
        content: bytes,
    ) -> Path:
        """Save uploaded file content to disk."""
        upload_dir = self.workspace_root / str(workspace_id) / "uploads" / str(file_id)
        upload_dir.mkdir(parents=True, exist_ok=True)

        file_path = upload_dir / filename
        file_path.write_bytes(content)

        logger.info(f"Saved upload {filename} to {file_path}")
        return file_path

    async def get_upload_path(
        self,
        workspace_id: UUID,
        file_id: UUID,
        filename: str,
    ) -> Optional[Path]:
        """Get the path to an uploaded file if it exists."""
        file_path = (
            self.workspace_root
            / str(workspace_id)
            / "uploads"
            / str(file_id)
            / filename
        )
        if file_path.exists():
            return file_path
        return None

    async def delete_upload(
        self,
        workspace_id: UUID,
        file_id: UUID,
    ) -> bool:
        """Delete an upload directory."""
        upload_dir = self.workspace_root / str(workspace_id) / "uploads" / str(file_id)
        if upload_dir.exists():
            shutil.rmtree(upload_dir)
            logger.info(f"Deleted upload directory {file_id}")
            return True
        return False

    async def copy_file(
        self,
        source: Path,
        destination: Path,
    ) -> Path:
        """Copy a file from source to destination."""
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        logger.info(f"Copied {source} to {destination}")
        return destination

    async def move_file(
        self,
        source: Path,
        destination: Path,
    ) -> Path:
        """Move a file from source to destination."""
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(source, destination)
        logger.info(f"Moved {source} to {destination}")
        return destination

    async def delete_file(self, path: Path) -> bool:
        """Delete a file if it exists."""
        if path.exists():
            path.unlink()
            logger.info(f"Deleted file {path}")
            return True
        return False

    async def file_exists(self, path: Path) -> bool:
        """Check if a file exists."""
        return path.exists()

    async def get_file_size(self, path: Path) -> Optional[int]:
        """Get the size of a file in bytes."""
        if path.exists():
            return path.stat().st_size
        return None

    async def read_file(self, path: Path) -> Optional[bytes]:
        """Read file content as bytes."""
        if path.exists():
            return path.read_bytes()
        return None

    async def write_file(self, path: Path, content: bytes) -> Path:
        """Write bytes to a file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        logger.info(f"Wrote {len(content)} bytes to {path}")
        return path


# Singleton instance
file_operations = FileOperationsIntegration()
