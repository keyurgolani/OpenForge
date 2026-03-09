from pathlib import Path
from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings
from tools.skills.install import _list_installed_skills


class ListInstalledSkillsTool(BaseTool):
    @property
    def id(self): return "skills.list_installed"

    @property
    def category(self): return "skills"

    @property
    def display_name(self): return "List Installed Skills"

    @property
    def description(self):
        return (
            "List all agent skills currently installed in the shared skills repository. "
            "Returns skill names, descriptions, and file paths."
        )

    @property
    def input_schema(self):
        return {"type": "object", "properties": {}}

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        skills = _list_installed_skills(settings.skills_dir)
        return ToolResult(success=True, output={"skills": skills, "count": len(skills)})
