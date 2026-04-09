"""Video chunk builder for timestamp-aligned chunking of video content.

Builds non-overlapping chunks of approximately 30s duration from transcription
segments and keyframe descriptions, aligning boundaries to segment boundaries.
"""

from __future__ import annotations

from pydantic import BaseModel

from openforge.core.pipeline.types import TranscriptionResult


class VideoChunk(BaseModel):
    """A single timestamp-aligned chunk of video content."""

    timestamp_start: float
    timestamp_end: float
    transcript_text: str
    keyframe_descriptions: list[str] = []
    chunk_index: int


def build_video_chunks(
    transcription: TranscriptionResult,
    keyframes: list[dict],
    keyframe_results: list[dict],
    chunk_duration: float = 30.0,
) -> list[VideoChunk]:
    """Build timestamp-aligned chunks from video processing outputs.

    Preconditions:
        - transcription.segments sorted by start timestamp
        - keyframes sorted by timestamp
        - chunk_duration > 0

    Postconditions:
        - Each VideoChunk spans approximately chunk_duration seconds
        - Chunk boundaries align to segment boundaries (not mid-word)
        - Each chunk includes transcript text + relevant keyframe descriptions
        - Chunks are non-overlapping and cover full video duration
        - timestamp_start values are monotonically increasing
    """
    segments = sorted(transcription.segments, key=lambda s: s.start)

    if not segments:
        return []

    chunks: list[VideoChunk] = []
    chunk_index = 0
    seg_idx = 0

    while seg_idx < len(segments):
        chunk_start = segments[seg_idx].start
        chunk_texts: list[str] = []
        chunk_end = chunk_start

        # Accumulate segments until we reach ~chunk_duration or exceed 1.5x
        while seg_idx < len(segments):
            seg = segments[seg_idx]
            seg_duration = seg.end - chunk_start

            # If adding this segment would exceed 1.5x and we already have
            # at least one segment, stop here (align to segment boundary).
            if seg_duration > chunk_duration * 1.5 and chunk_texts:
                break

            chunk_texts.append(seg.text)
            chunk_end = seg.end
            seg_idx += 1

            # If we've reached the target duration, stop at this segment boundary.
            if chunk_end - chunk_start >= chunk_duration:
                break

        # Collect keyframe descriptions within this chunk's time range
        descriptions = _collect_keyframe_descriptions(
            keyframes, keyframe_results, chunk_start, chunk_end
        )

        chunks.append(
            VideoChunk(
                timestamp_start=chunk_start,
                timestamp_end=chunk_end,
                transcript_text=" ".join(chunk_texts).strip(),
                keyframe_descriptions=descriptions,
                chunk_index=chunk_index,
            )
        )
        chunk_index += 1

    return chunks


def _collect_keyframe_descriptions(
    keyframes: list[dict],
    keyframe_results: list[dict],
    start: float,
    end: float,
) -> list[str]:
    """Collect keyframe descriptions that fall within [start, end]."""
    descriptions: list[str] = []
    for i, kf in enumerate(keyframes):
        ts = kf.get("timestamp", 0.0)
        if start <= ts <= end and i < len(keyframe_results):
            desc = keyframe_results[i].get("description", "")
            if desc:
                descriptions.append(desc)
    return descriptions
