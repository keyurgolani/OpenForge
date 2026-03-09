from protocol import BaseTool, ToolContext, ToolResult
from security import security


class ApplyDiffTool(BaseTool):
    @property
    def id(self): return "language.apply_diff"

    @property
    def category(self): return "language"

    @property
    def display_name(self): return "Apply Diff"

    @property
    def description(self):
        return "Apply an exact string replacement to a file. Replaces old_string with new_string."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to workspace root"},
                "old_string": {"type": "string", "description": "Exact string to replace"},
                "new_string": {"type": "string", "description": "Replacement string"},
            },
            "required": ["path", "old_string", "new_string"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        if not path.exists():
            return ToolResult(success=False, error=f"File not found: {params['path']}")

        old = params["old_string"]
        new = params["new_string"]

        try:
            content = path.read_text(encoding="utf-8")
            if old not in content:
                return ToolResult(success=False, error=f"String not found in file: {repr(old[:100])}")
            updated = content.replace(old, new, 1)
            path.write_text(updated, encoding="utf-8")
            return ToolResult(success=True, output=f"Applied replacement in {params['path']}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
