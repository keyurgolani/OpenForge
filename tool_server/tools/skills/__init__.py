"""
Skills tools for OpenForge.

Tools for accessing prompt templates and skills from the main app.
Enables agents to use predefined workflows.
"""
from protocol import BaseTool
from .list_prompts import SkillsListPromptsTool
from .get_prompt import SkillsGetPromptTool

TOOLS: list[BaseTool] = [
    SkillsListPromptsTool(),
    SkillsGetPromptTool(),
]
