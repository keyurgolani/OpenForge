from __future__ import annotations

import re
from collections.abc import Mapping

from openforge.utils.title_generation import normalize_generated_title

_LOW_SIGNAL_CHAT_TURN_PATTERNS = (
    re.compile(r"^(ok|okay|thanks|thank you|cool|nice|great|awesome|yep|yeah|yes|no|nah|hmm|huh)[.!]*$", re.IGNORECASE),
    re.compile(r"^(continue|go on|keep going|next|more|retry|again|same|proceed|do it)[.!]*$", re.IGNORECASE),
    re.compile(r"^(what about|anything else|and now)[?!.]*$", re.IGNORECASE),
)

_LOW_SIGNAL_CHAT_TOKENS = {
    "ok",
    "okay",
    "thanks",
    "thank",
    "you",
    "you're",
    "youre",
    "are",
    "cool",
    "nice",
    "great",
    "awesome",
    "amazing",
    "perfect",
    "good",
    "job",
    "well",
    "done",
    "appreciate",
    "it",
    "yep",
    "yeah",
    "yes",
    "no",
    "nah",
    "hmm",
    "huh",
    "continue",
    "go",
    "on",
    "keep",
    "going",
    "next",
    "more",
    "retry",
    "again",
    "same",
    "proceed",
    "do",
    "what",
    "about",
    "anything",
    "else",
    "and",
    "now",
    "so",
    "very",
    "really",
    "much",
    "a",
    "lot",
    "please",
    "thx",
    "ty",
    "mate",
    "buddy",
    "team",
    "agent",
    "assistant",
}

_REQUEST_PREFIX_PATTERNS = (
    re.compile(r"^(?:please\s+)?tell\s+me\s+", re.IGNORECASE),
    re.compile(r"^(?:please\s+)?(?:can|could|would|will)\s+you\s+", re.IGNORECASE),
    re.compile(
        r"^(?:please\s+)?(?:write|generate|create|draft|make|give|show|explain|summarize|outline|describe|compose)\s+(?:me\s+)?",
        re.IGNORECASE,
    ),
    re.compile(r"^(?:i\s+(?:need|want)\s+(?:you\s+to\s+)?)", re.IGNORECASE),
)


def _normalize_text(text: str | None) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip())


def _tokenize_text(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def _strip_request_framing(text: str | None) -> str:
    candidate = _normalize_text(text)
    if not candidate:
        return ""

    for _ in range(3):
        changed = False
        for pattern in _REQUEST_PREFIX_PATTERNS:
            updated = pattern.sub("", candidate, count=1).strip(" .:-")
            if updated and updated != candidate:
                candidate = updated
                changed = True
                break
        if not changed:
            break

    if candidate and candidate[0].islower():
        candidate = candidate[0].upper() + candidate[1:]
    return candidate


def _nearest_substantive_assistant_turn(
    messages: list[tuple[str, str]],
    user_index: int,
) -> str:
    forward_candidates = messages[user_index + 1:user_index + 5]
    for role, content in forward_candidates:
        if role == "assistant" and not is_low_signal_chat_turn(content):
            return content

    backward_candidates = list(reversed(messages[max(0, user_index - 4):user_index]))
    for role, content in backward_candidates:
        if role == "assistant" and not is_low_signal_chat_turn(content):
            return content

    for role, content in forward_candidates:
        if role == "assistant":
            return content
    for role, content in backward_candidates:
        if role == "assistant":
            return content
    return ""


def is_low_signal_chat_turn(text: str | None) -> bool:
    """
    Detect low-information turns (acknowledgements / continuation nudges)
    that should not dominate conversation titles.
    """
    normalized = _normalize_text(text)
    if not normalized:
        return True
    if any(pattern.match(normalized) for pattern in _LOW_SIGNAL_CHAT_TURN_PATTERNS):
        return True

    # Catch short praise-only variants like "thank you and you're great".
    if len(normalized) <= 180:
        tokens = _tokenize_text(normalized)
        if tokens and all(token in _LOW_SIGNAL_CHAT_TOKENS for token in tokens):
            return True
    return False


def pick_weighted_title_seed(latest_user_turns: list[str]) -> str:
    """
    latest_user_turns must be ordered newest -> oldest.
    Returns newest substantive turn, falling back through history.
    """
    cleaned_turns = [re.sub(r"\s+", " ", str(t or "").strip()) for t in latest_user_turns if str(t or "").strip()]
    if not cleaned_turns:
        return ""

    for turn in cleaned_turns:
        if not is_low_signal_chat_turn(turn):
            return turn
    return cleaned_turns[0]


def pick_weighted_title_seed_from_messages(
    messages: list[Mapping[str, object]],
    *,
    max_recent_user_context: int = 3,
) -> str:
    """
    Build a weighted seed from recent conversation context.
    Prioritizes newest substantive user turn, includes nearby assistant response,
    and appends older substantive user context for continuity.
    """
    cleaned: list[tuple[str, str]] = []
    for raw in messages:
        role = str(raw.get("role") or "").strip().lower()
        if role not in {"user", "assistant"}:
            continue
        text = _normalize_text(str(raw.get("content") or ""))
        if not text:
            continue
        cleaned.append((role, text))
    if not cleaned:
        return ""

    substantive_user_indices = [
        idx
        for idx, (role, text) in enumerate(cleaned)
        if role == "user" and not is_low_signal_chat_turn(text)
    ]
    if substantive_user_indices:
        selected_indices = substantive_user_indices[-max(1, max_recent_user_context):]
        newest_idx = selected_indices[-1]
        primary_turn = cleaned[newest_idx][1]
        assistant_context = _nearest_substantive_assistant_turn(cleaned, newest_idx)

        parts = [primary_turn]
        if assistant_context:
            parts.append(f"Assistant context: {assistant_context}")

        for idx in reversed(selected_indices[:-1]):
            parts.append(f"Prior user context: {cleaned[idx][1]}")
        return "\n".join(parts)

    latest_user_turns = [text for role, text in reversed(cleaned) if role == "user"]
    if latest_user_turns:
        return pick_weighted_title_seed(latest_user_turns)

    for role, text in reversed(cleaned):
        if role == "assistant":
            return text
    return cleaned[-1][1]


def fallback_chat_title(first_message: str, max_words: int = 7, max_length: int = 120) -> str | None:
    text = str(first_message or "").strip()
    if not text:
        return None

    text = re.sub(r"^#{1,6}\s*", "", text)
    text = re.sub(r"`{1,3}", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = _strip_request_framing(text)

    words = text.split(" ")
    truncated = " ".join(words[:max_words]).strip()
    return truncated[:max_length] if truncated else None


def derive_chat_title(raw_response: object, first_message: str) -> str | None:
    generated = normalize_generated_title(raw_response)
    generated = _strip_request_framing(generated)
    if generated and not is_low_signal_chat_turn(generated):
        return generated[:120]
    return fallback_chat_title(first_message)


def is_substantive_title_trigger_turn(text: str | None, min_words: int = 15) -> bool:
    normalized = _normalize_text(text)
    if not normalized:
        return False
    if is_low_signal_chat_turn(normalized):
        return False
    words = re.findall(r"\b[\w']+\b", normalized)
    return len(words) >= min_words


def build_running_title_summary(
    messages: list[Mapping[str, object]],
    *,
    max_recent_user_context: int = 4,
    max_chars: int = 1400,
) -> str:
    """
    Build a compact running summary from recent substantive exchanges.
    This avoids feeding full history into title generation.
    """
    seed = pick_weighted_title_seed_from_messages(
        messages,
        max_recent_user_context=max_recent_user_context,
    ).strip()
    if not seed:
        return ""
    return seed[:max_chars]


def has_chat_topic_shift(
    latest_user_turn: str | None,
    running_summary: str | None,
    current_title: str | None = None,
) -> bool:
    """
    Lightweight client-side topic drift detector.
    Returns True when newest substantive user turn has low lexical overlap
    with existing conversation context/title.
    """
    latest = _normalize_text(latest_user_turn)
    if not latest or is_low_signal_chat_turn(latest):
        return False

    latest_tokens = {
        token
        for token in _tokenize_text(latest)
        if token not in _LOW_SIGNAL_CHAT_TOKENS and len(token) > 2
    }
    if len(latest_tokens) < 4:
        return False

    baseline = _normalize_text(f"{running_summary or ''} {current_title or ''}")
    baseline_tokens = {
        token
        for token in _tokenize_text(baseline)
        if token not in _LOW_SIGNAL_CHAT_TOKENS and len(token) > 2
    }
    if not baseline_tokens:
        return True

    overlap = len(latest_tokens & baseline_tokens) / len(latest_tokens)
    return overlap < 0.24
