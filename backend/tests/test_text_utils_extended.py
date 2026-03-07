from openforge.utils.text import (
    count_words,
    normalize_word_count,
    truncate_text,
    strip_markdown,
    highlight_query_terms,
)


def test_count_words_handles_gist_code_and_markdown_code_blocks():
    gist = "def hello_world(x):\n    return x + 42"
    assert count_words(gist, knowledge_type="gist") >= 6

    markdown = """
Plain prose words here.

```python
result = requests.get(url).text
```

Inline `foo_bar123()` token.
"""
    total = count_words(markdown, knowledge_type="note")
    assert total >= 10


def test_normalize_word_count_and_truncate_text_boundaries():
    normalized, changed = normalize_word_count(2, "alpha beta gamma", knowledge_type="note")
    assert normalized == 3
    assert changed is True

    unchanged, changed2 = normalize_word_count(3, "alpha beta gamma", knowledge_type="note")
    assert unchanged == 3
    assert changed2 is False

    assert truncate_text("short", 20) == "short"
    assert truncate_text("word boundary should be preserved", 15).endswith("...")


def test_strip_markdown_and_highlight_query_terms():
    md = """
# Heading

Some **bold** text and _italic_ text with [a link](https://example.com).

> quoted line

```js
console.log('hidden code');
```
"""
    plain = strip_markdown(md)

    assert "Heading" in plain
    assert "bold" in plain
    assert "italic" in plain
    assert "a link" in plain
    assert "hidden code" not in plain

    highlighted = highlight_query_terms("Knowledge retrieval and ranking", "knowledge rank")
    assert "<mark>Knowledge</mark>" in highlighted
    assert "<mark>rank" in highlighted.lower()

    # No-op behavior for empty query/text
    assert highlight_query_terms("text", "") == "text"
    assert highlight_query_terms("", "query") == ""
