from tools.agent.invoke import InvokeAgentTool
from tools.agent.list_chats import ListChatsTool
from tools.agent.read_chat import ReadChatTool

TOOLS = [
    InvokeAgentTool(),
    ListChatsTool(),
    ReadChatTool(),
]
