"""LLM-driven input extraction for parameterized agents.

Given a user message and an agent's input_schema, uses the LLM to extract
parameter values from natural language. If some values are missing, generates
a follow-up question.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from openforge.core.llm_gateway import llm_gateway

logger = logging.getLogger("openforge.runtime.input_extraction")


def _format_conversation_history(conversation_history: list[dict[str, Any]] | None) -> str:
    if not conversation_history:
        return ""

    formatted_lines: list[str] = []
    for message in conversation_history:
        role = str(message.get("role") or "user").strip().lower()
        content = str(message.get("content") or "").strip()
        if not content:
            continue
        role_label = "ASSISTANT" if role == "assistant" else "USER"
        formatted_lines.append(f"{role_label}: {content}")

    return "\n".join(formatted_lines)


def build_extraction_prompt(
    input_schema: list[dict],
    user_message: str,
    conversation_history: list[dict[str, Any]] | None = None,
) -> str:
    """Build a meta-prompt for the LLM to extract input values."""
    schema_desc = []
    for param in input_schema:
        name = param.get("name", "")
        ptype = param.get("type", "text")
        required = param.get("required", True)
        desc = param.get("description", "")
        default = param.get("default")

        parts = [f"- {name} ({ptype})"]
        if desc:
            parts.append(f": {desc}")
        if required:
            parts.append(" [REQUIRED]")
        else:
            parts.append(" [OPTIONAL]")
        if default is not None:
            parts.append(f" (default: {default})")
        schema_desc.append("".join(parts))

    schema_text = "\n".join(schema_desc)
    history_text = _format_conversation_history(conversation_history)
    history_section = f"\nConversation transcript:\n{history_text}\n" if history_text else ""

    return f"""You are an input extraction assistant. Given a conversation and the latest user message, extract parameter values for the following schema:

{schema_text}
{history_section}

Latest user message: "{user_message}"

Respond with a JSON object containing:
- "extracted": a dict of parameter_name -> extracted_value (only include values you are confident about)
- "missing": a list of parameter names that are required but could not be extracted
- "follow_up": a natural follow-up message to the user (see rules below), or null if all required params are filled AND no optional params remain unset.

Rules:
- Use the conversation transcript to accumulate values already provided across earlier turns.
- Only USER messages count as sources of truth for parameter values.
- ASSISTANT messages provide context about what is being asked, but they do not supply parameter values.
- If the user gives multiple values for the same parameter, prefer the most recent USER-provided value.
- When writing the follow_up message:
  - First ask about any REQUIRED parameters that are still missing.
  - Then, if there are OPTIONAL parameters that the user has not provided, briefly mention them and ask if the user would like to configure any of them. Describe what each optional parameter does so the user can make an informed choice. Do NOT assume the user knows what parameters the agent supports.
  - If all required parameters are filled but optional parameters remain unset, still generate a follow_up that mentions the available optional parameters and asks if the user wants to set any before proceeding. Phrase it so the user can simply say "no" or "go ahead" to skip them.
  - If the conversation transcript shows the user has already been asked about optional parameters and declined (e.g., said "no", "go ahead", "skip", "just proceed", etc.), set follow_up to null — do NOT ask again.

Return ONLY valid JSON, no markdown formatting."""


def parse_extraction_response(response_text: str, input_schema: list[dict]) -> dict[str, Any]:
    """Parse the LLM's extraction response.

    Returns:
        {
            "extracted": {param_name: value, ...},
            "missing": [param_name, ...],
            "follow_up": str | None,
            "all_filled": bool,
        }
    """
    try:
        # Try to extract JSON from the response
        text = response_text.strip()
        if text.startswith("```"):
            # Strip markdown code block
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

        data = json.loads(text)
        extracted = data.get("extracted", {})
        missing = data.get("missing", [])
        follow_up = data.get("follow_up")

        # Validate extracted values against schema
        required_names = {p["name"] for p in input_schema if p.get("required", True)}
        filled = set(extracted.keys())
        still_missing = required_names - filled
        all_required_filled = len(still_missing) == 0

        # Preserve the LLM's follow_up about optional params even when
        # all required params are filled.  The LLM is instructed to set
        # follow_up to null once the user declines optional configuration,
        # so a non-null follow_up here means the user hasn't been asked yet.
        return {
            "extracted": extracted,
            "missing": list(still_missing),
            "follow_up": follow_up,
            "all_filled": all_required_filled,
        }

    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.warning("Failed to parse extraction response: %s", e)
        return {
            "extracted": {},
            "missing": [p["name"] for p in input_schema if p.get("required", True)],
            "follow_up": None,
            "all_filled": False,
            "extraction_failed": True,
        }


def _build_fallback_follow_up(input_schema: list[dict[str, Any]]) -> dict[str, Any]:
    missing = [p["name"] for p in input_schema if p.get("required", True)]
    return {
        "extracted": {},
        "missing": missing,
        "follow_up": None,
        "all_filled": False,
        "extraction_failed": True,
    }


async def extract_parameter_values(
    input_schema: list[dict[str, Any]],
    user_message: str,
    *,
    conversation_history: list[dict[str, Any]] | None = None,
    provider_name: str,
    api_key: str,
    model: str,
    base_url: str | None = None,
    max_tokens: int = 800,
) -> dict[str, Any]:
    """Extract parameter values from a user message.

    Falls back to a clarification prompt when extraction fails.
    """
    if not input_schema:
        return {
            "extracted": {},
            "missing": [],
            "follow_up": None,
            "all_filled": True,
        }

    prompt = build_extraction_prompt(input_schema, user_message, conversation_history)
    try:
        response_text = await llm_gateway.chat(
            messages=[{"role": "user", "content": prompt}],
            provider_name=provider_name,
            api_key=api_key,
            model=model,
            base_url=base_url,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        logger.warning("Parameter extraction failed: %s", exc)
        return _build_fallback_follow_up(input_schema)

    result = parse_extraction_response(response_text, input_schema)
    if result["all_filled"]:
        return result
    if not result.get("follow_up"):
        result["follow_up"] = _build_fallback_follow_up(input_schema)["follow_up"]
    return result
