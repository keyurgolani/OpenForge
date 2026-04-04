"""List pending reminders."""

import json
import time

from protocol import BaseTool, ToolContext, ToolResult


_REMINDER_KEY = "openforge:reminders"


class ListRemindersTool(BaseTool):
    @property
    def id(self):
        return "scheduler.list_reminders"

    @property
    def category(self):
        return "scheduler"

    @property
    def display_name(self):
        return "List Reminders"

    @property
    def description(self):
        return "List all pending reminders that have not yet fired."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "description": "Maximum number of reminders to return.",
                },
            },
        }

    @property
    def risk_level(self):
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        limit = params.get("limit", 20)
        try:
            import redis.asyncio as aioredis
            from config import get_settings

            r = aioredis.from_url(get_settings().redis_url)
            now = time.time()
            # Get future reminders (score > now)
            raw_entries = await r.zrangebyscore(
                _REMINDER_KEY, now, "+inf", start=0, num=limit, withscores=True,
            )
            await r.aclose()

            reminders = []
            for raw, score in raw_entries:
                entry = json.loads(raw if isinstance(raw, str) else raw.decode())
                seconds_until = int(score - now)
                minutes = seconds_until // 60
                entry["fires_in"] = f"{minutes}m {seconds_until % 60}s" if minutes else f"{seconds_until}s"
                reminders.append(entry)

            return ToolResult(success=True, output={"reminders": reminders, "total": len(reminders)})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
