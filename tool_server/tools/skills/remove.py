import shutil
from pathlib import Path
from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings


class RemoveSkillTool(BaseTool):
    @property
    def id(self): return "skills.remove"

    @property
    def category(self): return "skills"

    @property
    def display_name(self): return "Remove Skill"

    @property
    def description(self):
        return "Remove an installed agent skill by name, deleting its directory from the skills repository."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Skill directory name to remove (as returned by skills.list_installed).",
                },
            },
            "required": ["name"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        name = (params.get("name") or "").strip()
        if not name:
            return ToolResult(success=False, error="name is required")

        # Guard against path traversal
        if "/" in name or "\\" in name or name.startswith("."):
            return ToolResult(success=False, error="Invalid skill name")

        settings = get_settings()
        skill_dir = Path(settings.skills_dir) / name

        if not skill_dir.exists():
            return ToolResult(success=False, error=f"Skill '{name}' not found")

        if not skill_dir.is_dir():
            return ToolResult(success=False, error=f"'{name}' is not a skill directory")

        shutil.rmtree(skill_dir)
        return ToolResult(success=True, output={"removed": name})
