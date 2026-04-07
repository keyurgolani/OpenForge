"""search category — information discovery tools via SearXNG."""

from __future__ import annotations

from tools.search.web import SearchWebTool
from tools.search.news import SearchNewsTool
from tools.search.images import SearchImagesTool

TOOLS = [
    SearchWebTool(),
    SearchNewsTool(),
    SearchImagesTool(),
]
