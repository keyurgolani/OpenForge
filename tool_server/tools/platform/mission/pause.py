import httpx
from protocol import BaseTool, ToolContext, ToolResult


class PauseMissionTool(BaseTool):
    @property
    def id(self): return "platform.mission.pause"

    @property
    def category(self): return "platform.mission"

    @property
    def display_name(self): return "Pause Mission"

    @property
    def description(self):
        return (
            "Pause an active mission to temporarily stop cycle execution. "
            "The mission can be resumed later with platform.mission.activate. "
            "In-progress cycles will complete but no new cycles will be scheduled."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "mission_id": {
                    "type": "string",
                    "description": "The UUID of the mission to pause",
                },
            },
            "required": ["mission_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        mission_id = params.get("mission_id", "").strip()
        if not mission_id:
            return ToolResult(success=False, error="mission_id is required")

        url = f"{context.main_app_url}/api/v1/missions/{mission_id}/pause"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url)
                resp.raise_for_status()
            return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Mission {mission_id} not found")
            body = exc.response.text[:300] if exc.response else ""
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {body}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
