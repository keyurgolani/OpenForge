from protocol import BaseTool, ToolContext, ToolResult
from security import security


class WriteFileTool(BaseTool):
    @property
    def id(self): return "filesystem.write_file"

    @property
    def category(self): return "filesystem"

    @property
    def display_name(self): return "Write File"

    @property
    def description(self):
        return "Write content to a file in the workspace. Creates parent directories if needed."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to workspace root"},
                "content": {"type": "string", "description": "Content to write"},
                "encoding": {"type": "string", "default": "utf-8"},
                "append": {"type": "boolean", "default": False, "description": "Append instead of overwrite"},
            },
            "required": ["path", "content"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        content = params["content"]
        encoding = params.get("encoding", "utf-8")
        append = params.get("append", False)

        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            mode = "a" if append else "w"
            with open(path, mode, encoding=encoding) as f:
                f.write(content)
            return ToolResult(success=True, output=f"Written {len(content)} chars to {params['path']}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
