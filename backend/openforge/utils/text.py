# DEPRECATED: This module has moved to openforge.common.text
# This re-export is for backward compatibility only.
# Use openforge.common.text for new development.

import warnings

warnings.warn(
    "openforge.utils.text is deprecated. "
    "Use openforge.common.text for new development.",
    DeprecationWarning,
    stacklevel=2,
)

from openforge.common.text import (
    count_words,
    normalize_word_count,
    truncate_text,
    strip_markdown,
    highlight_query_terms,
)

__all__ = [
    'count_words',
    'normalize_word_count',
    'truncate_text',
    'strip_markdown',
    'highlight_query_terms',
]
