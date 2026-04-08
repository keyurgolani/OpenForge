"""Tests for the system hardware detection endpoint."""
import unittest
from unittest.mock import patch, MagicMock


class TestHardwareEndpoint(unittest.TestCase):

    @patch("openforge.api.system._read_cgroup_memory_limit")
    @patch("openforge.api.system._detect_gpu")
    @patch("shutil.disk_usage")
    def test_returns_hardware_info(self, mock_disk, mock_gpu, mock_cgroup):
        from openforge.api.system import _detect_hardware

        mock_cgroup.return_value = 16 * 1024**3
        mock_gpu.return_value = (True, "NVIDIA RTX 3060", 6.0)
        mock_disk.return_value = MagicMock(free=250 * 1024**3)

        result = _detect_hardware()

        assert result["ram_total_gb"] == 16.0
        assert result["has_gpu"] is True
        assert result["gpu_name"] == "NVIDIA RTX 3060"
        assert result["gpu_vram_gb"] == 6.0
        assert result["disk_free_gb"] == 250.0

    @patch("openforge.api.system._read_cgroup_memory_limit")
    @patch("openforge.api.system._detect_gpu")
    @patch("shutil.disk_usage")
    def test_no_gpu(self, mock_disk, mock_gpu, mock_cgroup):
        from openforge.api.system import _detect_hardware

        mock_cgroup.return_value = 8 * 1024**3
        mock_gpu.return_value = (False, None, None)
        mock_disk.return_value = MagicMock(free=100 * 1024**3)

        result = _detect_hardware()

        assert result["ram_total_gb"] == 8.0
        assert result["has_gpu"] is False
        assert result["gpu_name"] is None

    @patch("openforge.api.system._read_cgroup_memory_limit")
    @patch("openforge.api.system._detect_gpu")
    @patch("shutil.disk_usage")
    def test_cgroup_unlimited_falls_back_to_psutil(self, mock_disk, mock_gpu, mock_cgroup):
        from openforge.api.system import _detect_hardware

        mock_cgroup.return_value = None
        mock_gpu.return_value = (False, None, None)
        mock_disk.return_value = MagicMock(free=500 * 1024**3)

        with patch("psutil.virtual_memory") as mock_vmem:
            mock_vmem.return_value = MagicMock(total=32 * 1024**3, available=24 * 1024**3)
            result = _detect_hardware()

        assert result["ram_total_gb"] == 32.0
