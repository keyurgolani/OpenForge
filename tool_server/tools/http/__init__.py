from tools.http.get import HttpGetTool
from tools.http.post import HttpPostTool
from tools.http.fetch_page import FetchPageTool

TOOLS = [
    HttpGetTool(),
    HttpPostTool(),
    FetchPageTool(),
]
