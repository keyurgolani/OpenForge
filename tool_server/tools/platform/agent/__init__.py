from tools.platform.agent.invoke import InvokeAgentTool
from tools.platform.agent.list_agents import ListAgentsTool
from tools.platform.agent.get_agent import GetAgentTool

TOOLS = [
    InvokeAgentTool(),
    ListAgentsTool(),
    GetAgentTool(),
]
