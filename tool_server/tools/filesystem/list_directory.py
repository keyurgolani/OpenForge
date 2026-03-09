import os
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class ListDirectoryTool(BaseTool):
    @property
    def id(self): return "filesystem.list_directory"

    @property
    def category(self): return "filesystem"

    @property
    def display_name(self): return "List Directory"

    @property
    def description(self):
        return "List files and directories at the given path in the workspace."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path relative to workspace root (use '.' for root)"},
            },
            "required": ["path"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        if not path.exists():
            return ToolResult(success=False, error=f"Path not found: {params['path']}")
        if not path.is_dir():
            return ToolResult(success=False, error=f"Not a directory: {params['path']}")

        try:
            entries = []
            for entry in sorted(path.iterdir()):
                stat = entry.stat()
                entries.append({
                    "name": entry.name,
                    "type": "directory" if entry.is_dir() else "file",
                    "size": stat.st_size if entry.is_file() else None,
                    "modified": stat.st_mtime,
                })
            return ToolResult(success=True, output=entries)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
