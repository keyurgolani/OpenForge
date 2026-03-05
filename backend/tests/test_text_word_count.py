import unittest

from openforge.utils.text import count_words


class CountWordsTests(unittest.TestCase):
    def test_counts_plain_text_words(self) -> None:
        self.assertEqual(count_words("hello world"), 2)

    def test_counts_gist_content_using_code_tokens(self) -> None:
        content = "userAccountId=fooBar+baz42"
        self.assertEqual(count_words(content, note_type="gist"), 3)

    def test_counts_markdown_code_blocks_using_code_tokens(self) -> None:
        content = "Before code.\n```ts\nuserAccountId=fooBar+baz42\n```\nAfter code."
        self.assertEqual(count_words(content, note_type="standard"), 7)


if __name__ == "__main__":
    unittest.main()
