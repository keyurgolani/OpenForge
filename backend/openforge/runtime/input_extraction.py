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
- "follow_up": if there are missing required parameters, write a natural follow-up question to ask the user. If all required parameters are filled, set this to null.

Rules:
- Use the conversation transcript to accumulate values already provided across earlier turns.
- Only USER messages count as sources of truth for parameter values.
- ASSISTANT messages provide context about what is being asked, but they do not supply parameter values.
- If the user gives multiple values for the same parameter, prefer the most recent USER-provided value.

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

        return {
            "extracted": extracted,
            "missing": list(still_missing),
            "follow_up": follow_up if still_missing else None,
            "all_filled": len(still_missing) == 0,
        }

    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.warning("Failed to parse extraction response: %s", e)
        return {
            "extracted": {},
            "missing": [p["name"] for p in input_schema if p.get("required", True)],
            "follow_up": "I wasn't able to understand your input. Could you please provide the required inputs?",
            "all_filled": False,
        }


def _build_fallback_follow_up(input_schema: list[dict[str, Any]]) -> dict[str, Any]:
    missing = [p["name"] for p in input_schema if p.get("required", True)]
    if missing:
        follow_up = "Could you please provide the required inputs: " + ", ".join(missing)
    else:
        follow_up = "Could you please provide the required inputs?"
    return {
        "extracted": {},
        "missing": missing,
        "follow_up": follow_up,
        "all_filled": False,
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
