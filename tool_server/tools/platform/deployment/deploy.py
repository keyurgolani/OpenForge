import httpx
from protocol import BaseTool, ToolContext, ToolResult


class DeployTool(BaseTool):
    @property
    def id(self): return "platform.deployment.deploy"

    @property
    def category(self): return "platform.deployment"

    @property
    def display_name(self): return "Deploy Automation"

    @property
    def description(self):
        return (
            "Deploy an automation, creating a live deployment instance. "
            "Requires the automation_id. Provide input_values for all "
            "mandatory deployment inputs (inputs that are neither wired nor given static values "
            "in the automation graph). "
            "Attach a trigger: omit schedule fields for manual-only trigger, provide "
            "schedule_expression for cron trigger (e.g., '0 9 * * 1' for every Monday at 9am), "
            "or provide interval_seconds for interval trigger. "
            "Use platform.automation.get to inspect the deployment input schema first."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "automation_id": {
                    "type": "string",
                    "description": "The UUID of the automation to deploy",
                },
                "input_values": {
                    "type": "object",
                    "description": "Values for the deployment's mandatory inputs. Keys are parameter names (or node-key.param_name for multi-node automations).",
                },
                "schedule_expression": {
                    "type": "string",
                    "description": "Cron expression for scheduled trigger (e.g., '0 9 * * 1'). Omit for manual trigger.",
                },
                "interval_seconds": {
                    "type": "integer",
                    "description": "Interval in seconds for interval trigger. Omit for manual trigger.",
                },
            },
            "required": ["automation_id"],
        }

    @property
    def risk_level(self): return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        automation_id = params.get("automation_id")
        if not automation_id:
            return ToolResult(success=False, error="automation_id is required")
        # Use workspace from context; agents discover workspaces from their prompt
        workspace_id = context.workspace_id
        url = f"{context.main_app_url}/api/v1/automations/{automation_id}/deploy"
        payload: dict = {
            "workspace_id": workspace_id,
            "input_values": params.get("input_values", {}),
        }
        if "schedule_expression" in params:
            payload["schedule_expression"] = params["schedule_expression"]
        if "interval_seconds" in params:
            payload["interval_seconds"] = params["interval_seconds"]
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output={
                    "id": data.get("id"),
                    "automation_id": data.get("automation_id"),
                    "status": data.get("status"),
                    "trigger_type": data.get("trigger_type"),
                    "message": f"Deployed automation {automation_id}",
                },
            )
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300] if exc.response.text else "empty"
            return ToolResult(success=False, error=f"Deploy failed (HTTP {exc.response.status_code}): {body}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
