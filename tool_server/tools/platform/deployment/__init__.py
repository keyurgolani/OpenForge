from tools.platform.deployment.list_deployments import ListDeploymentsTool
from tools.platform.deployment.get_deployment import GetDeploymentTool
from tools.platform.deployment.deploy import DeployTool
from tools.platform.deployment.pause import PauseDeploymentTool
from tools.platform.deployment.resume import ResumeDeploymentTool
from tools.platform.deployment.teardown import TeardownDeploymentTool
from tools.platform.deployment.run_now import RunNowTool

TOOLS = [
    ListDeploymentsTool(),
    GetDeploymentTool(),
    DeployTool(),
    PauseDeploymentTool(),
    ResumeDeploymentTool(),
    TeardownDeploymentTool(),
    RunNowTool(),
]
