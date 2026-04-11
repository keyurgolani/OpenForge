import httpx
from protocol import BaseTool, ToolContext, ToolResult


class GetMissionStatusTool(BaseTool):
    @property
    def id(self): return "platform.mission.status"

    @property
    def category(self): return "platform.mission"

    @property
    def display_name(self): return "Get Mission Status"

    @property
    def description(self):
        return (
            "Get the current status and details of a mission by its ID. "
            "Returns the mission's status (draft/active/paused/completed/terminated), "
            "cycle count, token usage, cost estimate, current plan, last/next cycle times, "
            "and the latest cycle details. Use this to monitor mission progress "
            "or check whether a mission is healthy."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "mission_id": {
                    "type": "string",
                    "description": "The UUID of the mission to check",
                },
                "include_cycles": {
                    "type": "boolean",
                    "description": "If true, also returns the most recent cycles (default: true)",
                    "default": True,
                },
            },
            "required": ["mission_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        mission_id = params.get("mission_id", "").strip()
        if not mission_id:
            return ToolResult(success=False, error="mission_id is required")

        include_cycles = params.get("include_cycles", True)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Fetch mission details
                url = f"{context.main_app_url}/api/v1/missions/{mission_id}"
                resp = await client.get(url)
                resp.raise_for_status()
                mission = resp.json()

                # Optionally fetch recent cycles
                if include_cycles:
                    cycles_url = f"{context.main_app_url}/api/v1/missions/{mission_id}/cycles?limit=5"
                    cycles_resp = await client.get(cycles_url)
                    if cycles_resp.status_code == 200:
                        mission["recent_cycles"] = cycles_resp.json().get("cycles", [])

            return ToolResult(success=True, output=mission)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Mission {mission_id} not found")
            body = exc.response.text[:300] if exc.response else ""
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {body}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
