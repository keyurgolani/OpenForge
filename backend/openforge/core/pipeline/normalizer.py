"""Content normalizer for pipeline slot outputs.

Stateless, deterministic normalization of markdown text produced by
extraction backends.  No LLM calls — purely regex / string operations.

Key properties:
- Idempotent:  normalize(normalize(x)) == normalize(x)
- Deterministic: same input → same output
- Immutable: original SlotOutput is never mutated
"""

from __future__ import annotations

import re

from openforge.core.pipeline.types import SlotOutput


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def normalize_output(slot_output: SlotOutput) -> SlotOutput:
    """Return a *new* ``SlotOutput`` with normalised ``.text``.

    The original ``slot_output`` is **not** mutated.
    """
    text = slot_output.text

    # 1. Strip tool-specific page markers
    #    Patterns: "--- Page 3 ---", "——— Page 12 ———", "[Page 3]"
    text = re.sub(r"[-\u2014]{3,}\s*Page\s+\d+\s*[-\u2014]{3,}", "", text)
    text = re.sub(r"\[Page\s+\d+\]", "", text)

    # 2. Normalize heading levels (H1 must be the maximum level)
    text = _normalize_heading_levels(text)

    # 3. Normalize unordered list markers to "- "
    #    Handles: •, ●, ◦, ▪  and  * used as a bullet (start-of-line)
    text = re.sub(r"^[•●◦▪]\s+", "- ", text, flags=re.MULTILINE)
    text = re.sub(r"^\*\s+", "- ", text, flags=re.MULTILINE)

    # 4. Collapse 3+ consecutive newlines → exactly 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    # 5. Strip trailing whitespace from each line
    text = "\n".join(line.rstrip() for line in text.split("\n"))

    # 6. Normalize pipe-table formatting
    text = _normalize_tables(text)

    return SlotOutput(
        slot_type=slot_output.slot_type,
        backend_name=slot_output.backend_name,
        text=text.strip(),
        metadata=slot_output.metadata,
        vectors=slot_output.vectors,
        segments=slot_output.segments,
        success=slot_output.success,
        duration_ms=slot_output.duration_ms,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_HEADING_RE = re.compile(r"^(#{1,6})\s", re.MULTILINE)


def _normalize_heading_levels(text: str) -> str:
    """Shift all headings so the highest (smallest ``#`` count) becomes H1.

    If the text already contains an H1, no changes are made.
    If the minimum heading level is e.g. ``###`` (H3), every heading is
    shifted up by 2 so ``###`` → ``#``, ``####`` → ``##``, etc.
    """
    matches = _HEADING_RE.findall(text)
    if not matches:
        return text

    min_level = min(len(m) for m in matches)
    if min_level == 1:
        # Already has H1 — nothing to do.
        return text

    shift = min_level - 1

    def _shift(m: re.Match[str]) -> str:
        hashes = m.group(1)
        new_level = max(1, len(hashes) - shift)
        return "#" * new_level + " "

    return _HEADING_RE.sub(_shift, text)


_TABLE_ROW_RE = re.compile(r"^\|.*\|$")
_SEPARATOR_RE = re.compile(r"^[\s|:-]+$")


def _normalize_tables(text: str) -> str:
    """Normalize pipe-table formatting for consistent cell padding.

    Each cell is trimmed and padded with exactly one space on each side.
    Separator rows are rebuilt to match the column count with ``---``.
    """
    lines = text.split("\n")
    result: list[str] = []
    i = 0

    while i < len(lines):
        # Detect start of a pipe table (at least a header + separator row).
        if (
            i + 1 < len(lines)
            and _TABLE_ROW_RE.match(lines[i].strip())
            and _SEPARATOR_RE.match(lines[i + 1].strip())
        ):
            table_lines: list[str] = []
            # Collect all contiguous table rows (including separator).
            while i < len(lines) and (
                _TABLE_ROW_RE.match(lines[i].strip())
                or _SEPARATOR_RE.match(lines[i].strip())
            ):
                table_lines.append(lines[i])
                i += 1
            result.extend(_format_table(table_lines))
        else:
            result.append(lines[i])
            i += 1

    return "\n".join(result)


def _format_table(table_lines: list[str]) -> list[str]:
    """Re-format a collected pipe table with consistent spacing."""
    parsed_rows: list[list[str]] = []
    separator_indices: list[int] = []

    for idx, line in enumerate(table_lines):
        stripped = line.strip()
        if _SEPARATOR_RE.match(stripped):
            separator_indices.append(idx)
            # Placeholder — will be rebuilt.
            parsed_rows.append([])
        else:
            # Split on '|', drop leading/trailing empty strings from outer pipes.
            cells = [c.strip() for c in stripped.split("|")]
            if cells and cells[0] == "":
                cells = cells[1:]
            if cells and cells[-1] == "":
                cells = cells[:-1]
            parsed_rows.append(cells)

    # Determine column count from the widest data row.
    col_count = max((len(r) for r in parsed_rows if r), default=0)
    if col_count == 0:
        return table_lines  # degenerate — return as-is

    # Compute max width per column.
    col_widths = [3] * col_count  # minimum 3 for "---"
    for row in parsed_rows:
        if not row:
            continue
        for ci, cell in enumerate(row):
            if ci < col_count:
                col_widths[ci] = max(col_widths[ci], len(cell))

    out: list[str] = []
    for idx, row in enumerate(parsed_rows):
        if idx in separator_indices:
            # Build separator row.
            sep_cells = ["-" * col_widths[ci] for ci in range(col_count)]
            out.append("| " + " | ".join(sep_cells) + " |")
        else:
            # Pad each cell to its column width.
            padded: list[str] = []
            for ci in range(col_count):
                cell = row[ci] if ci < len(row) else ""
                padded.append(cell.ljust(col_widths[ci]))
            out.append("| " + " | ".join(padded) + " |")

    return out
