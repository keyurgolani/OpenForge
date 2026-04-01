import httpx
from protocol import BaseTool, ToolContext, ToolResult


class PauseDeploymentTool(BaseTool):
    @property
    def id(self): return "platform.deployment.pause"

    @property
    def category(self): return "platform.deployment"

    @property
    def display_name(self): return "Pause Deployment"

    @property
    def description(self):
        return (
            "Pause an active deployment. Disables the trigger so no new runs are created. "
            "The deployment can be resumed later with platform.deployment.resume. "
            "Use platform.deployment.list to find deployment IDs."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "deployment_id": {
                    "type": "string",
                    "description": "The UUID of the deployment to pause",
                },
            },
            "required": ["deployment_id"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        deployment_id = params.get("deployment_id")
        if not deployment_id:
            return ToolResult(success=False, error="deployment_id is required")
        url = f"{context.main_app_url}/api/v1/deployments/{deployment_id}/pause"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url)
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output={"id": data.get("id"), "status": data.get("status"), "message": f"Paused deployment {deployment_id}"},
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Deployment {deployment_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
