"""System hardware detection endpoint."""
from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger("openforge.api.system")

router = APIRouter()


def _read_cgroup_memory_limit() -> int | None:
    """Read container memory limit from cgroup v2 or v1. Returns bytes or None."""
    v2 = Path("/sys/fs/cgroup/memory.max")
    if v2.exists():
        raw = v2.read_text().strip()
        if raw != "max":
            try:
                return int(raw)
            except ValueError:
                pass

    v1 = Path("/sys/fs/cgroup/memory/memory.limit_in_bytes")
    if v1.exists():
        try:
            val = int(v1.read_text().strip())
            if val < 2**62:
                return val
        except (ValueError, OSError):
            pass

    return None


def _detect_gpu() -> tuple[bool, str | None, float | None]:
    """Detect NVIDIA GPU via nvidia-smi. Returns (has_gpu, name, vram_gb)."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            line = result.stdout.strip().split("\n")[0]
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 2:
                name = parts[0]
                vram_mb = float(parts[1])
                return True, name, round(vram_mb / 1024, 1)
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass
    return False, None, None


def _detect_hardware() -> dict:
    """Detect available system resources."""
    import psutil

    cgroup_bytes = _read_cgroup_memory_limit()
    if cgroup_bytes is not None:
        ram_total_gb = round(cgroup_bytes / (1024**3), 1)
    else:
        ram_total_gb = round(psutil.virtual_memory().total / (1024**3), 1)

    raw_available = psutil.virtual_memory().available / (1024**3)
    ram_available_gb = round(min(raw_available, ram_total_gb), 1)
    has_gpu, gpu_name, gpu_vram_gb = _detect_gpu()

    models_path = "/models"
    try:
        disk_free = shutil.disk_usage(models_path).free
    except OSError:
        disk_free = shutil.disk_usage("/").free
    disk_free_gb = round(disk_free / (1024**3), 1)

    return {
        "ram_total_gb": ram_total_gb,
        "ram_available_gb": ram_available_gb,
        "has_gpu": has_gpu,
        "gpu_name": gpu_name,
        "gpu_vram_gb": gpu_vram_gb,
        "disk_free_gb": disk_free_gb,
    }


@router.get("/hardware")
async def get_hardware():
    """Return detected system hardware resources."""
    return _detect_hardware()
