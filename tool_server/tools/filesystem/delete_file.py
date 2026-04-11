import shutil
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class DeleteFileTool(BaseTool):
    @property
    def id(self): return "filesystem.delete_file"

    @property
    def category(self): return "filesystem"

    @property
    def display_name(self): return "Delete File"

    @property
    def description(self):
        return "Delete a file or directory in the workspace. Use recursive=true to delete non-empty directories."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path relative to workspace root"},
                "recursive": {"type": "boolean", "default": False, "description": "Recursively delete directories"},
            },
            "required": ["path"],
        }

    @property
    def risk_level(self): return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        if not path.exists():
            return ToolResult(
                success=False, error=f"Path not found: {params['path']}",
                recovery_hints=["Check the path for typos", "Use filesystem.list_directory to verify existence"],
            )

        try:
            if path.is_dir():
                if params.get("recursive"):
                    shutil.rmtree(path)
                else:
                    path.rmdir()
            else:
                path.unlink()
            return ToolResult(success=True, output=f"Deleted '{params['path']}'")
        except Exception as exc:
            error = str(exc)
            hints = []
            if "not empty" in error.lower() or "directory not empty" in error.lower():
                hints.append("Use recursive=true to delete non-empty directories")
            if "permission" in error.lower():
                hints.append("Check file/directory permissions")
            return ToolResult(success=False, error=error, recovery_hints=hints or ["Verify the file is not in use by another process"])
