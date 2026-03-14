from tools.agent.invoke import InvokeAgentTool
from tools.agent.write_target import WriteTargetTool

TOOLS = [
    InvokeAgentTool(),
    WriteTargetTool(),
]
