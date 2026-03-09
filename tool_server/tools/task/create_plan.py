import json
from protocol import BaseTool, ToolContext, ToolResult


class CreatePlanTool(BaseTool):
    @property
    def id(self): return "task.create_plan"

    @property
    def category(self): return "task"

    @property
    def display_name(self): return "Create Plan"

    @property
    def description(self):
        return "Create a structured task plan with steps for the current execution. Stores it in agent memory."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Plan title"},
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "description": {"type": "string"},
                        },
                    },
                    "description": "List of plan steps",
                },
            },
            "required": ["title", "steps"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        try:
            import redis.asyncio as aioredis
            from config import get_settings

            plan = {
                "title": params["title"],
                "steps": [
                    {**step, "status": "pending"}
                    for step in params["steps"]
                ],
            }
            redis = aioredis.from_url(get_settings().redis_url)
            await redis.set(
                f"agent_plan:{context.execution_id}",
                json.dumps(plan),
                ex=3600,
            )
            await redis.aclose()
            return ToolResult(success=True, output={"plan": plan})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
