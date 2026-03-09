from tools.skills.install import InstallSkillTool
from tools.skills.list_installed import ListInstalledSkillsTool
from tools.skills.read import ReadSkillTool
from tools.skills.remove import RemoveSkillTool
from tools.skills.search import SearchSkillsTool

TOOLS = [
    InstallSkillTool(),
    ListInstalledSkillsTool(),
    ReadSkillTool(),
    RemoveSkillTool(),
    SearchSkillsTool(),
]
