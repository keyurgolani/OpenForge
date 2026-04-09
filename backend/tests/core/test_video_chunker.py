"""Tests for video chunk builder."""

from openforge.core.pipeline.types import TimestampSegment, TranscriptionResult
from openforge.core.pipeline.video_chunker import VideoChunk, build_video_chunks


class TestVideoChunkModel:
    def test_video_chunk_fields(self):
        chunk = VideoChunk(
            timestamp_start=0.0,
            timestamp_end=30.0,
            transcript_text="Hello world",
            keyframe_descriptions=["A person talking"],
            chunk_index=0,
        )
        assert chunk.timestamp_start == 0.0
        assert chunk.timestamp_end == 30.0
        assert chunk.transcript_text == "Hello world"
        assert chunk.keyframe_descriptions == ["A person talking"]
        assert chunk.chunk_index == 0

    def test_video_chunk_defaults(self):
        chunk = VideoChunk(
            timestamp_start=0.0,
            timestamp_end=10.0,
            transcript_text="text",
            chunk_index=0,
        )
        assert chunk.keyframe_descriptions == []


def _make_transcription(segments: list[tuple[float, float, str]]) -> TranscriptionResult:
    """Helper to build a TranscriptionResult from (start, end, text) tuples."""
    return TranscriptionResult(
        text=" ".join(t for _, _, t in segments),
        segments=[
            TimestampSegment(start=s, end=e, text=t) for s, e, t in segments
        ],
    )


class TestBuildVideoChunksEmpty:
    def test_empty_segments_returns_empty(self):
        tr = TranscriptionResult(text="", segments=[])
        result = build_video_chunks(tr, [], [])
        assert result == []


class TestBuildVideoChunksSingleSegment:
    def test_single_segment(self):
        tr = _make_transcription([(0.0, 5.0, "Hello")])
        chunks = build_video_chunks(tr, [], [])
        assert len(chunks) == 1
        assert chunks[0].timestamp_start == 0.0
        assert chunks[0].timestamp_end == 5.0
        assert chunks[0].transcript_text == "Hello"
        assert chunks[0].chunk_index == 0


class TestBuildVideoChunksMultipleSegments:
    def test_segments_within_duration_grouped(self):
        """Segments totaling < 30s should be in one chunk."""
        tr = _make_transcription([
            (0.0, 10.0, "First"),
            (10.0, 20.0, "Second"),
            (20.0, 25.0, "Third"),
        ])
        chunks = build_video_chunks(tr, [], [], chunk_duration=30.0)
        assert len(chunks) == 1
        assert chunks[0].transcript_text == "First Second Third"

    def test_segments_split_at_boundary(self):
        """Segments exceeding chunk_duration should split at segment boundary."""
        tr = _make_transcription([
            (0.0, 15.0, "First"),
            (15.0, 30.0, "Second"),
            (30.0, 45.0, "Third"),
            (45.0, 60.0, "Fourth"),
        ])
        chunks = build_video_chunks(tr, [], [], chunk_duration=30.0)
        assert len(chunks) == 2
        # First chunk covers 0-30
        assert chunks[0].timestamp_start == 0.0
        assert chunks[0].timestamp_end == 30.0
        # Second chunk covers 30-60
        assert chunks[1].timestamp_start == 30.0
        assert chunks[1].timestamp_end == 60.0

    def test_monotonically_increasing_starts(self):
        """timestamp_start values must be monotonically increasing."""
        tr = _make_transcription([
            (0.0, 10.0, "A"),
            (10.0, 20.0, "B"),
            (20.0, 35.0, "C"),
            (35.0, 50.0, "D"),
            (50.0, 65.0, "E"),
        ])
        chunks = build_video_chunks(tr, [], [], chunk_duration=30.0)
        for i in range(1, len(chunks)):
            assert chunks[i].timestamp_start > chunks[i - 1].timestamp_start

    def test_non_overlapping(self):
        """Chunks must not overlap."""
        tr = _make_transcription([
            (0.0, 10.0, "A"),
            (10.0, 20.0, "B"),
            (20.0, 35.0, "C"),
            (35.0, 50.0, "D"),
        ])
        chunks = build_video_chunks(tr, [], [], chunk_duration=30.0)
        for i in range(1, len(chunks)):
            assert chunks[i].timestamp_start >= chunks[i - 1].timestamp_end

    def test_covers_full_duration(self):
        """First chunk starts at first segment, last chunk ends at last segment."""
        tr = _make_transcription([
            (2.0, 12.0, "A"),
            (12.0, 22.0, "B"),
            (22.0, 40.0, "C"),
            (40.0, 55.0, "D"),
        ])
        chunks = build_video_chunks(tr, [], [], chunk_duration=30.0)
        assert chunks[0].timestamp_start == 2.0
        assert chunks[-1].timestamp_end == 55.0

    def test_chunk_indices_sequential(self):
        tr = _make_transcription([
            (0.0, 20.0, "A"),
            (20.0, 40.0, "B"),
            (40.0, 60.0, "C"),
        ])
        chunks = build_video_chunks(tr, [], [], chunk_duration=25.0)
        for i, chunk in enumerate(chunks):
            assert chunk.chunk_index == i


class TestBuildVideoChunksKeyframes:
    def test_keyframe_descriptions_included(self):
        tr = _make_transcription([(0.0, 30.0, "Hello")])
        keyframes = [{"timestamp": 10.0, "frame_path": "/tmp/f1.jpg"}]
        keyframe_results = [{"description": "A cat on screen", "timestamp": 10.0}]
        chunks = build_video_chunks(tr, keyframes, keyframe_results)
        assert chunks[0].keyframe_descriptions == ["A cat on screen"]

    def test_keyframe_outside_range_excluded(self):
        tr = _make_transcription([(0.0, 10.0, "Hello")])
        keyframes = [{"timestamp": 20.0, "frame_path": "/tmp/f1.jpg"}]
        keyframe_results = [{"description": "Outside", "timestamp": 20.0}]
        chunks = build_video_chunks(tr, keyframes, keyframe_results)
        assert chunks[0].keyframe_descriptions == []

    def test_no_keyframes(self):
        tr = _make_transcription([(0.0, 10.0, "Hello")])
        chunks = build_video_chunks(tr, [], [])
        assert chunks[0].keyframe_descriptions == []

    def test_keyframe_with_empty_description_excluded(self):
        tr = _make_transcription([(0.0, 30.0, "Hello")])
        keyframes = [{"timestamp": 5.0, "frame_path": "/tmp/f.jpg"}]
        keyframe_results = [{"description": "", "timestamp": 5.0}]
        chunks = build_video_chunks(tr, keyframes, keyframe_results)
        assert chunks[0].keyframe_descriptions == []


class TestBuildVideoChunksUnsortedInput:
    def test_unsorted_segments_are_sorted(self):
        """Segments should be sorted by start even if input is unsorted."""
        tr = TranscriptionResult(
            text="B A",
            segments=[
                TimestampSegment(start=10.0, end=20.0, text="B"),
                TimestampSegment(start=0.0, end=10.0, text="A"),
            ],
        )
        chunks = build_video_chunks(tr, [], [], chunk_duration=30.0)
        assert len(chunks) == 1
        assert chunks[0].transcript_text == "A B"
        assert chunks[0].timestamp_start == 0.0
