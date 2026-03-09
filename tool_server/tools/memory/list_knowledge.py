import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ListKnowledgeTool(BaseTool):
    @property
    def id(self): return "memory.list_knowledge"

    @property
    def category(self): return "memory"

    @property
    def display_name(self): return "List Workspace Knowledge"

    @property
    def description(self):
        return (
            "List knowledge records stored in the user's workspace. "
            "Returns id, title, type, and tags for each record. "
            "Use this to discover what knowledge items exist before reading, updating, or deleting them."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["standard", "fleeting", "bookmark", "gist"],
                    "description": "Filter by knowledge type (omit to return all types)",
                },
                "page_size": {
                    "type": "integer",
                    "default": 50,
                    "description": "Max records to return (default 50)",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/workspaces/{context.workspace_id}/knowledge"
        query: dict = {"page_size": params.get("page_size", 50)}
        if "type" in params:
            query["type"] = params["type"]
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=query)
                resp.raise_for_status()
            data = resp.json()
            items = data.get("knowledge", [])
            summary = [
                {
                    "id": k["id"],
                    "title": k.get("title") or "(untitled)",
                    "type": k.get("type", "standard"),
                    "tags": k.get("tags", []),
                }
                for k in items
            ]
            return ToolResult(success=True, output={"total": data.get("total", len(items)), "knowledge": summary})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
