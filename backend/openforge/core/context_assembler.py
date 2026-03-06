from openforge.core.llm_gateway import llm_gateway
import logging

logger = logging.getLogger("openforge.context")


class ContextAssembler:
    """
    Assembles the final messages list for an LLM call with token budget enforcement.

    Budget allocation (of model's max context):
    - System prompt: 12% (hard minimum, never truncated)
    - RAG context: 35%
    - Conversation history: 35%
    - Output headroom: 18%
    """

    def assemble(
        self,
        system_prompt: str,
        conversation_messages: list[dict],
        rag_results: list[dict],
        max_context_tokens: int = 16000,
        extra_context: str | None = None,
    ) -> list[dict]:
        """Returns assembled messages list for LLM call."""
        rag_budget = int(max_context_tokens * 0.35)
        history_budget = int(max_context_tokens * 0.35)

        # Build RAG context
        rag_text = self._build_rag_context(rag_results, rag_budget)

        # Build full system prompt
        full_system = system_prompt
        if rag_text:
            full_system += "\n\nWorkspace knowledge snippets (internal grounding data):\n\n" + rag_text
        if extra_context:
            full_system += extra_context

        # Build conversation history within budget
        messages = [{"role": "system", "content": full_system}]
        history = self._truncate_history(conversation_messages, history_budget)
        messages.extend(history)
        return messages

    def _build_rag_context(self, rag_results: list[dict], budget_tokens: int) -> str:
        if not rag_results:
            return ""

        # Sort by score descending
        sorted_results = sorted(rag_results, key=lambda x: x.get("score", 0), reverse=True)
        parts = []
        used_tokens = 0

        for r in sorted_results:
            header = f'[From: "{r["title"]}"'
            if r.get("header_path"):
                header += f' (section: {r["header_path"]})'
            header += "]"
            entry = f"{header}\n{r['chunk_text']}"
            entry_tokens = llm_gateway.count_tokens(entry)

            if used_tokens + entry_tokens > budget_tokens:
                break
            parts.append(entry)
            used_tokens += entry_tokens

        return "\n\n".join(parts) if parts else ""

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
