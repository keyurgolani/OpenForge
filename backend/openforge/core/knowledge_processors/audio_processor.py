"""Audio Processing Pipeline.

Full pipeline:
1. Extract metadata via mutagen/ffprobe (duration, format, sample rate, channels)
2. Transcribe via Whisper (configurable model size)
3. Generate AI title from transcript
4. Embed transcript text → openforge_knowledge
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional
from uuid import UUID

logger = logging.getLogger("openforge.processors.audio")

_whisper_models: dict = {}


def _get_whisper_model(model_size: str = "medium"):
    """Lazy-load Whisper model (cached per model size)."""
    global _whisper_models
    if model_size not in _whisper_models:
        import whisper

        logger.info("Loading Whisper model: %s", model_size)
        _whisper_models[model_size] = whisper.load_model(model_size)
        logger.info("Whisper model '%s' loaded.", model_size)
    return _whisper_models[model_size]


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
        whisper_model_size = "medium"
        if db_session:
            try:
                whisper_model_size = await self._get_whisper_model_size(db_session)
            except Exception:
                pass

        try:
            transcript_result = self._transcribe(file_path, whisper_model_size)
            result["transcript"] = transcript_result.get("text", "")
            result["segments"] = transcript_result.get("segments", [])
        except Exception as e:
            logger.warning("Whisper transcription failed for %s: %s", knowledge_id, e)

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

        # Build content from transcript
        content_parts = []
        if result["transcript"]:
            content_parts.append(f"## Transcript\n\n{result['transcript']}")

        metadata = result["metadata"]
        if metadata:
            meta_parts = []
            if metadata.get("duration"):
                minutes = int(metadata["duration"] // 60)
                seconds = int(metadata["duration"] % 60)
                meta_parts.append(f"- **Duration:** {minutes}:{seconds:02d}")
            if metadata.get("format"):
                meta_parts.append(f"- **Format:** {metadata['format']}")
            if metadata.get("sample_rate"):
                meta_parts.append(f"- **Sample Rate:** {metadata['sample_rate']} Hz")
            if metadata.get("channels"):
                meta_parts.append(f"- **Channels:** {metadata['channels']}")
            if metadata.get("bitrate"):
                meta_parts.append(f"- **Bitrate:** {metadata['bitrate']} kbps")
            if meta_parts:
                content_parts.append("## Audio Metadata\n\n" + "\n".join(meta_parts))

        return {
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
            "content": "\n\n".join(content_parts) if content_parts else "",
            "ai_title": result["ai_title"],
        }

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

    def _transcribe(self, file_path: str, model_size: str = "medium") -> dict:
        """Transcribe audio using Whisper."""
        model = _get_whisper_model(model_size)

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
        """Read whisper model size from config table."""
        from sqlalchemy import select
        from openforge.db.models import Config

        result = await db_session.execute(
            select(Config).where(Config.key == "whisper_model_size")
        )
        row = result.scalar_one_or_none()
        if row and row.value and isinstance(row.value, dict):
            return row.value.get("value", "medium")
        return "medium"

    async def _generate_title(
        self, transcript: str, workspace_id: UUID, db_session
    ) -> Optional[str]:
        """Generate AI title from transcript text."""
        from openforge.core.llm_gateway import llm_gateway
        from openforge.services.llm_service import llm_service

        provider_name, api_key, model, base_url = (
            await llm_service.get_provider_for_workspace(db_session, workspace_id)
        )

        prompt = (
            "Generate a concise, descriptive title (max 10 words) for this audio recording "
            "based on its transcript. Return only the title text, nothing else.\n\n"
            f"Transcript (first 2000 chars):\n{transcript[:2000]}"
        )

        title = await llm_gateway.chat(
            messages=[
                {"role": "system", "content": "Generate concise titles. Return only the title text."},
                {"role": "user", "content": prompt},
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
