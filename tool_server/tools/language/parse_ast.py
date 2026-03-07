"""
Parse AST tool for OpenForge.

Parses code files into AST structure for analysis.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
import ast
import logging
import json

logger = logging.getLogger("tool-server.language")


class LanguageParseAstTool(BaseTool):
    """Parse code file into AST structure."""

    @property
    def id(self) -> str:
        return "language.parse_ast"

    @property
    def category(self) -> str:
        return "language"

    @property
    def display_name(self) -> str:
        return "Parse AST"

    @property
    def description(self) -> str:
        return """Parse a code file into an Abstract Syntax Tree (AST) structure.

Analyzes the structure of source code and returns a hierarchical representation
of the code's syntax elements (functions, classes, variables, etc.).

Supports Python files (.py). Other languages may be added in the future.

Use for:
- Understanding code structure
- Finding definitions and references
- Code analysis and transformation"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the code file (relative to workspace)"
                },
                "include_source": {
                    "type": "boolean",
                    "default": False,
                    "description": "Include source code snippets for each node"
                },
                "max_depth": {
                    "type": "integer",
                    "default": 10,
                    "description": "Maximum depth of AST traversal"
                }
            },
            "required": ["path"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    def _node_to_dict(self, node, source_lines: list, include_source: bool, depth: int, max_depth: int) -> dict:
        """Convert AST node to dictionary representation."""
        if depth > max_depth:
            return {"type": node.__class__.__name__, "_truncated": True}

        result = {
            "type": node.__class__.__name__,
            "line": getattr(node, "lineno", None),
            "col": getattr(node, "col_offset", None),
        }

        # Add end position if available
        if hasattr(node, "end_lineno"):
            result["end_line"] = node.end_lineno
        if hasattr(node, "end_col_offset"):
            result["end_col"] = node.end_col_offset

        # Add source snippet if requested
        if include_source and result["line"] and result["end_line"]:
            start = max(0, result["line"] - 1)
            end = min(len(source_lines), result["end_line"])
            result["source"] = "".join(source_lines[start:end]).strip()

        # Add name for named nodes
        if hasattr(node, "name"):
            result["name"] = node.name

        # Add value for simple nodes
        if isinstance(node, ast.Constant):
            result["value"] = repr(node.value)
        elif isinstance(node, ast.Str):  # Python 3.7 compatibility
            result["value"] = repr(node.s)
        elif isinstance(node, ast.Num):  # Python 3.7 compatibility
            result["value"] = repr(node.n)

        # Process children
        children = []
        for child in ast.iter_child_nodes(node):
            children.append(self._node_to_dict(child, source_lines, include_source, depth + 1, max_depth))

        if children:
            result["children"] = children

        return result

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = params.get("path", "").strip()
        if not path:
            return ToolResult(
                success=False,
                output=None,
                error="File path is required"
            )

        include_source = params.get("include_source", False)
        max_depth = params.get("max_depth", 10)

        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            file_path = security.resolve_path(context.workspace_id, path)

            if not file_path.exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"File not found: {path}"
                )

            if not file_path.is_file():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Not a file: {path}"
                )

            # Check file extension
            if file_path.suffix != ".py":
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Unsupported file type: {file_path.suffix}. Only Python files (.py) are supported."
                )

            # Read and parse file
            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()
                source_lines = source.splitlines(keepends=True)

            try:
                tree = ast.parse(source)
            except SyntaxError as e:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Syntax error in file: {e.msg} at line {e.lineno}"
                )

            # Convert to dictionary
            ast_dict = self._node_to_dict(tree, source_lines, include_source, 0, max_depth)

            # Extract summary info
            functions = []
            classes = []
            imports = []

            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                    functions.append({
                        "name": node.name,
                        "line": node.lineno,
                        "args": [arg.arg for arg in node.args.args],
                        "decorators": [d.id if isinstance(d, ast.Name) else str(d) for d in node.decorator_list]
                    })
                elif isinstance(node, ast.ClassDef):
                    classes.append({
                        "name": node.name,
                        "line": node.lineno,
                        "bases": [b.id if isinstance(b, ast.Name) else str(b) for b in node.bases]
                    })
                elif isinstance(node, (ast.Import, ast.ImportFrom)):
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            imports.append(alias.name)
                    else:
                        module = node.module or ""
                        imports.append(module)

            return ToolResult(
                success=True,
                output={
                    "file": path,
                    "ast": ast_dict,
                    "summary": {
                        "functions": functions,
                        "classes": classes,
                        "imports": list(set(imports)),
                        "function_count": len(functions),
                        "class_count": len(classes),
                        "line_count": len(source_lines),
                    }
                }
            )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error parsing AST: {path}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to parse AST: {str(e)}"
            )
