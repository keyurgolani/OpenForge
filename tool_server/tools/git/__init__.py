from tools.git.status import GitStatusTool
from tools.git.log import GitLogTool
from tools.git.diff import GitDiffTool
from tools.git.add import GitAddTool
from tools.git.commit import GitCommitTool
from tools.git.init import GitInitTool

TOOLS = [
    GitStatusTool(),
    GitLogTool(),
    GitDiffTool(),
    GitAddTool(),
    GitCommitTool(),
    GitInitTool(),
]
