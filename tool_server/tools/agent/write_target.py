import os
import re

from protocol import BaseTool, ToolContext, ToolResult
from config import get_settings


def _safe_filename(name: str) -> str:
    """Sanitize a target name into a safe filename."""
    return re.sub(r"[^a-zA-Z0-9_-]", "-", name).strip("-") or "target"


class WriteTargetTool(BaseTool):
    @property
    def id(self):
        return "agent.write_target"

    @property
    def category(self):
        return "agent"

    @property
    def display_name(self):
        return "Write Target"

    @property
    def description(self):
        return (
            "Write to a persistent target file. Targets are output files organized by agent, "
            "accessible to the user at /targets/<agent_id>/. "
            "Use mode='replace' to overwrite, 'append' to add to the end, or 'patch' to concatenate directly. "
            "The target file is automatically created if it doesn't exist."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Target name (e.g. 'weekly-report', 'project-status'). "
                    "Used as the filename with .md extension.",
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the target",
                },
                "mode": {
                    "type": "string",
                    "enum": ["replace", "append", "patch"],
                    "default": "replace",
                    "description": "Update mode: replace (overwrite), append (add with newline), patch (concatenate)",
                },
            },
            "required": ["name", "content"],
        }

    @property
    def risk_level(self):
        return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        name = params["name"]
        content = params["content"]
        mode = params.get("mode", "replace")

        agent_id = context.agent_id
        if not agent_id:
            return ToolResult(success=False, error="No agent_id in execution context")

        settings = get_settings()
        target_dir = os.path.join(settings.targets_root, agent_id)
        os.makedirs(target_dir, exist_ok=True)

        safe_name = _safe_filename(name)
        target_path = os.path.join(target_dir, f"{safe_name}.md")

        try:
            if mode == "replace":
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write(content)
            elif mode == "append":
                with open(target_path, "a", encoding="utf-8") as f:
                    f.write(f"\n{content}")
            elif mode == "patch":
                with open(target_path, "a", encoding="utf-8") as f:
                    f.write(content)
            else:
                return ToolResult(success=False, error=f"Invalid mode: {mode}")

            return ToolResult(
                success=True,
                output=f"Target '{name}' written (mode={mode}, path=/targets/{agent_id}/{safe_name}.md)",
            )
        except Exception as exc:
            return ToolResult(success=False, error=f"Failed to write target: {exc}")
