"""Speech-to-Text provider abstraction.

Pluggable STT backends used by audio and video pipelines.
Provider selection is driven by the ``stt_provider`` key in the config table.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.core.pipeline.types import TimestampSegment, TranscriptionResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Whisper helpers (ported from audio_processor.py)
# ---------------------------------------------------------------------------

_whisper_models: dict = {}

_HF_TO_WHISPER = {
    "openai/whisper-tiny": "tiny",
    "openai/whisper-base": "base",
    "openai/whisper-small": "small",
    "openai/whisper-medium": "medium",
    "openai/whisper-large-v2": "large-v2",
    "openai/whisper-large-v3": "large-v3",
}


def _parse_whisper_model_name(config_value: str) -> str:
    """Convert a config value like ``openai/whisper-base`` to ``base``."""
    if not config_value:
        return "base"
    if config_value in _HF_TO_WHISPER:
        return _HF_TO_WHISPER[config_value]
    return config_value


def _get_whisper_download_root() -> str:
    """Return the Whisper model download directory."""
    from openforge.common.config import get_settings

    return str(Path(get_settings().models_root) / "whisper")


def _detect_device() -> tuple[str, str]:
    """Detect the best available device and matching compute type.

    Returns ``(device, compute_type)`` — ``("cuda", "float16")`` when a CUDA
    GPU is available, otherwise ``("cpu", "int8")``.
    """
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda", "float16"
    except ImportError:
        pass
    return "cpu", "int8"


def _get_whisper_model(model_size: str = "base", download_root: Optional[str] = None):
    """Lazy-load faster-whisper model (cached per model size)."""
    global _whisper_models
    cache_key = f"{model_size}:{download_root or 'default'}"
    if cache_key not in _whisper_models:
        from faster_whisper import WhisperModel

        if download_root is None:
            download_root = _get_whisper_download_root()

        device, compute_type = _detect_device()
        logger.info(
            "Loading faster-whisper model: %s (device=%s, compute_type=%s)",
            model_size,
            device,
            compute_type,
        )
        _whisper_models[cache_key] = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            download_root=download_root,
        )
        logger.info("faster-whisper model '%s' loaded.", model_size)
    return _whisper_models[cache_key]


# ---------------------------------------------------------------------------
# SpeechProvider protocol
# ---------------------------------------------------------------------------


class SpeechProvider(Protocol):
    """Protocol for speech-to-text backends."""

    provider_name: str

    async def transcribe(
        self, audio_path: str, language: str | None = None
    ) -> TranscriptionResult: ...


# ---------------------------------------------------------------------------
# FasterWhisperProvider (default)
# ---------------------------------------------------------------------------


class FasterWhisperProvider:
    """STT provider wrapping faster-whisper."""

    provider_name: str = "faster-whisper"

    async def transcribe(
        self, audio_path: str, language: str | None = None
    ) -> TranscriptionResult:
        result = await asyncio.to_thread(self._transcribe_sync, audio_path, language)
        return result

    @staticmethod
    def _transcribe_sync(
        audio_path: str, language: str | None = None
    ) -> TranscriptionResult:
        download_root = _get_whisper_download_root()
        model = _get_whisper_model("base", download_root=download_root)

        kwargs: dict = {"beam_size": 5}
        if language:
            kwargs["language"] = language

        segments_iter, info = model.transcribe(audio_path, **kwargs)

        segments: list[TimestampSegment] = []
        text_parts: list[str] = []
        for seg in segments_iter:
            segments.append(
                TimestampSegment(start=seg.start, end=seg.end, text=seg.text.strip())
            )
            text_parts.append(seg.text.strip())

        # Sort segments by start timestamp ascending
        segments.sort(key=lambda s: s.start)

        return TranscriptionResult(
            text=" ".join(text_parts),
            segments=segments,
            language=info.language if hasattr(info, "language") else language,
            duration=info.duration if hasattr(info, "duration") else None,
        )


# ---------------------------------------------------------------------------
# LiquidAudioProvider
# ---------------------------------------------------------------------------


class LiquidAudioProvider:
    """STT provider wrapping the liquid_audio_engine."""

    provider_name: str = "liquid-audio"

    async def transcribe(
        self, audio_path: str, language: str | None = None
    ) -> TranscriptionResult:
        result = await asyncio.to_thread(self._transcribe_sync, audio_path)
        return result

    @staticmethod
    def _transcribe_sync(audio_path: str) -> TranscriptionResult:
        from openforge.common.config import get_settings
        from openforge.core.liquid_audio_engine import transcribe as liquid_transcribe

        raw = liquid_transcribe(audio_path, get_settings().models_root)
        # liquid engine returns empty segments
        return TranscriptionResult(
            text=raw.get("text", ""),
            segments=[],
        )


# ---------------------------------------------------------------------------
# CohereTranscribeProvider
# ---------------------------------------------------------------------------


class CohereTranscribeProvider:
    """STT provider calling the Cohere Transcribe API via httpx."""

    provider_name: str = "cohere"

    _API_URL = "https://api.cohere.com/v2/audio/transcriptions"

    async def transcribe(
        self, audio_path: str, language: str | None = None
    ) -> TranscriptionResult:
        import httpx

        api_key = await self._get_api_key()
        if not api_key:
            raise RuntimeError("Cohere API key not configured (config key: cohere_api_key)")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=600) as client:
            with open(audio_path, "rb") as f:
                files = {"file": (Path(audio_path).name, f, "audio/mpeg")}
                data: dict[str, str] = {}
                if language:
                    data["language"] = language

                resp = await client.post(
                    self._API_URL,
                    headers=headers,
                    files=files,
                    data=data,
                )
                resp.raise_for_status()
                body = resp.json()

        text = body.get("text", "")
        raw_segments = body.get("segments", [])

        segments = [
            TimestampSegment(
                start=seg.get("start", 0.0),
                end=seg.get("end", 0.0),
                text=seg.get("text", ""),
            )
            for seg in raw_segments
        ]
        # Sort segments by start timestamp ascending
        segments.sort(key=lambda s: s.start)

        return TranscriptionResult(
            text=text,
            segments=segments,
            language=body.get("language"),
            duration=body.get("duration"),
        )

    @staticmethod
    async def _get_api_key() -> str | None:
        """Read the Cohere API key from the config table.

        Uses a fresh short-lived DB session so the provider can be called
        outside of an existing session context.
        """
        from openforge.db.postgres import async_session_factory

        async with async_session_factory() as session:
            from openforge.db.models import Config

            result = await session.execute(
                select(Config).where(Config.key == "cohere_api_key")
            )
            row = result.scalar_one_or_none()
            if row and row.value:
                val = row.value
                if isinstance(val, dict):
                    return val.get("value", "")
                return str(val)
        return None


# ---------------------------------------------------------------------------
# Provider registry and resolution
# ---------------------------------------------------------------------------

STT_PROVIDERS: dict[str, type[SpeechProvider]] = {
    "faster-whisper": FasterWhisperProvider,
    "liquid-audio": LiquidAudioProvider,
    "cohere": CohereTranscribeProvider,
}


async def resolve_stt_provider(db_session: AsyncSession) -> SpeechProvider:
    """Resolve the active STT provider from the config table.

    Reads the ``stt_provider`` key. Falls back to
    :class:`FasterWhisperProvider` when the key is missing or the
    configured provider fails to instantiate.
    """
    from openforge.db.models import Config

    provider_name = "faster-whisper"
    try:
        result = await db_session.execute(
            select(Config).where(Config.key == "stt_provider")
        )
        config = result.scalar_one_or_none()
        if config and config.value:
            val = config.value
            if isinstance(val, dict):
                provider_name = val.get("value", "faster-whisper")
            else:
                provider_name = str(val)
    except Exception:
        logger.warning("Failed to read stt_provider config, using default", exc_info=True)

    provider_cls = STT_PROVIDERS.get(provider_name)
    if provider_cls is None:
        logger.warning(
            "Unknown STT provider '%s', falling back to faster-whisper",
            provider_name,
        )
        return FasterWhisperProvider()

    try:
        return provider_cls()
    except Exception:
        logger.warning(
            "Failed to instantiate STT provider '%s', falling back to faster-whisper",
            provider_name,
            exc_info=True,
        )
        return FasterWhisperProvider()
