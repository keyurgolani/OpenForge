from pathlib import Path
from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings


class ReadSkillTool(BaseTool):
    @property
    def id(self): return "skills.read"

    @property
    def category(self): return "skills"

    @property
    def display_name(self): return "Read Skill"

    @property
    def description(self):
        return (
            "Read the full content of an installed SKILL.md file by skill name. "
            "Use this to understand what a skill does and how to apply it."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Skill directory name (as returned by skills.list_installed).",
                },
            },
            "required": ["name"],
        }

    @property
    def max_output(self): return 40_000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        name = (params.get("name") or "").strip()
        if not name:
            return ToolResult(success=False, error="name is required")

        settings = get_settings()
        skill_md = Path(settings.skills_dir) / name / "SKILL.md"

        if not skill_md.exists():
            return ToolResult(success=False, error=f"Skill '{name}' not found. Use skills.list_installed to see available skills.")

        content = skill_md.read_text(encoding="utf-8", errors="replace")
        return self._maybe_truncate("", content)
