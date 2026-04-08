"""Verify _parse_whisper_model_name(), _HF_TO_WHISPER mapping, and _detect_device() work with faster-whisper."""

import pytest

from openforge.core.knowledge_processors.audio_processor import (
    _HF_TO_WHISPER,
    _detect_device,
    _parse_whisper_model_name,
)

# Valid faster-whisper model size strings (same as openai-whisper).
VALID_FASTER_WHISPER_SIZES = {
    "tiny", "tiny.en",
    "base", "base.en",
    "small", "small.en",
    "medium", "medium.en",
    "large-v1", "large-v2", "large-v3",
}


class TestHFToWhisperMapping:
    """Verify the _HF_TO_WHISPER dict covers all catalog models and maps to valid sizes."""

    def test_all_catalog_stt_models_are_mapped(self):
        """Every openai/whisper-* model in LOCAL_MODELS must appear in _HF_TO_WHISPER."""
        from openforge.services.local_models import LOCAL_MODELS

        stt_ids = [m.id for m in LOCAL_MODELS if m.capability_type == "stt"]
        for model_id in stt_ids:
            assert model_id in _HF_TO_WHISPER, (
                f"STT model '{model_id}' from LOCAL_MODELS is missing in _HF_TO_WHISPER"
            )

    def test_mapped_values_are_valid_faster_whisper_sizes(self):
        """Every mapped value must be a recognized faster-whisper model size."""
        for hf_id, whisper_size in _HF_TO_WHISPER.items():
            assert whisper_size in VALID_FASTER_WHISPER_SIZES, (
                f"_HF_TO_WHISPER['{hf_id}'] = '{whisper_size}' is not a valid faster-whisper size"
            )

    def test_expected_mappings(self):
        """Spot-check the exact mapping values."""
        assert _HF_TO_WHISPER["openai/whisper-tiny"] == "tiny"
        assert _HF_TO_WHISPER["openai/whisper-base"] == "base"
        assert _HF_TO_WHISPER["openai/whisper-small"] == "small"
        assert _HF_TO_WHISPER["openai/whisper-medium"] == "medium"
        assert _HF_TO_WHISPER["openai/whisper-large-v2"] == "large-v2"
        assert _HF_TO_WHISPER["openai/whisper-large-v3"] == "large-v3"


class TestParseWhisperModelName:
    """Verify _parse_whisper_model_name() handles all input forms correctly."""

    @pytest.mark.parametrize(
        "config_value, expected",
        [
            ("openai/whisper-tiny", "tiny"),
            ("openai/whisper-base", "base"),
            ("openai/whisper-small", "small"),
            ("openai/whisper-medium", "medium"),
            ("openai/whisper-large-v2", "large-v2"),
            ("openai/whisper-large-v3", "large-v3"),
        ],
    )
    def test_hf_style_ids(self, config_value: str, expected: str):
        """HuggingFace-style IDs are resolved via _HF_TO_WHISPER."""
        assert _parse_whisper_model_name(config_value) == expected

    @pytest.mark.parametrize(
        "raw_name",
        ["tiny", "base", "small", "medium", "large-v2", "large-v3"],
    )
    def test_raw_size_names_pass_through(self, raw_name: str):
        """Raw model size strings are returned as-is (already valid for faster-whisper)."""
        assert _parse_whisper_model_name(raw_name) == raw_name

    def test_empty_string_defaults_to_base(self):
        assert _parse_whisper_model_name("") == "base"

    def test_unknown_value_passes_through(self):
        """An unrecognized value is returned unchanged (faster-whisper will validate it)."""
        assert _parse_whisper_model_name("custom-model") == "custom-model"


class TestDownloadStatusWhisperNames:
    """Verify get_download_status() derives correct CTranslate2 directory names."""

    @pytest.mark.parametrize(
        "model_id, expected_ct2_dir_name",
        [
            ("openai/whisper-tiny", "faster-whisper-tiny"),
            ("openai/whisper-base", "faster-whisper-base"),
            ("openai/whisper-small", "faster-whisper-small"),
            ("openai/whisper-medium", "faster-whisper-medium"),
            ("openai/whisper-large-v2", "faster-whisper-large-v2"),
            ("openai/whisper-large-v3", "faster-whisper-large-v3"),
        ],
    )
    def test_ct2_directory_name_derivation(self, model_id: str, expected_ct2_dir_name: str, tmp_path):
        """The CTranslate2 directory name derived from model ID matches faster-whisper convention."""
        # Replicate the logic from get_download_status()
        whisper_name = model_id.split("/")[-1].replace("whisper-", "")
        ct2_dir_name = f"faster-whisper-{whisper_name}"
        assert ct2_dir_name == expected_ct2_dir_name

    @pytest.mark.parametrize(
        "model_id",
        [
            "openai/whisper-tiny",
            "openai/whisper-base",
            "openai/whisper-large-v3",
        ],
    )
    def test_download_status_detects_ct2_directory(self, model_id: str, tmp_path, monkeypatch):
        """get_download_status() returns True when the CTranslate2 directory exists."""
        from openforge.services import local_models

        monkeypatch.setattr(local_models, "_models_root", lambda: tmp_path)

        whisper_name = model_id.split("/")[-1].replace("whisper-", "")
        ct2_dir = tmp_path / "whisper" / f"faster-whisper-{whisper_name}"
        ct2_dir.mkdir(parents=True)

        assert local_models.get_download_status(model_id) is True

    def test_download_status_false_when_no_model_files(self, tmp_path, monkeypatch):
        """get_download_status() returns False when neither CT2 dir nor .pt file exists."""
        from openforge.services import local_models

        monkeypatch.setattr(local_models, "_models_root", lambda: tmp_path)
        (tmp_path / "whisper").mkdir(parents=True)

        assert local_models.get_download_status("openai/whisper-base") is False


class TestDetectDevice:
    """Verify _detect_device() returns correct device and compute_type."""

    def test_returns_cuda_when_available(self, monkeypatch):
        """When torch.cuda.is_available() returns True, use CUDA with float16."""
        import types
        mock_torch = types.ModuleType("torch")
        mock_cuda = types.ModuleType("torch.cuda")
        mock_cuda.is_available = lambda: True
        mock_torch.cuda = mock_cuda
        monkeypatch.setitem(__import__("sys").modules, "torch", mock_torch)

        device, compute_type = _detect_device()
        assert device == "cuda"
        assert compute_type == "float16"

    def test_returns_cpu_when_no_cuda(self, monkeypatch):
        """When torch.cuda.is_available() returns False, fall back to CPU with int8."""
        import types
        mock_torch = types.ModuleType("torch")
        mock_cuda = types.ModuleType("torch.cuda")
        mock_cuda.is_available = lambda: False
        mock_torch.cuda = mock_cuda
        monkeypatch.setitem(__import__("sys").modules, "torch", mock_torch)

        device, compute_type = _detect_device()
        assert device == "cpu"
        assert compute_type == "int8"

    def test_returns_cpu_when_torch_not_installed(self, monkeypatch):
        """When torch is not importable, fall back to CPU with int8."""
        monkeypatch.setitem(__import__("sys").modules, "torch", None)

        device, compute_type = _detect_device()
        assert device == "cpu"
        assert compute_type == "int8"


class TestApiModelsDownloadDetection:
    """Validate _model_is_downloaded() in api/models.py checks CTranslate2 format correctly.

    The api/models.py detection is stricter than local_models: it requires both the
    directory (faster-whisper-{size}/) AND model.bin inside it.
    """

    def _patch_whisper_dir(self, monkeypatch, tmp_path):
        """Patch _whisper_dir() to return a temp directory."""
        from openforge.api import models as api_models
        whisper_dir = tmp_path / "whisper"
        whisper_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(api_models, "_whisper_dir", lambda: whisper_dir)
        return whisper_dir

    @pytest.mark.parametrize("model_name", ["tiny", "base", "small", "medium", "large-v2", "large-v3"])
    def test_detected_when_ct2_dir_and_model_bin_exist(self, model_name, tmp_path, monkeypatch):
        """Returns True when faster-whisper-{size}/ directory contains model.bin."""
        from openforge.api.models import _model_is_downloaded

        whisper_dir = self._patch_whisper_dir(monkeypatch, tmp_path)
        ct2_dir = whisper_dir / f"faster-whisper-{model_name}"
        ct2_dir.mkdir(parents=True)
        (ct2_dir / "model.bin").write_bytes(b"fake-model-data")

        assert _model_is_downloaded(model_name) is True

    @pytest.mark.parametrize("model_name", ["tiny", "base", "large-v3"])
    def test_not_detected_when_dir_exists_but_no_model_bin(self, model_name, tmp_path, monkeypatch):
        """Returns False when directory exists but model.bin is missing (incomplete download)."""
        from openforge.api.models import _model_is_downloaded

        whisper_dir = self._patch_whisper_dir(monkeypatch, tmp_path)
        ct2_dir = whisper_dir / f"faster-whisper-{model_name}"
        ct2_dir.mkdir(parents=True)
        # Directory exists but no model.bin — incomplete download

        assert _model_is_downloaded(model_name) is False

    def test_not_detected_when_no_directory(self, tmp_path, monkeypatch):
        """Returns False when the CTranslate2 directory doesn't exist at all."""
        from openforge.api.models import _model_is_downloaded

        self._patch_whisper_dir(monkeypatch, tmp_path)

        assert _model_is_downloaded("base") is False

    def test_not_detected_for_old_pt_file(self, tmp_path, monkeypatch):
        """Returns False for legacy .pt files — only CTranslate2 format is accepted."""
        from openforge.api.models import _model_is_downloaded

        whisper_dir = self._patch_whisper_dir(monkeypatch, tmp_path)
        # Create a legacy .pt file (old openai-whisper format)
        (whisper_dir / "base.pt").write_bytes(b"fake-pt-data")

        assert _model_is_downloaded("base") is False

    def test_whisper_model_map_consistent_with_audio_processor(self):
        """WHISPER_MODEL_MAP in api/models.py matches _HF_TO_WHISPER in audio_processor."""
        from openforge.api.models import WHISPER_MODEL_MAP

        for hf_id, size in WHISPER_MODEL_MAP.items():
            assert hf_id in _HF_TO_WHISPER, (
                f"WHISPER_MODEL_MAP key '{hf_id}' missing from audio_processor._HF_TO_WHISPER"
            )
            assert _HF_TO_WHISPER[hf_id] == size, (
                f"Mismatch for '{hf_id}': api/models.py has '{size}', "
                f"audio_processor has '{_HF_TO_WHISPER[hf_id]}'"
            )


class TestApiModelsWhisperDeletion:
    """Validate delete_whisper_model removes CTranslate2 directories."""

    def _patch_whisper_dir(self, monkeypatch, tmp_path):
        from openforge.api import models as api_models
        whisper_dir = tmp_path / "whisper"
        whisper_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(api_models, "_whisper_dir", lambda: whisper_dir)
        return whisper_dir

    @pytest.mark.asyncio
    async def test_deletes_ct2_directory(self, tmp_path, monkeypatch):
        """delete_whisper_model removes the faster-whisper-{size}/ directory."""
        from openforge.api.models import delete_whisper_model

        whisper_dir = self._patch_whisper_dir(monkeypatch, tmp_path)
        ct2_dir = whisper_dir / "faster-whisper-base"
        ct2_dir.mkdir(parents=True)
        (ct2_dir / "model.bin").write_bytes(b"fake")
        (ct2_dir / "config.json").write_bytes(b"{}")

        result = await delete_whisper_model("openai/whisper-base")

        assert result["deleted"] is True
        assert not ct2_dir.exists()

    @pytest.mark.asyncio
    async def test_delete_succeeds_when_no_directory(self, tmp_path, monkeypatch):
        """delete_whisper_model succeeds even if the model was never downloaded."""
        from openforge.api.models import delete_whisper_model

        self._patch_whisper_dir(monkeypatch, tmp_path)

        result = await delete_whisper_model("openai/whisper-base")
        assert result["deleted"] is True

    @pytest.mark.asyncio
    async def test_delete_accepts_raw_model_name(self, tmp_path, monkeypatch):
        """delete_whisper_model accepts raw size names like 'base' in addition to HF IDs."""
        from openforge.api.models import delete_whisper_model

        whisper_dir = self._patch_whisper_dir(monkeypatch, tmp_path)
        ct2_dir = whisper_dir / "faster-whisper-small"
        ct2_dir.mkdir(parents=True)
        (ct2_dir / "model.bin").write_bytes(b"fake")

        result = await delete_whisper_model("small")

        assert result["deleted"] is True
        assert result["name"] == "small"
        assert not ct2_dir.exists()
