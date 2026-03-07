"""
Recall facts tool for OpenForge.

Recalls stored facts from the agent's working memory (Redis).
"""
from protocol import BaseTool, ToolResult, ToolContext
from config import get_settings
import redis.asyncio as aioredis
import logging
import json

logger = logging.getLogger("tool-server.memory")


class MemoryRecallFactsTool(BaseTool):
    """Recall stored facts from the agent's working memory."""

    @property
    def id(self) -> str:
        return "memory.recall_facts"

    @property
    def category(self) -> str:
        return "memory"

    @property
    def display_name(self) -> str:
        return "Recall Facts"

    @property
    def description(self) -> str:
        return """Recall stored facts from the agent's working memory.

Retrieves facts that were stored earlier in the execution using store_fact.
Can retrieve a single fact by key, or list all stored facts.

Facts are scoped to the current execution and expire after the TTL.

Use for:
- Retrieving intermediate results
- Accessing context from previous tool calls
- Reviewing stored state"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Specific key to recall (if omitted, returns all facts)"
                },
                "parse_json": {
                    "type": "boolean",
                    "default": True,
                    "description": "Attempt to parse values as JSON"
                }
            },
            "required": []
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        key = params.get("key", "").strip()
        parse_json = params.get("parse_json", True)

        settings = get_settings()

        try:
            # Connect to Redis
            redis = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True
            )

            if key:
                # Recall specific key
                redis_key = f"agent_memory:{context.execution_id}:{key}"
                value = await redis.get(redis_key)
                await redis.close()

                if value is None:
                    return ToolResult(
                        success=True,
                        output={
                            "key": key,
                            "value": None,
                            "found": False,
                            "message": f"No fact found with key: {key}"
                        }
                    )

                # Try to parse as JSON
                parsed_value = value
                if parse_json:
                    try:
                        parsed_value = json.loads(value)
                    except (json.JSONDecodeError, TypeError):
                        pass

                return ToolResult(
                    success=True,
                    output={
                        "key": key,
                        "value": parsed_value,
                        "found": True,
                    }
                )
            else:
                # List all facts for this execution
                pattern = f"agent_memory:{context.execution_id}:*"
                keys = await redis.keys(pattern)

                facts = {}
                for redis_key in keys:
                    # Extract the fact key from the Redis key
                    fact_key = redis_key.split(":", 2)[-1]
                    value = await redis.get(redis_key)

                    if value is not None:
                        # Try to parse as JSON
                        parsed_value = value
                        if parse_json:
                            try:
                                parsed_value = json.loads(value)
                            except (json.JSONDecodeError, TypeError):
                                pass
                        facts[fact_key] = parsed_value

                await redis.close()

                return ToolResult(
                    success=True,
                    output={
                        "facts": facts,
                        "count": len(facts),
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
            logger.exception("Error recalling facts")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to recall facts: {str(e)}"
            )
