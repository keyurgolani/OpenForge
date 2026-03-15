from openforge.core.llm_gateway import llm_gateway
import logging

logger = logging.getLogger("openforge.context")


class ContextAssembler:
    """
    Assembles the final messages list for an LLM call with token budget enforcement.

    Budget allocation (of model's max context):
    - System prompt: 12% (hard minimum, never truncated)
    - Conversation history: 70%
    - Output headroom: 18%
    """

    def assemble(
        self,
        system_prompt: str,
        conversation_messages: list[dict],
        max_context_tokens: int = 16000,
        explicit_context: str | None = None,
    ) -> list[dict]:
        """Returns assembled messages list for LLM call."""
        history_budget = int(max_context_tokens * 0.70)

        # Build full system prompt
        full_system = system_prompt
        if explicit_context:
            full_system += explicit_context

        # Build conversation history within budget
        messages = [{"role": "system", "content": full_system}]
        history = self._truncate_history(conversation_messages, history_budget)
        messages.extend(history)
        return messages

    def _truncate_history(self, messages: list[dict], budget_tokens: int) -> list[dict]:
        if not messages:
            return []

        # Always keep the last 4 messages
        must_keep = messages[-4:]
        optional = messages[:-4]

        # Count tokens for must-keep messages
        must_tokens = sum(llm_gateway.count_tokens(m["content"]) for m in must_keep)
        remaining_budget = budget_tokens - must_tokens

        # Add older messages from newest to oldest until budget exhausted
        additional = []
        for msg in reversed(optional):
            tokens = llm_gateway.count_tokens(msg["content"])
            if remaining_budget - tokens < 0:
                break
            additional.insert(0, msg)
            remaining_budget -= tokens

        return additional + must_keep
