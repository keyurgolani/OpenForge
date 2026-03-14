"""
Common Text Utilities

This package contains text processing utilities used across the application.
"""

from openforge.common.text.titles import (
    # Basic normalization
    normalize_knowledge_title,
    normalize_generated_title,
    # Chat titles
    derive_chat_title,
    fallback_chat_title,
    pick_weighted_title_seed,
    pick_weighted_title_seed_from_messages,
    is_low_signal_chat_turn,
    is_substantive_title_trigger_turn,
    build_running_title_summary,
    has_chat_topic_shift,
    # Knowledge titles
    derive_knowledge_title,
    fallback_knowledge_title,
)

from openforge.common.text.processing import (
    count_words,
    normalize_word_count,
    truncate_text,
    strip_markdown,
    highlight_query_terms,
)

__all__ = [
    # Title utilities
    "normalize_knowledge_title",
    "normalize_generated_title",
    "derive_chat_title",
    "fallback_chat_title",
    "pick_weighted_title_seed",
    "pick_weighted_title_seed_from_messages",
    "is_low_signal_chat_turn",
    "is_substantive_title_trigger_turn",
    "build_running_title_summary",
    "has_chat_topic_shift",
    "derive_knowledge_title",
    "fallback_knowledge_title",
    # Text processing
    "count_words",
    "normalize_word_count",
    "truncate_text",
    "strip_markdown",
    "highlight_query_terms",
]
