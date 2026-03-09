import re
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class FindReferencesTool(BaseTool):
    @property
    def id(self): return "language.find_references"

    @property
    def category(self): return "language"

    @property
    def display_name(self): return "Find References"

    @property
    def description(self):
        return "Find all lines in a file that reference a given name (variable, function, class)."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to workspace root"},
                "name": {"type": "string", "description": "Name to search for"},
            },
            "required": ["path", "name"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        if not path.exists():
            return ToolResult(success=False, error=f"File not found: {params['path']}")

        try:
            source = path.read_text(encoding="utf-8")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))

        name = re.escape(params["name"])
        pattern = re.compile(r"\b" + name + r"\b")
        refs = []
        for i, line in enumerate(source.splitlines(), start=1):
            if pattern.search(line):
                refs.append({"line": i, "content": line.rstrip()})

        return ToolResult(success=True, output={"references": refs, "count": len(refs)})
