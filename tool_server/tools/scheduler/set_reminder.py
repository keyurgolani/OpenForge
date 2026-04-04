"""Scheduler tool — set time-based reminders using Redis sorted sets."""

import json
import time

from protocol import BaseTool, ToolContext, ToolResult


# Redis key for the reminder sorted set (score = target timestamp)
_REMINDER_KEY = "openforge:reminders"


class SetReminderTool(BaseTool):
    @property
    def id(self):
        return "scheduler.set_reminder"

    @property
    def category(self):
        return "scheduler"

    @property
    def display_name(self):
        return "Set Reminder"

    @property
    def description(self):
        return (
            "Schedule a reminder for a future time. The reminder will fire as a "
            "notification event when the scheduled time arrives. Use this to set "
            "follow-ups, check-ins, or time-delayed actions."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The reminder message to deliver when the time arrives.",
                },
                "delay_seconds": {
                    "type": "integer",
                    "description": "Number of seconds from now until the reminder fires.",
                    "minimum": 10,
                    "maximum": 604800,  # 7 days
                },
                "workspace_id": {
                    "type": "string",
                    "description": "Workspace to associate the reminder with.",
                },
            },
            "required": ["message", "delay_seconds"],
        }

    @property
    def risk_level(self):
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        message = params.get("message", "").strip()
        if not message:
            return ToolResult(success=False, error="message is required")

        delay_seconds = params.get("delay_seconds", 300)
        if delay_seconds < 10:
            return ToolResult(success=False, error="delay_seconds must be at least 10")
        if delay_seconds > 604800:
            return ToolResult(success=False, error="delay_seconds cannot exceed 604800 (7 days)")

        target_timestamp = time.time() + delay_seconds
        workspace_id = params.get("workspace_id", context.workspace_id)

        reminder = json.dumps({
            "message": message,
            "workspace_id": workspace_id,
            "execution_id": context.execution_id,
            "agent_id": context.agent_id,
            "created_at": time.time(),
        })

        try:
            import redis.asyncio as aioredis
            from config import get_settings

            r = aioredis.from_url(get_settings().redis_url)
            await r.zadd(_REMINDER_KEY, {reminder: target_timestamp})
            await r.aclose()

            minutes = delay_seconds // 60
            seconds = delay_seconds % 60
            time_str = f"{minutes}m {seconds}s" if minutes else f"{seconds}s"
            return ToolResult(
                success=True,
                output=f"Reminder set: \"{message}\" — will fire in {time_str}.",
            )
        except Exception as exc:
            return ToolResult(success=False, error=f"Failed to set reminder: {exc}")
