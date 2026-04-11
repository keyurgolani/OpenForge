import shutil
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class MoveFileTool(BaseTool):
    @property
    def id(self): return "filesystem.move_file"

    @property
    def category(self): return "filesystem"

    @property
    def display_name(self): return "Move File"

    @property
    def description(self):
        return "Move or rename a file or directory within the workspace."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "Source path relative to workspace root"},
                "destination": {"type": "string", "description": "Destination path relative to workspace root"},
            },
            "required": ["source", "destination"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        src = security.resolve_path(context.workspace_id, params["source"])
        dst = security.resolve_path(context.workspace_id, params["destination"])

        if not src.exists():
            return ToolResult(
                success=False, error=f"Source not found: {params['source']}",
                recovery_hints=["Check the source path for typos", "Use filesystem.search_files to locate the file"],
            )

        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
            return ToolResult(success=True, output=f"Moved '{params['source']}' to '{params['destination']}'")
        except Exception as exc:
            error = str(exc)
            hints = ["Check that both source and destination paths are valid"]
            if "permission" in error.lower():
                hints.append("Check file/directory permissions")
            return ToolResult(success=False, error=error, recovery_hints=hints)
