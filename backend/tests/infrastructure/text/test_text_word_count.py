import unittest

from openforge.utils.text import count_words, normalize_word_count


class CountWordsTests(unittest.TestCase):
    def test_counts_plain_text_words(self) -> None:
        self.assertEqual(count_words("hello world"), 2)

    def test_counts_gist_content_using_code_tokens(self) -> None:
        content = "userAccountId=fooBar+baz42"
        self.assertEqual(count_words(content, knowledge_type="gist"), 3)

    def test_counts_markdown_code_blocks_using_code_tokens(self) -> None:
        content = "Before code.\n```ts\nuserAccountId=fooBar+baz42\n```\nAfter code."
        self.assertEqual(count_words(content, knowledge_type="note"), 7)

    def test_counts_sentence_in_gist_as_multiple_words(self) -> None:
        content = "This gist line is a full sentence."
        self.assertEqual(count_words(content, knowledge_type="gist"), 7)

    def test_normalize_word_count_marks_stale_counts(self) -> None:
        normalized, changed = normalize_word_count(
            stored_word_count=1,
            text="This gist line is a full sentence.",
            knowledge_type="gist",
        )
        self.assertEqual(normalized, 7)
        self.assertTrue(changed)

    def test_normalize_word_count_keeps_fresh_counts(self) -> None:
        normalized, changed = normalize_word_count(
            stored_word_count=7,
            text="This gist line is a full sentence.",
            knowledge_type="gist",
        )
        self.assertEqual(normalized, 7)
        self.assertFalse(changed)


if __name__ == "__main__":
    unittest.main()
