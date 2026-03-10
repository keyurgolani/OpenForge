import json as _json
import uuid as _uuid
import litellm
from typing import AsyncGenerator
import tiktoken
import httpx
import logging

logger = logging.getLogger("openforge.llm")

# ── LiteLLM provider prefix map ───────────────────────────────────────────────
# ollama_chat/ routes to Ollama's /api/chat (native format).
# All other providers go through LiteLLM.  For Ollama we use direct httpx
# streaming so we can expose message.thinking from the native API.
PREFIX_MAP = {
    "anthropic":        "anthropic/",
    "gemini":           "gemini/",
    "ollama":           "ollama_chat/",   # used only for non-streaming calls
    "deepseek":         "deepseek/",
    "groq":             "groq/",
    "mistral":          "mistral/",
    "openrouter":       "openrouter/",
    "xai":              "xai/",
    "cohere":           "cohere/",
    "zhipuai":          "zhipuai/",
    "huggingface":      "huggingface/",
    "custom-openai":    "",       # user sets base_url; model name passed as-is
    "custom-anthropic": "anthropic/",
}


class _ThinkingParser:
    """
    Stateful parser that splits inline <think>...</think> tags from a token stream.

    Used for non-Ollama providers whose thinking models embed reasoning in the
    content stream (e.g. DeepSeek-R1, Qwen through OpenRouter, etc.).
    """

    _OPEN  = "<think>"
    _CLOSE = "</think>"

    def __init__(self) -> None:
        self._buf = ""
        self._in_think = False

    def feed(self, chunk: str) -> list[dict]:
        self._buf += chunk
        return self._drain()

    def flush(self) -> list[dict]:
        if not self._buf:
            return []
        ev_type = "thinking" if self._in_think else "token"
        events = [{"type": ev_type, "content": self._buf}]
        self._buf = ""
        return events

    def _drain(self) -> list[dict]:
        events: list[dict] = []
        while self._buf:
            if self._in_think:
                idx = self._buf.find(self._CLOSE)
                if idx == -1:
                    hold = self._partial_suffix(self._CLOSE)
                    emit_len = len(self._buf) - hold
                    if emit_len > 0:
                        events.append({"type": "thinking", "content": self._buf[:emit_len]})
                        self._buf = self._buf[emit_len:]
                    break
                if idx > 0:
                    events.append({"type": "thinking", "content": self._buf[:idx]})
                self._buf = self._buf[idx + len(self._CLOSE):]
                self._in_think = False
            else:
                idx = self._buf.find(self._OPEN)
                if idx == -1:
                    hold = self._partial_suffix(self._OPEN)
                    emit_len = len(self._buf) - hold
                    if emit_len > 0:
                        events.append({"type": "token", "content": self._buf[:emit_len]})
                        self._buf = self._buf[emit_len:]
                    break
                if idx > 0:
                    events.append({"type": "token", "content": self._buf[:idx]})
                self._buf = self._buf[idx + len(self._OPEN):]
                self._in_think = True
        return events

    def _partial_suffix(self, tag: str) -> int:
        max_check = min(len(tag) - 1, len(self._buf))
        for n in range(max_check, 0, -1):
            if tag.startswith(self._buf[-n:]):
                return n
        return 0


class LLMGateway:
    """Thin wrapper over LiteLLM (non-Ollama) and direct httpx (Ollama) for all LLM ops."""

    # ── Public API ────────────────────────────────────────────────────────────

    async def chat(
        self,
        messages: list[dict],
        provider_name: str,
        api_key: str,
        model: str,
        base_url: str | None = None,
        max_tokens: int = 2000,
    ) -> str:
        if provider_name == "ollama":
            base = self._resolve_base_url(provider_name, base_url)
            base = (base or "http://localhost:11434").rstrip("/")
            body: dict = {
                "model": model,
                "messages": self._to_ollama_messages(messages),
                "stream": False,
                "options": {"num_predict": max_tokens},
            }
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(f"{base}/api/chat", json=body)
                resp.raise_for_status()
                data = resp.json()
                return (data.get("message") or {}).get("content") or ""

        response = await litellm.acompletion(
            model=self._resolve_model(provider_name, model),
            messages=messages,
            api_key=api_key or None,
            api_base=self._resolve_base_url(provider_name, base_url),
            max_tokens=max_tokens,
        )
        return self._normalize_content(response.choices[0].message.content)

    async def stream(
        self,
        messages: list[dict],
        provider_name: str,
        api_key: str,
        model: str,
        base_url: str | None = None,
        max_tokens: int = 2000,
    ) -> AsyncGenerator[str, None]:
        if provider_name == "ollama":
            async for event in self._ollama_stream(
                messages=messages,
                tools=[],
                base_url=self._resolve_base_url(provider_name, base_url),
                model=model,
                max_tokens=max_tokens,
                include_thinking=False,
            ):
                if event["type"] == "token":
                    yield event["content"]
            return

        response = await litellm.acompletion(
            model=self._resolve_model(provider_name, model),
            messages=messages,
            api_key=api_key or None,
            api_base=base_url,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content

    async def stream_events(
        self,
        messages: list[dict],
        provider_name: str,
        api_key: str,
        model: str,
        base_url: str | None = None,
        max_tokens: int = 2000,
        include_thinking: bool = False,
    ) -> AsyncGenerator[dict[str, str], None]:
        # ── Ollama: direct /api/chat with native thinking support ──────────────
        if provider_name == "ollama":
            async for event in self._ollama_stream(
                messages=messages,
                tools=[],
                base_url=self._resolve_base_url(provider_name, base_url),
                model=model,
                max_tokens=max_tokens,
                include_thinking=include_thinking,
            ):
                if event["type"] != "done":
                    yield event
            return

        # ── All other providers via LiteLLM ────────────────────────────────────
        resolved_model = self._resolve_model(provider_name, model)
        response = await litellm.acompletion(
            model=resolved_model,
            messages=messages,
            api_key=api_key or None,
            api_base=base_url,
            max_tokens=max_tokens,
            stream=True,
        )
        parser = _ThinkingParser() if include_thinking else None
        async for chunk in response:
            delta = chunk.choices[0].delta
            # Providers that return thinking in a dedicated field (Anthropic, etc.)
            native_thinking = (
                getattr(delta, "reasoning_content", None)
                or getattr(delta, "thinking", None)
            )
            if native_thinking:
                yield {"type": "thinking", "content": native_thinking}
            if delta and delta.content:
                if parser:
                    for event in parser.feed(delta.content):
                        yield event
                else:
                    yield {"type": "token", "content": delta.content}
        if parser:
            for event in parser.flush():
                yield event

    async def stream_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        provider_name: str,
        api_key: str,
        model: str,
        base_url: str | None = None,
        max_tokens: int = 4000,
        include_thinking: bool = False,
    ) -> AsyncGenerator[dict, None]:
        """
        Stream an LLM response that may include tool calls.

        Yields events:
          {"type": "token",      "content": str}
          {"type": "thinking",   "content": str}
          {"type": "tool_calls", "calls": [{"id":.., "name":.., "arguments":..}]}
          {"type": "done",       "finish_reason": str}

        Ollama uses direct /api/chat (native thinking + tool support).
        All other providers go through LiteLLM.
        """
        if not tools:
            async for event in self.stream_events(
                messages=messages,
                provider_name=provider_name,
                api_key=api_key,
                model=model,
                base_url=base_url,
                max_tokens=max_tokens,
                include_thinking=include_thinking,
            ):
                yield event
            yield {"type": "done", "finish_reason": "stop"}
            return

        # ── Ollama: direct /api/chat ────────────────────────────────────────────
        if provider_name == "ollama":
            async for event in self._ollama_stream(
                messages=messages,
                tools=tools,
                base_url=self._resolve_base_url(provider_name, base_url),
                model=model,
                max_tokens=max_tokens,
                include_thinking=include_thinking,
            ):
                yield event
            return

        # ── All other providers via LiteLLM ────────────────────────────────────
        resolved_model = self._resolve_model(provider_name, model)
        accumulated_calls: dict[int, dict] = {}
        parser = _ThinkingParser() if include_thinking else None

        try:
            response = await litellm.acompletion(
                model=resolved_model,
                messages=messages,
                tools=tools,
                api_key=api_key or None,
                api_base=base_url,
                max_tokens=max_tokens,
                stream=True,
            )

            finish_reason = "stop"
            async for chunk in response:
                choice = chunk.choices[0]
                delta = choice.delta
                finish_reason = choice.finish_reason or finish_reason

                native_thinking = (
                    getattr(delta, "reasoning_content", None)
                    or getattr(delta, "thinking", None)
                )
                if native_thinking:
                    yield {"type": "thinking", "content": native_thinking}

                if delta and delta.content:
                    if parser:
                        for event in parser.feed(delta.content):
                            yield event
                    else:
                        yield {"type": "token", "content": delta.content}

                if delta and delta.tool_calls:
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in accumulated_calls:
                            accumulated_calls[idx] = {"id": tc_delta.id or "", "name": "", "arguments": ""}
                        call = accumulated_calls[idx]
                        if tc_delta.id:
                            call["id"] = tc_delta.id
                        if tc_delta.function:
                            if tc_delta.function.name:
                                call["name"] += tc_delta.function.name
                            if tc_delta.function.arguments:
                                call["arguments"] += tc_delta.function.arguments

                if choice.finish_reason == "tool_calls":
                    finish_reason = "tool_calls"

            if parser:
                for event in parser.flush():
                    yield event

            if accumulated_calls:
                calls = list(accumulated_calls.values())
                for call in calls:
                    try:
                        call["arguments"] = _json.loads(call["arguments"] or "{}")
                    except Exception:
                        call["arguments"] = {}
                yield {"type": "tool_calls", "calls": calls}

            yield {"type": "done", "finish_reason": finish_reason}

        except Exception as exc:
            logger.error("stream_with_tools error for model %s: %s", resolved_model, exc)
            raise

    # ── Model listing ─────────────────────────────────────────────────────────

    async def list_models(
        self,
        provider_name: str,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> list[dict]:
        """
        Fetches available models live from each provider's API.
        Raises on failure so the caller/user sees the real error.
        """
        try:
            if provider_name == "ollama":
                # Ollama exposes its local model list at /api/tags, not /v1/models
                base = self._resolve_base_url("ollama", base_url)
                headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{base}/api/tags", headers=headers)
                    resp.raise_for_status()
                    return [{"id": m["name"], "name": m["name"]} for m in resp.json().get("models", [])]

            elif provider_name == "openai":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.openai.com").rstrip("/") + "/v1/models"
                    resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                    resp.raise_for_status()
                    return sorted(
                        [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", [])
                         if any(k in m["id"] for k in ("gpt", "o1", "o3", "o4"))],
                        key=lambda x: x["id"],
                    )

            elif provider_name == "anthropic":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.anthropic.com").rstrip("/") + "/v1/models"
                    resp = await client.get(
                        url, headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"}
                    )
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m.get("display_name", m["id"])}
                            for m in resp.json().get("data", [])]

            elif provider_name == "gemini":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://generativelanguage.googleapis.com").rstrip("/") + f"/v1beta/models?key={api_key}"
                    resp = await client.get(url)
                    resp.raise_for_status()
                    return [
                        {"id": m["name"].replace("models/", ""), "name": m.get("displayName", m["name"])}
                        for m in resp.json().get("models", [])
                        if "generateContent" in m.get("supportedGenerationMethods", [])
                    ]

            elif provider_name == "groq":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.groq.com").rstrip("/") + "/openai/v1/models"
                    resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                    resp.raise_for_status()
                    return sorted(
                        [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", [])],
                        key=lambda x: x["id"],
                    )

            elif provider_name == "deepseek":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.deepseek.com").rstrip("/") + "/models"
                    resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", [])]

            elif provider_name == "mistral":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.mistral.ai").rstrip("/") + "/v1/models"
                    resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                    resp.raise_for_status()
                    return sorted(
                        [{"id": m["id"], "name": m.get("id", m["id"])} for m in resp.json().get("data", [])
                         if m.get("capabilities", {}).get("completion_chat", True)],
                        key=lambda x: x["id"],
                    )

            elif provider_name == "openrouter":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://openrouter.ai").rstrip("/") + "/api/v1/models"
                    resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m.get("name", m["id"])}
                            for m in resp.json().get("data", [])]

            elif provider_name == "xai":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.x.ai").rstrip("/") + "/v1/models"
                    resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", [])]

            elif provider_name == "cohere":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.cohere.com").rstrip("/") + "/v1/models"
                    resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                    resp.raise_for_status()
                    return [{"id": m["name"], "name": m["name"]}
                            for m in resp.json().get("models", [])
                            if "chat" in m.get("endpoints", [])]

            elif provider_name == "zhipuai":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://open.bigmodel.cn").rstrip("/") + "/api/paas/v4/models"
                    resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", [])]

            elif provider_name == "huggingface":
                raise RuntimeError(
                    "HuggingFace does not provide a chat-model list API. "
                    "Please type the model ID directly (e.g. 'meta-llama/Meta-Llama-3-8B-Instruct')."
                )

            elif provider_name == "custom-openai":
                if not base_url:
                    raise RuntimeError("Custom OpenAI-compatible provider requires a Base URL.")
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
                    resp = await client.get(base_url.rstrip("/") + "/v1/models", headers=headers)
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m.get("id", m["id"])}
                            for m in resp.json().get("data", [])]

            elif provider_name == "custom-anthropic":
                raise RuntimeError(
                    "Anthropic-compatible providers don't expose a model list endpoint. "
                    "Please type the model ID directly."
                )

            else:
                raise RuntimeError(f"Unknown provider: {provider_name!r}")

        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Failed to fetch model list for '{provider_name}': {e}")

    async def test_connection(
        self,
        provider_name: str,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ) -> dict:
        try:
            models = await self.list_models(provider_name, api_key, base_url)
            return {"success": True, "message": f"Connected. {len(models)} model(s) available.", "models_count": len(models)}
        except Exception as e:
            return {"success": False, "message": str(e), "models_count": 0}

    def count_tokens(self, text: str, model: str = "gpt-4") -> int:
        try:
            enc = tiktoken.encoding_for_model(model)
        except KeyError:
            enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))

    # ── Ollama native /api/chat streaming ─────────────────────────────────────

    async def _ollama_stream(
        self,
        messages: list[dict],
        tools: list[dict],
        base_url: str | None,
        model: str,
        max_tokens: int,
        include_thinking: bool,
    ) -> AsyncGenerator[dict, None]:
        """
        Stream directly from Ollama's native /api/chat endpoint.

        Handles:
          - message.thinking  → {"type": "thinking", "content": str}
          - message.content   → {"type": "token",    "content": str}
          - message.tool_calls → {"type": "tool_calls", "calls": [...]}
          - done              → {"type": "done", "finish_reason": str}

        Arguments in tool_calls are returned as dicts (already parsed).
        """
        base = (base_url or "http://localhost:11434").rstrip("/")

        body: dict = {
            "model": model,
            "messages": self._to_ollama_messages(messages),
            "stream": True,
            "options": {"num_predict": max_tokens},
        }
        if include_thinking:
            body["think"] = True
        if tools:
            body["tools"] = tools  # Ollama accepts the same OpenAI tool schema format

        accumulated_tool_calls: list[dict] = []

        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream("POST", f"{base}/api/chat", json=body) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = _json.loads(line)
                    except Exception:
                        continue

                    msg = chunk.get("message") or {}
                    thinking = msg.get("thinking") or ""
                    content = msg.get("content") or ""
                    tool_calls = msg.get("tool_calls") or []

                    if thinking:
                        yield {"type": "thinking", "content": thinking}
                    if content:
                        yield {"type": "token", "content": content}
                    if tool_calls:
                        accumulated_tool_calls.extend(tool_calls)

        if accumulated_tool_calls:
            calls = []
            for tc in accumulated_tool_calls:
                fn = tc.get("function") or {}
                calls.append({
                    "id": str(_uuid.uuid4()),
                    "name": fn.get("name", ""),
                    "arguments": fn.get("arguments") or {},
                })
            yield {"type": "tool_calls", "calls": calls}
            yield {"type": "done", "finish_reason": "tool_calls"}
        else:
            yield {"type": "done", "finish_reason": "stop"}

    def _to_ollama_messages(self, messages: list[dict]) -> list[dict]:
        """
        Convert OpenAI-format messages to Ollama native /api/chat format.

        Key differences:
          - Tool result messages: strip tool_call_id (not used by Ollama)
          - Assistant tool_calls: arguments must be a dict, not a JSON string
        """
        result = []
        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content") or ""

            if role in ("system", "user"):
                if isinstance(content, list):
                    # Multimodal content: extract text parts and base64 images
                    text_parts: list[str] = []
                    images: list[str] = []
                    for part in content:
                        if not isinstance(part, dict):
                            continue
                        if part.get("type") == "text":
                            text_parts.append(part.get("text", ""))
                        elif part.get("type") == "image_url":
                            url = (part.get("image_url") or {}).get("url", "")
                            if url.startswith("data:") and "," in url:
                                # data:image/jpeg;base64,<base64_data>
                                images.append(url.split(",", 1)[1])
                    ollama_msg: dict = {"role": role, "content": " ".join(text_parts)}
                    if images:
                        ollama_msg["images"] = images
                    result.append(ollama_msg)
                else:
                    result.append({"role": role, "content": content})

            elif role == "assistant":
                converted: dict = {"role": "assistant", "content": content}
                raw_calls = msg.get("tool_calls")
                if raw_calls:
                    ollama_calls = []
                    for tc in raw_calls:
                        fn = tc.get("function") or {}
                        args = fn.get("arguments", "{}")
                        if isinstance(args, str):
                            try:
                                args = _json.loads(args)
                            except Exception:
                                args = {}
                        ollama_calls.append({
                            "function": {
                                "name": fn.get("name", ""),
                                "arguments": args,
                            }
                        })
                    converted["tool_calls"] = ollama_calls
                result.append(converted)

            elif role == "tool":
                # Ollama doesn't use tool_call_id; content is the result
                result.append({"role": "tool", "content": content})

            else:
                result.append(msg)

        return result

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _resolve_model(self, provider_name: str, model: str) -> str:
        prefix = PREFIX_MAP.get(provider_name, "")
        if not prefix or model.startswith(prefix):
            return model
        return f"{prefix}{model}"

    def _resolve_base_url(self, provider_name: str, base_url: str | None) -> str | None:
        if provider_name != "ollama":
            return base_url
        # Strip trailing /v1 so we can append /api/chat or /api/tags ourselves
        base = (base_url or "http://localhost:11434").rstrip("/")
        return base[:-3] if base.endswith("/v1") else base

    def _normalize_content(self, content) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, str):
                    parts.append(block)
                elif isinstance(block, dict):
                    text = block.get("text")
                    if isinstance(text, str):
                        parts.append(text)
            return "".join(parts).strip()
        return str(content)


llm_gateway = LLMGateway()
