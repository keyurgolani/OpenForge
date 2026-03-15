from __future__ import annotations

from openforge.domains.prompts.seed import SEED_PROMPTS


def _seed(slug: str) -> dict:
    return next(prompt for prompt in SEED_PROMPTS if prompt["slug"] == slug)


def test_untrusted_knowledge_prompts_do_not_embed_raw_content_placeholders():
    expectations = {
        "generate_title": "knowledge_content",
        "summarize_knowledge": "knowledge_content",
        "extract_insights": "knowledge_content",
        "audio_title_generation": "transcript",
    }

    for slug, variable_name in expectations.items():
        prompt = _seed(slug)
        assert f"{{{variable_name}}}" not in prompt["template"]
        assert variable_name not in prompt["variable_schema"]


def test_agent_system_prompt_schema_matches_declared_placeholders():
    prompt = _seed("agent_system")

    assert prompt["variable_schema"] == {}
