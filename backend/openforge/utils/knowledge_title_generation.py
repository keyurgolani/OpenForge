# DEPRECATED: This module has moved to openforge.common.text.titles
# This re-export is for backward compatibility only.
# Use openforge.common.text for new development.

import warnings

warnings.warn(
    "openforge.utils.knowledge_title_generation is deprecated. "
    "Use openforge.common.text for new development.",
    DeprecationWarning,
    stacklevel=2,
)

from openforge.common.text.titles import (
    derive_knowledge_title,
    fallback_knowledge_title,
)

__all__ = [
    'derive_knowledge_title',
    'fallback_knowledge_title',
]
