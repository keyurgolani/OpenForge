"""browser category — interactive web session tools via PinchTab."""

from __future__ import annotations

import os

from tools.web.clients import PinchTabClient, PinchTabConfig
from tools.browser.open import BrowserOpenTool
from tools.browser.snapshot import BrowserSnapshotTool
from tools.browser.click import BrowserClickTool
from tools.browser.type import BrowserTypeTool
from tools.browser.fill_form import BrowserFillFormTool
from tools.browser.evaluate import BrowserEvaluateTool
from tools.browser.list_tabs import BrowserListTabsTool
from tools.browser.close_tab import BrowserCloseTabTool
from tools.browser.extract_text import BrowserExtractTextTool

_pt_client = PinchTabClient(
    PinchTabConfig(
        base_url=os.environ.get("PINCHTAB_URL", "http://pinchtab:3000"),
    )
)

TOOLS = [
    BrowserOpenTool(_pt_client),
    BrowserSnapshotTool(_pt_client),
    BrowserClickTool(_pt_client),
    BrowserTypeTool(_pt_client),
    BrowserFillFormTool(_pt_client),
    BrowserExtractTextTool(_pt_client),
    BrowserEvaluateTool(_pt_client),
    BrowserListTabsTool(_pt_client),
    BrowserCloseTabTool(_pt_client),
]
