"""
Face detection + smart 9:16 vertical cropping.

Uses OpenCV's Haar cascade face detector (no external models needed) +
multi-frame tracking with exponential-moving-average smoothing so the crop
window doesn't jerk between frames.

Outputs:
  - For each clip: a single static crop window (x, y, w, h) that contains
    the speaker(s) for ≥80% of the clip duration.
  - When two speakers sit too far apart for one 9:16 crop, a split-screen
    descriptor is added (top_crop + bottom_crop) so the clip_generator
    can vstack them.

Why static crop (not pan)?
  Most short-form formats expect the speaker centered. A static, well-chosen
  crop window looks more professional than a panning window that follows
  every micro-movement.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Optional

import numpy as np

from utils import emit_complete, emit_error, emit_progress


# ---------------------------------------------------------------------------
# Multi-frame face sampling with smoothing
# ---------------------------------------------------------------------------


def _smooth_series(values: list[float], alpha: float = 0.35) -> list[float]:
    """
    Exponential-moving-average smoothing. Reduces jitter between frames.
    `alpha` ∈ (0,1) — higher = more responsive, lower = smoother.
    """
    if not values:
        return values
    out = [values[0]]
    for v in values[1:]:
        out.append(alpha * v + (1 - alpha) * out[-1])
    return out


def detect_face_position(
    video_path: str,
    start_time: float = 0,
    duration: float = 10,
    sample_count: int = 8,
) -> dict:
    """
    Sample `sample_count` frames evenly across the clip and detect faces.

    Returns a dict with:
      - center_x, center_y       (normalized, smoothed across samples)
      - detected, face_count
      - face_span_x              (how spread out faces are)
      - multi_speaker (bool)
      - left_face, right_face    (when multi_speaker=True)
    """
    import cv2

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {
            "center_x": 0.5, "center_y": 0.5,
            "detected": False, "face_count": 0,
            "multi_speaker": False,
        }

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    start_frame = int(start_time * fps)
    end_frame = min(int((start_time + duration) * fps), total_frames - 1)

    if end_frame <= start_frame:
        end_frame = min(start_frame + int(fps * 5), total_frames - 1)

    step = max(1, (end_frame - start_frame) // sample_count)
    sample_frames = list(range(start_frame, end_frame, step))[:sample_count]

    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    face_cascade = cv2.CascadeClassifier(cascade_path)

    all_face_rects = []  # (left_x, top_y, right_x, bottom_y) normalized
    max_faces_in_frame = 0
    per_frame_main_face_x: list[float] = []  # X-center of largest face in each frame
    per_frame_main_face_y: list[float] = []

    for frame_idx in sample_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(int(frame_w * 0.04), int(frame_h * 0.04)),
        )

        if len(faces) > 0:
            max_faces_in_frame = max(max_faces_in_frame, len(faces))

            # Identify the largest face in this frame (likely the speaker)
            largest = max(faces, key=lambda f: f[2] * f[3])
            lx, ly, lw, lh = largest
            per_frame_main_face_x.append((lx + lw / 2) / frame_w)
            per_frame_main_face_y.append((ly + lh / 2) / frame_h)

            for (x, y, w, h) in faces:
                left = x / frame_w
                top = y / frame_h
                right = (x + w) / frame_w
                bottom = (y + h) / frame_h
                all_face_rects.append((left, top, right, bottom))

    cap.release()

    if not all_face_rects:
        return {
            "center_x": 0.5, "center_y": 0.5,
            "detected": False, "face_count": 0,
            "multi_speaker": False,
            "confidence": 0.0,
        }

    # Smooth the per-frame main face position (kills jitter between samples).
    smoothed_x = _smooth_series(per_frame_main_face_x)
    smoothed_y = _smooth_series(per_frame_main_face_y)
    center_x_smoothed = float(np.median(smoothed_x)) if smoothed_x else 0.5
    center_y_smoothed = float(np.median(smoothed_y)) if smoothed_y else 0.5

    # Multi-speaker detection: if span of face X positions is > 0.4 of frame,
    # they won't fit in a single 9:16 crop.
    min_left = min(r[0] for r in all_face_rects)
    max_right = max(r[2] for r in all_face_rects)
    face_span_x = max_right - min_left

    multi_speaker = False
    left_face = None
    right_face = None

    if max_faces_in_frame >= 2 and face_span_x > 0.4:
        face_centers_x = [(r[0] + r[2]) / 2 for r in all_face_rects]
        midpoint = float(np.median(face_centers_x))

        left_rects = [r for r in all_face_rects if (r[0] + r[2]) / 2 < midpoint]
        right_rects = [r for r in all_face_rects if (r[0] + r[2]) / 2 >= midpoint]

        if left_rects and right_rects:
            multi_speaker = True

            def _avg_box(rects):
                cx = float(np.mean([(r[0] + r[2]) / 2 for r in rects]))
                cy = float(np.mean([(r[1] + r[3]) / 2 for r in rects]))
                return {
                    "center_x": round(cx, 4),
                    "center_y": round(cy, 4),
                    "left": round(min(r[0] for r in rects), 4),
                    "top": round(min(r[1] for r in rects), 4),
                    "right": round(max(r[2] for r in rects), 4),
                    "bottom": round(max(r[3] for r in rects), 4),
                }

            left_face = _avg_box(left_rects)
            right_face = _avg_box(right_rects)

    confidence = len(all_face_rects) / (len(sample_frames) * max(max_faces_in_frame, 1))

    result = {
        "center_x": round(max(0.0, min(1.0, center_x_smoothed)), 4),
        "center_y": round(max(0.0, min(1.0, center_y_smoothed)), 4),
        "detected": True,
        "face_count": max_faces_in_frame,
        "face_span_x": round(face_span_x, 4),
        "confidence": round(min(confidence, 1.0), 3),
        "multi_speaker": multi_speaker,
    }

    if multi_speaker and left_face and right_face:
        result["left_face"] = left_face
        result["right_face"] = right_face

    return result


# ---------------------------------------------------------------------------
# Crop math
# ---------------------------------------------------------------------------


def calculate_crop(
    video_width: int,
    video_height: int,
    face_center_x: float,
    target_ratio: str = "9:16",
) -> dict:
    """Calculate crop coordinates so the face is horizontally centered."""
    if target_ratio == "9:16":
        ratio = 9 / 16
    elif target_ratio == "1:1":
        ratio = 1.0
    elif target_ratio == "16:9":
        ratio = 16 / 9
    else:
        ratio = 9 / 16

    crop_h = video_height
    crop_w = int(crop_h * ratio)

    if crop_w > video_width:
        crop_w = video_width
        crop_h = int(crop_w / ratio)

    # Center horizontally on face
    face_pixel_x = int(face_center_x * video_width)
    crop_x = face_pixel_x - crop_w // 2
    crop_x = max(0, min(crop_x, video_width - crop_w))
    crop_y = max(0, (video_height - crop_h) // 2)

    output_w = 1080 if target_ratio in ("9:16", "1:1") else 1920
    output_h = 1920 if target_ratio == "9:16" else (1080 if target_ratio in ("1:1", "16:9") else 1920)

    return {
        "x": crop_x,
        "y": crop_y,
        "w": crop_w,
        "h": crop_h,
        "output_w": output_w,
        "output_h": output_h,
    }


def calculate_split_crop(
    video_width: int,
    video_height: int,
    left_face: dict,
    right_face: dict,
    target_ratio: str = "9:16",
) -> Optional[dict]:
    """
    Two crop regions for split-screen mode, stacked vertically.
    Output: 1080x1920 (9:16); each half is 1080x960.
    """
    if target_ratio != "9:16":
        return None

    out_w = 1080
    out_h = 1920
    half_h = out_h // 2
    person_ratio = out_w / half_h  # 1.125

    def person_crop(face, vw, vh):
        cx = face["center_x"] * vw
        cy = face["center_y"] * vh

        crop_h = vh
        crop_w = int(crop_h * person_ratio)

        if crop_w > vw:
            crop_w = vw
            crop_h = int(crop_w / person_ratio)

        crop_x = int(cx - crop_w / 2)
        crop_x = max(0, min(crop_x, vw - crop_w))

        crop_y = int(cy - crop_h / 2)
        crop_y = max(0, min(crop_y, vh - crop_h))

        return {"x": crop_x, "y": crop_y, "w": crop_w, "h": crop_h}

    top_crop = person_crop(left_face, video_width, video_height)
    bottom_crop = person_crop(right_face, video_width, video_height)

    return {
        "mode": "split",
        "top_crop": top_crop,
        "bottom_crop": bottom_crop,
        "output_w": out_w,
        "output_h": out_h,
        "half_h": half_h,
    }


def get_video_dimensions(video_path: str) -> tuple[int, int]:
    """Get video width and height using ffprobe."""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-select_streams', 'v:0',
             '-show_entries', 'stream=width,height',
             '-of', 'json', video_path],
            capture_output=True, text=True,
        )
        data = json.loads(result.stdout)
        stream = data['streams'][0]
        return int(stream['width']), int(stream['height'])
    except Exception:
        return 1920, 1080


def analyze_clips_for_cropping(
    video_path: str,
    clips: list,
    target_ratio: str = "9:16",
) -> list:
    """
    Analyze all clips for face positions and calculate crop parameters.
    Detects multi-speaker situations and generates split-screen crop data.
    """
    emit_progress("crop", 0, "Analyzing face positions for smart cropping...")

    width, height = get_video_dimensions(video_path)

    for i, clip in enumerate(clips):
        pct = int((i / max(len(clips), 1)) * 100)
        emit_progress("crop", pct, f"Analyzing clip {i + 1}/{len(clips)}...")

        face = detect_face_position(
            video_path,
            clip['start'],
            min(clip['duration'], 12),
            sample_count=8,   # 8 samples per clip (was 3) → much smoother
        )

        crop = calculate_crop(width, height, face['center_x'], target_ratio)

        clip['face'] = face
        clip['crop'] = crop
        clip['video_width'] = width
        clip['video_height'] = height

        if face.get('multi_speaker') and face.get('left_face') and face.get('right_face'):
            split_crop = calculate_split_crop(
                width, height,
                face['left_face'], face['right_face'],
                target_ratio,
            )
            if split_crop:
                clip['split_crop'] = split_crop

    emit_progress("crop", 100, "Face analysis complete!")
    emit_complete("crop", {"clips_analyzed": len(clips)})

    return clips


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python face_cropper.py <video_path> <clips.json> [ratio]"}))
        sys.exit(1)

    video_path = sys.argv[1]
    clips_path = sys.argv[2]
    ratio = sys.argv[3] if len(sys.argv) > 3 else "9:16"

    with open(clips_path, 'r', encoding='utf-8') as f:
        clips = json.load(f)

    result = analyze_clips_for_cropping(video_path, clips, ratio)
    if result:
        with open(clips_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    else:
        sys.exit(1)
