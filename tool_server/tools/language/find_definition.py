import ast
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class FindDefinitionTool(BaseTool):
    @property
    def id(self): return "language.find_definition"

    @property
    def category(self): return "language"

    @property
    def display_name(self): return "Find Definition"

    @property
    def description(self):
        return "Find the definition of a class or function by name in a Python file."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Python file path relative to workspace root"},
                "name": {"type": "string", "description": "Name of the class or function to find"},
            },
            "required": ["path", "name"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        if not path.exists():
            return ToolResult(success=False, error=f"File not found: {params['path']}")

        try:
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source)
            lines = source.splitlines()
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))

        name = params["name"]
        for node in ast.walk(tree):
            if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == name:
                    end_line = getattr(node, "end_lineno", node.lineno)
                    snippet = "\n".join(lines[node.lineno - 1: end_line])
                    return ToolResult(success=True, output={
                        "name": name,
                        "type": "class" if isinstance(node, ast.ClassDef) else "function",
                        "line": node.lineno,
                        "end_line": end_line,
                        "snippet": snippet,
                    })

        return ToolResult(success=False, error=f"Definition '{name}' not found in {params['path']}")
