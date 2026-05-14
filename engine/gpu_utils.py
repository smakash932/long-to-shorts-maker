"""
GPU detection utilities.

Auto-detects:
  - NVIDIA GPU presence (via `nvidia-smi`).
  - CUDA support for faster-whisper / PyTorch / CTranslate2.
  - NVENC support in the local FFmpeg build (h264_nvenc encoder).

Results are cached at module load so that callers can check support
cheaply on every clip without re-running the probes.

This module is intentionally dependency-light — it shells out to
`nvidia-smi` and `ffmpeg` so it works even if torch/CTranslate2 are
not installed yet. A more accurate CUDA check happens lazily via
`probe_ctranslate2_cuda()` if/when `ctranslate2` is importable.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from typing import Optional


# Allow callers to force CPU mode via env var (useful for debugging /
# fallback when CUDA breaks). Set LTS_FORCE_CPU=1 to disable GPU paths.
FORCE_CPU = os.environ.get("LTS_FORCE_CPU", "").strip() in ("1", "true", "yes")


_gpu_info_cache: Optional[dict] = None


def _run(cmd: list[str], timeout: int = 10) -> subprocess.CompletedProcess | None:
    """Run a command and return CompletedProcess, or None on failure."""
    try:
        return subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout
        )
    except Exception:
        return None


def detect_nvidia_gpu() -> dict:
    """
    Detect NVIDIA GPU using nvidia-smi.

    Returns a dict like:
        {
          "available": True,
          "name": "NVIDIA GeForce GTX 1650",
          "memory_total_mb": 4096,
          "memory_free_mb": 3500,
          "driver": "32.0.15.9186",
        }
    or {"available": False} when no GPU is found.
    """
    if FORCE_CPU:
        return {"available": False, "reason": "LTS_FORCE_CPU=1"}

    if shutil.which("nvidia-smi") is None:
        return {"available": False, "reason": "nvidia-smi not found"}

    # Query GPU using parseable CSV format
    proc = _run([
        "nvidia-smi",
        "--query-gpu=name,memory.total,memory.free,driver_version",
        "--format=csv,noheader,nounits",
    ])
    if proc is None or proc.returncode != 0 or not proc.stdout.strip():
        return {"available": False, "reason": "nvidia-smi failed"}

    # Take the first GPU
    first_line = proc.stdout.strip().splitlines()[0]
    parts = [p.strip() for p in first_line.split(",")]
    if len(parts) < 4:
        return {"available": False, "reason": "unexpected nvidia-smi output"}

    try:
        return {
            "available": True,
            "name": parts[0],
            "memory_total_mb": int(parts[1]),
            "memory_free_mb": int(parts[2]),
            "driver": parts[3],
        }
    except ValueError:
        return {"available": False, "reason": "could not parse nvidia-smi"}


def detect_nvenc(nvidia: dict | None = None) -> dict:
    """
    Detect FFmpeg NVENC encoder support.

    NVENC requires BOTH:
      1. FFmpeg compiled with NVENC encoders.
      2. An NVIDIA GPU + driver actually present at runtime.

    Many static FFmpeg builds advertise h264_nvenc in `-encoders` even on
    CPU-only machines, so we also require nvidia-smi to confirm a real GPU.

    Returns: {"available": bool, "encoders": [list of nvenc encoders]}
    """
    if FORCE_CPU:
        return {"available": False, "reason": "LTS_FORCE_CPU=1"}

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return {"available": False, "reason": "ffmpeg not found"}

    proc = _run([ffmpeg, "-hide_banner", "-encoders"], timeout=15)
    if proc is None or proc.returncode != 0:
        return {"available": False, "reason": "ffmpeg -encoders failed"}

    encoders = []
    for line in proc.stdout.splitlines():
        # encoder lines look like " V..... h264_nvenc           NVIDIA NVENC H.264 encoder"
        line = line.strip()
        if "_nvenc" in line:
            # Pull out the encoder name (2nd token after the flags)
            tokens = line.split()
            if len(tokens) >= 2:
                encoders.append(tokens[1])

    if not encoders:
        return {"available": False, "reason": "no nvenc encoders in ffmpeg"}

    # Confirm we actually have a usable NVIDIA GPU. Without one the encoder
    # binary exists but every encode will fail at runtime with "Cannot load
    # nvcuda.dll" / "no CUDA capable device".
    if nvidia is None:
        nvidia = detect_nvidia_gpu()
    if not nvidia.get("available"):
        return {
            "available": False,
            "encoders": encoders,
            "reason": "no NVIDIA GPU present (encoder built in but unusable)",
        }

    return {"available": True, "encoders": encoders}


def probe_ctranslate2_cuda() -> dict:
    """
    Probe whether CTranslate2 (used by faster-whisper) has CUDA support.
    Returns {"available": bool, "device_count": int, "reason"?: str}.
    """
    if FORCE_CPU:
        return {"available": False, "reason": "LTS_FORCE_CPU=1"}

    try:
        import ctranslate2  # type: ignore

        count = ctranslate2.get_cuda_device_count()
        if count > 0:
            return {"available": True, "device_count": count}
        return {"available": False, "reason": "ctranslate2 reports 0 CUDA devices"}
    except ImportError:
        return {"available": False, "reason": "ctranslate2 not installed"}
    except Exception as e:  # noqa: BLE001
        return {"available": False, "reason": f"ctranslate2 error: {e}"}


def gpu_info(force_refresh: bool = False) -> dict:
    """
    Aggregate GPU support info, cached after first call.

    Returns dict with keys:
      nvidia, nvenc, whisper_cuda, summary
    """
    global _gpu_info_cache
    if _gpu_info_cache is not None and not force_refresh:
        return _gpu_info_cache

    nvidia = detect_nvidia_gpu()
    nvenc = detect_nvenc(nvidia=nvidia)
    whisper_cuda = probe_ctranslate2_cuda()

    # Build human-readable summary
    parts = []
    if nvidia.get("available"):
        parts.append(
            f"{nvidia['name']} ({nvidia['memory_total_mb']} MB)"
        )
    else:
        parts.append("CPU only")
    parts.append("NVENC: on" if nvenc.get("available") else "NVENC: off")
    parts.append("Whisper CUDA: on" if whisper_cuda.get("available") else "Whisper CUDA: off")

    _gpu_info_cache = {
        "nvidia": nvidia,
        "nvenc": nvenc,
        "whisper_cuda": whisper_cuda,
        "force_cpu": FORCE_CPU,
        "summary": " | ".join(parts),
    }
    return _gpu_info_cache


def video_encoder_args(quality: str = "balanced") -> list[str]:
    """
    Return the FFmpeg encoder arguments to use for video encoding.

    Uses NVENC (h264_nvenc) when available, otherwise libx264.
    `quality` can be: "fast", "balanced", "best".
    """
    info = gpu_info()
    if info["nvenc"].get("available"):
        # NVENC tuning — GTX 1650 supports all of these
        preset = {
            "fast": "p2",        # fast
            "balanced": "p4",    # medium
            "best": "p6",        # slow / quality
        }.get(quality, "p4")

        cq = {
            "fast": "26",
            "balanced": "23",
            "best": "20",
        }.get(quality, "23")

        return [
            "-c:v", "h264_nvenc",
            "-preset", preset,
            "-tune", "hq",
            "-rc", "vbr",
            "-cq", cq,
            "-b:v", "0",
            "-pix_fmt", "yuv420p",
        ]

    # CPU fallback
    preset = {
        "fast": "veryfast",
        "balanced": "veryfast",
        "best": "medium",
    }.get(quality, "veryfast")

    crf = {
        "fast": "25",
        "balanced": "23",
        "best": "20",
    }.get(quality, "23")

    return [
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", crf,
        "-pix_fmt", "yuv420p",
    ]


def whisper_device_settings(prefer_gpu: bool = True) -> tuple[str, str]:
    """
    Return (device, compute_type) for faster-whisper.

    For GTX 1650 (4 GB), we use float16 — much faster than int8_float16 with
    no quality loss on the `small` model. CPU fallback uses int8.
    """
    if prefer_gpu and not FORCE_CPU:
        info = gpu_info()
        if info["whisper_cuda"].get("available"):
            return ("cuda", "float16")
        # Even when ctranslate2 doesn't report CUDA, if nvidia-smi shows a GPU
        # the user might be missing CUDA libs — log it but don't crash here.
    return ("cpu", "int8")


def whisper_model_size(prefer_gpu: bool = True) -> str:
    """
    Return the Whisper model size to use.

    On GPU we use 'small' — great quality, ~1 GB VRAM, fast.
    'medium' is ~3 GB VRAM and fits on a 4 GB GTX 1650 but cuts speed in half.
    On CPU we still use 'small' (int8) because tiny is too lossy for word
    timestamps.
    """
    override = os.environ.get("LTS_WHISPER_MODEL")
    if override:
        return override

    device, _ = whisper_device_settings(prefer_gpu=prefer_gpu)
    if device == "cuda":
        info = gpu_info()
        mem_mb = info["nvidia"].get("memory_total_mb", 0)
        # 4 GB → small. 6 GB → medium. 10 GB+ → large-v3.
        if mem_mb >= 10000:
            return "large-v3"
        if mem_mb >= 6000:
            return "medium"
        return "small"

    return "small"


if __name__ == "__main__":
    # Pretty-print as JSON for quick CLI inspection / Node.js consumption.
    print(json.dumps(gpu_info(), indent=2))
