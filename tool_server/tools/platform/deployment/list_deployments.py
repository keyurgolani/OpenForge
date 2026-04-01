import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ListDeploymentsTool(BaseTool):
    @property
    def id(self): return "platform.deployment.list"

    @property
    def category(self): return "platform.deployment"

    @property
    def display_name(self): return "List Deployments"

    @property
    def description(self):
        return (
            "List all deployments in the system. A deployment is a live instance of an automation "
            "with concrete input values and an attached trigger. "
            "Returns deployment IDs, automation names, statuses, trigger types, and timing info. "
            "Optionally filter by status (active, paused, torn_down), automation_id, or workspace_id."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filter by deployment status: active, paused, torn_down",
                },
                "automation_id": {
                    "type": "string",
                    "description": "Filter by the source automation ID",
                },
                "workspace_id": {
                    "type": "string",
                    "description": "Filter by workspace ID",
                },
                "limit": {
                    "type": "integer",
                    "default": 50,
                    "description": "Maximum number of deployments to return",
                },
            },
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = f"{context.main_app_url}/api/v1/deployments"
        query: dict = {"limit": params.get("limit", 50)}
        for key in ("status", "automation_id", "workspace_id"):
            if key in params:
                query[key] = params[key]
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=query)
                resp.raise_for_status()
            data = resp.json()
            deployments = data.get("deployments", [])
            summary = [
                {
                    "id": d.get("id"),
                    "automation_id": d.get("automation_id"),
                    "automation_name": d.get("automation_name"),
                    "workspace_id": d.get("workspace_id"),
                    "status": d.get("status"),
                    "trigger_type": d.get("trigger_type"),
                    "schedule_expression": d.get("schedule_expression"),
                    "interval_seconds": d.get("interval_seconds"),
                    "last_run_at": d.get("last_run_at"),
                    "created_at": d.get("created_at"),
                }
                for d in deployments
            ]
            return ToolResult(success=True, output={"deployments": summary, "total": data.get("total", len(summary))})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
