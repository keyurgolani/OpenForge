import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ListWorkspacesTool(BaseTool):
    @property
    def id(self): return "platform.workspace.list_workspaces"

    @property
    def category(self): return "platform.workspace"

    @property
    def display_name(self): return "List Workspaces"

    @property
    def description(self):
        return (
            "List all workspaces in the system. Returns workspace names, IDs, descriptions, "
            "knowledge counts, and conversation counts. "
            "Use this to discover available workspaces and their IDs before performing "
            "workspace-scoped operations like searching knowledge or saving content."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {},
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/workspaces"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
            workspaces = resp.json()
            summary = [
                {
                    "id": ws.get("id"),
                    "name": ws.get("name"),
                    "description": ws.get("description"),
                    "knowledge_count": ws.get("knowledge_count", 0),
                    "conversation_count": ws.get("conversation_count", 0),
                }
                for ws in (workspaces if isinstance(workspaces, list) else [])
            ]
            return ToolResult(success=True, output={"workspaces": summary, "total": len(summary)})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
