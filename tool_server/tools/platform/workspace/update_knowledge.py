import httpx
from protocol import BaseTool, ToolContext, ToolResult
from tools.platform.workspace._access import _check_deployment_write_access


class UpdateKnowledgeTool(BaseTool):
    @property
    def id(self):
        return "platform.workspace.update_knowledge"

    @property
    def category(self):
        return "platform.workspace"

    @property
    def display_name(self):
        return "Update Knowledge"

    @property
    def description(self):
        return (
            "Update an existing knowledge item's content, title, or tags. "
            "Use this to enrich or correct previously saved knowledge."
        )

    @property
    def risk_level(self):
        return "medium"

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "workspace_id": {
                    "type": "string",
                    "description": "Workspace ID containing the knowledge item",
                },
                "knowledge_id": {
                    "type": "string",
                    "description": "ID of the knowledge item to update",
                },
                "title": {
                    "type": "string",
                    "description": "New title (optional — omit to keep current)",
                },
                "content": {
                    "type": "string",
                    "description": "New content (optional — omit to keep current)",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "New tags (optional — omit to keep current)",
                },
            },
            "required": ["workspace_id", "knowledge_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        workspace_id = params.get("workspace_id") or context.workspace_id
        knowledge_id = params.get("knowledge_id")

        # Enforce deployment workspace write access
        denied = await _check_deployment_write_access(workspace_id, context)
        if denied:
            return denied
        if not knowledge_id:
            return ToolResult(success=False, error="knowledge_id is required")

        update_data = {}
        if "title" in params:
            update_data["title"] = params["title"]
        if "content" in params:
            update_data["content"] = params["content"]
        if "tags" in params:
            update_data["tags"] = params["tags"]

        if not update_data:
            return ToolResult(success=False, error="No fields to update. Provide title, content, or tags.")

        try:
            url = f"{context.main_app_url}/api/v1/workspaces/{workspace_id}/knowledge/{knowledge_id}"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.patch(url, json=update_data)
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output=f"Updated knowledge item '{data.get('title', knowledge_id)}' successfully.",
            )
        except httpx.HTTPStatusError as exc:
            return ToolResult(success=False, error=f"Failed to update knowledge: {exc.response.status_code} {exc.response.text}")
        except Exception as exc:
            return ToolResult(success=False, error=f"Failed to update knowledge: {exc}")
