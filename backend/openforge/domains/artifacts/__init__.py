"""Backward-compat shim -- use outputs domain instead."""
from openforge.domains.outputs.service import OutputService as ArtifactService  # noqa: F401
from openforge.domains.outputs.router import router  # noqa: F401
