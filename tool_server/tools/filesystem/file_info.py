"""
File info tool for OpenForge.

Gets detailed metadata about a file within workspace scope.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
from pathlib import Path
import logging
import mimetypes
import hashlib

logger = logging.getLogger("tool-server.filesystem")


class FileInfoTool(BaseTool):
    """Get detailed information about a file within the workspace."""

    @property
    def id(self) -> str:
        return "filesystem.file_info"

    @property
    def category(self) -> str:
        return "filesystem"

    @property
    def display_name(self) -> str:
        return "File Info"

    @property
    def description(self) -> str:
        return """Get detailed metadata about a file or directory.

Returns information including:
- File type (file, directory, symlink)
- Size in bytes
- Creation and modification timestamps
- MIME type (for files)
- File permissions
- MD5 hash (for files under 10MB)"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file or directory"
                },
                "compute_hash": {
                    "type": "boolean",
                    "default": True,
                    "description": "Compute MD5 hash for files (default: true)"
                }
            },
            "required": ["path"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            relative_path = params["path"]
            compute_hash = params.get("compute_hash", True)

            full_path = security.resolve_path(context.workspace_id, relative_path)

            if not full_path.exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"File not found: {relative_path}"
                )

            stat = full_path.stat()

            info = {
                "path": relative_path,
                "name": full_path.name,
                "type": self._get_type(full_path),
                "size": stat.st_size,
                "created": stat.st_ctime,
                "modified": stat.st_mtime,
                "accessed": stat.st_atime,
                "permissions": oct(stat.st_mode)[-3:],
            }

            # Add file-specific info
            if full_path.is_file():
                mime_type, _ = mimetypes.guess_type(str(full_path))
                info["mime_type"] = mime_type or "application/octet-stream"
                info["extension"] = full_path.suffix.lower() or None

                # Compute hash for small files
                if compute_hash and stat.st_size < 10 * 1024 * 1024:  # 10MB
                    info["md5_hash"] = self._compute_md5(full_path)

            # Add directory-specific info
            if full_path.is_dir():
                try:
                    items = list(full_path.iterdir())
                    info["item_count"] = len(items)
                    info["file_count"] = sum(1 for i in items if i.is_file())
                    info["directory_count"] = sum(1 for i in items if i.is_dir())
                except PermissionError:
                    info["item_count"] = None
                    info["error"] = "Permission denied reading directory contents"

            return ToolResult(
                success=True,
                output=info
            )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error getting file info: {params['path']}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to get file info: {str(e)}"
            )

    def _get_type(self, path: Path) -> str:
        """Get the type of a path."""
        if path.is_symlink():
            return "symlink"
        elif path.is_file():
            return "file"
        elif path.is_dir():
            return "directory"
        else:
            return "unknown"

    def _compute_md5(self, path: Path) -> str:
        """Compute MD5 hash of a file."""
        hash_md5 = hashlib.md5()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
