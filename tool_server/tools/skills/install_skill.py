"""
Install skill tool for OpenForge.

Installs a skill from skills.sh using the `npx skills` CLI.
Skills are identified as `owner/skill-name` (e.g., `vercel-labs/agent-skills`).
"""
import asyncio
import logging
import os
from pathlib import Path

from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings

logger = logging.getLogger("tool-server.skills")


class SkillsInstallSkillTool(BaseTool):
    """Install a skill from skills.sh using the npx skills CLI."""

    @property
    def id(self) -> str:
        return "skills.install_skill"

    @property
    def category(self) -> str:
        return "skills"

    @property
    def display_name(self) -> str:
        return "Install Skill"

    @property
    def description(self) -> str:
        return """Install a skill from skills.sh using the skills CLI.

Skills are identified as 'owner/skill-name' (e.g., 'vercel-labs/agent-skills').
The skill is downloaded and installed into the /skills directory.

Use for:
- Installing new skills from the skills.sh repository
- Adding new capabilities to the agent environment"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "skill": {
                    "type": "string",
                    "description": (
                        "Skill identifier in 'owner/skill-name' format. "
                        "Example: 'vercel-labs/agent-skills'"
                    ),
                }
            },
            "required": ["skill"],
        }

    @property
    def risk_level(self) -> str:
        return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        skill = params.get("skill", "").strip()
        if not skill:
            return ToolResult(success=False, output=None, error="skill is required")

        # Sanitize — no shell injection
        if any(c in skill for c in (";", "&", "|", "`", "$", "(", ")", "\n", "\r")):
            return ToolResult(success=False, output=None, error="Invalid characters in skill name")

        settings = get_settings()
        skills_root = Path(settings.skills_root)

        try:
            skills_root.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to create skills directory {skills_root}: {e}",
            )

        # Snapshot files before install to detect what was added
        before = set(skills_root.iterdir()) if skills_root.exists() else set()

        env = {
            **os.environ,
            "DISABLE_TELEMETRY": "1",
            "npm_config_yes": "true",  # suppress npx prompts
            # Allow anonymous clone of public repos — disable any credential helper
            # that might send bad credentials and cause auth failures.
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "credential.helper",
            "GIT_CONFIG_VALUE_0": "",
        }

        try:
            proc = await asyncio.create_subprocess_exec(
                "npx", "--yes", "skills", "add", skill,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(skills_root),
                env=env,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=120.0,
                )
            except asyncio.TimeoutError:
                proc.kill()
                return ToolResult(
                    success=False,
                    output=None,
                    error="Skill installation timed out after 120 seconds",
                )

            stdout_text = stdout.decode("utf-8", errors="replace").strip()
            stderr_text = stderr.decode("utf-8", errors="replace").strip()

            if proc.returncode != 0:
                return ToolResult(
                    success=False,
                    output={"stdout": stdout_text, "stderr": stderr_text},
                    error=f"skills CLI exited with code {proc.returncode}: {stderr_text or stdout_text}",
                )

        except FileNotFoundError:
            return ToolResult(
                success=False,
                output=None,
                error="npx not found. Node.js must be installed in the tool server.",
            )
        except Exception as e:
            logger.exception(f"Error installing skill '{skill}'")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to install skill '{skill}': {e}",
            )

        # Detect newly installed files
        after = set(skills_root.iterdir()) if skills_root.exists() else set()
        new_files = [
            {"name": f.stem, "filename": f.name, "size_bytes": f.stat().st_size}
            for f in sorted(after - before)
            if not f.name.startswith(".")
        ]

        return ToolResult(
            success=True,
            output={
                "skill": skill,
                "installed_files": new_files,
                "file_count": len(new_files),
                "skills_root": str(skills_root),
                "stdout": stdout_text,
            },
        )
