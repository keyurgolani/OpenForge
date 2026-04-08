"""Test LFM2.5 Audio model catalog entries."""
import unittest


class TestLiquidAudioCatalog(unittest.TestCase):
    def test_stt_entry_exists(self):
        from openforge.services.local_models import _MODEL_BY_ID
        model = _MODEL_BY_ID.get("lfm2.5-audio-1.5b-stt")
        assert model is not None
        assert model.capability_type == "stt"
        assert model.engine == "liquid-audio"

    def test_tts_entry_exists(self):
        from openforge.services.local_models import _MODEL_BY_ID
        model = _MODEL_BY_ID.get("lfm2.5-audio-1.5b-tts")
        assert model is not None
        assert model.capability_type == "tts"
        assert model.engine == "liquid-audio"

    def test_distinct_ids(self):
        from openforge.services.local_models import _MODEL_BY_ID
        stt = _MODEL_BY_ID.get("lfm2.5-audio-1.5b-stt")
        tts = _MODEL_BY_ID.get("lfm2.5-audio-1.5b-tts")
        assert stt is not tts

    def test_list_stt_includes_liquid(self):
        from openforge.services.local_models import list_local_models
        stt_models = list_local_models(capability_type="stt")
        ids = [m["id"] for m in stt_models]
        assert "lfm2.5-audio-1.5b-stt" in ids

    def test_list_tts_includes_liquid(self):
        from openforge.services.local_models import list_local_models
        tts_models = list_local_models(capability_type="tts")
        ids = [m["id"] for m in tts_models]
        assert "lfm2.5-audio-1.5b-tts" in ids
