"""
Apply diff tool for OpenForge.

Applies a search-and-replace diff to a file.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.security import WorkspaceSecurity
from tool_server.config import get_settings
import logging
import shutil
from pathlib import Path

logger = logging.getLogger("tool-server.language")


class LanguageApplyDiffTool(BaseTool):
    """Apply a search-and-replace diff to a file."""

    @property
    def id(self) -> str:
        return "language.apply_diff"

    @property
    def category(self) -> str:
        return "language"

    @property
    def display_name(self) -> str:
        return "Apply Diff"

    @property
    def description(self) -> str:
        return """Apply a search-and-replace diff to a file.

Finds a specific block of text in a file and replaces it with new content.
This is a precise way to make targeted edits without rewriting entire files.

The search text must match exactly (including whitespace/indentation).
If multiple matches are found, the operation fails unless allow_multiple is true.

WARNING: This modifies files. Ensure proper approval flows are in place.

Use for:
- Making targeted code changes
- Refactoring specific functions
- Fixing bugs with precise patches"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to modify"
                },
                "search": {
                    "type": "string",
                    "description": "The exact text to find and replace"
                },
                "replace": {
                    "type": "string",
                    "description": "The text to replace with"
                },
                "allow_multiple": {
                    "type": "boolean",
                    "default": False,
                    "description": "Allow replacing multiple occurrences"
                },
                "create_backup": {
                    "type": "boolean",
                    "default": True,
                    "description": "Create a .bak backup file before modifying"
                }
            },
            "required": ["path", "search", "replace"]
        }

    @property
    def risk_level(self) -> str:
        return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = params.get("path", "").strip()
        search_text = params.get("search", "")
        replace_text = params.get("replace", "")
        allow_multiple = params.get("allow_multiple", False)
        create_backup = params.get("create_backup", True)

        if not path:
            return ToolResult(
                success=False,
                output=None,
                error="File path is required"
            )

        if not search_text:
            return ToolResult(
                success=False,
                output=None,
                error="Search text is required"
            )

        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            file_path = security.resolve_path(context.workspace_id, path)

            if not file_path.exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"File not found: {path}"
                )

            if not file_path.is_file():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Not a file: {path}"
                )

            # Read file content
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Count occurrences
            occurrences = content.count(search_text)

            if occurrences == 0:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Search text not found in file. Make sure the text matches exactly, including whitespace."
                )

            if occurrences > 1 and not allow_multiple:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Found {occurrences} occurrences of search text. Set allow_multiple=true to replace all, or use more specific search text."
                )

            # Create backup if requested
            backup_path = None
            if create_backup:
                backup_path = file_path.with_suffix(file_path.suffix + ".bak")
                shutil.copy2(file_path, backup_path)

            # Apply the replacement
            new_content = content.replace(search_text, replace_text)

            # Write the modified content
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)

            # Calculate diff stats
            search_lines = search_text.strip().split("\n")
            replace_lines = replace_text.strip().split("\n")

            return ToolResult(
                success=True,
                output={
                    "path": path,
                    "occurrences_replaced": occurrences,
                    "lines_removed": len(search_lines),
                    "lines_added": len(replace_lines),
                    "backup_created": backup_path is not None,
                    "backup_path": str(backup_path.name) if backup_path else None,
                    "file_size_before": len(content),
                    "file_size_after": len(new_content),
                }
            )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error applying diff to: {path}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to apply diff: {str(e)}"
            )
