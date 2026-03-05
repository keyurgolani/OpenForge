from __future__ import annotations

import json
import re

from openforge.utils.title import normalize_note_title


def normalize_generated_title(raw_response: object) -> str | None:
    raw_title = str(raw_response or "").strip()
    if not raw_title:
        return None

    raw_title = re.sub(
        r"^```(?:json|markdown|md)?\s*|\s*```$",
        "",
        raw_title,
        flags=re.IGNORECASE | re.MULTILINE,
    ).strip()
    raw_title = re.sub(r'^["\']|["\']$', "", raw_title)
    raw_title = re.sub(
        r"^(generated\s+)?title\s*:\s*",
        "",
        raw_title,
        flags=re.IGNORECASE,
    ).strip()

    try:
        json_match = re.search(r"\{[\s\S]*\}", raw_title)
        if json_match:
            data = json.loads(json_match.group())
            if isinstance(data, dict):
                if "title" in data:
                    raw_title = str(data["title"])
                elif data:
                    raw_title = str(next(iter(data.values())))
    except Exception:
        pass

    first_line = next((line.strip() for line in raw_title.splitlines() if line.strip()), "")
    cleaned = first_line.strip().strip('"\'')
    return normalize_note_title(cleaned)
