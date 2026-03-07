"""
Find definition tool for OpenForge.

Finds where a symbol (function, class, variable) is defined.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
import ast
import logging
from pathlib import Path

logger = logging.getLogger("tool-server.language")


class LanguageFindDefinitionTool(BaseTool):
    """Find where a symbol is defined."""

    @property
    def id(self) -> str:
        return "language.find_definition"

    @property
    def category(self) -> str:
        return "language"

    @property
    def display_name(self) -> str:
        return "Find Definition"

    @property
    def description(self) -> str:
        return """Find where a symbol (function, class, variable) is defined.

Searches through code files in the workspace to find the definition
of a named symbol. Returns the file, line number, and context.

Supports Python files (.py). Other languages may be added in the future.

Use for:
- Understanding where a function/class originates
- Navigating codebases
- Code review and refactoring"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "The symbol name to find (function, class, or variable name)"
                },
                "path": {
                    "type": "string",
                    "description": "Directory to search in (default: entire workspace)"
                },
                "include_context": {
                    "type": "boolean",
                    "default": True,
                    "description": "Include surrounding code context"
                }
            },
            "required": ["symbol"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    def _find_definitions_in_file(self, file_path: Path, symbol: str, include_context: bool) -> list:
        """Find all definitions of a symbol in a Python file."""
        definitions = []

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()
                lines = source.splitlines()

            tree = ast.parse(source)

            for node in ast.walk(tree):
                match = False
                node_type = None

                # Check for function definitions
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if node.name == symbol:
                        match = True
                        node_type = "function"

                # Check for class definitions
                elif isinstance(node, ast.ClassDef):
                    if node.name == symbol:
                        match = True
                        node_type = "class"

                # Check for variable assignments at module level
                elif isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name) and target.id == symbol:
                            match = True
                            node_type = "variable"
                            break

                if match:
                    definition = {
                        "file": str(file_path),
                        "line": node.lineno,
                        "type": node_type,
                    }

                    if include_context:
                        # Get surrounding lines
                        start = max(0, node.lineno - 3)
                        end = min(len(lines), node.lineno + 10)

                        context_lines = []
                        for i in range(start, end):
                            prefix = ">>> " if i == node.lineno - 1 else "    "
                            context_lines.append(f"{prefix}{lines[i]}")

                        definition["context"] = "\n".join(context_lines)

                    definitions.append(definition)

        except SyntaxError:
            pass  # Skip files with syntax errors
        except Exception as e:
            logger.debug(f"Error parsing {file_path}: {e}")

        return definitions

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        symbol = params.get("symbol", "").strip()
        if not symbol:
            return ToolResult(
                success=False,
                output=None,
                error="Symbol name is required"
            )

        search_path = params.get("path", ".")
        include_context = params.get("include_context", True)

        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            workspace_path = security.resolve_path(context.workspace_id, ".")
            search_root = security.resolve_path(context.workspace_id, search_path)

            if not search_root.exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Path not found: {search_path}"
                )

            # Find all Python files
            if search_root.is_file():
                if search_root.suffix == ".py":
                    python_files = [search_root]
                else:
                    return ToolResult(
                        success=False,
                        output=None,
                        error=f"Not a Python file: {search_path}"
                    )
            else:
                python_files = list(search_root.rglob("*.py"))

            # Search for definitions
            all_definitions = []
            for py_file in python_files:
                definitions = self._find_definitions_in_file(py_file, symbol, include_context)
                all_definitions.extend(definitions)

            if not all_definitions:
                return ToolResult(
                    success=True,
                    output={
                        "symbol": symbol,
                        "definitions": [],
                        "count": 0,
                        "message": f"No definitions found for '{symbol}'"
                    }
                )

            return ToolResult(
                success=True,
                output={
                    "symbol": symbol,
                    "definitions": all_definitions,
                    "count": len(all_definitions),
                }
            )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error finding definition: {symbol}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to find definition: {str(e)}"
            )
