"""
Delete file tool for OpenForge.

Deletes files within workspace scope with safety protections.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
from pathlib import Path
import logging
import shutil

logger = logging.getLogger("tool-server.filesystem")


class DeleteFileTool(BaseTool):
    """Delete a file or directory within the workspace."""

    @property
    def id(self) -> str:
        return "filesystem.delete_file"

    @property
    def category(self) -> str:
        return "filesystem"

    @property
    def display_name(self) -> str:
        return "Delete File"

    @property
    def description(self) -> str:
        return """Delete a file or empty directory within the workspace.

WARNING: This is a destructive operation. Files cannot be recovered after deletion.

Safety restrictions:
- Cannot delete directories that contain files (use recursive=true for that)
- Cannot delete the workspace root directory
- Path traversal attempts will be blocked"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file or directory to delete"
                },
                "recursive": {
                    "type": "boolean",
                    "default": False,
                    "description": "Allow deleting non-empty directories recursively"
                }
            },
            "required": ["path"]
        }

    @property
    def risk_level(self) -> str:
        return "critical"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            relative_path = params["path"]
            recursive = params.get("recursive", False)

            # Safety: Don't allow deleting workspace root
            if relative_path in (".", "./", "", "/"):
                return ToolResult(
                    success=False,
                    output=None,
                    error="Cannot delete workspace root directory"
                )

            full_path = security.resolve_path(context.workspace_id, relative_path)

            if not full_path.exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"File not found: {relative_path}"
                )

            # Track what was deleted
            deleted_info = {
                "path": relative_path,
                "type": "directory" if full_path.is_dir() else "file",
                "size": full_path.stat().st_size if full_path.is_file() else None,
            }

            if full_path.is_file():
                full_path.unlink()
                logger.info(f"Deleted file: {relative_path}")
            elif full_path.is_dir():
                # Check if directory is empty
                if any(full_path.iterdir()):
                    if not recursive:
                        return ToolResult(
                            success=False,
                            output=None,
                            error=f"Directory is not empty. Use recursive=true to delete non-empty directories."
                        )
                    # Count items before deletion
                    item_count = sum(1 for _ in full_path.rglob("*"))
                    shutil.rmtree(full_path)
                    deleted_info["items_deleted"] = item_count
                    logger.info(f"Deleted directory recursively: {relative_path} ({item_count} items)")
                else:
                    full_path.rmdir()
                    logger.info(f"Deleted empty directory: {relative_path}")

            return ToolResult(
                success=True,
                output=deleted_info
            )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error deleting: {params['path']}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to delete: {str(e)}"
            )
