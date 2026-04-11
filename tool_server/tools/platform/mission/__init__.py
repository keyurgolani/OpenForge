from tools.platform.mission.create import CreateMissionTool
from tools.platform.mission.status import GetMissionStatusTool
from tools.platform.mission.list_missions import ListMissionsTool
from tools.platform.mission.activate import ActivateMissionTool
from tools.platform.mission.pause import PauseMissionTool

TOOLS = [
    CreateMissionTool(),
    GetMissionStatusTool(),
    ListMissionsTool(),
    ActivateMissionTool(),
    PauseMissionTool(),
]
