import pytest

from openforge.services.knowledge_processing_service import KnowledgeProcessingService


def test_pick_bookmark_content_prefers_cloudflare_markdown() -> None:
    service = KnowledgeProcessingService()
    strategy, content = service._pick_bookmark_content(
        [
            ("cloudflare_markdown", "# Title\n\nFrom markdown-for-agents"),
            ("html_to_markdown", "# Fallback"),
            ("chrome_readable_text", "Chrome text"),
        ]
    )
    assert strategy == "cloudflare_markdown"
    assert content.startswith("# Title")


def test_pick_bookmark_content_falls_back_to_html_markdown() -> None:
    service = KnowledgeProcessingService()
    strategy, content = service._pick_bookmark_content(
        [
            ("cloudflare_markdown", ""),
            ("html_to_markdown", "## Converted\n\nBody"),
            ("chrome_readable_text", "Chrome text"),
        ]
    )
    assert strategy == "html_to_markdown"
    assert "Converted" in content


def test_pick_bookmark_content_falls_back_to_chrome_text_last() -> None:
    service = KnowledgeProcessingService()
    strategy, content = service._pick_bookmark_content(
        [
            ("cloudflare_markdown", ""),
            ("html_to_markdown", ""),
            ("chrome_readable_text", "Rendered DOM text"),
        ]
    )
    assert strategy == "chrome_readable_text"
    assert content == "Rendered DOM text"


def test_pick_bookmark_content_falls_back_to_metadata_last() -> None:
    service = KnowledgeProcessingService()
    strategy, content = service._pick_bookmark_content(
        [
            ("cloudflare_markdown", ""),
            ("html_to_markdown", ""),
            ("chrome_readable_text", ""),
            ("metadata_fallback", "# Example\n\nDescription text"),
        ]
    )
    assert strategy == "metadata_fallback"
    assert content.startswith("# Example")


def test_build_bookmark_metadata_fallback_text_uses_title_and_description() -> None:
    service = KnowledgeProcessingService()
    fallback = service._build_bookmark_metadata_fallback_text("Example Title", "Example description.")
    assert fallback == "# Example Title\n\nExample description."


def test_parse_github_repo_or_directory_for_repo_root() -> None:
    service = KnowledgeProcessingService()
    parsed = service._parse_github_repo_or_directory("https://github.com/keyurgolani/OpenForge")
    assert parsed == ("keyurgolani", "OpenForge", None, None)


def test_parse_github_repo_or_directory_for_tree_directory() -> None:
    service = KnowledgeProcessingService()
    parsed = service._parse_github_repo_or_directory(
        "https://github.com/keyurgolani/OpenForge/tree/main/backend/openforge"
    )
    assert parsed == ("keyurgolani", "OpenForge", "main", "backend/openforge")


def test_parse_github_blob_file() -> None:
    service = KnowledgeProcessingService()
    parsed = service._parse_github_blob_file(
        "https://github.com/keyurgolani/OpenForge/blob/main/README.md"
    )
    assert parsed == ("keyurgolani", "OpenForge", "main", "README.md")


@pytest.mark.asyncio
async def test_github_directory_readme_falls_back_to_repo_root_readme() -> None:
    service = KnowledgeProcessingService()
    calls: list[tuple[str | None, str | None]] = []

    async def fake_fetch(_client, _owner, _repo, *, directory_path, ref):
        calls.append((directory_path, ref))
        if directory_path == "backend/openforge":
            return ""
        if directory_path is None:
            return "# Root README\n\nProject overview."
        return ""

    service._try_fetch_github_readme = fake_fetch  # type: ignore[attr-defined]
    strategy, content = await service._extract_github_bookmark_content(
        client=None,
        url="https://github.com/keyurgolani/OpenForge/tree/main/backend/openforge",
    )

    assert strategy == "github_repository_root_readme"
    assert content.startswith("# Root README")
    assert calls[0] == ("backend/openforge", "main")
    assert calls[1] == ("backend", "main")
    assert calls[2] == (None, "main")


@pytest.mark.asyncio
async def test_github_override_returns_none_when_no_readme_found() -> None:
    service = KnowledgeProcessingService()

    async def fake_fetch(*_args, **_kwargs):
        return ""

    service._try_fetch_github_readme = fake_fetch  # type: ignore[attr-defined]
    strategy, content = await service._extract_github_bookmark_content(
        client=None,
        url="https://github.com/keyurgolani/OpenForge/tree/main/backend/openforge",
    )

    assert strategy == "none"
    assert content == ""


@pytest.mark.asyncio
async def test_github_blob_readme_returns_raw_markdown() -> None:
    service = KnowledgeProcessingService()

    async def fake_file_fetch(_client, _owner, _repo, *, file_path, ref):
        assert file_path == "README.md"
        assert ref == "main"
        return "# Project Title\n\n- Bullet one\n- Bullet two"

    service._try_fetch_github_file_text = fake_file_fetch  # type: ignore[attr-defined]
    strategy, content = await service._extract_github_bookmark_content(
        client=None,
        url="https://github.com/keyurgolani/OpenForge/blob/main/README.md",
    )

    assert strategy == "github_blob_readme_markdown"
    assert content.startswith("# Project Title")
    assert "- Bullet one" in content


@pytest.mark.asyncio
async def test_try_fetch_raw_markdown_file_for_non_github_url() -> None:
    service = KnowledgeProcessingService()

    class DummyResponse:
        def __init__(self, status_code: int, text: str):
            self.status_code = status_code
            self.text = text

    class DummyClient:
        async def get(self, _url: str, headers=None):  # noqa: ANN001
            assert headers is not None
            return DummyResponse(200, "# External README\n\nSome markdown content.")

    content = await service._try_fetch_raw_markdown_file(
        DummyClient(),
        "https://example.com/docs/README.md",
    )

    assert content.startswith("# External README")


def test_convert_html_to_markdown_preserves_basic_structure() -> None:
    service = KnowledgeProcessingService()
    html = """
    <html>
      <body>
        <h1>OpenForge Knowledge</h1>
        <p>Store links and ideas.</p>
        <ul>
          <li>First point</li>
          <li><a href="https://example.com">Reference</a></li>
        </ul>
      </body>
    </html>
    """
    markdown = service._convert_html_to_markdown(html)
    assert "# OpenForge Knowledge" in markdown
    assert "- First point" in markdown
    assert "[Reference](https://example.com)" in markdown


def test_extract_readable_text_from_html_removes_navigation() -> None:
    service = KnowledgeProcessingService()
    html = """
    <html><body>
      <header>Top nav content</header>
      <main><p>Hello <strong>world</strong></p></main>
      <script>window.alert("x")</script>
    </body></html>
    """
    text = service._extract_readable_text_from_html(html)
    assert "Hello world" in text
    assert "Top nav content" not in text
    assert "window.alert" not in text


def test_looks_like_bot_challenge_text_detects_security_pages() -> None:
    service = KnowledgeProcessingService()
    challenge = "Vercel Security Checkpoint. Please enable JavaScript and disable any ad blocker."
    assert service._looks_like_bot_challenge_text(challenge) is True
    assert service._looks_like_bot_challenge_text("Normal article markdown content.") is False


def test_extract_jina_markdown_body_strips_service_preamble() -> None:
    service = KnowledgeProcessingService()
    raw = (
        "Title: Example\n"
        "URL Source: https://example.com\n\n"
        "Markdown Content:\n"
        "# Heading\n\nBody text."
    )
    body = service._extract_jina_markdown_body(raw)
    assert body.startswith("# Heading")
    assert "Body text." in body
