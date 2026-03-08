"""
Store fact tool for OpenForge.

Stores a key-value fact in the agent's working memory (Redis).
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings
import redis.asyncio as aioredis
import logging
import json

logger = logging.getLogger("tool-server.memory")


class MemoryStoreFactTool(BaseTool):
    """Store a key-value fact in the agent's working memory."""

    @property
    def id(self) -> str:
        return "memory.store_fact"

    @property
    def category(self) -> str:
        return "memory"

    @property
    def display_name(self) -> str:
        return "Store Fact"

    @property
    def description(self) -> str:
        return """Store a key-value fact in the agent's working memory.

Stores information that the agent needs to remember during execution.
Facts are scoped to the current execution and expire after the execution completes.

This is ephemeral memory - for persistent storage, use create_knowledge instead.

Use for:
- Remembering intermediate results
- Storing context across tool calls
- Tracking state during multi-step operations"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "The key to store the fact under"
                },
                "value": {
                    "type": ["string", "number", "boolean", "object", "array"],
                    "description": "The value to store (can be any JSON-serializable type)"
                },
                "ttl_seconds": {
                    "type": "integer",
                    "default": 3600,
                    "description": "Time-to-live in seconds (default: 1 hour, max: 86400)"
                }
            },
            "required": ["key", "value"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        key = params.get("key", "").strip()
        if not key:
            return ToolResult(
                success=False,
                output=None,
                error="Key is required"
            )

        value = params.get("value")
        ttl_seconds = min(params.get("ttl_seconds", 3600), 86400)  # Max 24 hours

        settings = get_settings()

        try:
            # Connect to Redis
            redis = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True
            )

            # Build the Redis key scoped to the execution
            redis_key = f"agent_memory:{context.execution_id}:{key}"

            # Serialize value
            if isinstance(value, (dict, list)):
                value_str = json.dumps(value)
            else:
                value_str = str(value)

            # Store with TTL
            await redis.setex(redis_key, ttl_seconds, value_str)
            await redis.close()

            return ToolResult(
                success=True,
                output={
                    "key": key,
                    "stored": True,
                    "ttl_seconds": ttl_seconds,
                    "execution_id": context.execution_id,
                }
            )

        except aioredis.RedisError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Redis error: {str(e)}"
            )
        except Exception as e:
            logger.exception(f"Error storing fact: {key}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to store fact: {str(e)}"
            )
