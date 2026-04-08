"""Liquid Audio engine — lazy-loaded LFM2.5-Audio-1.5B for STT and TTS.

The model and processor are loaded once and cached globally, shared
between STT and TTS paths since it is a single unified model.
"""
from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger("openforge.core.liquid_audio")

_liquid_model = None
_liquid_processor = None

_MODEL_HF_ID = "LiquidAI/LFM2.5-Audio-1.5B"


def get_liquid_audio(models_root: str) -> tuple:
    """Return (model, processor), loading from cache or disk on first call.

    Raises RuntimeError if the liquid_audio package is not installed.
    """
    global _liquid_model, _liquid_processor

    if _liquid_model is not None and _liquid_processor is not None:
        return _liquid_model, _liquid_processor

    try:
        from liquid_audio import LiquidAudioModel, LiquidAudioProcessor
    except ImportError:
        raise RuntimeError(
            "liquid-audio package is not installed. "
            "Install it with: pip install liquid-audio"
        )

    cache_dir = str(Path(models_root) / "liquid-audio")
    logger.info("Loading LFM2.5-Audio model from %s", cache_dir)

    _liquid_processor = LiquidAudioProcessor.from_pretrained(
        _MODEL_HF_ID, cache_dir=cache_dir,
    )
    _liquid_model = LiquidAudioModel.from_pretrained(
        _MODEL_HF_ID, cache_dir=cache_dir,
    )

    logger.info("LFM2.5-Audio model loaded.")
    return _liquid_model, _liquid_processor


def transcribe(audio_path: str, models_root: str) -> dict:
    """Transcribe audio file using LFM2.5-Audio in ASR mode.

    Returns dict with "text" and "segments" keys matching the faster-whisper format.
    """
    model, processor = get_liquid_audio(models_root)

    inputs = processor.process_audio(audio_path)
    result = model.generate_sequential(inputs, mode="asr")
    text = processor.decode_text(result)

    return {"text": text.strip(), "segments": []}


def synthesize(text: str, models_root: str) -> bytes:
    """Synthesize speech from text using LFM2.5-Audio in TTS mode.

    Returns WAV audio bytes at 24kHz.
    """
    import io
    import wave

    model, processor = get_liquid_audio(models_root)

    inputs = processor.process_text(text)
    result = model.generate_sequential(inputs, mode="tts")
    waveform = processor.decode_audio(result)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        import numpy as np
        audio_int16 = (waveform * 32767).astype(np.int16)
        wf.writeframes(audio_int16.tobytes())
    return buf.getvalue()
