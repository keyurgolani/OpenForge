"""
Sync tool definitions from tool server to database.

This script fetches all tool definitions from the tool server's /tools/registry
endpoint and populates the tool_definitions table in the database.

Usage:
    python -m openforge.scripts.sync_tool_definitions [--tool-server-url URL]
"""
import asyncio
import argparse
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from openforge.db.database import async_session_factory
from openforge.db.models import ToolDefinition
from openforge.config import get_settings

import httpx

logger = logging.getLogger(__name__)


async def fetch_tools_from_server(tool_server_url: str) -> list[dict]:
    """Fetch tool definitions from the tool server."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(f"{tool_server_url}/tools/registry")
        response.raise_for_status()
        return response.json()


async def sync_tool_definitions(tool_server_url: str, dry_run: bool = False) -> int:
    """
    Sync tool definitions from tool server to database.

    Returns the number of tools synced.
    """
    settings = get_settings()

    # Use provided URL or default from settings
    url = tool_server_url or settings.tool_server_url

    logger.info(f"Fetching tools from {url}...")
    tools = await fetch_tools_from_server(url)
    logger.info(f"Found {len(tools)} tools on server")

    if dry_run:
        logger.info("Dry run - would sync the following tools:")
        for tool in tools:
            logger.info(f"  - {tool['id']}: {tool['display_name']} ({tool['risk_level']})")
        return len(tools)

    async with async_session_factory() as session:
        synced = 0

        for tool in tools:
            # Determine if tool requires workspace scope
            requires_workspace = tool["category"] in [
                "filesystem", "git", "shell", "language"
            ]

            # Use upsert to handle both insert and update
            stmt = insert(ToolDefinition).values(
                id=tool["id"],
                category=tool["category"],
                display_name=tool["display_name"],
                description=tool["description"],
                input_schema=tool["input_schema"],
                output_schema=None,  # Tool server doesn't provide output schema
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
                }
            )

            await session.execute(stmt)
            synced += 1
            logger.debug(f"Synced: {tool['id']}")

        await session.commit()
        logger.info(f"Successfully synced {synced} tool definitions")

    return synced


def main():
    parser = argparse.ArgumentParser(
        description="Sync tool definitions from tool server to database"
    )
    parser.add_argument(
        "--tool-server-url",
        default=None,
        help="Tool server URL (default: from settings)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be synced without making changes"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging"
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    try:
        count = asyncio.run(sync_tool_definitions(args.tool_server_url, args.dry_run))
        print(f"\nSynced {count} tool definitions")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Failed to sync tool definitions: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
