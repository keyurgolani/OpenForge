"""
Search files tool for OpenForge.

Searches for files matching a pattern within workspace scope.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
from pathlib import Path
import logging
import fnmatch

logger = logging.getLogger("tool-server.filesystem")


class SearchFilesTool(BaseTool):
    """Search for files matching a pattern within the workspace."""

    @property
    def id(self) -> str:
        return "filesystem.search_files"

    @property
    def category(self) -> str:
        return "filesystem"

    @property
    def display_name(self) -> str:
        return "Search Files"

    @property
    def description(self) -> str:
        return """Search for files matching a glob pattern within the workspace.

Supports standard glob patterns:
- * matches any sequence of characters (except /)
- ** matches any sequence of characters including /
- ? matches any single character
- [abc] matches any character in the brackets

Examples:
- *.py - Find all Python files
- **/*.md - Find all markdown files recursively
- test_*.py - Find all test files
- **/migrations/*.py - Find all migration files

Returns matching file paths with their types and sizes."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to match files (e.g., '*.py', '**/*.md')"
                },
                "path": {
                    "type": "string",
                    "default": ".",
                    "description": "Directory to search in (default: workspace root)"
                },
                "include_hidden": {
                    "type": "boolean",
                    "default": False,
                    "description": "Include hidden files (starting with .)"
                },
                "max_results": {
                    "type": "integer",
                    "default": 100,
                    "description": "Maximum number of results to return"
                }
            },
            "required": ["pattern"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            pattern = params["pattern"]
            search_path = params.get("path", ".")
            include_hidden = params.get("include_hidden", False)
            max_results = params.get("max_results", 100)

            full_search_path = security.resolve_path(context.workspace_id, search_path)

            if not full_search_path.exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Directory not found: {search_path}"
                )

            if not full_search_path.is_dir():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Not a directory: {search_path}"
                )

            matches = []
            truncated = False

            # Use rglob for recursive search if pattern contains **
            if "**" in pattern:
                # For ** patterns, we need to handle differently
                for item in full_search_path.rglob("*"):
                    if len(matches) >= max_results:
                        truncated = True
                        break

                    if not include_hidden and any(part.startswith(".") for part in item.parts):
                        continue

                    rel_path = item.relative_to(full_search_path)
                    if fnmatch.fnmatch(str(rel_path), pattern):
                        matches.append(self._get_file_info(item, full_search_path))
            else:
                # Non-recursive glob
                for item in full_search_path.glob(pattern):
                    if len(matches) >= max_results:
                        truncated = True
                        break

                    if not include_hidden and item.name.startswith("."):
                        continue

                    matches.append(self._get_file_info(item, full_search_path))

            # Sort by path
            matches.sort(key=lambda x: x["path"])

            return ToolResult(
                success=True,
                output={
                    "pattern": pattern,
                    "search_path": search_path,
                    "matches": matches,
                    "total_count": len(matches),
                    "truncated": truncated,
                },
                truncated=truncated,
                original_length=len(matches) if truncated else None
            )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error searching files: {params.get('pattern')}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to search files: {str(e)}"
            )

    def _get_file_info(self, item: Path, base_path: Path) -> dict:
        """Get info for a matched file."""
        stat = item.stat()
        return {
            "path": str(item.relative_to(base_path)),
            "type": "directory" if item.is_dir() else "file",
            "size": stat.st_size if item.is_file() else 0,
            "modified": stat.st_mtime,
        }
