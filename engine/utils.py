"""
Utility functions for the Long to Shorts Maker engine.
Handles JSON output, file paths, and common operations.
"""

import json
import sys
import os
import hashlib
import time

# Base paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
VIDEOS_DIR = os.path.join(STORAGE_DIR, "videos")
CLIPS_DIR = os.path.join(STORAGE_DIR, "clips")
THUMBNAILS_DIR = os.path.join(STORAGE_DIR, "thumbnails")
TEMP_DIR = os.path.join(STORAGE_DIR, "temp")


def ensure_dirs():
    """Create all required storage directories."""
    for d in [STORAGE_DIR, VIDEOS_DIR, CLIPS_DIR, THUMBNAILS_DIR, TEMP_DIR]:
        os.makedirs(d, exist_ok=True)


def generate_id(text: str) -> str:
    """Generate a short unique ID from text + timestamp."""
    raw = f"{text}_{time.time()}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def emit(event: str, data: dict):
    """Emit a JSON event to stdout for Node.js to capture."""
    msg = json.dumps({"event": event, **data}, ensure_ascii=False)
    print(msg, flush=True)


def emit_progress(step: str, progress: int, message: str = ""):
    """Emit a progress update."""
    emit("progress", {
        "step": step,
        "progress": progress,
        "message": message
    })


def emit_error(message: str, step: str = ""):
    """Emit an error event."""
    emit("error", {
        "step": step,
        "message": message
    })


def emit_complete(step: str, data: dict = None):
    """Emit a completion event."""
    payload = {"step": step}
    if data:
        payload["data"] = data
    emit("complete", payload)


def get_video_path(video_id: str, ext: str = "mp4") -> str:
    """Get the path for a video file."""
    return os.path.join(VIDEOS_DIR, f"{video_id}.{ext}")


def get_clip_dir(video_id: str) -> str:
    """Get the clip directory for a video."""
    path = os.path.join(CLIPS_DIR, video_id)
    os.makedirs(path, exist_ok=True)
    return path


def get_thumbnail_path(video_id: str, clip_index: int) -> str:
    """Get the thumbnail path for a clip."""
    return os.path.join(THUMBNAILS_DIR, f"{video_id}_clip{clip_index}.jpg")


def format_time(seconds: float) -> str:
    """Format seconds to HH:MM:SS.ms string."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def parse_time(time_str: str) -> float:
    """Parse HH:MM:SS.ms string to seconds."""
    parts = time_str.split(":")
    h, m = int(parts[0]), int(parts[1])
    s = float(parts[2])
    return h * 3600 + m * 60 + s
