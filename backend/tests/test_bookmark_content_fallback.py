import pytest

from openforge.services.note_service import NoteService


def test_pick_bookmark_content_prefers_cloudflare_markdown() -> None:
    service = NoteService()
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
    service = NoteService()
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
    service = NoteService()
    strategy, content = service._pick_bookmark_content(
        [
            ("cloudflare_markdown", ""),
            ("html_to_markdown", ""),
            ("chrome_readable_text", "Rendered DOM text"),
        ]
    )
    assert strategy == "chrome_readable_text"
    assert content == "Rendered DOM text"


def test_parse_github_repo_or_directory_for_repo_root() -> None:
    service = NoteService()
    parsed = service._parse_github_repo_or_directory("https://github.com/keyurgolani/OpenForge")
    assert parsed == ("keyurgolani", "OpenForge", None, None)


def test_parse_github_repo_or_directory_for_tree_directory() -> None:
    service = NoteService()
    parsed = service._parse_github_repo_or_directory(
        "https://github.com/keyurgolani/OpenForge/tree/main/backend/openforge"
    )
    assert parsed == ("keyurgolani", "OpenForge", "main", "backend/openforge")


@pytest.mark.asyncio
async def test_github_directory_readme_falls_back_to_repo_root_readme() -> None:
    service = NoteService()
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
    assert calls[1] == (None, "main")


@pytest.mark.asyncio
async def test_github_override_returns_none_when_no_readme_found() -> None:
    service = NoteService()

    async def fake_fetch(*_args, **_kwargs):
        return ""

    service._try_fetch_github_readme = fake_fetch  # type: ignore[attr-defined]
    strategy, content = await service._extract_github_bookmark_content(
        client=None,
        url="https://github.com/keyurgolani/OpenForge/tree/main/backend/openforge",
    )

    assert strategy == "none"
    assert content == ""


def test_convert_html_to_markdown_preserves_basic_structure() -> None:
    service = NoteService()
    html = """
    <html>
      <body>
        <h1>OpenForge Notes</h1>
        <p>Store links and ideas.</p>
        <ul>
          <li>First point</li>
          <li><a href="https://example.com">Reference</a></li>
        </ul>
      </body>
    </html>
    """
    markdown = service._convert_html_to_markdown(html)
    assert "# OpenForge Notes" in markdown
    assert "- First point" in markdown
    assert "[Reference](https://example.com)" in markdown


def test_extract_readable_text_from_html_removes_navigation() -> None:
    service = NoteService()
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
