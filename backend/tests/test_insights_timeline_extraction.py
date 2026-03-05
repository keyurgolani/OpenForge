from openforge.utils.insights import normalize_insights_payload


def test_normalize_insights_extracts_timelines_from_legacy_fields() -> None:
    raw = {
        "todos": ["Finalize budget by 2026-04-15"],
        "deadlines": ["2026-05-01: Submit Q2 plan"],
        "highlights": ["Revenue increased in Q1"],
        "tags": ["Project Alpha", "Q2 review"],
    }

    normalized = normalize_insights_payload(raw, note_content="")

    assert normalized["tasks"] == ["Finalize budget by 2026-04-15"]
    assert normalized["facts"] == ["Revenue increased in Q1"]
    assert normalized["tags"] == ["project-alpha", "q2-review"]

    timelines = normalized["timelines"]
    assert len(timelines) >= 2
    assert any(t["date"] == "2026-04-15" for t in timelines)
    assert any(t["date"] == "2026-05-01" and "Submit Q2 plan" in t["event"] for t in timelines)


def test_normalize_insights_extracts_timelines_from_note_content() -> None:
    content = """
Kickoff on March 10, 2026 with product and design.
Leadership review 04/12/2026: confirm launch checklist.
"""

    normalized = normalize_insights_payload({}, note_content=content)
    timelines = normalized["timelines"]

    assert len(timelines) == 2
    assert timelines[0]["date"] == "2026-03-10"
    assert timelines[1]["date"] == "2026-04-12"
    assert "launch checklist" in timelines[1]["event"]
