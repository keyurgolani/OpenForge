from tools.platform.agent.invoke import InvokeAgentTool
from tools.platform.agent.list_agents import ListAgentsTool
from tools.platform.agent.get_agent import GetAgentTool
from tools.platform.agent.create_agent import CreateAgentTool
from tools.platform.agent.update_agent import UpdateAgentTool

TOOLS = [
    InvokeAgentTool(),
    ListAgentsTool(),
    GetAgentTool(),
    CreateAgentTool(),
    UpdateAgentTool(),
]
