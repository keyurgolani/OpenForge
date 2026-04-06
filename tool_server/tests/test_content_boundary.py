"""Tests for the content boundary utility."""

from content_boundary import wrap_untrusted


def test_wraps_content_with_tags():
    result = wrap_untrusted("Hello world", "https://example.com")
    assert '<untrusted_content source="https://example.com">' in result
    assert "Hello world" in result
    assert "</untrusted_content>" in result


def test_preserves_content_exactly():
    content = "Line 1\nLine 2\n<script>alert('xss')</script>"
    result = wrap_untrusted(content, "web search")
    assert content in result


def test_source_label_in_tag():
    result = wrap_untrusted("data", "my-source")
    assert 'source="my-source"' in result


def test_empty_content():
    result = wrap_untrusted("", "empty")
    assert '<untrusted_content source="empty">' in result
    assert "</untrusted_content>" in result
