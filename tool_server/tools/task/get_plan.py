import json
from protocol import BaseTool, ToolContext, ToolResult


class GetPlanTool(BaseTool):
    @property
    def id(self): return "task.get_plan"

    @property
    def category(self): return "task"

    @property
    def display_name(self): return "Get Plan"

    @property
    def description(self):
        return "Retrieve the current task plan for this execution."

    @property
    def input_schema(self):
        return {"type": "object", "properties": {}}

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        try:
            import redis.asyncio as aioredis
            from config import get_settings

            redis = aioredis.from_url(get_settings().redis_url)
            raw = await redis.get(f"agent_plan:{context.execution_id}")
            await redis.aclose()
            if not raw:
                return ToolResult(success=True, output=None)
            return ToolResult(success=True, output=json.loads(raw))
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
