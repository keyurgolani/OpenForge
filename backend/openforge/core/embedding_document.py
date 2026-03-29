from __future__ import annotations

from typing import Any


def _format_timeline_entry(item: Any) -> str:
    if isinstance(item, dict):
        date = str(item.get("date", "")).strip()
        event = str(item.get("event", "")).strip()
        if date and event:
            return f"{date}: {event}"
        return date or event
    return str(item).strip()


def _format_insight_items(items: Any, *, is_timeline: bool = False) -> list[str]:
    if not isinstance(items, list):
        return []
    out: list[str] = []
    for item in items:
        text = _format_timeline_entry(item) if is_timeline else str(item).strip()
        if text:
            out.append(text)
    return out


def build_knowledge_embedding_document(
    *,
    content: str,
    ai_summary: str | None = None,
    insights: dict[str, Any] | None = None,
    categories: list[dict[str, Any]] | None = None,
) -> str:
    """
    Build an embedding corpus containing:
    1) original knowledge content
    2) AI summary
    3) structured intelligence sections (dynamic per workspace categories)
    """
    sections: list[str] = []

    body = (content or "").strip()
    if body:
        sections.append(body)

    summary = (ai_summary or "").strip()
    if summary:
        sections.append(f"## AI Summary\n{summary}")

    insight_sections: list[str] = []
    if isinstance(insights, dict):
        if categories:
            for cat in sorted(categories, key=lambda c: c.get("sort_order", 0)):
                key = cat["key"]
                label = cat.get("name", key.replace("_", " ").title())
                cat_type = cat.get("type", "text")
                if cat_type == "summary":
                    # Summary already handled above; also check insights payload
                    val = insights.get(key)
                    if isinstance(val, str) and val.strip() and not summary:
                        sections.append(f"## AI Summary\n{val.strip()}")
                    continue
                is_timeline = cat_type == "timeline"
                lines = _format_insight_items(insights.get(key), is_timeline=is_timeline)
                if lines:
                    rendered = "\n".join(f"- {line}" for line in lines)
                    insight_sections.append(f"### {label}\n{rendered}")
        else:
            # Fallback for legacy data without categories
            mapping: list[tuple[str, str, bool]] = [
                ("tasks", "Tasks", False),
                ("facts", "Facts", False),
                ("crucial_things", "Crucial Things", False),
                ("timelines", "Timelines", True),
                ("tags", "Tags", False),
            ]
            for key, label, is_timeline in mapping:
                lines = _format_insight_items(insights.get(key), is_timeline=is_timeline)
                if not lines:
                    continue
                rendered = "\n".join(f"- {line}" for line in lines)
                insight_sections.append(f"### {label}\n{rendered}")

    if insight_sections:
        sections.append("## AI Intelligence\n" + "\n\n".join(insight_sections))

    return "\n\n".join(sections).strip()
