from tools.language.parse_ast import ParseAstTool
from tools.language.find_definition import FindDefinitionTool
from tools.language.find_references import FindReferencesTool
from tools.language.apply_diff import ApplyDiffTool

TOOLS = [
    ParseAstTool(),
    FindDefinitionTool(),
    FindReferencesTool(),
    ApplyDiffTool(),
]
