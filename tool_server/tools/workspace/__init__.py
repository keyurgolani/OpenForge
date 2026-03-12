from tools.workspace.search import WorkspaceSearchTool
from tools.workspace.save_knowledge import SaveKnowledgeTool
from tools.workspace.list_knowledge import WorkspaceListKnowledgeTool
from tools.workspace.delete_knowledge import WorkspaceDeleteKnowledgeTool
from tools.workspace.list_chats import WorkspaceListChatsTool
from tools.workspace.read_chat import WorkspaceReadChatTool
from tools.workspace.update_target import UpdateTargetTool

TOOLS = [
    WorkspaceSearchTool(),
    SaveKnowledgeTool(),
    WorkspaceListKnowledgeTool(),
    WorkspaceDeleteKnowledgeTool(),
    WorkspaceListChatsTool(),
    WorkspaceReadChatTool(),
    UpdateTargetTool(),
]
