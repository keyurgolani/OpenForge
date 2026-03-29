from __future__ import annotations

import copy
from datetime import datetime, timezone
import re
from typing import Any

_MONTH_NAME = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_DATE_PATTERNS = [
    re.compile(r"(?P<date>\b\d{4}-\d{2}-\d{2}\b)"),
    re.compile(r"(?P<date>\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b)"),
    re.compile(rf"(?P<date>\b{_MONTH_NAME}\s+\d{{1,2}}(?:,\s*\d{{4}})?\b)", re.IGNORECASE),
    re.compile(rf"(?P<date>\b\d{{1,2}}\s+{_MONTH_NAME}(?:\s+\d{{4}})?\b)", re.IGNORECASE),
]


# ── Default intelligence categories seeded into new workspaces ──
# Also used as fallback when workspace.intelligence_categories is NULL.
DEFAULT_INTELLIGENCE_CATEGORIES: list[dict[str, Any]] = [
    {
        "key": "summary",
        "name": "Summary",
        "description": "A concise markdown summary of the content",
        "type": "summary",
        "sort_order": 0,
    },
    {
        "key": "tasks",
        "name": "Tasks",
        "description": "Action items and todos extracted from the content",
        "type": "text",
        "sort_order": 1,
    },
    {
        "key": "facts",
        "name": "Facts",
        "description": "Key facts and highlights worth remembering",
        "type": "text",
        "sort_order": 2,
    },
    {
        "key": "crucial_things",
        "name": "Crucial Things",
        "description": "Critical or important information that must not be missed",
        "type": "text",
        "sort_order": 3,
    },
    {
        "key": "timelines",
        "name": "Timelines",
        "description": "Dates and events mentioned in the content",
        "type": "timeline",
        "sort_order": 4,
    },
]


def get_workspace_categories(
    workspace_categories: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Return the effective categories for a workspace (defaults if NULL)."""
    if workspace_categories:
        return workspace_categories
    return copy.deepcopy(DEFAULT_INTELLIGENCE_CATEGORIES)


def _empty_insights_payload(
    categories: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    cats = get_workspace_categories(categories)
    return {cat["key"]: [] for cat in cats if cat["type"] != "summary"}


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        cleaned = value.strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(cleaned)
    return output


def _to_string_list(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        return _dedupe_strings([raw])
    if isinstance(raw, list):
        out: list[str] = []
        for item in raw:
            if isinstance(item, str):
                out.append(item)
            elif item is not None:
                out.append(str(item))
        return _dedupe_strings(out)
    return []


def _coerce_date_to_iso(raw_date: str) -> str | None:
    text = raw_date.strip()
    if not text:
        return None

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text

    formats = [
        "%Y/%m/%d",
        "%m/%d/%Y",
        "%m/%d/%y",
        "%m-%d-%Y",
        "%m-%d-%y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%B %d %Y",
        "%b %d %Y",
        "%d %B %Y",
        "%d %b %Y",
        "%B %d",
        "%b %d",
        "%d %B",
        "%d %b",
    ]

    for fmt in formats:
        try:
            parsed = datetime.strptime(text, fmt)
            if parsed.year == 1900:
                parsed = parsed.replace(year=datetime.now(timezone.utc).year)
            return parsed.date().isoformat()
        except ValueError:
            continue

    return None


def _extract_date_event_from_text(text: str) -> tuple[str | None, str | None]:
    clean = (text or "").strip()
    if not clean:
        return None, None

    for pattern in _DATE_PATTERNS:
        match = pattern.search(clean)
        if not match:
            continue
        raw_date = match.group("date").strip()
        normalized_date = _coerce_date_to_iso(raw_date) or raw_date
        before = clean[:match.start()].strip(" -:|")
        after = clean[match.end():].strip(" -:|")
        event = after or before or clean
        if event.lower() == raw_date.lower():
            event = clean
        return normalized_date, event

    return None, None


def _normalize_timeline_item(raw: Any, fallback_event: str | None = None) -> dict[str, str] | None:
    if isinstance(raw, dict):
        date_raw = raw.get("date") or raw.get("deadline") or raw.get("due_date") or raw.get("when")
        event_raw = raw.get("event") or raw.get("description") or raw.get("task") or raw.get("title")
        date_text = str(date_raw).strip() if date_raw else ""
        event_text = str(event_raw).strip() if event_raw else ""

        if not date_text and event_text:
            detected_date, detected_event = _extract_date_event_from_text(event_text)
            if detected_date:
                date_text = detected_date
            if detected_event:
                event_text = detected_event
        if date_text:
            normalized_date = _coerce_date_to_iso(date_text) or date_text
            return {"date": normalized_date, "event": event_text or fallback_event or "Timeline event"}
        return None

    if isinstance(raw, str):
        date_text, event_text = _extract_date_event_from_text(raw)
        if not date_text:
            return None
        return {"date": date_text, "event": event_text or fallback_event or raw.strip()}

    return None


def _extract_timelines_from_content(content: str, max_items: int = 16) -> list[dict[str, str]]:
    lines = [line.strip() for line in (content or "").splitlines() if line.strip()]
    out: list[dict[str, str]] = []
    for line in lines:
        item = _normalize_timeline_item(line)
        if item:
            out.append(item)
        if len(out) >= max_items:
            break
    return out


def _dedupe_timelines(items: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, str]] = []
    for item in items:
        date_text = (item.get("date") or "").strip()
        event_text = (item.get("event") or "").strip()
        if not date_text:
            continue
        if not event_text:
            event_text = "Timeline event"
        key = (date_text.lower(), event_text.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append({"date": date_text, "event": event_text})
    return out


def _normalize_value_for_type(
    raw_value: Any,
    cat_type: str,
    knowledge_content: str,
) -> Any:
    """Normalize a raw LLM value according to its category type."""
    if cat_type == "summary":
        return str(raw_value).strip() if raw_value else ""
    if cat_type == "timeline":
        items: list[dict[str, str]] = []
        for raw_item in (raw_value if isinstance(raw_value, list) else []):
            item = _normalize_timeline_item(raw_item)
            if item:
                items.append(item)
        if not items:
            items.extend(_extract_timelines_from_content(knowledge_content))
        return _dedupe_timelines(items)
    if cat_type == "tag":
        tags = _to_string_list(raw_value)
        return _dedupe_strings([t.lower().replace(" ", "-") for t in tags if t.strip()])
    if cat_type == "url":
        return _dedupe_strings(_to_string_list(raw_value))
    if cat_type == "number":
        out: list[Any] = []
        for v in (raw_value if isinstance(raw_value, list) else [raw_value] if raw_value is not None else []):
            try:
                out.append(float(v) if "." in str(v) else int(v))
            except (ValueError, TypeError):
                continue
        return out
    if cat_type == "boolean":
        out_b: list[bool] = []
        for v in (raw_value if isinstance(raw_value, list) else [raw_value] if raw_value is not None else []):
            if isinstance(v, bool):
                out_b.append(v)
            elif isinstance(v, str):
                out_b.append(v.lower() in ("true", "yes", "1"))
        return out_b
    # Default: text
    return _dedupe_strings(_to_string_list(raw_value))


def normalize_insights_payload(
    raw: Any,
    knowledge_content: str,
    categories: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    cats = get_workspace_categories(categories)
    payload = _empty_insights_payload(cats)
    raw_data = raw if isinstance(raw, dict) else {}

    # Legacy key aliases for backward compatibility
    _LEGACY_ALIASES: dict[str, list[str]] = {
        "tasks": ["todos"],
        "facts": ["highlights"],
        "crucial_things": ["critical"],
        "timelines": ["deadlines", "reminders"],
    }

    # First pass: extract all non-timeline categories
    text_items_for_timeline_scan: list[str] = []
    timeline_keys: list[str] = []

    for cat in cats:
        key = cat["key"]
        cat_type = cat.get("type", "text")
        if cat_type == "summary":
            continue  # summary handled separately
        # Collect raw values from primary key + legacy aliases
        raw_value = raw_data.get(key)
        if raw_value is None:
            raw_value = []
        elif not isinstance(raw_value, list):
            raw_value = [raw_value]
        else:
            raw_value = list(raw_value)
        for alias in _LEGACY_ALIASES.get(key, []):
            alias_val = raw_data.get(alias)
            if isinstance(alias_val, list):
                raw_value.extend(alias_val)
            elif alias_val is not None:
                raw_value.append(alias_val)

        if cat_type == "timeline":
            timeline_keys.append(key)
            payload[key] = _normalize_value_for_type(raw_value, cat_type, knowledge_content)
        else:
            payload[key] = _normalize_value_for_type(raw_value, cat_type, knowledge_content)
            # Collect text items for cross-scanning timeline dates
            if cat_type == "text":
                text_items_for_timeline_scan.extend(
                    s for s in payload[key] if isinstance(s, str)
                )

    # Second pass: scan text items for timeline entries and merge into timeline categories
    for tkey in timeline_keys:
        existing_timelines = payload[tkey]
        for text_item in text_items_for_timeline_scan:
            item = _normalize_timeline_item(text_item)
            if item:
                existing_timelines.append(item)
        payload[tkey] = _dedupe_timelines(existing_timelines)

    return payload
