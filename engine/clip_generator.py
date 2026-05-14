"""
Clip generator using FFmpeg.
Cuts video segments, applies 9:16 crop, burns subtitles, generates thumbnails.

Features:
  - Single-person smart crop (face-centered)
  - Multi-speaker split-screen (top/bottom stacking)
  - Anti-copyright subtle zoom/pan effect (Ken Burns)
  - High-quality output with no resolution loss
"""

import os
import json
import sys
import subprocess
import random
from utils import (
    emit_progress, emit_error, emit_complete,
    get_clip_dir, get_thumbnail_path, format_time, ensure_dirs
)
from subtitle_styles import generate_word_by_word_ass


def _build_anticopy_filter(output_w: int, output_h: int) -> str:
    """
    Build a LIGHTWEIGHT anti-copyright filter.

    Strategy (almost zero extra CPU cost):
      - Scale to exact output resolution
      - Tiny random brightness/saturation shift (invisible to eyes, unique to detectors)

    NOTE: Crop is already handled separately (face crop or center crop).
    This function only adds scale + color fingerprint.
    """
    # Tiny color shift (invisible to human eye, changes pixel values)
    brightness = round(random.uniform(-0.02, 0.02), 4)
    saturation = round(random.uniform(0.97, 1.03), 4)

    # scale → color shift
    filter_str = (
        f"scale={output_w}:{output_h}:flags=lanczos,"
        f"eq=brightness={brightness}:saturation={saturation}"
    )

    return filter_str


def _safe_ass_path(sub_path: str) -> str:
    """
    Convert a Windows path to FFmpeg ass= filter safe format.
    The safest way on Windows is to use a relative path to avoid drive letter colons,
    and rigorously escape spaces and remaining colons.
    """
    try:
        # Make path relative to avoid drive letter colon issues in FFmpeg
        cwd = os.getcwd()
        rel_path = os.path.relpath(sub_path, cwd)
        safe = rel_path.replace('\\', '/')
    except ValueError:
        # Fallback to absolute if on a different drive
        safe = sub_path.replace('\\', '/')
        
    # Escape colons
    safe = safe.replace(':', '\\:')
    # Escape spaces
    safe = safe.replace(' ', '\\ ')
    
    return safe


def generate_single_clip(video_path: str, clip: dict, output_dir: str,
                          transcription: dict = None,
                          template: str = "default",
                          add_subtitles: bool = True,
                          hook_position: str = "upper",
                          sub_position: str = "bottom") -> dict:
    """
    Generate a single short clip from the original video.

    Supports:
      - Single-person face-centered crop
      - Multi-speaker split-screen (top/bottom)
      - Anti-copyright zoom/pan effect
      - Subtitle burning

    Args:
        video_path: Path to the original video
        clip: Clip dict from scene_detector (with crop params from face_cropper)
        output_dir: Directory to save the clip
        transcription: Full transcription dict
        template: Subtitle template name
        add_subtitles: Whether to burn subtitles

    Returns:
        Updated clip dict with output file path.
    """
    clip_index = clip['index']
    start = clip['start']
    end = clip['end']
    duration = clip['duration']
    crop = clip.get('crop', {})
    split_crop = clip.get('split_crop', None)

    # Output paths
    output_path = os.path.join(output_dir, f"clip_{clip_index:03d}.mp4")
    thumb_path = os.path.join(output_dir, f"clip_{clip_index:03d}_thumb.jpg")
    sub_path = os.path.join(output_dir, f"clip_{clip_index:03d}.ass")

    # Determine output resolution
    out_w = crop.get('output_w', 1080) if crop else 1080
    out_h = crop.get('output_h', 1920) if crop else 1920

    is_split = split_crop is not None and split_crop.get('mode') == 'split'

    if is_split:
        out_w = split_crop['output_w']
        out_h = split_crop['output_h']

    # --- Build FFmpeg command ---
    if is_split:
        # ===== SPLIT-SCREEN MODE =====
        # Two separate crops from the same input, stacked vertically
        tc = split_crop['top_crop']
        bc = split_crop['bottom_crop']
        half_h = split_crop['half_h']  # 960

        # Build lightweight anti-copyright filters for each half
        top_anticopy = _build_anticopy_filter(out_w, half_h)
        bottom_anticopy = _build_anticopy_filter(out_w, half_h)

        # Complex filter graph:
        # [0:v] → crop top person → anticopy → [top]
        # [0:v] → crop bottom person → anticopy → [bottom]
        # [top][bottom] → vstack → [v]
        # Add a 4px white divider line between the two halves
        filter_complex = (
            f"[0:v]crop={tc['w']}:{tc['h']}:{tc['x']}:{tc['y']},"
            f"{top_anticopy}[top];"
            f"[0:v]crop={bc['w']}:{bc['h']}:{bc['x']}:{bc['y']},"
            f"{bottom_anticopy}[bottom];"
            f"color=c=white:s={out_w}x4[line];"
            f"[top][line][bottom]vstack=inputs=3,scale={out_w}:{out_h}[v]"
        )

        # Subtitle handling for split mode
        if add_subtitles and transcription and transcription.get('words'):
            clip_words = [
                w for w in transcription['words']
                if w['start'] >= start - 0.5 and w['end'] <= end + 0.5
            ]
            if clip_words:
                # Subtitles go on the full frame (bottom area)
                ass_content = generate_word_by_word_ass(
                    clip_words, start, template, out_w, out_h,
                    clip_duration=duration,
                    hook_position=hook_position, sub_position=sub_position
                )
                with open(sub_path, 'w', encoding='utf-8') as f:
                    f.write(ass_content)

                safe_sub_path = _safe_ass_path(sub_path)
                filter_complex += f";[v]ass={safe_sub_path}[vout]"
                output_label = "[vout]"
            else:
                output_label = "[v]"
        else:
            output_label = "[v]"

        cmd = [
            'ffmpeg', '-y',
            '-ss', str(start),
            '-to', str(end),
            '-i', video_path,
            '-filter_complex', filter_complex,
            '-map', output_label,
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-shortest',
            output_path
        ]

    else:
        # ===== SINGLE-PERSON MODE (with anti-copyright protection) =====
        filters = []

        # Crop filter
        if crop:
            cx = crop.get('x', 0)
            cy = crop.get('y', 0)
            cw = crop.get('w', 1080)
            ch = crop.get('h', 1920)
            filters.append(f"crop={cw}:{ch}:{cx}:{cy}")
        else:
            filters.append("crop=ih*9/16:ih:(iw-ih*9/16)/2:0")

        # Lightweight anti-copyright filter (scale+color shift)
        anticopy = _build_anticopy_filter(out_w, out_h)
        filters.append(anticopy)

        # Generate subtitles if transcription available
        if add_subtitles and transcription and transcription.get('words'):
            clip_words = [
                w for w in transcription['words']
                if w['start'] >= start - 0.5 and w['end'] <= end + 0.5
            ]

            if clip_words:
                ass_content = generate_word_by_word_ass(
                    clip_words, start, template, out_w, out_h,
                    clip_duration=duration,
                    hook_position=hook_position, sub_position=sub_position
                )

                with open(sub_path, 'w', encoding='utf-8') as f:
                    f.write(ass_content)

                safe_sub_path = _safe_ass_path(sub_path)
                filters.append(f"ass={safe_sub_path}")

        # Build filter string
        filter_str = ','.join(filters) if filters else None

        # Build FFmpeg command
        cmd = [
            'ffmpeg', '-y',
            '-ss', str(start),
            '-to', str(end),
            '-i', video_path,
        ]

        if filter_str:
            cmd.extend(['-vf', filter_str])

        cmd.extend([
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-shortest',
            output_path
        ])

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=600
        )

        if result.returncode != 0:
            # Log FFmpeg error for debugging
            stderr_tail = result.stderr[-300:] if result.stderr else 'unknown'
            print(f"[CLIP {clip_index}] FFmpeg FAILED. Error: {stderr_tail}", flush=True)
            emit_progress("generate", -1, f"FFmpeg retry (clip {clip_index}): subtitle filter issue, retrying without subs")
            # Fallback: try without subtitles and without zoom
            fallback_filters = []
            if crop:
                cx = crop.get('x', 0)
                cy = crop.get('y', 0)
                cw = crop.get('w', 1080)
                ch = crop.get('h', 1920)
                fallback_filters.append(f"crop={cw}:{ch}:{cx}:{cy}")
                fallback_filters.append(f"scale={out_w}:{out_h}")
            else:
                fallback_filters.append("crop=ih*9/16:ih:(iw-ih*9/16)/2:0")
                fallback_filters.append("scale=1080:1920")

            filter_str_fallback = ','.join(fallback_filters)

            cmd2 = [
                'ffmpeg', '-y',
                '-ss', str(start),
                '-to', str(end),
                '-i', video_path,
                '-vf', filter_str_fallback,
                '-c:v', 'libx264', '-preset', 'ultrafast',
                '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart', '-shortest',
                output_path
            ]

            result2 = subprocess.run(cmd2, capture_output=True, text=True, timeout=300)
            if result2.returncode != 0:
                return None

        # Generate thumbnail
        thumb_cmd = [
            'ffmpeg', '-y',
            '-ss', str(start + duration / 3),
            '-i', video_path,
        ]

        if is_split and split_crop:
            tc = split_crop['top_crop']
            thumb_cmd.extend(['-vf', f"crop={tc['w']}:{tc['h']}:{tc['x']}:{tc['y']},scale=270:480"])
        elif crop:
            cx = crop.get('x', 0)
            cy = crop.get('y', 0)
            cw = crop.get('w', 1080)
            ch = crop.get('h', 1920)
            thumb_cmd.extend(['-vf', f"crop={cw}:{ch}:{cx}:{cy},scale=270:480"])
        else:
            thumb_cmd.extend(['-vf', "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=270:480"])

        thumb_cmd.extend(['-vframes', '1', '-q:v', '3', thumb_path])

        subprocess.run(thumb_cmd, capture_output=True, text=True, timeout=30)

        # Get file size
        file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0

        clip['output_path'] = output_path
        clip['thumbnail_path'] = thumb_path if os.path.exists(thumb_path) else None
        clip['subtitle_path'] = sub_path if os.path.exists(sub_path) else None
        clip['file_size'] = file_size
        clip['generated'] = True
        clip['is_split_screen'] = is_split

        return clip

    except subprocess.TimeoutExpired:
        return None
    except Exception:
        return None


def generate_all_clips(video_path: str, clips: list, video_id: str,
                        transcription: dict = None,
                        template: str = "default",
                        add_subtitles: bool = True,
                        hook_position: str = "upper",
                        sub_position: str = "bottom") -> list:
    """
    Generate all clips from a video.

    Args:
        video_path: Path to original video
        clips: List of clip dicts (with crop params)
        video_id: Video identifier
        transcription: Full transcription dict
        template: Subtitle template name
        add_subtitles: Whether to add subtitles

    Returns:
        List of generated clip dicts with output file paths.
    """
    ensure_dirs()
    output_dir = get_clip_dir(video_id)

    emit_progress("generate", 0, f"Generating {len(clips)} clips...")

    generated = []
    failed = 0
    split_count = 0

    for i, clip in enumerate(clips):
        pct = int((i / max(len(clips), 1)) * 100)
        is_split = clip.get('split_crop') is not None
        mode_str = "split-screen" if is_split else "single"
        emit_progress("generate", pct, f"Generating clip {i+1}/{len(clips)} ({mode_str})...")

        result = generate_single_clip(
            video_path, clip, output_dir,
            transcription, template, add_subtitles,
            hook_position, sub_position
        )

        if result:
            generated.append(result)
            if result.get('is_split_screen'):
                split_count += 1
        else:
            failed += 1
            clip['generated'] = False
            clip['error'] = 'FFmpeg processing failed'
            generated.append(clip)

    emit_progress("generate", 100, f"Generated {len(generated) - failed}/{len(clips)} clips! ({split_count} split-screen)")
    emit_complete("generate", {
        "total": len(clips),
        "success": len(generated) - failed,
        "failed": failed,
        "split_screen": split_count,
        "output_dir": output_dir,
    })

    # Save final clips data
    clips_json_path = os.path.join(output_dir, "clips.json")
    with open(clips_json_path, 'w', encoding='utf-8') as f:
        json.dump(generated, f, ensure_ascii=False, indent=2)

    return generated


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: python clip_generator.py <video_path> <clips.json> <video_id> [transcription.json] [template]"}))
        sys.exit(1)

    video_path = sys.argv[1]
    clips_path = sys.argv[2]
    video_id = sys.argv[3]

    with open(clips_path, 'r', encoding='utf-8') as f:
        clips = json.load(f)

    transcription = None
    if len(sys.argv) > 4 and os.path.exists(sys.argv[4]):
        with open(sys.argv[4], 'r', encoding='utf-8') as f:
            transcription = json.load(f)

    template = sys.argv[5] if len(sys.argv) > 5 else "default"

    result = generate_all_clips(video_path, clips, video_id, transcription, template)
    if not result:
        sys.exit(1)
