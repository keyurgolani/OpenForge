from openforge.utils.knowledge_title_generation import derive_knowledge_title


def test_derive_knowledge_title_prefers_valid_model_output() -> None:
    result = derive_knowledge_title('{"title":"API Migration Plan"}', "random knowledge body")
    assert result == "API Migration Plan"


def test_derive_knowledge_title_falls_back_to_content_when_model_output_invalid() -> None:
    content = "   ## shipping checklist for sprint 14 deployment and rollback plan   "
    result = derive_knowledge_title("Untitled", content, max_words=6)
    assert result == "shipping checklist for sprint 14 deployment"


def test_derive_knowledge_title_returns_none_for_empty_content_and_invalid_model_output() -> None:
    result = derive_knowledge_title("", "   ")
    assert result is None
