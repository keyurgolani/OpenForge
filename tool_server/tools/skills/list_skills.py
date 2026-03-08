"""
List skills tool for OpenForge.

Lists available skill scripts from the skills volume mount (/skills).
"""
import logging
from pathlib import Path

from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings

logger = logging.getLogger("tool-server.skills")


class SkillsListSkillsTool(BaseTool):
    """List available skill scripts from the skills volume."""

    @property
    def id(self) -> str:
        return "skills.list_skills"

    @property
    def category(self) -> str:
        return "skills"

    @property
    def display_name(self) -> str:
        return "List Skills"

    @property
    def description(self) -> str:
        return """List available skill scripts in the skills directory.

Skills are custom scripts stored in the /skills volume.
This tool helps discover what skills are available to execute.

Use for:
- Discovering available custom skills
- Finding skill names before running them"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {},
            "required": []
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        skills_root = Path(settings.skills_root)

        if not skills_root.exists():
            return ToolResult(
                success=True,
                output={
                    "skills": [],
                    "count": 0,
                    "message": f"Skills directory {skills_root} does not exist or is empty",
                }
            )

        skills = []
        for f in sorted(skills_root.iterdir()):
            if f.is_file() and not f.name.startswith("."):
                skills.append({
                    "name": f.stem,
                    "filename": f.name,
                    "extension": f.suffix,
                    "size_bytes": f.stat().st_size,
                })

        return ToolResult(
            success=True,
            output={
                "skills": skills,
                "count": len(skills),
                "skills_root": str(skills_root),
            }
        )
