"""Tool output truncation and summarization policy."""

from __future__ import annotations

from .summarization import clip_text, estimate_token_count, serialize_output, summarize_structured_output
from .types import SummaryType, ToolOutputHandlingMode, ToolOutputProcessingResult


class ToolOutputHandler:
    def __init__(self, *, max_inline_chars: int = 4000, max_preview_chars: int = 600) -> None:
        self.max_inline_chars = max_inline_chars
        self.max_preview_chars = max_preview_chars

    def process(self, *, tool_name: str, output: object) -> ToolOutputProcessingResult:
        raw_text = serialize_output(output)
        raw_token_estimate = estimate_token_count(raw_text)
        preview = clip_text(raw_text, self.max_preview_chars)

        if len(raw_text) <= self.max_inline_chars:
            return ToolOutputProcessingResult(
                summary_type=None,
                handling_mode=ToolOutputHandlingMode.INLINE,
                preview=preview,
                summary=raw_text,
                raw_output_reference=None,
                raw_char_count=len(raw_text),
                raw_token_estimate=raw_token_estimate,
                was_truncated=False,
            )

        summary = summarize_structured_output(tool_name, output)
        return ToolOutputProcessingResult(
            summary_type=SummaryType.TOOL_OUTPUT,
            handling_mode=ToolOutputHandlingMode.SUMMARIZED,
            preview=preview,
            summary=summary,
            raw_output_reference=None,
            raw_char_count=len(raw_text),
            raw_token_estimate=raw_token_estimate,
            was_truncated=True,
        )
