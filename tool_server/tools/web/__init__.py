"""web category — content reading & extraction tools."""

from __future__ import annotations

import os

from tools.web.clients import (
    Crawl4AIClient,
    Crawl4AIConfig,
    PinchTabClient,
    PinchTabConfig,
)
from tools.web.read_page import ReadPageTool
from tools.web.read_pages import ReadPagesTool
from tools.web.screenshot import WebScreenshotTool

_c4_client = Crawl4AIClient(
    Crawl4AIConfig(
        base_url=os.environ.get("CRAWL4AI_URL", "http://crawl4ai:11235"),
    )
)

_pt_client = PinchTabClient(
    PinchTabConfig(
        base_url=os.environ.get("PINCHTAB_URL", "http://pinchtab:3000"),
    )
)

TOOLS = [
    ReadPageTool(_c4_client),
    ReadPagesTool(_c4_client),
    WebScreenshotTool(_pt_client),
]
