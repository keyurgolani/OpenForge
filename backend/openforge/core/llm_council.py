"""LLM Council — orchestrates multiple models to deliberate and select the best response.

Fully composable: both the chairman and member endpoints can be standard models
or other virtual providers.
"""
import asyncio
import logging
import re
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import LLMEndpoint, LLMCouncilConfig

logger = logging.getLogger("openforge.llm_council")

DEFAULT_JUDGING_PROMPT = """You are a judge evaluating multiple AI responses to the same prompt. Your task is to select the best response.

Original Prompt:
{prompt}

Response Options:
{responses}

Evaluate each response on:
1. Accuracy and correctness
2. Completeness of the answer
3. Clarity and readability
4. Relevance to the prompt

Respond with ONLY the number (1, 2, 3, etc.) of the best response, followed by a brief explanation.

Best Response Number: """


def _endpoint_label(ep: LLMEndpoint) -> str:
    """Get a human-readable label for an endpoint."""
    if ep.display_name:
        return ep.display_name
    if ep.endpoint_type == "standard" and ep.model_id:
        return ep.model_id
    return str(ep.id)[:8]


class LLMCouncil:
    def __init__(self, resolver, db: AsyncSession, config: LLMCouncilConfig, chairman_endpoint: LLMEndpoint):
        self.resolver = resolver
        self.db = db
        self.config = config
        self.chairman_endpoint = chairman_endpoint

    async def _get_member_response(self, member_endpoint: LLMEndpoint, messages: list[dict], max_tokens: int, _depth: int) -> tuple[str, str, str]:
        """Get response from a council member endpoint. Returns (endpoint_id, label, response)."""
        label = _endpoint_label(member_endpoint)
        try:
            response = await self.resolver.chat(
                self.db, member_endpoint, messages,
                max_tokens=max_tokens, _depth=_depth,
            )
            return str(member_endpoint.id), label, response
        except Exception as e:
            logger.warning(f"Council member {member_endpoint.id} failed: {e}")
            return str(member_endpoint.id), label, f"[Error: {str(e)}]"

    async def _judge_responses(self, prompt: str, responses: list[tuple[str, str, str]], _depth: int) -> tuple[int, str]:
        """Have the chairman judge responses. Returns (0-based index of winner, reasoning)."""
        response_text = ""
        for i, (_, label, response) in enumerate(responses):
            response_text += f"\n\n--- Response {i + 1} ({label}) ---\n{response}\n"

        judging_prompt = self.config.judging_prompt or DEFAULT_JUDGING_PROMPT
        full_prompt = judging_prompt.format(prompt=prompt, responses=response_text)

        try:
            content = await self.resolver.chat(
                self.db, self.chairman_endpoint,
                [{"role": "user", "content": full_prompt}],
                max_tokens=200, _depth=_depth,
            )
            match = re.search(r'\b([1-9])\b', content)
            if match:
                winning_index = int(match.group(1)) - 1
                if 0 <= winning_index < len(responses):
                    logger.info(f"Chairman selected response {winning_index + 1}")
                    return winning_index, content.strip()
            logger.warning(f"Could not parse chairman's decision: {content}")
            return 0, content.strip()
        except Exception as e:
            logger.warning(f"Chairman judging failed: {e}, defaulting to first response")
            return 0, f"Judging failed: {str(e)}"

    async def stream(
        self,
        messages: list[dict],
        *,
        max_tokens: int = 2000,
        _depth: int = 0,
    ) -> AsyncGenerator[dict, None]:
        if not self.config.members:
            raise ValueError("No council members configured")

        # Get last user message for judging context
        user_prompt = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                content = msg.get("content", "")
                user_prompt = content if isinstance(content, str) else str(content)
                break

        logger.info(f"Council deliberating with {len(self.config.members)} members...")

        # Gather responses from all members
        if self.config.parallel_execution:
            tasks = [
                self._get_member_response(member.endpoint, messages, max_tokens, _depth)
                for member in self.config.members
            ]
            responses = list(await asyncio.gather(*tasks))
        else:
            responses = []
            for member in self.config.members:
                ep_id, label, content = await self._get_member_response(member.endpoint, messages, max_tokens, _depth)
                responses.append((ep_id, label, content))

        # Filter out errors
        valid_responses = [
            (i, resp) for i, (_, _, resp) in enumerate(responses)
            if not resp.startswith("[Error:")
        ]

        if not valid_responses:
            error_msg = responses[0][2] if responses else "All council members failed"
            yield {"type": "token", "content": error_msg}
            return

        # Judge
        chairman_reasoning = ""
        if len(valid_responses) == 1:
            winning_index = valid_responses[0][0]
            chairman_reasoning = "Only one valid response — auto-selected."
        else:
            valid_for_judging = [(responses[i][0], responses[i][1], responses[i][2]) for i, _ in valid_responses]
            winning_index, chairman_reasoning = await self._judge_responses(
                user_prompt,
                valid_for_judging,
                _depth=_depth,
            )

        # Yield winning response as tokens
        winning_response = responses[winning_index][2]
        yield {"type": "token", "content": winning_response}

        # Build rich metadata for the UI
        member_details = []
        for i, (ep_id, label, resp) in enumerate(responses):
            is_error = resp.startswith("[Error:")
            member_details.append({
                "label": label,
                "response_preview": resp[:300] if not is_error else resp,
                "is_winner": i == winning_index,
                "is_error": is_error,
            })

        yield {
            "type": "metadata",
            "data": {
                "type": "council",
                "member_count": len(self.config.members),
                "valid_responses": len(valid_responses),
                "selected_index": winning_index,
                "chairman": _endpoint_label(self.chairman_endpoint),
                "chairman_reasoning": chairman_reasoning[:300],
                "members": member_details,
            },
        }
