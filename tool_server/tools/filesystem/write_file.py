"""
Write file tool for OpenForge.

Writes content to files within workspace scope with path traversal protection.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.security import WorkspaceSecurity
from tool_server.config import get_settings
from pathlib import Path
import logging

logger = logging.getLogger("tool-server.filesystem")


class WriteFileTool(BaseTool):
    """Write content to a file within the workspace."""

    @property
    def id(self) -> str:
        return "filesystem.write_file"

    @property
    def category(self) -> str:
        return "filesystem"

    @property
    def display_name(self) -> str:
        return "Write File"

    @property
    def description(self) -> str:
        return """Write content to a file within the workspace.

Creates a new file or overwrites an existing file.
The file path must be relative to the workspace root.
Parent directories will be created if they don't exist.

Use 'append' mode to add content to an existing file instead of overwriting.

WARNING: This tool can modify or overwrite files. Use with caution."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file within the workspace"
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file"
                },
                "mode": {
                    "type": "string",
                    "enum": ["write", "append"],
                    "default": "write",
                    "description": "Write mode: 'write' to overwrite, 'append' to add to end"
                },
                "encoding": {
                    "type": "string",
                    "default": "utf-8",
                    "description": "File encoding (default: utf-8)"
                }
            },
            "required": ["path", "content"]
        }

    @property
    def risk_level(self) -> str:
        return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            full_path = security.resolve_path(context.workspace_id, params["path"])

            content = params["content"]
            mode = params.get("mode", "write")
            encoding = params.get("encoding", "utf-8")

            # Create parent directories if they don't exist
            full_path.parent.mkdir(parents=True, exist_ok=True)

            # Check if file exists before writing
            file_existed = full_path.exists()

            # Write mode: 'a' for append, 'w' for write
            write_mode = "a" if mode == "append" else "w"

            with open(full_path, write_mode, encoding=encoding) as f:
                f.write(content)

            file_size = full_path.stat().st_size

            return ToolResult(
                success=True,
                output={
                    "path": params["path"],
                    "action": "appended" if mode == "append" else "written",
                    "bytes_written": len(content.encode(encoding)),
                    "file_size": file_size,
                    "file_existed": file_existed,
                }
            )

        except ValueError as e:
            # Path traversal error
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error writing file: {params['path']}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to write file: {str(e)}"
            )
