import httpx
from protocol import BaseTool, ToolContext, ToolResult


class GetDeploymentTool(BaseTool):
    @property
    def id(self): return "platform.deployment.get"

    @property
    def category(self): return "platform.deployment"

    @property
    def display_name(self): return "Get Deployment"

    @property
    def description(self):
        return (
            "Get detailed information about a specific deployment by its ID. "
            "Returns the deployment's full configuration including automation reference, "
            "input values, trigger type, schedule, status, and run history. "
            "Use platform.deployment.list to find deployment IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "deployment_id": {
                    "type": "string",
                    "description": "The UUID of the deployment to retrieve",
                },
            },
            "required": ["deployment_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        deployment_id = params.get("deployment_id")
        if not deployment_id:
            return ToolResult(success=False, error="deployment_id is required")
        url = f"{context.main_app_url}/api/v1/deployments/{deployment_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
            return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Deployment {deployment_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
