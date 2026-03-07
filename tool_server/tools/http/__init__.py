"""
HTTP tools for OpenForge.

Tools for making HTTP requests and fetching web content.
Includes safety validations for URL access.
"""
from protocol import BaseTool
from .get import HttpGetTool
from .post import HttpPostTool
from .fetch_page import HttpFetchPageTool
from .search_web import HttpSearchWebTool

TOOLS: list[BaseTool] = [
    HttpGetTool(),
    HttpPostTool(),
    HttpFetchPageTool(),
    HttpSearchWebTool(),
]
