"""
Infrastructure package root.

This package centralizes infrastructure concerns:
- Database (db)
- Queue/Celery (queue)
- Search/Retrieval (search)
- MCP/Model server integration (mcp)

External integrations should be placed in the package or subpackages:
- integrations/llm/
- integrations/tools/
- integrations/workspace/
- integrations/files/
"""
from openforge.infrastructure.db import get_db, init_db
from openforge.infrastructure.queue import get_celery_app
from openforge.infrastructure.search import SearchEngine
from openforge.infrastructure.mcp import get_mcp_client  # Placeholder for future modules
# from openforge.infrastructure.integrations import ...

__all__ = [
    "get_db",
    "init_db",
    "get_celery_app",
    "SearchEngine",
    "get_mcp_client",
]
