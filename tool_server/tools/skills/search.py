import asyncio
import os
from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings
from tools.skills.install import _strip_ansi, _extract_meaningful


class SearchSkillsTool(BaseTool):
    @property
    def id(self): return "skills.search"

    @property
    def category(self): return "skills"

    @property
    def display_name(self): return "Search Available Skills"

    @property
    def description(self):
        return (
            "List available skills in a skills.sh package without installing them. "
            "The skills.sh URL format is https://skills.sh/{owner}/{repo}/{skill-name}. "
            "The source parameter is '{owner}/{repo}' (the GitHub repo). "
            "Example: https://skills.sh/vercel-labs/skills/find-skills → source='vercel-labs/skills'. "
            "Use this to discover what skills are in a package before installing."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": (
                        "GitHub repo identifier 'owner/repo'. "
                        "Derived from skills.sh URL: https://skills.sh/{owner}/{repo}/{skill-name} → '{owner}/{repo}'. "
                        "Example: 'vercel-labs/skills'."
                    ),
                },
            },
            "required": ["source"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        source = (params.get("source") or "").strip()
        if not source:
            return ToolResult(success=False, error="source is required")

        settings = get_settings()
        env = os.environ.copy()
        env["DISABLE_TELEMETRY"] = "1"
        env["NO_COLOR"] = "1"
        env["FORCE_COLOR"] = "0"

        cmd = ["npx", "--yes", "skills", "add", source, "-a", "claude-code", "--list"]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=settings.skills_root,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return ToolResult(success=False, error="Search timed out after 60s")

            out = _extract_meaningful(_strip_ansi(stdout.decode("utf-8", errors="replace")))
            err = _extract_meaningful(_strip_ansi(stderr.decode("utf-8", errors="replace")))

            if proc.returncode != 0 and not out:
                return ToolResult(success=False, error=err or f"Exit code {proc.returncode}")

            return ToolResult(success=True, output={"source": source, "available_skills": out})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
