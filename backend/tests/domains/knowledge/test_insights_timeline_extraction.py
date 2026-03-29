from openforge.utils.insights import normalize_insights_payload


def test_normalize_insights_extracts_timelines_from_legacy_fields() -> None:
    raw = {
        "todos": ["Finalize budget by 2026-04-15"],
        "deadlines": ["2026-05-01: Submit Q2 plan"],
        "highlights": ["Revenue increased in Q1"],
        "tags": ["Project Alpha", "Q2 review"],
    }

    normalized = normalize_insights_payload(raw, knowledge_content="")

    assert normalized["tasks"] == ["Finalize budget by 2026-04-15"]
    assert normalized["facts"] == ["Revenue increased in Q1"]
    # Tags are extracted as a system feature, not part of insights payload
    # unless a tag-type category is configured
    assert "tags" not in normalized

    timelines = normalized["timelines"]
    assert len(timelines) >= 2
    assert any(t["date"] == "2026-04-15" for t in timelines)
    assert any(t["date"] == "2026-05-01" and "Submit Q2 plan" in t["event"] for t in timelines)


def test_normalize_insights_with_tag_category() -> None:
    """When a tag-type category is configured, tags appear in the payload."""
    from openforge.utils.insights import DEFAULT_INTELLIGENCE_CATEGORIES
    import copy

    cats = copy.deepcopy(DEFAULT_INTELLIGENCE_CATEGORIES)
    cats.append({"key": "tags", "name": "Tags", "description": "Tags", "type": "tag", "sort_order": 5})

    raw = {"tags": ["Project Alpha", "Q2 review"]}
    normalized = normalize_insights_payload(raw, knowledge_content="", categories=cats)
    assert normalized["tags"] == ["project-alpha", "q2-review"]


def test_normalize_insights_extracts_timelines_from_knowledge_content() -> None:
    content = """
Kickoff on March 10, 2026 with product and design.
Leadership review 04/12/2026: confirm launch checklist.
"""

    normalized = normalize_insights_payload({}, knowledge_content=content)
    timelines = normalized["timelines"]

    assert len(timelines) == 2
    assert timelines[0]["date"] == "2026-03-10"
    assert timelines[1]["date"] == "2026-04-12"
    assert "launch checklist" in timelines[1]["event"]
