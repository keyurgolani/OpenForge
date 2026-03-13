"""Audio Processing Pipeline.

Full pipeline:
1. Extract metadata via mutagen/ffprobe (duration, format, sample rate, channels)
2. Transcribe via Whisper (configurable model size)
3. Compress audio to OGG Opus via ffmpeg (replaces original if smaller)
4. Generate AI title from transcript
5. Embed transcript text → openforge_knowledge
"""
from __future__ import annotations

import asyncio
import json
import logging
import subprocess
from pathlib import Path
from typing import Optional
from uuid import UUID

logger = logging.getLogger("openforge.processors.audio")

_whisper_models: dict = {}

# Map HuggingFace-style IDs (openai/whisper-base) → Whisper CLI model names
_HF_TO_WHISPER = {
    "openai/whisper-tiny": "tiny",
    "openai/whisper-base": "base",
    "openai/whisper-small": "small",
    "openai/whisper-medium": "medium",
    "openai/whisper-large-v2": "large-v2",
    "openai/whisper-large-v3": "large-v3",
}


def _parse_whisper_model_name(config_value: str) -> str:
    """Convert a config value like 'openai/whisper-base' to 'base'."""
    if not config_value:
        return "base"
    # Check HuggingFace-style ID
    if config_value in _HF_TO_WHISPER:
        return _HF_TO_WHISPER[config_value]
    # Already a raw name like "base", "small", etc.
    return config_value


def _get_whisper_download_root() -> str:
    """Return the Whisper model download directory."""
    from openforge.config import get_settings
    return str(Path(get_settings().models_root) / "whisper")


def _get_whisper_model(model_size: str = "base", download_root: Optional[str] = None):
    """Lazy-load Whisper model (cached per model size)."""
    global _whisper_models
    cache_key = f"{model_size}:{download_root or 'default'}"
    if cache_key not in _whisper_models:
        import whisper

        if download_root is None:
            download_root = _get_whisper_download_root()

        # Check if model file exists before loading
        model_path = Path(download_root) / f"{model_size}.pt"
        if not model_path.exists():
            raise RuntimeError(
                f"Whisper model '{model_size}' is not downloaded. "
                f"Download it from Settings > Audio before processing audio files."
            )

        logger.info("Loading Whisper model: %s from %s", model_size, download_root)
        _whisper_models[cache_key] = whisper.load_model(
            model_size, download_root=download_root
        )
        logger.info("Whisper model '%s' loaded.", model_size)
    return _whisper_models[cache_key]


class AudioProcessor:
    """Complete audio knowledge processing pipeline."""

    async def process(
        self,
        knowledge_id: UUID,
        file_path: str,
        workspace_id: UUID,
        db_session=None,
    ) -> dict:
        """Run the full audio processing pipeline. Returns metadata dict."""

        result = {
            "metadata": {},
            "transcript": "",
            "segments": [],
            "ai_title": None,
        }

        # ── Step 1: Audio metadata ──
        try:
            result["metadata"] = self._extract_metadata(file_path)
        except Exception as e:
            logger.warning("Audio metadata extraction failed for %s: %s", knowledge_id, e)

        # ── Step 2: Whisper transcription ──
        whisper_model_size = "base"
        if db_session:
            try:
                whisper_model_size = await self._get_whisper_model_size(db_session)
            except Exception:
                pass

        try:
            # Run CPU-bound transcription in a thread pool to avoid blocking
            # the async event loop (which would starve health checks and cause
            # Docker to restart the container).
            transcript_result = await asyncio.to_thread(
                self._transcribe, file_path, whisper_model_size
            )
            result["transcript"] = transcript_result.get("text", "")
            result["segments"] = transcript_result.get("segments", [])
        except Exception as e:
            logger.warning("Whisper transcription failed for %s: %s", knowledge_id, e)

        # ── Step 2b: Compress audio file ──
        try:
            compress_result = await asyncio.to_thread(
                self._compress_audio, file_path
            )
            if compress_result:
                result["compressed_file_path"] = compress_result["file_path"]
                result["compressed_file_size"] = compress_result["file_size"]
                result["compressed_mime_type"] = compress_result["mime_type"]
                # Re-extract metadata from the compressed file
                try:
                    result["metadata"] = self._extract_metadata(compress_result["file_path"])
                except Exception:
                    pass
        except Exception as e:
            logger.warning("Audio compression failed for %s: %s", knowledge_id, e)

        # ── Step 3: AI title from transcript ──
        if result["transcript"] and db_session:
            try:
                result["ai_title"] = await self._generate_title(
                    result["transcript"], workspace_id, db_session
                )
            except Exception as e:
                logger.warning("AI title generation failed for %s: %s", knowledge_id, e)

        # ── Step 4: Embed transcript ──
        if result["transcript"] and len(result["transcript"].strip()) >= 20:
            try:
                await self._embed_text(knowledge_id, workspace_id, result["transcript"])
            except Exception as e:
                logger.warning("Text embedding failed for %s: %s", knowledge_id, e)

        metadata = result["metadata"] or {}

        output: dict = {
            "file_metadata": {
                "duration": metadata.get("duration"),
                "format": metadata.get("format"),
                "sample_rate": metadata.get("sample_rate"),
                "channels": metadata.get("channels"),
                "bitrate": metadata.get("bitrate"),
                "segments": [
                    {"start": s.get("start"), "end": s.get("end"), "text": s.get("text")}
                    for s in result["segments"][:500]  # Limit stored segments
                ],
            },
            "content": result["transcript"] or "",
            "ai_title": result["ai_title"],
        }

        if result.get("compressed_file_path"):
            output["file_path"] = result["compressed_file_path"]
            output["file_size"] = result["compressed_file_size"]
            output["mime_type"] = result["compressed_mime_type"]

        return output

    def _extract_metadata(self, file_path: str) -> dict:
        """Extract audio metadata using mutagen and ffprobe."""
        metadata: dict = {}

        # Try mutagen first
        try:
            import mutagen

            audio = mutagen.File(file_path)
            if audio is not None:
                if audio.info:
                    metadata["duration"] = getattr(audio.info, "length", None)
                    metadata["sample_rate"] = getattr(audio.info, "sample_rate", None)
                    metadata["channels"] = getattr(audio.info, "channels", None)
                    metadata["bitrate"] = (
                        getattr(audio.info, "bitrate", 0) // 1000
                        if getattr(audio.info, "bitrate", None)
                        else None
                    )
                # File format from extension
                metadata["format"] = Path(file_path).suffix.upper().lstrip(".")
        except Exception as e:
            logger.debug("mutagen failed, trying ffprobe: %s", e)

        # Fallback to ffprobe for missing fields
        if not metadata.get("duration"):
            try:
                probe = subprocess.run(
                    [
                        "ffprobe",
                        "-v", "quiet",
                        "-print_format", "json",
                        "-show_format",
                        "-show_streams",
                        file_path,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if probe.returncode == 0:
                    info = json.loads(probe.stdout)
                    fmt = info.get("format", {})
                    metadata.setdefault("duration", float(fmt.get("duration", 0)))
                    metadata.setdefault("format", fmt.get("format_name", "").upper())
                    metadata.setdefault(
                        "bitrate",
                        int(fmt.get("bit_rate", 0)) // 1000 if fmt.get("bit_rate") else None,
                    )
                    for stream in info.get("streams", []):
                        if stream.get("codec_type") == "audio":
                            metadata.setdefault(
                                "sample_rate", int(stream.get("sample_rate", 0))
                            )
                            metadata.setdefault("channels", stream.get("channels"))
                            break
            except Exception as e:
                logger.debug("ffprobe failed: %s", e)

        return metadata

    def _compress_audio(self, file_path: str) -> Optional[dict]:
        """Compress audio to OGG Opus format using ffmpeg.

        Replaces the original file with the compressed version.
        Returns new file info dict, or None if compression was skipped.
        """
        src = Path(file_path)
        if not src.exists():
            return None

        # Skip if already OGG Opus
        if src.suffix.lower() in (".ogg", ".opus"):
            return None

        compressed_path = src.with_suffix(".ogg")

        try:
            proc = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", str(src),
                    "-c:a", "libopus",
                    "-b:a", "48k",       # 48 kbps — very good for speech
                    "-vn",               # strip non-audio streams
                    "-map_metadata", "-1",  # strip metadata to save space
                    str(compressed_path),
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )
            if proc.returncode != 0:
                logger.warning("ffmpeg compression failed: %s", proc.stderr[-500:] if proc.stderr else "")
                # Clean up partial output
                compressed_path.unlink(missing_ok=True)
                return None
        except subprocess.TimeoutExpired:
            logger.warning("ffmpeg compression timed out for %s", file_path)
            compressed_path.unlink(missing_ok=True)
            return None

        compressed_size = compressed_path.stat().st_size
        original_size = src.stat().st_size

        # Only keep compressed version if it's actually smaller
        if compressed_size >= original_size:
            logger.info(
                "Compressed file not smaller (%d >= %d), keeping original: %s",
                compressed_size, original_size, file_path,
            )
            compressed_path.unlink(missing_ok=True)
            return None

        logger.info(
            "Audio compressed: %s → %s (%.0f%% reduction)",
            file_path, compressed_path.name,
            (1 - compressed_size / original_size) * 100,
        )

        # Remove the original and use the compressed file
        src.unlink()

        return {
            "file_path": str(compressed_path),
            "file_size": compressed_size,
            "mime_type": "audio/ogg",
        }

    def _transcribe(self, file_path: str, model_size: str = "base") -> dict:
        """Transcribe audio using Whisper."""
        download_root = _get_whisper_download_root()
        model = _get_whisper_model(model_size, download_root=download_root)

        # Transcribe with timestamps
        result = model.transcribe(
            file_path,
            fp16=False,  # Use fp32 for CPU compatibility; fp16 requires CUDA
            verbose=False,
        )

        return {
            "text": result.get("text", "").strip(),
            "segments": [
                {
                    "start": seg.get("start"),
                    "end": seg.get("end"),
                    "text": seg.get("text", "").strip(),
                }
                for seg in result.get("segments", [])
            ],
        }

    async def _get_whisper_model_size(self, db_session) -> str:
        """Read whisper model from config table (local_whisper_model key)."""
        from sqlalchemy import select
        from openforge.db.models import Config

        result = await db_session.execute(
            select(Config).where(Config.key == "local_whisper_model")
        )
        row = result.scalar_one_or_none()
        if row and row.value:
            # Value is stored as the HF ID (e.g. "openai/whisper-base") or raw name
            raw = row.value
            if isinstance(raw, dict):
                raw = raw.get("value", "")
            return _parse_whisper_model_name(str(raw)) if raw else "base"
        return "base"

    async def _generate_title(
        self, transcript: str, workspace_id: UUID, db_session
    ) -> Optional[str]:
        """Generate AI title from transcript text."""
        from openforge.core.llm_gateway import llm_gateway
        from openforge.core.prompt_catalogue import resolve_prompt_text
        from openforge.services.llm_service import llm_service

        provider_name, api_key, model, base_url = (
            await llm_service.get_provider_for_workspace(db_session, workspace_id)
        )

        prompt = await resolve_prompt_text(
            db_session,
            "audio_title_generation",
            transcript=transcript[:2000],
        )

        title = await llm_gateway.chat(
            messages=[
                {"role": "system", "content": prompt},
            ],
            provider_name=provider_name,
            api_key=api_key,
            model=model,
            base_url=base_url,
            max_tokens=30,
        )

        return title.strip().strip('"').strip("'") if title else None

    async def _embed_text(
        self, knowledge_id: UUID, workspace_id: UUID, text: str
    ) -> None:
        """Embed transcript into openforge_knowledge collection."""
        from openforge.core.knowledge_processor import knowledge_processor

        await knowledge_processor.process_knowledge(
            knowledge_id=knowledge_id,
            workspace_id=workspace_id,
            content=text,
            knowledge_type="audio",
            title=None,
            tags=[],
        )


audio_processor = AudioProcessor()
