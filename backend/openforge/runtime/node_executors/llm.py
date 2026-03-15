"""LLM node executor.

Integrates with Phase 7 profiles, Phase 3 prompts/policies, and the LLM
gateway to produce real model-backed responses when configured.  Falls back
to deterministic static responses for testing and template-driven workflows.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionError, NodeExecutionResult

logger = logging.getLogger("openforge.runtime.node_executors.llm")


class LLMNodeExecutor(BaseNodeExecutor):
    """LLM node executor with profile, prompt, and policy integration.

    Execution modes (selected by node config):

    * **static_response / response_template** -- deterministic text output for
      testing and simple template workflows.  No LLM call is made.
    * **live** (default when no static config) -- resolves a profile, renders
      the system prompt through the managed prompt catalogue, evaluates policy,
      calls the LLM gateway, and optionally validates the output against the
      profile's output contract.
    """

    supported_types = ("llm",)

    def __init__(
        self,
        *,
        profile_registry=None,
        llm_service=None,
        llm_gateway=None,
        policy_engine=None,
    ) -> None:
        self._profile_registry = profile_registry
        self._llm_service = llm_service
        self._llm_gateway = llm_gateway
        self._policy_engine = policy_engine

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {}) or {}
        output_key = config.get("output_key", "llm_output")

        # ----- deterministic mode (backwards compatible) ----- #
        if config.get("static_response") is not None:
            state[output_key] = str(config["static_response"]).format(**state)
            return NodeExecutionResult(state=state, output={output_key: state[output_key]})

        if config.get("response_template") is not None:
            state[output_key] = str(config["response_template"]).format(**state)
            return NodeExecutionResult(state=state, output={output_key: state[output_key]})

        # ----- live LLM mode ----- #
        return await self._execute_live(context, state, config, output_key)

    # ------------------------------------------------------------------ #
    # Live LLM execution
    # ------------------------------------------------------------------ #

    async def _execute_live(
        self,
        context: NodeExecutionContext,
        state: dict[str, Any],
        config: dict[str, Any],
        output_key: str,
    ) -> NodeExecutionResult:
        # Resolve profile
        profile = await self._resolve_profile(context, config)

        # Render system prompt through Phase 3 prompt catalogue
        system_prompt = await self._resolve_system_prompt(context, config, profile)

        # Build messages
        messages = self._build_messages(state, config, system_prompt)

        # Evaluate policy if applicable
        await self._evaluate_policy(context, profile)

        # Call LLM
        response_text = await self._call_llm(context, config, profile, messages)

        # Validate output contract if applicable
        validated = self._validate_output(response_text, config, profile)

        state[output_key] = validated
        return NodeExecutionResult(state=state, output={output_key: validated})

    async def _resolve_profile(
        self, context: NodeExecutionContext, config: dict[str, Any]
    ) -> Any:
        """Resolve agent profile from Phase 7 profile registry."""
        profile_id = config.get("profile_id") or config.get("profile_slug")
        if profile_id and self._profile_registry:
            profile = self._profile_registry.get(str(profile_id))
            if profile is not None:
                return profile
            logger.warning("Profile '%s' not found in registry, using default", profile_id)

        if self._profile_registry:
            return self._profile_registry.get_default()
        return None

    async def _resolve_system_prompt(
        self, context: NodeExecutionContext, config: dict[str, Any], profile: Any
    ) -> str:
        """Render system prompt through Phase 3 managed prompt catalogue."""
        # Direct prompt override in config takes precedence
        if config.get("system_prompt"):
            return str(config["system_prompt"])

        # Resolve through profile's prompt ref and the prompt domain
        if profile is not None:
            prompt_ref = getattr(profile, "system_prompt_ref", None)
            if prompt_ref:
                try:
                    from openforge.domains.prompts.service import resolve_prompt_text

                    db = getattr(context.coordinator, "db", None)
                    if db is not None:
                        ref = prompt_ref
                        if ref.startswith("catalogue:"):
                            ref = ref.split(":", 1)[1]
                        return await resolve_prompt_text(db, ref)
                except Exception:
                    logger.debug("Failed to resolve prompt from domain service, using raw ref", exc_info=True)
                    return prompt_ref

        return config.get("fallback_prompt", "You are a helpful assistant.")

    def _build_messages(
        self, state: dict[str, Any], config: dict[str, Any], system_prompt: str
    ) -> list[dict[str, str]]:
        """Build LLM message list from state and config."""
        messages: list[dict[str, str]] = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        # User message from config template or state
        user_template = config.get("user_prompt_template")
        if user_template:
            try:
                user_content = str(user_template).format(**state)
            except (KeyError, IndexError):
                user_content = str(user_template)
            messages.append({"role": "user", "content": user_content})
        elif config.get("user_prompt_key"):
            content = state.get(config["user_prompt_key"], "")
            if content:
                messages.append({"role": "user", "content": str(content)})
        elif state.get("user_input"):
            messages.append({"role": "user", "content": str(state["user_input"])})

        # Include any prior conversation from state
        prior_messages = state.get(config.get("messages_key", "__messages__"))
        if isinstance(prior_messages, list):
            messages.extend(prior_messages)

        return messages

    async def _evaluate_policy(self, context: NodeExecutionContext, profile: Any) -> None:
        """Evaluate policy constraints before LLM call."""
        if self._policy_engine is None or profile is None:
            return

        # Check if profile allows LLM execution
        if hasattr(profile, "status") and profile.status != "active":
            raise NodeExecutionError(
                f"Profile '{getattr(profile, 'slug', 'unknown')}' is not active",
                code="policy_blocked",
            )

    async def _call_llm(
        self,
        context: NodeExecutionContext,
        config: dict[str, Any],
        profile: Any,
        messages: list[dict[str, str]],
    ) -> str:
        """Call LLM through the gateway with provider resolution."""
        if self._llm_gateway is None or self._llm_service is None:
            # No gateway available - return empty or raise
            logger.warning("LLM gateway not configured, returning empty response")
            return ""

        try:
            # Resolve provider from profile's model policy or workspace default
            db = getattr(context.coordinator, "db", None)
            workspace_id = getattr(context.run, "workspace_id", None)

            provider_override = None
            model_override = config.get("model")
            if profile:
                provider_override = getattr(profile, "provider_override_id", None)
                if not model_override:
                    model_override = getattr(profile, "model_override", None)

            provider_name, api_key, model, base_url = (
                await self._llm_service.get_provider_for_workspace(
                    db,
                    workspace_id,
                    provider_id=provider_override,
                    model_override=model_override,
                )
            )

            max_tokens = config.get("max_tokens", 4096)

            # Use non-streaming chat for workflow nodes
            response = await self._llm_gateway.chat(
                messages=messages,
                provider_name=provider_name,
                api_key=api_key,
                model=model,
                base_url=base_url,
                max_tokens=max_tokens,
            )

            # Extract text content from response
            if isinstance(response, str):
                return response
            if hasattr(response, "choices") and response.choices:
                choice = response.choices[0]
                if hasattr(choice, "message") and hasattr(choice.message, "content"):
                    return choice.message.content or ""
            return str(response)

        except Exception as exc:
            error_str = str(exc).lower()
            if "timeout" in error_str:
                raise NodeExecutionError(str(exc), code="llm_timeout", retryable=True) from exc
            if "rate" in error_str and "limit" in error_str:
                raise NodeExecutionError(str(exc), code="llm_rate_limit", retryable=True) from exc
            raise NodeExecutionError(
                f"LLM call failed: {exc}", code="llm_call_failed"
            ) from exc

    def _validate_output(
        self, response: str, config: dict[str, Any], profile: Any
    ) -> str:
        """Validate output against output contract if applicable."""
        if not profile:
            return response

        # Check structured output requirement
        require_structured = getattr(profile, "require_structured_output", False)
        if require_structured and config.get("output_schema"):
            try:
                parsed = json.loads(response)
                # Basic schema validation - check required keys
                schema = config["output_schema"]
                required = schema.get("required", [])
                missing = [k for k in required if k not in parsed]
                if missing:
                    logger.warning(
                        "LLM output missing required fields: %s", missing
                    )
            except json.JSONDecodeError:
                logger.warning("LLM output is not valid JSON but structured output was required")

        return response
