from protocol import BaseTool, ToolContext, ToolResult
from security import security


class SearchFilesTool(BaseTool):
    @property
    def id(self): return "filesystem.search_files"

    @property
    def category(self): return "filesystem"

    @property
    def display_name(self): return "Search Files"

    @property
    def description(self):
        return "Search for files matching a glob pattern in the workspace. Returns matching file paths."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Glob pattern, e.g. '**/*.py' or '*.txt'"},
                "base_path": {"type": "string", "default": ".", "description": "Base directory to search from"},
            },
            "required": ["pattern"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        base = security.resolve_path(context.workspace_id, params.get("base_path", "."))
        if not base.exists():
            return ToolResult(success=False, error=f"Base path not found: {params.get('base_path', '.')}")

        try:
            matches = [str(p.relative_to(base)) for p in base.rglob(params["pattern"])]
            matches.sort()
            return ToolResult(success=True, output=matches)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
