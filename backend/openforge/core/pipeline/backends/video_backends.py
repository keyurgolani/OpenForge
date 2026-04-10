"""Video processing slot backends for the pipeline framework.

Backends:
- AudioExtractionBackend: Extract audio track from video via FFmpeg
- SceneDetectionBackend: Detect scene boundaries and extract keyframes via PySceneDetect
- FrameDescriptionBackend: Describe keyframes via vision LLM
- VideoMetadataBackend: Extract video metadata via ffprobe
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import tempfile
import time
from pathlib import Path
from uuid import UUID

from openforge.core.pipeline.registry import register_backend
from openforge.core.pipeline.types import SlotContext, SlotOutput

logger = logging.getLogger(__name__)

_FAILURE_PHRASES = (
    "not provided",
    "no image",
    "unable to analyze",
    "cannot see",
    "can't see",
    "don't see an image",
    "no visual",
    "image was not",
    "image is not",
    "didn't receive",
    "did not receive",
)


# ---------------------------------------------------------------------------
# AudioExtractionBackend — extract audio track via FFmpeg
# ---------------------------------------------------------------------------


class AudioExtractionBackend:
    """Extract audio track from video via FFmpeg subprocess."""

    slot_type = "audio_extraction"
    backend_name = "ffmpeg"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            audio_path = await self._extract_audio(file_path)
            elapsed = int((time.monotonic() - start) * 1000)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                metadata={"audio_path": audio_path},
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("AudioExtractionBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    @staticmethod
    async def _extract_audio(file_path: str) -> str:
        """Extract audio track from video to a temporary WAV file."""
        suffix = ".wav"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        output_path = tmp.name
        tmp.close()

        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y",
            "-i", file_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            Path(output_path).unlink(missing_ok=True)
            raise TimeoutError("FFmpeg audio extraction timed out after 600s")

        if proc.returncode != 0:
            Path(output_path).unlink(missing_ok=True)
            err_msg = stderr.decode(errors="replace")[-500:] if stderr else ""
            raise RuntimeError(f"FFmpeg audio extraction failed (rc={proc.returncode}): {err_msg}")

        return output_path


# ---------------------------------------------------------------------------
# SceneDetectionBackend — detect scene boundaries via PySceneDetect
# ---------------------------------------------------------------------------


class SceneDetectionBackend:
    """Detect scene boundaries and extract keyframes via PySceneDetect."""

    slot_type = "scene_detection"
    backend_name = "pyscenedetect"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            keyframes = await asyncio.to_thread(self._detect_scenes, file_path)
            elapsed = int((time.monotonic() - start) * 1000)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                metadata={"keyframes": keyframes},
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("SceneDetectionBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    @staticmethod
    def _detect_scenes(file_path: str) -> list[dict]:
        """Detect scene boundaries and save keyframes as temp images.

        Returns a list of dicts with ``timestamp`` (float seconds) and
        ``frame_path`` (str) for each detected scene boundary.
        """
        from scenedetect import open_video, SceneManager
        from scenedetect.detectors import AdaptiveDetector

        video = open_video(file_path)
        scene_manager = SceneManager()
        scene_manager.add_detector(AdaptiveDetector())
        scene_manager.detect_scenes(video)
        scene_list = scene_manager.get_scene_list()

        if not scene_list:
            return []

        keyframes: list[dict] = []
        tmp_dir = tempfile.mkdtemp(prefix="keyframes_")

        import cv2

        cap = cv2.VideoCapture(file_path)
        try:
            for idx, (scene_start, _scene_end) in enumerate(scene_list):
                timestamp = scene_start.get_seconds()
                frame_number = scene_start.get_frames()
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
                ret, frame = cap.read()
                if not ret:
                    continue

                frame_path = str(Path(tmp_dir) / f"keyframe_{idx:04d}.jpg")
                cv2.imwrite(frame_path, frame)
                keyframes.append({
                    "timestamp": timestamp,
                    "frame_path": frame_path,
                    "scene_index": idx,
                })
        finally:
            cap.release()

        # Write sidecar JSON so downstream slots (FrameDescriptionBackend)
        # can discover keyframe paths without inter-slot communication.
        sidecar = Path(file_path).with_suffix(".keyframes.json")
        try:
            sidecar.write_text(json.dumps(keyframes, indent=2))
        except Exception as e:
            logger.warning("Failed to write keyframes sidecar: %s", e)

        return keyframes


# ---------------------------------------------------------------------------
# FrameDescriptionBackend — describe keyframes via vision LLM
# ---------------------------------------------------------------------------


class FrameDescriptionBackend:
    """Describe video keyframes via a vision LLM."""

    slot_type = "frame_description"
    backend_name = "vision-llm"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            descriptions = await self._describe_keyframes(
                file_path, context.workspace_id, context.db_session
            )
            elapsed = int((time.monotonic() - start) * 1000)
            text = "\n\n".join(
                f"[Keyframe {d['scene_index']} @ {d['timestamp']:.1f}s] {d['description']}"
                for d in descriptions
                if d.get("description")
            )
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                text=text,
                metadata={"frame_descriptions": descriptions},
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("FrameDescriptionBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    async def _describe_keyframes(
        self, file_path: str, workspace_id: UUID, db_session
    ) -> list[dict]:
        """Describe each keyframe image using a vision LLM.

        Reads keyframe paths from the scene detection slot output stored in
        the pipeline context.  Falls back to an empty list when no keyframes
        are available or the LLM provider cannot be resolved.
        """
        # Keyframe paths are passed via the file_path convention:
        # For video pipelines the executor passes the original video path.
        # Keyframe metadata is expected to be available from a prior
        # SceneDetectionBackend run.  When called standalone we attempt to
        # read keyframe paths from a sidecar JSON next to the video file.
        keyframe_info = self._load_keyframe_info(file_path)
        if not keyframe_info:
            return []

        if db_session is None:
            return []

        try:
            from openforge.core.llm_gateway import llm_gateway
            from openforge.core.prompt_resolution import resolve_prompt_text
            from openforge.services.llm_service import llm_service

            provider_name, api_key, model, base_url = (
                await llm_service.resolve_vision_provider_for_pipeline(
                    db_session, knowledge_type="video",
                    slot_type="frame_description",
                )
            )
        except Exception:
            logger.warning("Could not resolve vision provider for frame descriptions")
            return []

        prompt = None
        try:
            prompt = await resolve_prompt_text(db_session, "video_frame_analysis")
        except Exception:
            pass
        if not prompt:
            prompt = (
                "Describe this video keyframe in detail. Focus on the visual content, "
                "any text visible, people, objects, and the overall scene. "
                "Return a JSON object with keys: description, tags."
            )

        descriptions: list[dict] = []
        for kf in keyframe_info:
            frame_path = kf.get("frame_path", "")
            if not frame_path or not Path(frame_path).exists():
                continue

            desc = await self._describe_single_frame(
                frame_path, prompt, provider_name, api_key, model, base_url
            )
            desc["timestamp"] = kf.get("timestamp", 0.0)
            desc["scene_index"] = kf.get("scene_index", 0)
            desc["frame_path"] = frame_path
            descriptions.append(desc)

        return descriptions

    @staticmethod
    def _load_keyframe_info(file_path: str) -> list[dict]:
        """Load keyframe info from a sidecar JSON file if it exists."""
        sidecar = Path(file_path).with_suffix(".keyframes.json")
        if sidecar.exists():
            try:
                return json.loads(sidecar.read_text())
            except Exception:
                pass
        return []

    async def _describe_single_frame(
        self,
        frame_path: str,
        prompt: str,
        provider_name: str,
        api_key: str,
        model: str,
        base_url: str | None,
    ) -> dict:
        """Call vision LLM to describe a single keyframe image."""
        from openforge.core.llm_gateway import llm_gateway

        with open(frame_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        ext = Path(frame_path).suffix.lower().lstrip(".")
        mime_map = {
            "jpg": "jpeg", "jpeg": "jpeg", "png": "png",
            "gif": "gif", "webp": "webp",
        }
        mime_subtype = mime_map.get(ext, "jpeg")

        try:
            response = await llm_gateway.chat(
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/{mime_subtype};base64,{image_data}"
                                },
                            },
                        ],
                    }
                ],
                provider_name=provider_name,
                api_key=api_key,
                model=model,
                base_url=base_url,
                max_tokens=300,
            )

            json_match = re.search(r"\{[\s\S]*\}", response)
            if json_match:
                parsed = json.loads(json_match.group())
                description = parsed.get("description", "")
                desc_lower = description.lower()
                if any(phrase in desc_lower for phrase in _FAILURE_PHRASES):
                    logger.warning(
                        "Vision LLM returned failure response for frame, discarding: %r",
                        description[:120],
                    )
                    return {"description": "", "tags": []}
                return {
                    "description": description,
                    "tags": parsed.get("tags", []),
                }
        except Exception as e:
            logger.warning("Vision LLM frame description failed: %s", e)

        return {"description": "", "tags": []}


# ---------------------------------------------------------------------------
# VideoMetadataBackend — extract video metadata via ffprobe
# ---------------------------------------------------------------------------


class VideoMetadataBackend:
    """Extract video metadata via ffprobe subprocess."""

    slot_type = "metadata_extraction"
    backend_name = "ffprobe"

    async def run(self, file_path: str, context: SlotContext) -> SlotOutput:
        start = time.monotonic()
        try:
            metadata = await self._extract_metadata(file_path)
            elapsed = int((time.monotonic() - start) * 1000)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                metadata=metadata,
                duration_ms=elapsed,
            )
        except Exception as e:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.warning("VideoMetadataBackend failed for %s: %s", file_path, e)
            return SlotOutput(
                slot_type=self.slot_type,
                backend_name=self.backend_name,
                success=False,
                error=str(e),
                duration_ms=elapsed,
            )

    @staticmethod
    async def _extract_metadata(file_path: str) -> dict:
        """Extract video metadata using ffprobe."""
        proc = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            file_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise TimeoutError("ffprobe timed out after 60s")

        if proc.returncode != 0:
            err_msg = stderr.decode(errors="replace")[-500:] if stderr else ""
            raise RuntimeError(f"ffprobe failed (rc={proc.returncode}): {err_msg}")

        info = json.loads(stdout.decode())
        fmt = info.get("format", {})
        metadata: dict = {
            "duration": float(fmt.get("duration", 0)),
            "format_name": fmt.get("format_name", ""),
            "format_long_name": fmt.get("format_long_name", ""),
            "size": int(fmt.get("size", 0)),
            "bit_rate": int(fmt.get("bit_rate", 0)) if fmt.get("bit_rate") else None,
        }

        for stream in info.get("streams", []):
            codec_type = stream.get("codec_type")
            if codec_type == "video":
                metadata["video_codec"] = stream.get("codec_name", "")
                metadata["width"] = stream.get("width")
                metadata["height"] = stream.get("height")
                if metadata.get("width") and metadata.get("height"):
                    metadata["resolution"] = f"{metadata['width']}x{metadata['height']}"
                # Parse fps from r_frame_rate (e.g. "30/1" or "24000/1001")
                r_frame_rate = stream.get("r_frame_rate", "")
                if r_frame_rate and "/" in r_frame_rate:
                    parts = r_frame_rate.split("/")
                    try:
                        num, den = int(parts[0]), int(parts[1])
                        if den > 0:
                            metadata["fps"] = round(num / den, 2)
                    except (ValueError, IndexError):
                        pass
            elif codec_type == "audio":
                metadata["audio_codec"] = stream.get("codec_name", "")
                metadata["audio_sample_rate"] = (
                    int(stream.get("sample_rate", 0))
                    if stream.get("sample_rate")
                    else None
                )
                metadata["audio_channels"] = stream.get("channels")

        return metadata


# ---------------------------------------------------------------------------
# Register all backends
# ---------------------------------------------------------------------------

register_backend("audio_extraction", "ffmpeg", AudioExtractionBackend())
register_backend("scene_detection", "pyscenedetect", SceneDetectionBackend())
register_backend("frame_description", "vision-llm", FrameDescriptionBackend())
register_backend("metadata_extraction", "ffprobe", VideoMetadataBackend())
