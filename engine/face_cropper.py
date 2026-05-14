"""
Face detection for smart 9:16 vertical cropping.
Uses OpenCV DNN face detector (works on all Python versions).
Falls back to center crop if no face detected.

Multi-speaker support:
  When 2+ faces are detected far apart (can't fit in single 9:16 crop),
  generates split-screen crop data so FFmpeg can stack two crops vertically.
"""

import os
import json
import sys
import subprocess
import numpy as np
from utils import emit_progress, emit_error, emit_complete


def detect_face_position(video_path: str, start_time: float = 0,
                          duration: float = 10, sample_count: int = 5) -> dict:
    """
    Detect face positions in a video segment.
    Finds ALL faces and returns:
      - Combined center (for single-crop mode)
      - Individual face regions (for split-screen mode)
      - multi_speaker flag when faces are too far apart for single 9:16 crop
    """
    import cv2

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {
            "center_x": 0.5, "center_y": 0.5,
            "detected": False, "face_count": 0,
            "multi_speaker": False
        }

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Calculate frame positions to sample
    start_frame = int(start_time * fps)
    end_frame = min(int((start_time + duration) * fps), total_frames - 1)

    if end_frame <= start_frame:
        end_frame = min(start_frame + int(fps * 5), total_frames - 1)

    step = max(1, (end_frame - start_frame) // sample_count)
    sample_frames = list(range(start_frame, end_frame, step))[:sample_count]

    # Collect ALL face bounding boxes across all samples
    all_face_rects = []  # (left_x, top_y, right_x, bottom_y) normalized
    max_faces_in_frame = 0

    # Per-frame face groups to identify consistent speaker positions
    frame_face_groups = []

    # Use OpenCV's built-in Haar cascade face detector (always available)
    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    face_cascade = cv2.CascadeClassifier(cascade_path)

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
            minSize=(int(frame_w * 0.04), int(frame_h * 0.04))
        )

        frame_faces = []
        if len(faces) > 0:
            max_faces_in_frame = max(max_faces_in_frame, len(faces))
            for (x, y, w, h) in faces:
                # Normalize to 0-1
                left = x / frame_w
                top = y / frame_h
                right = (x + w) / frame_w
                bottom = (y + h) / frame_h
                all_face_rects.append((left, top, right, bottom))
                frame_faces.append((left, top, right, bottom))

        frame_face_groups.append(frame_faces)

    cap.release()

    if not all_face_rects:
        return {
            "center_x": 0.5, "center_y": 0.5,
            "detected": False, "face_count": 0,
            "multi_speaker": False,
            "confidence": 0.0
        }

    # Find bounding box that includes ALL detected faces
    min_left = min(r[0] for r in all_face_rects)
    min_top = min(r[1] for r in all_face_rects)
    max_right = max(r[2] for r in all_face_rects)
    max_bottom = max(r[3] for r in all_face_rects)

    # Center of all faces combined
    center_x = (min_left + max_right) / 2
    center_y = (min_top + max_bottom) / 2

    # Width span of all faces (for smart crop width calculation)
    face_span_x = max_right - min_left

    # --- Multi-speaker detection ---
    # 9:16 crop width ratio on a 16:9 video ≈ 0.5625 of height, which is
    # roughly 9/16 * (frame_h/frame_w) of the frame width
    # For a 1920x1080 video: crop_w = 1080 * 9/16 = 607.5 → 607.5/1920 = 0.316
    # So if face_span_x > 0.4, faces are too far apart for single 9:16 crop
    multi_speaker = False
    left_face = None
    right_face = None

    if max_faces_in_frame >= 2 and face_span_x > 0.4:
        # Cluster faces into left-side and right-side groups
        face_centers_x = [(r[0] + r[2]) / 2 for r in all_face_rects]
        midpoint = sum(face_centers_x) / len(face_centers_x)

        left_faces = [r for r in all_face_rects if (r[0] + r[2]) / 2 < midpoint]
        right_faces = [r for r in all_face_rects if (r[0] + r[2]) / 2 >= midpoint]

        if left_faces and right_faces:
            multi_speaker = True

            # Calculate average bounding box for each group
            left_face = {
                "center_x": round(sum((r[0] + r[2]) / 2 for r in left_faces) / len(left_faces), 4),
                "center_y": round(sum((r[1] + r[3]) / 2 for r in left_faces) / len(left_faces), 4),
                "left": round(min(r[0] for r in left_faces), 4),
                "top": round(min(r[1] for r in left_faces), 4),
                "right": round(max(r[2] for r in left_faces), 4),
                "bottom": round(max(r[3] for r in left_faces), 4),
            }
            right_face = {
                "center_x": round(sum((r[0] + r[2]) / 2 for r in right_faces) / len(right_faces), 4),
                "center_y": round(sum((r[1] + r[3]) / 2 for r in right_faces) / len(right_faces), 4),
                "left": round(min(r[0] for r in right_faces), 4),
                "top": round(min(r[1] for r in right_faces), 4),
                "right": round(max(r[2] for r in right_faces), 4),
                "bottom": round(max(r[3] for r in right_faces), 4),
            }

    result = {
        "center_x": round(max(0.0, min(1.0, center_x)), 4),
        "center_y": round(max(0.0, min(1.0, center_y)), 4),
        "detected": True,
        "face_count": max_faces_in_frame,
        "face_span_x": round(face_span_x, 4),
        "confidence": len(all_face_rects) / (len(sample_frames) * max(max_faces_in_frame, 1)),
        "multi_speaker": multi_speaker,
    }

    if multi_speaker and left_face and right_face:
        result["left_face"] = left_face
        result["right_face"] = right_face

    return result


def calculate_crop(video_width: int, video_height: int,
                   face_center_x: float, target_ratio: str = "9:16") -> dict:
    """
    Calculate crop coordinates based on face position.
    """
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

    # Calculate X offset based on face position
    face_pixel_x = int(face_center_x * video_width)
    crop_x = face_pixel_x - crop_w // 2
    crop_x = max(0, min(crop_x, video_width - crop_w))

    crop_y = max(0, (video_height - crop_h) // 2)

    return {
        "x": crop_x,
        "y": crop_y,
        "w": crop_w,
        "h": crop_h,
        "output_w": 1080 if target_ratio == "9:16" else (1080 if target_ratio == "1:1" else 1920),
        "output_h": 1920 if target_ratio == "9:16" else (1080 if target_ratio == "1:1" else 1080),
    }


def calculate_split_crop(video_width: int, video_height: int,
                          left_face: dict, right_face: dict,
                          target_ratio: str = "9:16") -> dict:
    """
    Calculate TWO crop regions for split-screen mode.
    Each person gets their own crop box, then they are stacked vertically.

    Output: 1080x1920 (9:16)
      - Top half: 1080x960 (person A)
      - Bottom half: 1080x960 (person B)
    """
    if target_ratio != "9:16":
        # Split-screen only makes sense for 9:16
        return None

    out_w = 1080
    out_h = 1920
    half_h = out_h // 2  # 960 per person

    # Each person box aspect ratio = 1080:960 = 9:8
    person_ratio = out_w / half_h  # 1.125

    # Calculate crop for each person
    def person_crop(face, vw, vh):
        cx = face["center_x"] * vw
        cy = face["center_y"] * vh

        # Try to use full video height for best quality
        crop_h = vh
        crop_w = int(crop_h * person_ratio)

        if crop_w > vw:
            crop_w = vw
            crop_h = int(crop_w / person_ratio)

        # Center on the face's X position
        crop_x = int(cx - crop_w / 2)
        crop_x = max(0, min(crop_x, vw - crop_w))

        # Center vertically on face
        crop_y = int(cy - crop_h / 2)
        crop_y = max(0, min(crop_y, vh - crop_h))

        return {
            "x": crop_x,
            "y": crop_y,
            "w": crop_w,
            "h": crop_h,
        }

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


def get_video_dimensions(video_path: str) -> tuple:
    """Get video width and height using ffprobe."""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-select_streams', 'v:0',
             '-show_entries', 'stream=width,height',
             '-of', 'json', video_path],
            capture_output=True, text=True
        )
        data = json.loads(result.stdout)
        stream = data['streams'][0]
        return int(stream['width']), int(stream['height'])
    except Exception:
        return 1920, 1080


def analyze_clips_for_cropping(video_path: str, clips: list,
                                target_ratio: str = "9:16") -> list:
    """
    Analyze all clips for face positions and calculate crop parameters.
    Detects multi-speaker situations and generates split-screen crop data.
    """
    emit_progress("crop", 0, "Analyzing face positions for smart cropping...")

    width, height = get_video_dimensions(video_path)

    for i, clip in enumerate(clips):
        pct = int((i / max(len(clips), 1)) * 100)
        emit_progress("crop", pct, f"Analyzing clip {i+1}/{len(clips)}...")

        face = detect_face_position(
            video_path,
            clip['start'],
            min(clip['duration'], 10),
            sample_count=3
        )

        # Default single-person crop
        crop = calculate_crop(width, height, face['center_x'], target_ratio)

        clip['face'] = face
        clip['crop'] = crop
        clip['video_width'] = width
        clip['video_height'] = height

        # Multi-speaker split-screen crop
        if face.get('multi_speaker') and face.get('left_face') and face.get('right_face'):
            split_crop = calculate_split_crop(
                width, height,
                face['left_face'], face['right_face'],
                target_ratio
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
