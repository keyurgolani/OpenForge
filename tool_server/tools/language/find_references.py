"""
Find references tool for OpenForge.

Finds all references to a symbol in the codebase.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
import ast
import re
import logging
from pathlib import Path

logger = logging.getLogger("tool-server.language")


class LanguageFindReferencesTool(BaseTool):
    """Find all references to a symbol."""

    @property
    def id(self) -> str:
        return "language.find_references"

    @property
    def category(self) -> str:
        return "language"

    @property
    def display_name(self) -> str:
        return "Find References"

    @property
    def description(self) -> str:
        return """Find all references to a symbol in the codebase.

Searches through code files to find all places where a symbol is used
(function calls, variable access, imports, etc.).

Supports Python files (.py). Other languages may be added in the future.

Use for:
- Understanding code dependencies
- Impact analysis before refactoring
- Finding usage examples"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "The symbol name to find references for"
                },
                "path": {
                    "type": "string",
                    "description": "Directory to search in (default: entire workspace)"
                },
                "include_definitions": {
                    "type": "boolean",
                    "default": False,
                    "description": "Include the symbol definition itself"
                },
                "include_context": {
                    "type": "boolean",
                    "default": True,
                    "description": "Include surrounding code context"
                },
                "max_results": {
                    "type": "integer",
                    "default": 50,
                    "description": "Maximum number of references to return"
                }
            },
            "required": ["symbol"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    def _find_references_in_file(self, file_path: Path, symbol: str, include_definitions: bool, include_context: bool) -> list:
        """Find all references to a symbol in a Python file."""
        references = []

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()
                lines = source.splitlines()

            tree = ast.parse(source)

            # Track definition lines to skip if needed
            definition_lines = set()
            if not include_definitions:
                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                        if node.name == symbol:
                            definition_lines.add(node.lineno)
                    elif isinstance(node, ast.Assign):
                        for target in node.targets:
                            if isinstance(target, ast.Name) and target.id == symbol:
                                definition_lines.add(node.lineno)

            # Find all Name nodes that match the symbol
            for node in ast.walk(tree):
                if isinstance(node, ast.Name) and node.id == symbol:
                    line_no = node.lineno

                    # Skip definitions if requested
                    if not include_definitions and line_no in definition_lines:
                        continue

                    # Determine context
                    context_type = "reference"
                    if isinstance(node.ctx, ast.Load):
                        context_type = "usage"
                    elif isinstance(node.ctx, ast.Store):
                        context_type = "assignment"
                    elif isinstance(node.ctx, ast.Del):
                        context_type = "deletion"

                    reference = {
                        "file": str(file_path),
                        "line": line_no,
                        "col": node.col_offset,
                        "type": context_type,
                    }

                    if include_context:
                        start = max(0, line_no - 2)
                        end = min(len(lines), line_no + 2)

                        context_lines = []
                        for i in range(start, end):
                            prefix = ">>> " if i == line_no - 1 else "    "
                            context_lines.append(f"{prefix}{lines[i]}")

                        reference["context"] = "\n".join(context_lines)

                    references.append(reference)

            # Also check for attribute access (e.g., obj.symbol)
            for node in ast.walk(tree):
                if isinstance(node, ast.Attribute) and node.attr == symbol:
                    line_no = node.lineno

                    reference = {
                        "file": str(file_path),
                        "line": line_no,
                        "col": node.col_offset,
                        "type": "attribute",
                    }

                    if include_context:
                        start = max(0, line_no - 2)
                        end = min(len(lines), line_no + 2)

                        context_lines = []
                        for i in range(start, end):
                            prefix = ">>> " if i == line_no - 1 else "    "
                            context_lines.append(f"{prefix}{lines[i]}")

                        reference["context"] = "\n".join(context_lines)

                    references.append(reference)

        except SyntaxError:
            pass  # Skip files with syntax errors
        except Exception as e:
            logger.debug(f"Error parsing {file_path}: {e}")

        return references

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        symbol = params.get("symbol", "").strip()
        if not symbol:
            return ToolResult(
                success=False,
                output=None,
                error="Symbol name is required"
            )

        search_path = params.get("path", ".")
        include_definitions = params.get("include_definitions", False)
        include_context = params.get("include_context", True)
        max_results = params.get("max_results", 50)

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

            # Search for references
            all_references = []
            for py_file in python_files:
                refs = self._find_references_in_file(py_file, symbol, include_definitions, include_context)
                all_references.extend(refs)

                if len(all_references) >= max_results:
                    break

            # Sort by file and line
            all_references.sort(key=lambda r: (r["file"], r["line"]))

            # Limit results
            truncated = len(all_references) > max_results
            all_references = all_references[:max_results]

            return ToolResult(
                success=True,
                output={
                    "symbol": symbol,
                    "references": all_references,
                    "count": len(all_references),
                    "truncated": truncated,
                }
            )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error finding references: {symbol}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to find references: {str(e)}"
            )
