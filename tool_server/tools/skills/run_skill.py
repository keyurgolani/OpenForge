"""
Run skill tool for OpenForge.

Executes a skill script from the skills volume mount (/skills).
Skills are scripts that extend agent capabilities.
"""
import asyncio
import json
import logging
import os
from pathlib import Path

from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings

logger = logging.getLogger("tool-server.skills")


class SkillsRunSkillTool(BaseTool):
    """Execute a skill script from the skills volume."""

    @property
    def id(self) -> str:
        return "skills.run_skill"

    @property
    def category(self) -> str:
        return "skills"

    @property
    def display_name(self) -> str:
        return "Run Skill"

    @property
    def description(self) -> str:
        return """Execute a skill script from the skills directory.

Skills are scripts stored in the /skills volume that extend agent capabilities.
Each skill can accept JSON input and returns JSON output.

Use for:
- Running custom automation scripts
- Executing domain-specific tasks
- Extending agent capabilities with user-defined scripts"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "skill_name": {
                    "type": "string",
                    "description": "Name of the skill to run (filename without extension)"
                },
                "input": {
                    "type": "object",
                    "description": "JSON input to pass to the skill script",
                    "additionalProperties": True,
                }
            },
            "required": ["skill_name"]
        }

    @property
    def risk_level(self) -> str:
        return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        skill_name = params.get("skill_name", "").strip()
        if not skill_name:
            return ToolResult(
                success=False,
                output=None,
                error="skill_name is required"
            )

        # Sanitize skill name - no path traversal
        skill_name = skill_name.replace("..", "").replace("/", "").replace("\\", "")
        if not skill_name:
            return ToolResult(
                success=False,
                output=None,
                error="Invalid skill name"
            )

        settings = get_settings()
        skills_root = Path(settings.skills_root)

        # Look for skill script
        skill_path = None
        for ext in [".py", ".sh", ".js", ""]:
            candidate = skills_root / f"{skill_name}{ext}"
            if candidate.exists() and candidate.is_file():
                skill_path = candidate
                break

        if not skill_path:
            # List available skills for helpful error
            available = []
            if skills_root.exists():
                available = [
                    f.stem for f in skills_root.iterdir()
                    if f.is_file() and not f.name.startswith(".")
                ]
            return ToolResult(
                success=False,
                output=None,
                error=f"Skill '{skill_name}' not found. Available skills: {available}"
            )

        skill_input = params.get("input", {})
        input_json = json.dumps(skill_input)

        try:
            # Execute based on file extension
            if skill_path.suffix == ".py":
                cmd = ["python3", str(skill_path)]
            elif skill_path.suffix == ".sh":
                cmd = ["bash", str(skill_path)]
            elif skill_path.suffix == ".js":
                cmd = ["node", str(skill_path)]
            else:
                # Try to make it executable and run directly
                os.chmod(skill_path, 0o755)
                cmd = [str(skill_path)]

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={
                    **os.environ,
                    "SKILL_INPUT": input_json,
                    "WORKSPACE_ID": str(context.workspace_id) if context.workspace_id else "",
                    "SKILLS_ROOT": str(skills_root),
                },
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(input=input_json.encode()),
                    timeout=60.0,
                )
            except asyncio.TimeoutError:
                proc.kill()
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Skill '{skill_name}' timed out after 60 seconds"
                )

            if proc.returncode != 0:
                return ToolResult(
                    success=False,
                    output={"stderr": stderr.decode("utf-8", errors="replace")},
                    error=f"Skill '{skill_name}' exited with code {proc.returncode}"
                )

            stdout_text = stdout.decode("utf-8", errors="replace").strip()

            # Try to parse as JSON
            try:
                output = json.loads(stdout_text)
            except json.JSONDecodeError:
                output = {"output": stdout_text}

            return ToolResult(
                success=True,
                output=output,
            )

        except Exception as e:
            logger.exception(f"Error running skill '{skill_name}'")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to run skill '{skill_name}': {str(e)}"
            )
