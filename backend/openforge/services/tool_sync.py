"""
Tool sync service.

Syncs tool definitions from the tool server into the local database.
Used both at startup and via the /tools/sync API endpoint.
"""
import httpx
import logging

from sqlalchemy.dialects.postgresql import insert

from openforge.config import get_settings
from openforge.db.postgres import AsyncSessionLocal
from openforge.db.models import ToolDefinition

logger = logging.getLogger(__name__)

WORKSPACE_SCOPED_CATEGORIES = {"filesystem", "git", "shell", "language"}


async def sync_tools_from_server() -> int:
    """
    Fetch tool definitions from the tool server and upsert into the database.

    Returns the number of tools synced.
    """
    settings = get_settings()

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{settings.tool_server_url}/tools/registry")
        response.raise_for_status()
        tools = response.json()

    synced = 0

    async with AsyncSessionLocal() as db:
        for tool in tools:
            try:
                requires_workspace = tool["category"] in WORKSPACE_SCOPED_CATEGORIES

                stmt = insert(ToolDefinition).values(
                    id=tool["id"],
                    category=tool["category"],
                    display_name=tool["display_name"],
                    description=tool["description"],
                    input_schema=tool["input_schema"],
                    output_schema=None,
                    risk_level=tool["risk_level"],
                    requires_workspace_scope=requires_workspace,
                    is_enabled=True,
                ).on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "category": tool["category"],
                        "display_name": tool["display_name"],
                        "description": tool["description"],
                        "input_schema": tool["input_schema"],
                        "risk_level": tool["risk_level"],
                        "requires_workspace_scope": requires_workspace,
                    },
                )

                await db.execute(stmt)
                synced += 1
            except Exception as e:
                logger.error(f"Failed to sync tool {tool.get('id', '?')}: {e}")

        await db.commit()

    return synced
