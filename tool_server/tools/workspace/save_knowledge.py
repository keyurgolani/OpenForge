import httpx
from protocol import BaseTool, ToolContext, ToolResult


class SaveKnowledgeTool(BaseTool):
    @property
    def id(self): return "workspace.save_knowledge"

    @property
    def category(self): return "workspace"

    @property
    def display_name(self): return "Save Knowledge"

    @property
    def description(self):
        return (
            "Create a new knowledge record in the user's workspace. "
            "The record is saved permanently and is visible to the user in their knowledge base. "
            "Use this when the user explicitly asks you to save, write, or create a note, document, "
            "or code snippet in their workspace. "
            "NOT for temporary agent notes — use memory.store for ephemeral scratchpad data that "
            "only needs to last for the current task."
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
                    "description": "Knowledge type: note (notes/documents), fleeting (quick temporary thought), gist (code snippet)",
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
