from tools.platform.workspace import TOOLS as WORKSPACE_TOOLS
from tools.platform.agent import TOOLS as AGENT_TOOLS
from tools.platform.chat import TOOLS as CHAT_TOOLS
from tools.platform.automation import TOOLS as AUTOMATION_TOOLS
from tools.platform.deployment import TOOLS as DEPLOYMENT_TOOLS
from tools.platform.sink import TOOLS as SINK_TOOLS

TOOLS = (
    WORKSPACE_TOOLS
    + AGENT_TOOLS
    + CHAT_TOOLS
    + AUTOMATION_TOOLS
    + DEPLOYMENT_TOOLS
    + SINK_TOOLS
)
