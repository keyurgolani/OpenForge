# DEPRECATED: This module has moved to openforge.common.config
# This re-export is for backward compatibility only.
# Import from openforge.common.config for new development.

import warnings

warnings.warn(
    "openforge.config is deprecated. "
    "Use openforge.common.config for new development.",
    DeprecationWarning,
    stacklevel=2,
)

from openforge.common.config.settings import Settings, get_settings

__all__ = ["Settings", "get_settings"]
