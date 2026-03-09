import ast
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class ParseAstTool(BaseTool):
    @property
    def id(self): return "language.parse_ast"

    @property
    def category(self): return "language"

    @property
    def display_name(self): return "Parse Python AST"

    @property
    def description(self):
        return "Parse a Python file and return its AST structure: classes, functions, imports."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Python file path relative to workspace root"},
            },
            "required": ["path"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        if not path.exists():
            return ToolResult(success=False, error=f"File not found: {params['path']}")

        try:
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(path))
        except SyntaxError as exc:
            return ToolResult(success=False, error=f"Syntax error: {exc}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))

        classes = []
        functions = []
        imports = []

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                classes.append({"name": node.name, "line": node.lineno})
            elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                functions.append({"name": node.name, "line": node.lineno})
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                for alias in node.names:
                    imports.append(f"{module}.{alias.name}")

        return ToolResult(success=True, output={
            "classes": classes,
            "functions": functions,
            "imports": sorted(set(imports)),
            "lines": len(source.splitlines()),
        })
