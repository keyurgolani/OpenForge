from __future__ import annotations

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


def _empty_insights_payload() -> dict[str, list[Any]]:
    return {
        "timelines": [],
        "facts": [],
        "crucial_things": [],
        "tasks": [],
        "tags": [],
    }


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


def normalize_insights_payload(raw: Any, note_content: str) -> dict[str, list[Any]]:
    payload = _empty_insights_payload()
    raw_data = raw if isinstance(raw, dict) else {}

    tasks = _to_string_list(raw_data.get("tasks")) + _to_string_list(raw_data.get("todos"))
    facts = _to_string_list(raw_data.get("facts")) + _to_string_list(raw_data.get("highlights"))
    crucial = _to_string_list(raw_data.get("crucial_things")) + _to_string_list(raw_data.get("critical"))
    tags = _to_string_list(raw_data.get("tags"))
    tags = _dedupe_strings([tag.lower().replace(" ", "-") for tag in tags if tag.strip()])

    timeline_items: list[dict[str, str]] = []
    for raw_item in raw_data.get("timelines") or []:
        item = _normalize_timeline_item(raw_item)
        if item:
            timeline_items.append(item)
    for raw_item in raw_data.get("deadlines") or []:
        item = _normalize_timeline_item(raw_item, fallback_event="Deadline")
        if item:
            timeline_items.append(item)
    for raw_item in raw_data.get("reminders") or []:
        item = _normalize_timeline_item(raw_item, fallback_event="Reminder")
        if item:
            timeline_items.append(item)
    for task in tasks:
        item = _normalize_timeline_item(task)
        if item:
            timeline_items.append(item)
    if not timeline_items:
        timeline_items.extend(_extract_timelines_from_content(note_content))

    payload["tasks"] = _dedupe_strings(tasks)
    payload["facts"] = _dedupe_strings(facts)
    payload["crucial_things"] = _dedupe_strings(crucial)
    payload["tags"] = tags
    payload["timelines"] = _dedupe_timelines(timeline_items)
    return payload
