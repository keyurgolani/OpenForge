from tools.memory.store import StoreMemoryTool
from tools.memory.recall import RecallMemoryTool
from tools.memory.search_workspace import SearchWorkspaceTool
from tools.memory.save_to_workspace import SaveToWorkspaceTool
from tools.memory.list_knowledge import ListKnowledgeTool
from tools.memory.delete_knowledge import DeleteKnowledgeTool

TOOLS = [
    StoreMemoryTool(),
    RecallMemoryTool(),
    SearchWorkspaceTool(),
    SaveToWorkspaceTool(),
    ListKnowledgeTool(),
    DeleteKnowledgeTool(),
]
