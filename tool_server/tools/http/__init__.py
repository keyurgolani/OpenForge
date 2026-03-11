from tools.http.get import HttpGetTool
from tools.http.post import HttpPostTool
from tools.http.fetch_page import FetchPageTool
from tools.http.search_web import SearchWebTool

TOOLS = [
    HttpGetTool(),
    HttpPostTool(),
    FetchPageTool(),
    SearchWebTool(),
]
