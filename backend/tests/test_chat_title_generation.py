from openforge.utils.chat_title import (
    derive_chat_title,
    fallback_chat_title,
    is_low_signal_chat_turn,
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


def test_fallback_chat_title_truncates_and_cleans() -> None:
    msg = "   ##   this   is    a    heavily   spaced    heading   with   extras   "
    result = fallback_chat_title(msg, max_words=5)
    assert result == "this is a heavily spaced"


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
