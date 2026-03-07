"""
Audio processor for OpenForge Knowledge System.

Processes uploaded audio through:
1. Metadata extraction (duration, format, sample rate)
2. Whisper transcription
3. AI title generation
4. Text embedding
"""
import asyncio
import json
import logging
import subprocess
from pathlib import Path
from uuid import UUID
from typing import Optional

from openforge.config import get_settings
from openforge.core.embedding import embed_texts
from openforge.core.knowledge_processor import knowledge_processor
from openforge.core.content_processors.base import ContentProcessor, ProcessorResult

logger = logging.getLogger("openforge.audio_processor")

# Cache for loaded Whisper models
_whisper_models = {}


def get_whisper_model(model_size: str = "medium"):
    """Get or load a Whisper model."""
    global _whisper_models
    if model_size not in _whisper_models:
        try:
            import whisper
            _whisper_models[model_size] = whisper.load_model(model_size)
            logger.info(f"Whisper {model_size} model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            return None
    return _whisper_models[model_size]


class AudioProcessor(ContentProcessor):
    """Process audio files for knowledge storage and retrieval."""

    name = "audio"
    supported_types = ["audio/"]
    supported_extensions = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".wma", ".opus"]

    def __init__(self):
        self.settings = get_settings()

    async def process(
        self,
        file_path: str,
        workspace_id: UUID,
        knowledge_id: Optional[UUID] = None,
        **kwargs,
    ) -> ProcessorResult:
        """
        Full audio processing pipeline.

        Args:
            file_path: Path to the audio file
            workspace_id: UUID of the workspace
            knowledge_id: Optional UUID of the knowledge entry
            **kwargs: Additional options (whisper_model_size, title_provider_config)

        Returns:
            ProcessorResult with extracted metadata, transcript, and AI title
        """
        result = ProcessorResult(success=False)
        whisper_model_size = kwargs.get("whisper_model_size", "medium")
        title_provider_config = kwargs.get("title_provider_config")

        audio_path = Path(file_path)
        if not audio_path.exists():
            result.error = f"Audio file not found: {file_path}"
            logger.error(f"Audio file not found: {file_path}")
            return result

        try:
            # Step 1: Extract metadata via ffprobe
            result.metadata = await self._extract_metadata(audio_path)
            duration_seconds = result.metadata.get("duration_seconds", 0)

            # Step 2: Transcribe with Whisper
            transcript_result = await self._transcribe(audio_path, whisper_model_size)
            transcript = transcript_result.get("text", "")
            segments = transcript_result.get("segments", [])

            result.content = transcript
            result.extracted_text = transcript
            result.metadata["segments"] = segments
            result.metadata["word_count"] = len(transcript.split())

            # Step 3: Generate AI title
            if transcript and title_provider_config:
                result.ai_title = await self._generate_title(
                    transcript, title_provider_config
                )

            result.success = True

            # Step 4: Embed transcript
            if knowledge_id and transcript:
                await knowledge_processor.process_knowledge(
                    knowledge_id=knowledge_id,
                    workspace_id=workspace_id,
                    content=transcript,
                    knowledge_type="audio",
                    title=result.ai_title,
                    tags=[],
                )
                result.embedded = True

        except Exception as e:
            logger.exception(f"Error processing audio {knowledge_id}: {e}")
            result.error = str(e)

        return result

    async def _extract_metadata(self, audio_path: Path) -> dict:
        """Extract audio metadata using ffprobe."""
        metadata = {}

        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                str(audio_path),
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()

            if process.returncode == 0:
                data = json.loads(stdout.decode())

                # Format info
                format_info = data.get("format", {})
                metadata["format"] = format_info.get("format_name", "unknown")
                metadata["duration_seconds"] = float(format_info.get("duration", 0))
                metadata["bit_rate"] = int(format_info.get("bit_rate", 0))
                metadata["file_size"] = int(format_info.get("size", 0))

                # Audio stream info
                for stream in data.get("streams", []):
                    if stream.get("codec_type") == "audio":
                        metadata["sample_rate"] = stream.get("sample_rate")
                        metadata["channels"] = stream.get("channels")
                        metadata["codec"] = stream.get("codec_name")
                        break

        except Exception as e:
            logger.error(f"Failed to extract audio metadata: {e}")

        return metadata

    async def _transcribe(self, audio_path: Path, model_size: str) -> dict:
        """Transcribe audio using Whisper."""
        result = {"text": "", "segments": []}

        try:
            # Run Whisper in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                self._run_whisper_sync,
                str(audio_path),
                model_size,
            )

        except Exception as e:
            logger.error(f"Whisper transcription failed: {e}")

        return result

    def _run_whisper_sync(self, audio_path: str, model_size: str) -> dict:
        """Synchronous Whisper transcription."""
        model = get_whisper_model(model_size)
        if not model:
            return {"text": "", "segments": []}

        # Transcribe with word-level timestamps
        transcription = model.transcribe(audio_path, word_timestamps=False)

        segments = []
        full_text = []

        for segment in transcription.get("segments", []):
            segments.append({
                "start": segment.get("start", 0),
                "end": segment.get("end", 0),
                "text": segment.get("text", "").strip(),
            })
            full_text.append(segment.get("text", "").strip())

        return {
            "text": " ".join(full_text),
            "segments": segments,
        }

    async def _generate_title(
        self, transcript: str, provider_config: dict
    ) -> Optional[str]:
        """Generate a title from the transcript."""
        try:
            # Use first 2000 chars for title generation
            sample = transcript[:2000]

            prompt = f"""Generate a concise, descriptive title (5-10 words) for this audio transcript:

{sample}

Return only the title, nothing else."""

            from openforge.core.llm_gateway import llm_gateway

            provider_id = provider_config.get("provider_id")
            model = provider_config.get("model")

            response = await llm_gateway.chat(
                messages=[{"role": "user", "content": prompt}],
                provider_id=provider_id,
                model=model,
                temperature=0.3,
                max_tokens=50,
            )

            title = response.get("content", "").strip()
            # Clean up quotes if present
            title = title.strip('"\'').strip()

            return title[:100] if title else None

        except Exception as e:
            logger.error(f"Title generation failed: {e}")
            return None
