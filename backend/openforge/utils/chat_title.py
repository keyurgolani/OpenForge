# DEPRECATED: This module has moved to openforge.common.text.titles
# This re-export is for backward compatibility only.
# Use openforge.common.text for new development.

import warnings

warnings.warn(
    "openforge.utils.chat_title is deprecated. "
    "Use openforge.common.text for new development.",
    DeprecationWarning,
    stacklevel=2,
)

from openforge.common.text.titles import (
    derive_chat_title,
    fallback_chat_title,
    pick_weighted_title_seed,
    pick_weighted_title_seed_from_messages,
    is_low_signal_chat_turn,
    is_substantive_title_trigger_turn,
    build_running_title_summary,
    has_chat_topic_shift,
)

__all__ = [
    'derive_chat_title',
    'fallback_chat_title',
    'pick_weighted_title_seed',
    'pick_weighted_title_seed_from_messages',
    'is_low_signal_chat_turn',
    'is_substantive_title_trigger_turn',
    'build_running_title_summary',
    'has_chat_topic_shift',
]
