"""
Skills tools for OpenForge.

Tools for accessing prompt templates and skills from the main app.
Enables agents to use predefined workflows and custom skill scripts.
"""
from protocol import BaseTool
from .list_prompts import SkillsListPromptsTool
from .get_prompt import SkillsGetPromptTool
from .list_skills import SkillsListSkillsTool
from .run_skill import SkillsRunSkillTool

TOOLS: list[BaseTool] = [
    SkillsListPromptsTool(),
    SkillsGetPromptTool(),
    SkillsListSkillsTool(),
    SkillsRunSkillTool(),
]
