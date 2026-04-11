import httpx
from protocol import BaseTool, ToolContext, ToolResult


class ActivateMissionTool(BaseTool):
    @property
    def id(self): return "platform.mission.activate"

    @property
    def category(self): return "platform.mission"

    @property
    def display_name(self): return "Activate Mission"

    @property
    def description(self):
        return (
            "Activate a draft mission to begin autonomous OODA cycle execution. "
            "This transitions the mission from 'draft' to 'active' status, "
            "creates a dedicated workspace for the mission, and schedules the first cycle. "
            "The mission must be in 'draft' status to activate."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "mission_id": {
                    "type": "string",
                    "description": "The UUID of the mission to activate",
                },
            },
            "required": ["mission_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        mission_id = params.get("mission_id", "").strip()
        if not mission_id:
            return ToolResult(success=False, error="mission_id is required")

        url = f"{context.main_app_url}/api/v1/missions/{mission_id}/activate"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
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
