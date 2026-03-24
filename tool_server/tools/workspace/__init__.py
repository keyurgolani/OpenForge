from tools.workspace.search import WorkspaceSearchTool
from tools.workspace.save_knowledge import SaveKnowledgeTool
from tools.workspace.list_knowledge import WorkspaceListKnowledgeTool
from tools.workspace.delete_knowledge import WorkspaceDeleteKnowledgeTool

TOOLS = [
    WorkspaceSearchTool(),
    SaveKnowledgeTool(),
    WorkspaceListKnowledgeTool(),
    WorkspaceDeleteKnowledgeTool(),
]
