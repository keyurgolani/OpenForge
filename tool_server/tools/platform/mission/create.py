import httpx
from protocol import BaseTool, ToolContext, ToolResult


class CreateMissionTool(BaseTool):
    @property
    def id(self): return "platform.mission.create"

    @property
    def category(self): return "platform.mission"

    @property
    def display_name(self): return "Create Mission"

    @property
    def description(self):
        return (
            "Create a new autonomous mission. A mission is a long-running, goal-directed "
            "process that executes in OODA cycles (Perceive → Orient → Decide → Act). "
            "Missions run autonomously on a cadence, using an assigned agent to pursue "
            "a stated goal. They are created in 'draft' status — use platform.mission.activate "
            "to start execution. "
            "Requires a name, goal, and the ID of the agent that will execute the mission."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Human-readable name for the mission (e.g. 'Monitor competitor pricing')",
                },
                "goal": {
                    "type": "string",
                    "description": (
                        "The objective the mission should achieve. Be specific and measurable. "
                        "The agent will use this to guide its OODA cycles."
                    ),
                },
                "autonomous_agent_id": {
                    "type": "string",
                    "description": "UUID of the agent that will execute this mission",
                },
                "description": {
                    "type": "string",
                    "description": "Optional detailed description of the mission scope and context",
                },
                "directives": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional standing instructions the agent should follow each cycle",
                },
                "constraints": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Optional constraints (e.g. [{'type': 'time', 'value': '9am-5pm'}])",
                },
                "rubric": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": (
                        "Optional evaluation criteria scored each cycle "
                        "(e.g. [{'dimension': 'coverage', 'weight': 1.0, 'description': '...'}])"
                    ),
                },
                "cadence": {
                    "type": "object",
                    "description": (
                        "Optional schedule for cycle execution "
                        "(e.g. {'type': 'interval', 'interval_minutes': 60})"
                    ),
                },
                "budget": {
                    "type": "object",
                    "description": (
                        "Optional token/cost budget "
                        "(e.g. {'max_tokens': 1000000, 'max_cycles': 100})"
                    ),
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tags for categorization",
                },
            },
            "required": ["name", "goal", "autonomous_agent_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        name = params.get("name", "").strip()
        goal = params.get("goal", "").strip()
        agent_id = params.get("autonomous_agent_id", "").strip()

        if not name:
            return ToolResult(success=False, error="name is required")
        if not goal:
            return ToolResult(success=False, error="goal is required")
        if not agent_id:
            return ToolResult(success=False, error="autonomous_agent_id is required")

        payload = {
            "name": name,
            "goal": goal,
            "autonomous_agent_id": agent_id,
        }
        for key in ("description", "directives", "constraints", "rubric",
                     "cadence", "budget", "tags"):
            val = params.get(key)
            if val is not None:
                payload[key] = val

        url = f"{context.main_app_url}/api/v1/missions"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
            return ToolResult(success=True, output=resp.json())
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:300] if exc.response else ""
            return ToolResult(success=False, error=f"HTTP {exc.response.status_code}: {body}")
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
