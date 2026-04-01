import httpx
from protocol import BaseTool, ToolContext, ToolResult


class RunNowTool(BaseTool):
    @property
    def id(self): return "platform.deployment.run_now"

    @property
    def category(self): return "platform.deployment"

    @property
    def display_name(self): return "Run Deployment Now"

    @property
    def description(self):
        return (
            "Trigger an immediate one-off execution of an active deployment. "
            "This creates a new run right now, independent of the deployment's normal trigger schedule. "
            "The deployment must be in active status. "
            "Use platform.deployment.list to find active deployments."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "deployment_id": {
                    "type": "string",
                    "description": "The UUID of the deployment to run",
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
        url = f"{context.main_app_url}/api/v1/deployments/{deployment_id}/run-now"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url)
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output={"id": data.get("id"), "status": data.get("status"), "message": f"Triggered immediate run for deployment {deployment_id}"},
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Deployment {deployment_id} not found")
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
