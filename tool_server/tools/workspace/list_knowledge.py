import httpx
from protocol import BaseTool, ToolContext, ToolResult


class WorkspaceListKnowledgeTool(BaseTool):
    @property
    def id(self): return "workspace.list_knowledge"

    @property
    def category(self): return "workspace"

    @property
    def display_name(self): return "List Knowledge"

    @property
    def description(self):
        return (
            "List knowledge records the user has stored in their workspace — notes, bookmarks, "
            "gists, uploaded documents, and other content the user created or imported. "
            "Returns titles, IDs, types, and tags for each record. "
            "Use this to browse available knowledge or find records by type. "
            "To find knowledge by topic or content, use workspace.search instead. "
            "These are user-created records — NOT the agent's own working scratchpad (use memory.recall for that)."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["standard", "fleeting", "bookmark", "gist", "image", "audio", "pdf", "docx", "xlsx", "pptx"],
                    "description": "Filter by knowledge type (omit to return all types)",
                },
                "page_size": {
                    "type": "integer",
                    "default": 50,
                    "description": "Maximum number of records to return",
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
