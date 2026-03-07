"""
LLM Council for OpenForge v2.

Orchestrates multiple LLM models to deliberate and select the best response.
"""
import asyncio
import logging
from typing import Any, Optional
from dataclasses import dataclass, field

import litellm

from openforge.core.llm_gateway import llm_gateway

logger = logging.getLogger("openforge.llm_council")


@dataclass
class CouncilMember:
    """A member of the LLM council."""
    id: str
    provider_id: str
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    label: Optional[str] = None  # Display label


@dataclass
class CouncilConfig:
    """Configuration for an LLM Council."""
    council_id: str
    chairman: CouncilMember  # Model that judges responses
    members: list[CouncilMember] = field(default_factory=list)
    parallel_execution: bool = True  # Run members in parallel or sequentially
    judging_prompt: Optional[str] = None  # Custom prompt for judging


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


class LLMCouncil:
    """
    Orchestrates multiple LLM models to deliberate and select the best response.

    How it works:
    1. User sends a prompt
    2. All council members generate responses (parallel or sequential)
    3. Chairman evaluates all responses and selects the best one
    4. Return the winning response
    """

    def __init__(self, config: CouncilConfig):
        self.config = config

    async def _get_member_response(
        self,
        member: CouncilMember,
        messages: list[dict],
        max_tokens: int,
    ) -> tuple[str, str]:
        """
        Get a response from a council member.

        Returns:
            Tuple of (member_id, response_content)
        """
        try:
            response = await litellm.acompletion(
                model=llm_gateway._resolve_model(member.provider_id, member.model),
                messages=messages,
                api_key=member.api_key or None,
                api_base=member.base_url,
                max_tokens=max_tokens,
            )
            content = llm_gateway._normalize_content(response.choices[0].message.content)
            return member.id, content
        except Exception as e:
            logger.warning(f"Council member {member.id} ({member.model}) failed: {e}")
            return member.id, f"[Error: {str(e)}]"

    async def _judge_responses(
        self,
        prompt: str,
        responses: list[tuple[str, str]],
    ) -> int:
        """
        Have the chairman judge the responses.

        Returns:
            Index of the winning response (0-based)
        """
        # Format responses for judging
        response_text = ""
        for i, (member_id, response) in enumerate(responses):
            label = f"Response {i + 1}"
            response_text += f"\n\n--- {label} ---\n{response}\n"

        judging_prompt = self.config.judging_prompt or DEFAULT_JUDGING_PROMPT
        full_prompt = judging_prompt.format(prompt=prompt, responses=response_text)

        try:
            response = await litellm.acompletion(
                model=llm_gateway._resolve_model(
                    self.config.chairman.provider_id,
                    self.config.chairman.model
                ),
                messages=[{"role": "user", "content": full_prompt}],
                api_key=self.config.chairman.api_key or None,
                api_base=self.config.chairman.base_url,
                max_tokens=100,
            )

            content = llm_gateway._normalize_content(response.choices[0].message.content)

            # Extract the winning number
            import re
            match = re.search(r'\b([1-9])\b', content)
            if match:
                winning_index = int(match.group(1)) - 1
                if 0 <= winning_index < len(responses):
                    logger.info(f"Chairman selected response {winning_index + 1}")
                    return winning_index

            # Fallback to first response
            logger.warning(f"Could not parse chairman's decision: {content}")
            return 0

        except Exception as e:
            logger.warning(f"Chairman judging failed: {e}, defaulting to first response")
            return 0

    async def chat(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
    ) -> str:
        """
        Get a response from the council.

        Args:
            messages: Conversation messages
            max_tokens: Maximum tokens for response

        Returns:
            Best response from the council
        """
        if not self.config.members:
            raise ValueError("No council members configured")

        # Get the last user message for judging context
        user_prompt = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_prompt = msg.get("content", "")
                break

        logger.info(f"Council deliberating with {len(self.config.members)} members...")

        # Gather responses from all members
        if self.config.parallel_execution:
            # Run all members in parallel
            tasks = [
                self._get_member_response(member, messages, max_tokens)
                for member in self.config.members
            ]
            responses = await asyncio.gather(*tasks)
        else:
            # Run members sequentially
            responses = []
            for member in self.config.members:
                member_id, content = await self._get_member_response(member, messages, max_tokens)
                responses.append((member_id, content))

        # Filter out error responses for judging
        valid_responses = [
            (i, resp) for i, (member_id, resp) in enumerate(responses)
            if not resp.startswith("[Error:")
        ]

        if not valid_responses:
            # All failed, return first error
            return responses[0][1] if responses else "All council members failed"

        # Judge responses
        if len(valid_responses) == 1:
            # Only one valid response, use it
            winning_index = valid_responses[0][0]
        else:
            # Have chairman judge
            winning_index = await self._judge_responses(
                user_prompt,
                [(responses[i][0], responses[i][1]) for i, _ in valid_responses]
            )

        # Return winning response
        return responses[winning_index][1]

    async def stream(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
    ) -> Any:
        """
        Council doesn't stream - it deliberates and returns the best response.

        This method yields status updates followed by the final response.
        """
        # Yield status update
        yield "[Council deliberating...]"

        # Get the final response
        response = await self.chat(messages, max_tokens)

        # Yield the response
        for char in response:
            yield char
            await asyncio.sleep(0.001)


def create_default_council_config() -> CouncilConfig:
    """Create a default council configuration."""
    return CouncilConfig(
        council_id="default",
        chairman=CouncilMember(
            id="chairman",
            provider_id="openai",
            model="gpt-4o-mini",
        ),
        members=[],
        parallel_execution=True,
    )
