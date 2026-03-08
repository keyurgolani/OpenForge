"""
Read file tool for OpenForge.

Reads file contents within workspace scope with path traversal protection.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.security import WorkspaceSecurity
from tool_server.config import get_settings
import logging

logger = logging.getLogger("tool-server.filesystem")


class ReadFileTool(BaseTool):
    """Read the contents of a file within the workspace."""

    @property
    def id(self) -> str:
        return "filesystem.read_file"

    @property
    def category(self) -> str:
        return "filesystem"

    @property
    def display_name(self) -> str:
        return "Read File"

    @property
    def description(self) -> str:
        return """Read the contents of a file within the workspace.

Use this tool to read the content of any file in the workspace.
The file path must be relative to the workspace root.
Returns the file content as text.

Common use cases:
- Reading source code files
- Reading configuration files
- Reading documentation or notes
- Reading any text-based file"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file within the workspace"
                },
                "encoding": {
                    "type": "string",
                    "default": "utf-8",
                    "description": "File encoding (default: utf-8)"
                },
                "offset": {
                    "type": "integer",
                    "default": 0,
                    "description": "Line number to start reading from (0-indexed)"
                },
                "limit": {
                    "type": "integer",
                    "default": 0,
                    "description": "Maximum number of lines to read (0 = all)"
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
            full_path = security.resolve_path(context.workspace_id, params["path"])

            if not full_path.exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"File not found: {params['path']}"
                )

            if not full_path.is_file():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Not a file: {params['path']}"
                )

            encoding = params.get("encoding", "utf-8")
            offset = params.get("offset", 0)
            limit = params.get("limit", 0)

            try:
                with open(full_path, "r", encoding=encoding) as f:
                    if offset > 0 or limit > 0:
                        lines = f.readlines()
                        total_lines = len(lines)
                        start = min(offset, total_lines)
                        if limit > 0:
                            content_lines = lines[start:start + limit]
                        else:
                            content_lines = lines[start:]
                        content = "".join(content_lines)
                    else:
                        content = f.read()
                        total_lines = content.count("\n") + (1 if content else 0)
            except UnicodeDecodeError:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Cannot read file as text with encoding {encoding}. File may be binary."
                )

            # Truncate if needed
            original_length = len(content)
            truncated = False
            if self.max_output_chars and original_length > self.max_output_chars:
                content = content[:self.max_output_chars]
                content += "\n\n... [OUTPUT TRUNCATED]"
                truncated = True

            return ToolResult(
                success=True,
                output={
                    "content": content,
                    "path": params["path"],
                    "total_lines": total_lines if offset == 0 and limit == 0 else len(content.split("\n")),
                },
                truncated=truncated,
                original_length=original_length if truncated else None
            )

        except ValueError as e:
            # Path traversal error
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error reading file: {params['path']}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to read file: {str(e)}"
            )
