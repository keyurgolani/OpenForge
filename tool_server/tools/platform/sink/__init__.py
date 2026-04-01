from tools.platform.sink.list_sinks import ListSinksTool
from tools.platform.sink.get_sink import GetSinkTool
from tools.platform.sink.create_sink import CreateSinkTool
from tools.platform.sink.update_sink import UpdateSinkTool
from tools.platform.sink.delete_sink import DeleteSinkTool

TOOLS = [
    ListSinksTool(),
    GetSinkTool(),
    CreateSinkTool(),
    UpdateSinkTool(),
    DeleteSinkTool(),
]
