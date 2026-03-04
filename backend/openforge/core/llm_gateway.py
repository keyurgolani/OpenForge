import litellm
from typing import AsyncGenerator
import tiktoken
import httpx
import logging

logger = logging.getLogger("openforge.llm")

FALLBACK_MODELS = {
    "openai": [
        {"id": "gpt-4o", "name": "GPT-4o"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
        {"id": "gpt-4", "name": "GPT-4"},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"},
        {"id": "o1", "name": "o1"},
        {"id": "o1-mini", "name": "o1-mini"},
    ],
    "anthropic": [
        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
        {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku"},
        {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
        {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet"},
        {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
    ],
    "gemini": [
        {"id": "gemini-2.0-flash-exp", "name": "Gemini 2.0 Flash"},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
        {"id": "gemini-1.0-pro", "name": "Gemini 1.0 Pro"},
    ],
    # Note: Ollama is intentionally absent — models are user-installed and vary per instance.
    # Ollama models are fetched live from /api/tags; errors surface as real error messages.
    "groq": [
        {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B Versatile"},
        {"id": "llama-3.1-70b-versatile", "name": "Llama 3.1 70B Versatile"},
        {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B"},
        {"id": "gemma2-9b-it", "name": "Gemma2 9B"},
    ],
    "deepseek": [
        {"id": "deepseek-chat", "name": "DeepSeek Chat"},
        {"id": "deepseek-reasoner", "name": "DeepSeek Reasoner"},
    ],
    "mistral": [
        {"id": "mistral-large-latest", "name": "Mistral Large"},
        {"id": "mistral-medium-latest", "name": "Mistral Medium"},
        {"id": "mistral-small-latest", "name": "Mistral Small"},
        {"id": "open-mistral-7b", "name": "Open Mistral 7B"},
    ],
    "xai": [
        {"id": "grok-2-1212", "name": "Grok 2"},
        {"id": "grok-2-vision-1212", "name": "Grok 2 Vision"},
        {"id": "grok-beta", "name": "Grok Beta"},
    ],
    "cohere": [
        {"id": "command-r-plus-08-2024", "name": "Command R+"},
        {"id": "command-r-08-2024", "name": "Command R"},
        {"id": "command-light", "name": "Command Light"},
    ],
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
        """Non-streaming chat completion."""
        response = await litellm.acompletion(
            model=self._resolve_model(provider_name, model),
            messages=messages,
            api_key=api_key or None,
            api_base=base_url,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    async def stream(
        self,
        messages: list[dict],
        provider_name: str,
        api_key: str,
        model: str,
        base_url: str | None = None,
        max_tokens: int = 2000,
    ) -> AsyncGenerator[str, None]:
        """Streaming chat completion. Yields token strings."""
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
        """Fetch available models. Falls back to static list on failure."""
        try:
            if provider_name == "ollama":
                base = base_url or "http://localhost:11434"
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{base}/api/tags")
                    resp.raise_for_status()
                    data = resp.json()
                    return [
                        {"id": m["name"], "name": m["name"]}
                        for m in data.get("models", [])
                    ]

            elif provider_name == "openai":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {"Authorization": f"Bearer {api_key}"}
                    url = (base_url or "https://api.openai.com") + "/v1/models"
                    resp = await client.get(url, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    models = [
                        {"id": m["id"], "name": m["id"]}
                        for m in data.get("data", [])
                        if "gpt" in m["id"] or "o1" in m["id"] or "o3" in m["id"]
                    ]
                    return models or FALLBACK_MODELS.get(provider_name, [])

            elif provider_name == "anthropic":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
                    resp = await client.get("https://api.anthropic.com/v1/models", headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    return [
                        {"id": m["id"], "name": m.get("display_name", m["id"])}
                        for m in data.get("data", [])
                    ]

            elif provider_name == "gemini":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(
                        f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return [
                        {"id": m["name"].replace("models/", ""), "name": m.get("displayName", m["name"])}
                        for m in data.get("models", [])
                        if "generateContent" in m.get("supportedGenerationMethods", [])
                    ]

            elif provider_name == "openrouter":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {"Authorization": f"Bearer {api_key}"}
                    resp = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    return [
                        {"id": m["id"], "name": m.get("name", m["id"])}
                        for m in data.get("data", [])
                    ]

            elif provider_name == "xai":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {"Authorization": f"Bearer {api_key}"}
                    resp = await client.get("https://api.x.ai/v1/models", headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    return [
                        {"id": m["id"], "name": m.get("id", m["id"])}
                        for m in data.get("data", [])
                    ]

            elif provider_name == "cohere":
                async with httpx.AsyncClient(timeout=10.0) as client:
                    headers = {"Authorization": f"Bearer {api_key}"}
                    resp = await client.get("https://api.cohere.com/v1/models", headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    return [
                        {"id": m["name"], "name": m.get("name", m["name"])}
                        for m in data.get("models", [])
                        if "chat" in m.get("endpoints", [])
                    ]

        except Exception as e:
            # For Ollama: re-raise so the user sees the real error (bad URL, not running, etc.)
            # A fallback list of generic model names would be misleading since Ollama models
            # are user-installed and the hardcoded list would never match their local install.
            if provider_name == "ollama":
                raise RuntimeError(
                    f"Could not reach Ollama at {base_url or 'http://localhost:11434'}/api/tags. "
                    f"Make sure Ollama is running and the base URL is correct. Error: {e}"
                )
            logger.warning(f"Failed to fetch models for {provider_name}: {e}. Using fallback list.")

        return FALLBACK_MODELS.get(provider_name, [])

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
                "message": f"Connected. {len(models)} models available.",
                "models_count": len(models),
            }
        except Exception as e:
            return {"success": False, "message": str(e), "models_count": 0}

    def count_tokens(self, text: str, model: str = "gpt-4") -> int:
        """Approximate token count using tiktoken."""
        try:
            enc = tiktoken.encoding_for_model(model)
        except KeyError:
            enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))

    def _resolve_model(self, provider_name: str, model: str) -> str:
        """LiteLLM requires provider-prefixed model names for some providers."""
        prefix_map = {
            "anthropic": "anthropic/",
            "gemini": "gemini/",
            "ollama": "ollama/",
            "deepseek": "deepseek/",
            "groq": "groq/",
            "mistral": "mistral/",
            "openrouter": "openrouter/",
            "xai": "xai/",
            "cohere": "cohere/",
        }
        prefix = prefix_map.get(provider_name, "")
        if not prefix or model.startswith(prefix):
            return model
        return f"{prefix}{model}"


llm_gateway = LLMGateway()
