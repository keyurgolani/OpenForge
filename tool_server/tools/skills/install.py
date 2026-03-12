import asyncio
import os
import re
import shutil
from pathlib import Path
from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings


def _strip_ansi(text: str) -> str:
    """Remove ANSI escape codes and terminal control sequences."""
    # Remove CSI sequences (colors, cursor movement, etc.)
    text = re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', text)
    # Remove other escape sequences
    text = re.sub(r'\x1b[^[\\]', '', text)
    # Remove carriage returns used for spinner overwrites
    text = re.sub(r'\r[^\n]*', '', text)
    # Remove the ASCII art banner (lines made of block characters █ ╗ ╔ etc.)
    text = re.sub(r'^[█╗╔╚╝║╠╣╦╩╬═─│┌┐└┘├┤┬┴┼◒◐◓◑■▷◇]+.*$', '', text, flags=re.MULTILINE)
    # Collapse multiple blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _extract_meaningful(text: str) -> str:
    """Keep only lines that carry useful information (drop decorative box-drawing lines)."""
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r'^[│├┤┌┐└┘─┼◇◒◐◓◑■▷┆┊·]+\s*$', stripped):
            continue
        if re.match(r'^[█╗╔╚╝║╠╣╦╩╬═]+', stripped):
            continue
        cleaned = re.sub(r'^[│├┤┌┐└┘]\s*', '', line).strip()
        if cleaned:
            lines.append(cleaned)
    return '\n'.join(lines)


def _parse_source(raw: str) -> tuple[str, list[str]]:
    """
    Normalize a source string into (owner/repo, [skill_names]).

    Accepted formats:
      - https://skills.sh/owner/repo/skill       → ("owner/repo", ["skill"])
      - https://skills.sh/owner/repo              → ("owner/repo", [])
      - https://github.com/owner/repo             → ("owner/repo", [])
      - owner/repo/skill                          → ("owner/repo", ["skill"])
      - owner/repo                                → ("owner/repo", [])
    """
    s = raw.strip().rstrip("/")

    # Strip known URL prefixes
    for prefix in ("https://skills.sh/", "http://skills.sh/",
                   "https://github.com/", "http://github.com/"):
        if s.lower().startswith(prefix):
            s = s[len(prefix):]
            break

    parts = [p for p in s.split("/") if p]
    if len(parts) >= 3:
        # owner/repo/skill-name (possibly more segments, take first 3)
        return f"{parts[0]}/{parts[1]}", [parts[2]]
    if len(parts) == 2:
        return f"{parts[0]}/{parts[1]}", []
    # Fallback: return as-is
    return raw.strip(), []


class InstallSkillTool(BaseTool):
    @property
    def id(self): return "skills.install"

    @property
    def category(self): return "skills"

    @property
    def display_name(self): return "Install Skill"

    @property
    def description(self):
        return (
            "Install one or more agent skills from the skills.sh registry. "
            "The skills.sh URL format is https://skills.sh/{owner}/{repo}/{skill-name}. "
            "The source parameter is '{owner}/{repo}' (the GitHub repo). "
            "Use skill_names to install a specific skill from a multi-skill repo, or omit to install all. "
            "Example: https://skills.sh/vercel-labs/skills/find-skills → source='vercel-labs/skills', skill_names=['find-skills']. "
            "Single-skill repos: https://skills.sh/vercel-labs/agent-skills → source='vercel-labs/agent-skills'."
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
                        "Example: 'vercel-labs/skills' for a multi-skill repo, 'vercel-labs/agent-skills' for single-skill."
                    ),
                },
                "skill_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Specific skill names to install from the package. Omit or pass [] to install all.",
                },
            },
            "required": ["source"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        source = (params.get("source") or "").strip()
        if not source:
            return ToolResult(success=False, error="source is required")

        skill_names: list[str] = list(params.get("skill_names") or [])

        # Normalize source: handle skills.sh URLs, github URLs, and owner/repo/skill paths
        source, extra_skills = _parse_source(source)
        for s in extra_skills:
            if s not in skill_names:
                skill_names.append(s)
        settings = get_settings()
        skills_root = settings.skills_root

        Path(skills_root).mkdir(parents=True, exist_ok=True)

        cmd = ["npx", "--yes", "skills", "add", source, "-a", "claude-code", "--copy", "-y"]
        if skill_names:
            for name in skill_names:
                cmd += ["--skill", name]
        else:
            cmd += ["--skill", "*"]

        env = os.environ.copy()
        env["npm_config_update_notifier"] = "false"
        env["DISABLE_TELEMETRY"] = "1"
        env["NO_COLOR"] = "1"
        env["FORCE_COLOR"] = "0"

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=skills_root,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return ToolResult(success=False, error="Install timed out after 120s")

            out = _extract_meaningful(_strip_ansi(stdout.decode("utf-8", errors="replace")))
            err = _extract_meaningful(_strip_ansi(stderr.decode("utf-8", errors="replace")))
            combined = out
            if err:
                combined = f"{out}\n{err}" if out else err

            if proc.returncode != 0:
                return ToolResult(success=False, error=combined or f"Exit code {proc.returncode}")

            # Move skills out of the CLI's .claude/skills staging dir into skills_dir
            _promote_cli_skills(Path(skills_root), Path(settings.skills_dir))

            installed = _list_installed_skills(settings.skills_dir)
            return ToolResult(success=True, output={
                "message": "Skills installed successfully",
                "output": combined,
                "installed_skills": installed,
            })
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))


def _promote_cli_skills(skills_root: Path, skills_dir: Path) -> None:
    """Move skills from the CLI's .claude/skills staging area into skills_dir."""
    staging = skills_root / ".claude" / "skills"
    if not staging.is_dir():
        return
    skills_dir.mkdir(parents=True, exist_ok=True)
    for entry in staging.iterdir():
        if not entry.is_dir():
            continue
        dest = skills_dir / entry.name
        if dest.exists():
            shutil.rmtree(dest)
        shutil.move(str(entry), str(dest))
    # Remove the .claude staging dir if it's now empty (or only has empty subdirs)
    try:
        claude_dir = skills_root / ".claude"
        if claude_dir.is_dir():
            shutil.rmtree(claude_dir)
    except Exception:
        pass


def _list_installed_skills(skills_dir: str, include_content: bool = False) -> list[dict]:
    """Utility: enumerate installed skill directories."""
    base = Path(skills_dir)
    if not base.is_dir():
        return []
    result = []
    for entry in sorted(base.iterdir()):
        if not entry.is_dir():
            continue
        skill_md = entry / "SKILL.md"
        if not skill_md.exists():
            continue
        raw = skill_md.read_text(encoding="utf-8", errors="replace")
        meta = _parse_skill_meta(raw)
        skill: dict = {
            "name": meta.get("name") or entry.name,
            "description": meta.get("description") or "",
            "path": str(skill_md),
        }
        if include_content:
            # Strip YAML frontmatter, return only the markdown body
            body = re.sub(r"^---\n.+?\n---\n?", "", raw, flags=re.DOTALL).strip()
            skill["content"] = body
        result.append(skill)
    return result


def _parse_skill_meta(content: str) -> dict:
    """Extract name and description from SKILL.md YAML frontmatter."""
    match = re.match(r"^---\n(.+?)\n---", content, re.DOTALL)
    if not match:
        return {}
    meta: dict = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    return meta
