"""
List directory tool for OpenForge.

Lists directory contents within workspace scope.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
from pathlib import Path
import logging

logger = logging.getLogger("tool-server.filesystem")


class ListDirectoryTool(BaseTool):
    """List the contents of a directory within the workspace."""

    @property
    def id(self) -> str:
        return "filesystem.list_directory"

    @property
    def category(self) -> str:
        return "filesystem"

    @property
    def display_name(self) -> str:
        return "List Directory"

    @property
    def description(self) -> str:
        return """List the contents of a directory within the workspace.

Returns a list of files and subdirectories with their metadata:
- name: The file or directory name
- type: 'file' or 'directory'
- size: File size in bytes (0 for directories)
- modified: Last modification timestamp

Use this tool to explore the workspace structure and find files."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "default": ".",
                    "description": "Relative path to the directory (default: workspace root)"
                },
                "recursive": {
                    "type": "boolean",
                    "default": False,
                    "description": "Whether to list contents recursively"
                },
                "include_hidden": {
                    "type": "boolean",
                    "default": False,
                    "description": "Whether to include hidden files (starting with .)"
                }
            },
            "required": []
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            relative_path = params.get("path", ".")
            recursive = params.get("recursive", False)
            include_hidden = params.get("include_hidden", False)

            full_path = security.resolve_path(context.workspace_id, relative_path)

            if not full_path.exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Directory not found: {relative_path}"
                )

            if not full_path.is_dir():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Not a directory: {relative_path}"
                )

            entries = []

            if recursive:
                for item in full_path.rglob("*"):
                    if not include_hidden and any(part.startswith(".") for part in item.parts):
                        continue
                    entries.append(self._get_entry_info(item, full_path))
            else:
                for item in full_path.iterdir():
                    if not include_hidden and item.name.startswith("."):
                        continue
                    entries.append(self._get_entry_info(item, full_path))

            # Sort: directories first, then files, alphabetically
            entries.sort(key=lambda x: (x["type"] == "file", x["name"].lower()))

            return ToolResult(
                success=True,
                output={
                    "path": relative_path,
                    "entries": entries,
                    "total_count": len(entries),
                }
            )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error listing directory: {params.get('path', '.')}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to list directory: {str(e)}"
            )

    def _get_entry_info(self, item: Path, base_path: Path) -> dict:
        """Get metadata for a directory entry."""
        stat = item.stat()
        return {
            "name": item.name,
            "path": str(item.relative_to(base_path)),
            "type": "directory" if item.is_dir() else "file",
            "size": stat.st_size if item.is_file() else 0,
            "modified": stat.st_mtime,
        }
