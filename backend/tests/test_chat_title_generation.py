from openforge.utils.chat_title import derive_chat_title, fallback_chat_title


def test_derive_chat_title_prefers_model_output_when_valid() -> None:
    raw = '{"title":"Q2 launch checklist"}'
    result = derive_chat_title(raw, "random first message")
    assert result == "Q2 launch checklist"


def test_derive_chat_title_falls_back_when_model_output_is_placeholder() -> None:
    raw = "Untitled"
    first_message = "Need to plan migration from Docker Compose to Kubernetes this week"
    result = derive_chat_title(raw, first_message)
    assert result == "Need to plan migration from Docker Compose"


def test_fallback_chat_title_truncates_and_cleans() -> None:
    msg = "   ##   this   is    a    heavily   spaced    heading   with   extras   "
    result = fallback_chat_title(msg, max_words=5)
    assert result == "this is a heavily spaced"
