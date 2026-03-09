import asyncio
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class GitCommitTool(BaseTool):
    @property
    def id(self): return "git.commit"

    @property
    def category(self): return "git"

    @property
    def display_name(self): return "Git Commit"

    @property
    def description(self): return "Create a git commit with staged changes."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Commit message"},
                "author_name": {"type": "string", "description": "Author name (e.g. 'Jane Doe'). Required if git user.name is not configured globally."},
                "author_email": {"type": "string", "description": "Author email (e.g. 'jane@example.com'). Required if git user.email is not configured globally."},
            },
            "required": ["message"],
        }

    @property
    def risk_level(self): return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        cwd = str(security.get_workspace_dir(context.workspace_id))
        author_name = (params.get("author_name") or "").strip()
        author_email = (params.get("author_email") or "").strip()
        cmd = ["git"]
        if author_name:
            cmd += ["-c", f"user.name={author_name}"]
        if author_email:
            cmd += ["-c", f"user.email={author_email}"]
        cmd += ["commit", "-m", params["message"]]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
            out = stdout.decode("utf-8", errors="replace")
            err = stderr.decode("utf-8", errors="replace")
            if proc.returncode != 0:
                err_text = err.strip() or out.strip()
                if "Please tell me who you are" in err_text or "user.email" in err_text:
                    return ToolResult(
                        success=False,
                        error=(
                            "Git author identity is not configured. "
                            "Ask the user for their preferred git author name and email before retrying. "
                            "Do not invent or guess an author. "
                            "Once the user provides their name and email, retry this tool with the "
                            "author_name and author_email parameters."
                        ),
                    )
                return ToolResult(success=False, error=err_text)
            return ToolResult(success=True, output=out.strip())
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
