import httpx
from protocol import BaseTool, ToolContext, ToolResult


class SaveToWorkspaceTool(BaseTool):
    @property
    def id(self): return "memory.save_to_workspace"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "Save to Workspace Knowledge"

    @property
    def description(self):
        return (
            "Save a new knowledge record to the user's workspace. "
            "Use this when the user asks you to save, remember, or store something permanently "
            "in their workspace beyond the current conversation."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Title for the knowledge record"},
                "content": {"type": "string", "description": "Content to save"},
                "type": {
                    "type": "string",
                    "enum": ["note", "fleeting", "gist"],
                    "default": "note",
                    "description": "Knowledge type: note (notes), fleeting (temporary), gist (code snippets)",
                },
            },
            "required": ["title", "content"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/workspaces/{context.workspace_id}/knowledge"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json={
                    "title": params["title"],
                    "content": params["content"],
                    "type": params.get("type", "note"),
                })
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output=f"Saved to workspace knowledge: '{params['title']}' (id: {data.get('id', 'unknown')})",
            )
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
