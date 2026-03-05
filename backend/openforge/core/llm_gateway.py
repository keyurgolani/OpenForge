import litellm
from typing import AsyncGenerator
import tiktoken
import httpx
import json
import logging

logger = logging.getLogger("openforge.llm")

# ── LiteLLM provider prefix map ───────────────────────────────────────────
PREFIX_MAP = {
    "anthropic":        "anthropic/",
    "gemini":           "gemini/",
    "ollama":           "ollama/",
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


class LLMGateway:
    """Wraps LiteLLM for all LLM operations."""

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
            return await self._chat_ollama_native(
                messages=messages,
                model=model,
                base_url=base_url,
                api_key=api_key,
                max_tokens=max_tokens,
            )

        response = await litellm.acompletion(
            model=self._resolve_model(provider_name, model),
            messages=messages,
            api_key=api_key or None,
            api_base=base_url,
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
            async for token in self._stream_ollama_native(
                messages=messages,
                model=model,
                base_url=base_url,
                api_key=api_key,
                max_tokens=max_tokens,
                include_thinking=False,
            ):
                yield token
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
        if provider_name == "ollama":
            async for event in self._stream_ollama_native_events(
                messages=messages,
                model=model,
                base_url=base_url,
                api_key=api_key,
                max_tokens=max_tokens,
                include_thinking=include_thinking,
            ):
                yield event
            return

        async for token in self.stream(
            messages=messages,
            provider_name=provider_name,
            api_key=api_key,
            model=model,
            base_url=base_url,
            max_tokens=max_tokens,
        ):
            yield {"type": "token", "content": token}

    async def _chat_ollama_native(
        self,
        messages: list[dict],
        model: str,
        base_url: str | None,
        api_key: str,
        max_tokens: int,
    ) -> str:
        payload = self._build_ollama_payload(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
            stream=False,
            include_thinking=False,
        )
        headers = self._ollama_headers(api_key)
        base = self._normalize_ollama_base_url(base_url)

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{base}/api/chat",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            chunk = response.json()

        return self._extract_ollama_chunk_text(chunk)

    async def _stream_ollama_native(
        self,
        messages: list[dict],
        model: str,
        base_url: str | None,
        api_key: str,
        max_tokens: int,
        include_thinking: bool,
    ) -> AsyncGenerator[str, None]:
        payload = self._build_ollama_payload(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
            stream=True,
            include_thinking=include_thinking,
        )
        headers = self._ollama_headers(api_key)
        base = self._normalize_ollama_base_url(base_url)

        timeout = httpx.Timeout(connect=10.0, read=None, write=30.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST",
                f"{base}/api/chat",
                json=payload,
                headers=headers,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        logger.debug("Skipping non-JSON Ollama stream line: %s", line)
                        continue

                    token = self._extract_ollama_chunk_text(chunk)
                    if token:
                        yield token

    async def _stream_ollama_native_events(
        self,
        messages: list[dict],
        model: str,
        base_url: str | None,
        api_key: str,
        max_tokens: int,
        include_thinking: bool,
    ) -> AsyncGenerator[dict[str, str], None]:
        payload = self._build_ollama_payload(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
            stream=True,
            include_thinking=include_thinking,
        )
        headers = self._ollama_headers(api_key)
        base = self._normalize_ollama_base_url(base_url)

        timeout = httpx.Timeout(connect=10.0, read=None, write=30.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST",
                f"{base}/api/chat",
                json=payload,
                headers=headers,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        logger.debug("Skipping non-JSON Ollama stream line: %s", line)
                        continue

                    thinking = self._extract_ollama_chunk_thinking(chunk)
                    if thinking:
                        yield {"type": "thinking", "content": thinking}

                    token = self._extract_ollama_chunk_text(chunk)
                    if token:
                        yield {"type": "token", "content": token}

    async def list_models(
        self,
        provider_name: str,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> list[dict]:
        """
        Fetches available models live from each provider's API.
        Never returns stale fallback lists — raises on failure so the caller/user
        sees the real error (wrong key, wrong URL, service down, etc.).
        """
        try:
            # ── Ollama ────────────────────────────────────────────────────
            if provider_name == "ollama":
                base = self._normalize_ollama_base_url(base_url)
                headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{base}/api/tags", headers=headers)
                    resp.raise_for_status()
                    return [{"id": m["name"], "name": m["name"]} for m in resp.json().get("models", [])]

            # ── OpenAI ────────────────────────────────────────────────────
            elif provider_name == "openai":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.openai.com").rstrip("/") + "/v1/models"
                    resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                    resp.raise_for_status()
                    data = resp.json().get("data", [])
                    return sorted(
                        [{"id": m["id"], "name": m["id"]} for m in data
                         if any(k in m["id"] for k in ("gpt", "o1", "o3", "o4"))],
                        key=lambda x: x["id"]
                    )

            # ── Anthropic ─────────────────────────────────────────────────
            elif provider_name == "anthropic":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.anthropic.com").rstrip("/") + "/v1/models"
                    resp = await client.get(
                        url,
                        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                    )
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m.get("display_name", m["id"])}
                            for m in resp.json().get("data", [])]

            # ── Gemini ────────────────────────────────────────────────────
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

            # ── Groq ──────────────────────────────────────────────────────
            elif provider_name == "groq":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.groq.com").rstrip("/") + "/openai/v1/models"
                    resp = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {api_key}"},
                    )
                    resp.raise_for_status()
                    return sorted(
                        [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", [])],
                        key=lambda x: x["id"]
                    )

            # ── DeepSeek ──────────────────────────────────────────────────
            elif provider_name == "deepseek":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.deepseek.com").rstrip("/") + "/models"
                    resp = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {api_key}"},
                    )
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", [])]

            # ── Mistral ───────────────────────────────────────────────────
            elif provider_name == "mistral":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.mistral.ai").rstrip("/") + "/v1/models"
                    resp = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {api_key}"},
                    )
                    resp.raise_for_status()
                    return sorted(
                        [{"id": m["id"], "name": m.get("id", m["id"])} for m in resp.json().get("data", [])
                         if m.get("capabilities", {}).get("completion_chat", True)],
                        key=lambda x: x["id"]
                    )

            # ── OpenRouter ────────────────────────────────────────────────
            elif provider_name == "openrouter":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://openrouter.ai").rstrip("/") + "/api/v1/models"
                    resp = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {api_key}"},
                    )
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m.get("name", m["id"])}
                            for m in resp.json().get("data", [])]

            # ── xAI (Grok) ────────────────────────────────────────────────
            elif provider_name == "xai":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.x.ai").rstrip("/") + "/v1/models"
                    resp = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {api_key}"},
                    )
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", [])]

            # ── Cohere ────────────────────────────────────────────────────
            elif provider_name == "cohere":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://api.cohere.com").rstrip("/") + "/v1/models"
                    resp = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {api_key}"},
                    )
                    resp.raise_for_status()
                    return [{"id": m["name"], "name": m["name"]}
                            for m in resp.json().get("models", [])
                            if "chat" in m.get("endpoints", [])]

            # ── ZhipuAI (Z.AI / GLM) ──────────────────────────────────────
            elif provider_name == "zhipuai":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    url = (base_url or "https://open.bigmodel.cn").rstrip("/") + "/api/paas/v4/models"
                    resp = await client.get(
                        url,
                        headers={"Authorization": f"Bearer {api_key}"},
                    )
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m["id"]} for m in resp.json().get("data", [])]

            # ── HuggingFace Inference API ─────────────────────────────────
            elif provider_name == "huggingface":
                # HF doesn't have a simple "list chat models" endpoint.
                # Raise so the user is prompted to type a model ID manually.
                raise RuntimeError(
                    "HuggingFace does not provide a chat-model list API. "
                    "Please type the model ID directly (e.g. 'meta-llama/Meta-Llama-3-8B-Instruct')."
                )

            # ── Custom OpenAI-compatible ──────────────────────────────────
            elif provider_name == "custom-openai":
                if not base_url:
                    raise RuntimeError("Custom OpenAI-compatible provider requires a Base URL.")
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
                    url = base_url.rstrip("/") + "/v1/models"
                    resp = await client.get(url, headers=headers)
                    resp.raise_for_status()
                    return [{"id": m["id"], "name": m.get("id", m["id"])}
                            for m in resp.json().get("data", [])]

            # ── Custom Anthropic-compatible ───────────────────────────────
            elif provider_name == "custom-anthropic":
                # Anthropic-compatible endpoints don't expose a model list.
                raise RuntimeError(
                    "Anthropic-compatible providers don't expose a model list endpoint. "
                    "Please type the model ID directly."
                )

            else:
                raise RuntimeError(f"Unknown provider: {provider_name!r}")

        except RuntimeError:
            raise  # Re-raise our own descriptive errors as-is
        except Exception as e:
            raise RuntimeError(
                f"Failed to fetch model list for '{provider_name}': {e}"
            )

    async def test_connection(
        self,
        provider_name: str,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ) -> dict:
        """Test connectivity by listing models."""
        try:
            models = await self.list_models(provider_name, api_key, base_url)
            return {
                "success": True,
                "message": f"Connected. {len(models)} model(s) available.",
                "models_count": len(models),
            }
        except Exception as e:
            return {"success": False, "message": str(e), "models_count": 0}

    def count_tokens(self, text: str, model: str = "gpt-4") -> int:
        try:
            enc = tiktoken.encoding_for_model(model)
        except KeyError:
            enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))

    def _resolve_model(self, provider_name: str, model: str) -> str:
        prefix = PREFIX_MAP.get(provider_name, "")
        if not prefix or model.startswith(prefix):
            return model
        return f"{prefix}{model}"

    def _build_ollama_payload(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int,
        stream: bool,
        include_thinking: bool = False,
    ) -> dict:
        ollama_messages = self._to_ollama_messages(messages)
        payload = {
            "model": self._normalize_ollama_model(model),
            "messages": ollama_messages,
            "stream": stream,
            "think": include_thinking,
        }
        if max_tokens > 0:
            payload["options"] = {"num_predict": max_tokens}
        return payload

    def _to_ollama_messages(self, messages: list[dict]) -> list[dict]:
        normalized_messages: list[dict] = []
        for message in messages:
            role = str(message.get("role") or "user")
            content = self._normalize_content(message.get("content"))
            if not content and role == "assistant":
                continue
            normalized_messages.append({"role": role, "content": content})
        return normalized_messages

    def _normalize_ollama_model(self, model: str) -> str:
        return model.split("/", 1)[1] if model.startswith("ollama/") else model

    def _ollama_headers(self, api_key: str) -> dict:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        return headers

    def _normalize_ollama_base_url(self, base_url: str | None) -> str:
        base = (base_url or "http://localhost:11434").rstrip("/")
        if base.endswith("/v1"):
            return base[:-3]
        return base

    def _extract_ollama_chunk_text(self, chunk: dict) -> str:
        if not isinstance(chunk, dict):
            return ""

        message = chunk.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str) and content:
                return content

        response = chunk.get("response")
        if isinstance(response, str) and response:
            return response

        return ""

    def _extract_ollama_chunk_thinking(self, chunk: dict) -> str:
        if not isinstance(chunk, dict):
            return ""

        thinking = chunk.get("thinking")
        if isinstance(thinking, str) and thinking:
            return thinking

        message = chunk.get("message")
        if isinstance(message, dict):
            message_thinking = message.get("thinking")
            if isinstance(message_thinking, str) and message_thinking:
                return message_thinking

        return ""

    def _normalize_content(self, content) -> str:
        """Normalize provider-specific message content payloads to plain text."""
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, str):
                    parts.append(block)
                    continue
                if isinstance(block, dict):
                    text = block.get("text")
                    if isinstance(text, str):
                        parts.append(text)
            return "".join(parts).strip()
        return str(content)


llm_gateway = LLMGateway()
