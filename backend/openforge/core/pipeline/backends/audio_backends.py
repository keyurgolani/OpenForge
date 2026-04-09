"""Audio processing slot backends for the pipeline framework.

Backends:
- AudioMetadataBackend: Audio metadata extraction via mutagen with ffprobe fallback
- TranscriptionBackend: Speech-to-text via resolved SpeechProvider
- AudioCompressionBackend: Audio compression to OGG Opus via ffmpeg
"""
from __future__ import annotations

import asyncio
import json
import logging
import subprocess
import time
from pathlib import Path

from openforge.core.pipeline.registry import register_backend
from openforge.core.pipeline.types import SlotContext, SlotOutput

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# AudioMetadataBackend — mutagen + ffprobe fallback
# ---------------------------------------------------------------------------


class AudioMetadataBackend:
    """Extract audio metadata using mutagen with ffprobe fallback."""

    slot_type = "metadata_extraction"
    backend_name = "mutagen"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            metadata = await asyncio.to_thread(self._extract_metadata, file_path)
            elapsed = int((time.monotonic() - start) * 1000)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                metadata=metadata,
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("AudioMetadataBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    @staticmethod
    def _extract_metadata(file_path: str) -> dict:
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
                        int(fmt.get("bit_rate", 0)) // 1000
                        if fmt.get("bit_rate")
                        else None,
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


# ---------------------------------------------------------------------------
# TranscriptionBackend — delegates to resolved SpeechProvider
# ---------------------------------------------------------------------------


class TranscriptionBackend:
    """Transcribe audio via the configured SpeechProvider."""

    slot_type = "transcription"
    backend_name = "stt-provider"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            from openforge.core.pipeline.stt_providers import resolve_stt_provider

            provider = await resolve_stt_provider(context.db_session)
            result = await provider.transcribe(file_path)

            elapsed = int((time.monotonic() - start) * 1000)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                text=result.text,
                segments=list(result.segments),
                metadata={
                    "language": result.language,
                    "duration": result.duration,
                },
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("TranscriptionBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )


# ---------------------------------------------------------------------------
# AudioCompressionBackend — ffmpeg OGG Opus compression
# ---------------------------------------------------------------------------


class AudioCompressionBackend:
    """Compress audio to OGG Opus format using ffmpeg."""

    slot_type = "audio_compression"
    backend_name = "ffmpeg-opus"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            result = await asyncio.to_thread(self._compress_audio, file_path)
            elapsed = int((time.monotonic() - start) * 1000)
            if result is None:
                # Compression skipped (already OGG/Opus or not smaller)
                return SlotOutput(
                    slot_type=self.slot_type,
                    backend_name=self.backend_name,
                    metadata={"skipped": True},
                    duration_ms=elapsed,
                )
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                metadata=result,
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("AudioCompressionBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    @staticmethod
    def _compress_audio(file_path: str) -> dict | None:
        """Compress audio to OGG Opus format using ffmpeg.

        Returns new file info dict, or ``None`` if compression was skipped.
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
                    "-b:a", "48k",
                    "-vn",
                    "-map_metadata", "-1",
                    str(compressed_path),
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )
            if proc.returncode != 0:
                logger.warning(
                    "ffmpeg compression failed: %s",
                    proc.stderr[-500:] if proc.stderr else "",
                )
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
                compressed_size,
                original_size,
                file_path,
            )
            compressed_path.unlink(missing_ok=True)
            return None

        logger.info(
            "Audio compressed: %s → %s (%.0f%% reduction)",
            file_path,
            compressed_path.name,
            (1 - compressed_size / original_size) * 100,
        )

        # Remove the original and use the compressed file
        src.unlink()

        return {
            "file_path": str(compressed_path),
            "file_size": compressed_size,
            "mime_type": "audio/ogg",
        }


# ---------------------------------------------------------------------------
# Register all backends
# ---------------------------------------------------------------------------

register_backend("metadata_extraction", "mutagen", AudioMetadataBackend())
register_backend("transcription", "stt-provider", TranscriptionBackend())
register_backend("audio_compression", "ffmpeg-opus", AudioCompressionBackend())
