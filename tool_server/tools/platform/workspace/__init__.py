from tools.platform.workspace.search import WorkspaceSearchTool
from tools.platform.workspace.save_knowledge import SaveKnowledgeTool
from tools.platform.workspace.list_knowledge import ListKnowledgeTool
from tools.platform.workspace.delete_knowledge import DeleteKnowledgeTool
from tools.platform.workspace.list_workspaces import ListWorkspacesTool
from tools.platform.workspace.get_workspace import GetWorkspaceTool

TOOLS = [
    WorkspaceSearchTool(),
    SaveKnowledgeTool(),
    ListKnowledgeTool(),
    DeleteKnowledgeTool(),
    ListWorkspacesTool(),
    GetWorkspaceTool(),
]
