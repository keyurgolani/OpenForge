from openforge.common.text import normalize_knowledge_title, normalize_generated_title


def test_normalize_knowledge_title_rejects_placeholder_untitled() -> None:
    assert normalize_knowledge_title("Untitled") is None
    assert normalize_knowledge_title("  untitled  ") is None


def test_normalize_knowledge_title_rejects_empty_values() -> None:
    assert normalize_knowledge_title(None) is None
    assert normalize_knowledge_title("   ") is None


def test_normalize_knowledge_title_keeps_real_titles() -> None:
    assert normalize_knowledge_title("Project Roadmap") == "Project Roadmap"


def test_generated_title_normalizer_discards_placeholder_title() -> None:
    assert normalize_generated_title('{"title":"Untitled"}') is None


def test_generated_title_normalizer_extracts_real_title() -> None:
    assert normalize_generated_title('{"title":"Q2 API Rollout"}') == "Q2 API Rollout"
