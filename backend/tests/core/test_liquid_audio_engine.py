"""Tests for liquid audio engine loading."""
import sys
import unittest
from unittest.mock import patch, MagicMock


class TestLiquidAudioEngine(unittest.TestCase):
    @patch("openforge.core.liquid_audio_engine._liquid_model", None)
    @patch("openforge.core.liquid_audio_engine._liquid_processor", None)
    def test_get_model_caches_on_second_call(self):
        mock_model_instance = MagicMock()
        mock_processor_instance = MagicMock()

        MockModel = MagicMock()
        MockModel.from_pretrained.return_value = mock_model_instance
        MockProcessor = MagicMock()
        MockProcessor.from_pretrained.return_value = mock_processor_instance

        mock_liquid_audio = MagicMock()
        mock_liquid_audio.LiquidAudioModel = MockModel
        mock_liquid_audio.LiquidAudioProcessor = MockProcessor

        with patch.dict(sys.modules, {"liquid_audio": mock_liquid_audio}):
            import openforge.core.liquid_audio_engine as engine
            engine._liquid_model = None
            engine._liquid_processor = None

            m1, p1 = engine.get_liquid_audio("/tmp/models")
            m2, p2 = engine.get_liquid_audio("/tmp/models")

            assert m1 is m2
            assert p1 is p2
            MockModel.from_pretrained.assert_called_once()
            MockProcessor.from_pretrained.assert_called_once()

    @patch("openforge.core.liquid_audio_engine._liquid_model", None)
    @patch("openforge.core.liquid_audio_engine._liquid_processor", None)
    def test_raises_when_package_missing(self):
        import builtins
        original_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name == "liquid_audio":
                raise ImportError("No module named 'liquid_audio'")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            from openforge.core import liquid_audio_engine
            liquid_audio_engine._liquid_model = None
            liquid_audio_engine._liquid_processor = None
            with self.assertRaises(RuntimeError):
                liquid_audio_engine.get_liquid_audio("/tmp/models")
