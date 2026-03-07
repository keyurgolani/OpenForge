from openforge.services.attachment_pipeline import (
    extract_http_urls,
    resolve_attachment_pipeline,
)


def test_resolve_attachment_pipeline_prefers_text_content_types() -> None:
    assert resolve_attachment_pipeline(content_type="text/plain", filename="knowledge.bin") == "text"
    assert resolve_attachment_pipeline(content_type="text/markdown", filename="knowledge.any") == "text"


def test_resolve_attachment_pipeline_accepts_text_extensions_without_content_type() -> None:
    assert resolve_attachment_pipeline(content_type=None, filename="guide.txt") == "text"
    assert resolve_attachment_pipeline(content_type="", filename="README.md") == "text"
    assert resolve_attachment_pipeline(content_type="application/octet-stream", filename="data.csv") == "text"


def test_resolve_attachment_pipeline_marks_future_types_as_deferred() -> None:
    assert resolve_attachment_pipeline(content_type="application/pdf", filename="doc.pdf") == "deferred"
    assert resolve_attachment_pipeline(content_type="image/png", filename="image.png") == "deferred"


def test_extract_http_urls_dedupes_and_strips_trailing_punctuation() -> None:
    text = (
        "Read https://example.com/docs, then inspect "
        "https://example.com/docs and https://openforge.dev/guide)."
    )

    assert extract_http_urls(text) == [
        "https://example.com/docs",
        "https://openforge.dev/guide",
    ]
