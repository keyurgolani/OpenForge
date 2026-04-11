import os
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class FileInfoTool(BaseTool):
    @property
    def id(self): return "filesystem.file_info"

    @property
    def category(self): return "filesystem"

    @property
    def display_name(self): return "File Info"

    @property
    def description(self):
        return "Get metadata about a file or directory: size, type, modification time, permissions."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path relative to workspace root"},
            },
            "required": ["path"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        if not path.exists():
            return ToolResult(
                success=False, error=f"Path not found: {params['path']}",
                recovery_hints=["Check the path for typos", "Use filesystem.search_files to locate the file"],
            )

        try:
            stat = path.stat()
            return ToolResult(success=True, output={
                "path": params["path"],
                "type": "directory" if path.is_dir() else "file",
                "size": stat.st_size,
                "modified": stat.st_mtime,
                "created": stat.st_ctime,
                "permissions": oct(stat.st_mode)[-3:],
            })
        except Exception as exc:
            return ToolResult(
                success=False, error=str(exc),
                recovery_hints=["Check file permissions", "Verify the path exists within the workspace"],
            )
