from protocol import BaseTool, ToolContext, ToolResult
from security import security


class ReadFileTool(BaseTool):
    @property
    def id(self): return "filesystem.read_file"

    @property
    def category(self): return "filesystem"

    @property
    def display_name(self): return "Read File"

    @property
    def description(self):
        return "Read the contents of a file in the workspace. Supports optional line offset and limit."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to workspace root"},
                "encoding": {"type": "string", "default": "utf-8", "description": "File encoding"},
                "offset": {"type": "integer", "description": "Start reading from this line number (1-based)"},
                "limit": {"type": "integer", "description": "Max number of lines to read"},
            },
            "required": ["path"],
        }

    @property
    def max_output(self): return 50000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        if not path.exists():
            return ToolResult(success=False, error=f"File not found: {params['path']}")
        if not path.is_file():
            return ToolResult(success=False, error=f"Not a file: {params['path']}")

        encoding = params.get("encoding", "utf-8")
        offset = params.get("offset", 1)
        limit = params.get("limit")

        try:
            with open(path, "r", encoding=encoding, errors="replace") as f:
                lines = f.readlines()

            start = max(0, (offset or 1) - 1)
            if limit:
                lines = lines[start: start + limit]
            else:
                lines = lines[start:]

            content = "".join(lines)
            return self._maybe_truncate("", content)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
