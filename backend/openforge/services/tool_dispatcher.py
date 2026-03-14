# DEPRECATED: This module has moved to openforge.integrations.tools.dispatcher
# This re-export is for backward compatibility only.
# Use openforge.integrations.tools for new development.

import warnings

warnings.warn(
    "openforge.services.tool_dispatcher is deprecated. "
    "Use openforge.integrations.tools for new development.",
    DeprecationWarning,
    stacklevel=2,
)

from openforge.integrations.tools.dispatcher import tool_dispatcher, ToolDispatcher

__all__ = ['tool_dispatcher', 'ToolDispatcher']
