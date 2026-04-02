from tools.http.get import HttpGetTool
from tools.http.post import HttpPostTool
from tools.http.fetch_page import FetchPageTool
from tools.http.fetch_multiple import FetchMultipleTool
from tools.http.search_web import SearchWebTool
from tools.http.search_news import SearchNewsTool

TOOLS = [
    HttpGetTool(),
    HttpPostTool(),
    FetchPageTool(),
    FetchMultipleTool(),
    SearchWebTool(),
    SearchNewsTool(),
]
