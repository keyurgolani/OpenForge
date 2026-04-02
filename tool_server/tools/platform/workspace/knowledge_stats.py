import httpx
from protocol import BaseTool, ToolContext, ToolResult


class KnowledgeStatsTool(BaseTool):
    @property
    def id(self):
        return "platform.workspace.knowledge_stats"

    @property
    def category(self):
        return "platform.workspace"

    @property
    def display_name(self):
        return "Knowledge Stats"

    @property
    def description(self):
        return (
            "Get aggregate statistics about knowledge in a workspace: "
            "total count, count by type, tag distribution, and date range. "
            "Useful for assessing workspace health and identifying gaps."
        )

    @property
    def risk_level(self):
        return "low"

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "workspace_id": {
                    "type": "string",
                    "description": "Workspace ID to get stats for",
                },
            },
            "required": ["workspace_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        workspace_id = params.get("workspace_id") or context.workspace_id
        if not workspace_id:
            return ToolResult(success=False, error="workspace_id is required")

        try:
            url = f"{context.main_app_url}/api/v1/workspaces/{workspace_id}/knowledge"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params={"page_size": 500})
                resp.raise_for_status()
            data = resp.json()

            items = data.get("items", [])
            total = len(items)
            type_counts = {}
            tag_counts = {}
            has_summary = 0

            for item in items:
                t = item.get("type", "unknown")
                type_counts[t] = type_counts.get(t, 0) + 1
                for tag in item.get("tags") or []:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
                if item.get("summary"):
                    has_summary += 1

            stats = {
                "total_items": total,
                "by_type": type_counts,
                "top_tags": dict(sorted(tag_counts.items(), key=lambda x: -x[1])[:20]),
                "items_with_summary": has_summary,
                "items_without_summary": total - has_summary,
            }

            return ToolResult(success=True, output=stats)
        except httpx.HTTPStatusError as exc:
            return ToolResult(success=False, error=f"Failed to get stats: {exc.response.status_code}")
        except Exception as exc:
            return ToolResult(success=False, error=f"Failed to get stats: {exc}")
