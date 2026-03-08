"""
Language tools for OpenForge.

Tools for code analysis, parsing, and modification.
Supports Python (AST-based). Other languages may be added in the future.
"""
from tool_server.protocol import BaseTool
from .parse_ast import LanguageParseAstTool
from .find_definition import LanguageFindDefinitionTool
from .find_references import LanguageFindReferencesTool
from .apply_diff import LanguageApplyDiffTool

TOOLS: list[BaseTool] = [
    LanguageParseAstTool(),
    LanguageFindDefinitionTool(),
    LanguageFindReferencesTool(),
    LanguageApplyDiffTool(),
]
