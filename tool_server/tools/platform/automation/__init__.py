from tools.platform.automation.list_automations import ListAutomationsTool
from tools.platform.automation.get_automation import GetAutomationTool
from tools.platform.automation.create_automation import CreateAutomationTool
from tools.platform.automation.update_automation import UpdateAutomationTool
from tools.platform.automation.delete_automation import DeleteAutomationTool

TOOLS = [
    ListAutomationsTool(),
    GetAutomationTool(),
    CreateAutomationTool(),
    UpdateAutomationTool(),
    DeleteAutomationTool(),
]
