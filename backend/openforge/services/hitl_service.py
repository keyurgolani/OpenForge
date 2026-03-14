# DEPRECATED: This module has moved to openforge.runtime.hitl
# This re-export is for backward compatibility only.
# Use openforge.runtime.hitl for new development.

import warnings

warnings.warn(
    "openforge.services.hitl_service is deprecated. "
    "Use openforge.runtime.hitl for new development.",
    DeprecationWarning,
    stacklevel=2,
)

from openforge.runtime.hitl import hitl_service, HITLService

__all__ = ['hitl_service', 'HITLService']
