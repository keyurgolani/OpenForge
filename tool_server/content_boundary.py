"""Untrusted content boundary utility.

Wraps external content in <untrusted_content> tags so the LLM treats it as
data only — not as instructions. Applied to all HTTP tool outputs.
"""


def wrap_untrusted(content: str, source: str) -> str:
    """Wrap external content in boundary tags.

    Args:
        content: The raw external content.
        source: A short label identifying the source (e.g. URL or "web search").

    Returns:
        Content wrapped in <untrusted_content> tags.
    """
    return (
        f'<untrusted_content source="{source}">\n'
        f"{content}\n"
        f"</untrusted_content>"
    )
