import httpx
from protocol import BaseTool, ToolContext, ToolResult


class UpdateTargetTool(BaseTool):
    @property
    def id(self): return "workspace.update_target"

    @property
    def category(self): return "workspace"

    @property
    def display_name(self): return "Update Target"

    @property
    def description(self):
        return (
            "Update a continuous target in the workspace. Targets are persistent output files "
            "that you can incrementally update across multiple interactions. "
            "Use mode='replace' to overwrite, 'append' to add to the end, or 'patch' to concatenate directly. "
            "The target is automatically created if it doesn't exist."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Target name (e.g. 'weekly-report', 'project-status')",
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
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        name = params["name"]
        content = params["content"]
        mode = params.get("mode", "replace")

        url = f"{context.main_app_url}/api/v1/workspaces/{context.workspace_id}/targets/{name}/update"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json={
                    "content": content,
                    "mode": mode,
                })
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output=f"Target '{name}' updated (mode={mode}, id={data.get('id', 'unknown')})",
            )
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
