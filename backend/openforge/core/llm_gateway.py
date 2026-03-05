import litellm
from typing import AsyncGenerator
import tiktoken
import httpx
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
                base = (base_url or "http://localhost:11434").rstrip("/")
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
