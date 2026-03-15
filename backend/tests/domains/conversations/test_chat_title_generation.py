from openforge.utils.chat_title import (
    build_running_title_summary,
    derive_chat_title,
    fallback_chat_title,
    has_chat_topic_shift,
    is_low_signal_chat_turn,
    is_substantive_title_trigger_turn,
    pick_weighted_title_seed,
    pick_weighted_title_seed_from_messages,
)


def test_derive_chat_title_prefers_model_output_when_valid() -> None:
    raw = '{"title":"Q2 launch checklist"}'
    result = derive_chat_title(raw, "random first message")
    assert result == "Q2 launch checklist"


def test_derive_chat_title_falls_back_when_model_output_is_placeholder() -> None:
    raw = "Untitled"
    first_message = "Need to plan migration from Docker Compose to Kubernetes this week"
    result = derive_chat_title(raw, first_message)
    assert result == "Need to plan migration from Docker Compose"


def test_derive_chat_title_falls_back_when_model_output_is_low_signal() -> None:
    raw = "Thank you and you're great"
    first_message = "Need to plan migration from Docker Compose to Kubernetes this week"
    result = derive_chat_title(raw, first_message)
    assert result == "Need to plan migration from Docker Compose"


def test_derive_chat_title_strips_request_framing_from_generated_title() -> None:
    raw = "Tell me a long long story about dragons"
    result = derive_chat_title(raw, "random first message")
    assert result == "A long long story about dragons"


def test_fallback_chat_title_truncates_and_cleans() -> None:
    msg = "   ##   this   is    a    heavily   spaced    heading   with   extras   "
    result = fallback_chat_title(msg, max_words=5)
    assert result == "This is a heavily spaced"


def test_fallback_chat_title_strips_request_framing() -> None:
    msg = "Please tell me a long long story about wizard kingdoms and dragons"
    result = fallback_chat_title(msg, max_words=7)
    assert result == "A long long story about wizard kingdoms"


def test_fallback_chat_title_drops_trailing_filler_words_after_truncation() -> None:
    msg = "Tell me a long long story about dragons and kingdoms"
    result = fallback_chat_title(msg, max_words=7)
    assert result == "A long long story about dragons"


def test_is_low_signal_chat_turn_for_acknowledgements() -> None:
    assert is_low_signal_chat_turn("continue")
    assert is_low_signal_chat_turn("Thanks!")
    assert is_low_signal_chat_turn("Thank you and you're great")
    assert not is_low_signal_chat_turn("Need a migration plan from docker compose to k8s")


def test_pick_weighted_title_seed_prefers_latest_substantive_turn() -> None:
    latest_first = [
        "continue",
        "thanks",
        "Need a migration plan from docker compose to k8s with rollback",
        "ok",
    ]
    assert pick_weighted_title_seed(latest_first) == "Need a migration plan from docker compose to k8s with rollback"


def test_pick_weighted_title_seed_falls_back_to_latest_when_all_low_signal() -> None:
    latest_first = ["continue", "ok", "thanks"]
    assert pick_weighted_title_seed(latest_first) == "continue"


def test_pick_weighted_title_seed_from_messages_uses_latest_substantive_exchange() -> None:
    messages = [
        {"role": "user", "content": "Plan migration from docker compose to kubernetes with rollback"},
        {"role": "assistant", "content": "Let's split this into assessment, rollout, and rollback phases."},
        {"role": "user", "content": "thank you and you're great"},
        {"role": "assistant", "content": "You're welcome!"},
    ]

    seed = pick_weighted_title_seed_from_messages(messages)

    assert seed.startswith("Plan migration from docker compose to kubernetes with rollback")
    assert "Assistant context: Let's split this into assessment, rollout, and rollback phases." in seed


def test_is_substantive_title_trigger_turn_requires_enough_words() -> None:
    assert not is_substantive_title_trigger_turn("thanks")
    assert not is_substantive_title_trigger_turn("Need a rollout plan")
    assert is_substantive_title_trigger_turn(
        "Need a staged rollout plan for Kubernetes migration with rollback checkpoints and team ownership mapping"
    )


def test_build_running_title_summary_uses_weighted_seed() -> None:
    messages = [
        {"role": "user", "content": "Draft release checklist for v2 launch with QA and rollback"},
        {"role": "assistant", "content": "Let's split checklist by QA gates, deployment, and rollback readiness."},
        {"role": "user", "content": "continue"},
    ]
    summary = build_running_title_summary(messages)
    assert "Draft release checklist for v2 launch with QA and rollback" in summary
    assert "Assistant context:" in summary


def test_has_chat_topic_shift_detects_shift_and_ignores_low_signal() -> None:
    running = "Plan kubernetes migration with phased rollout and rollback."
    title = "Kubernetes Rollout Plan"

    assert has_chat_topic_shift(
        "Now let's design a pricing page conversion funnel experiment with A/B variants and analytics",
        running,
        title,
    )
    assert not has_chat_topic_shift("thanks", running, title)
    assert not has_chat_topic_shift(
        "Need rollback window details and migration sequencing for services",
        running,
        title,
    )
