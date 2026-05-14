"""
Audio transcription using faster-whisper.

Speed/quality strategy:
  - Extracts audio to a 16 kHz mono WAV first (fastest input for Whisper).
  - On GPU (e.g. GTX 1650): runs `small` in float16 on CUDA. ~5–10x faster
    than CPU + better quality than int8.
  - On CPU: runs `small` in int8 quantization.
  - Caches the loaded model in-process so consecutive videos in a batch
    do not pay the model-load cost twice.

Supports word-level timestamps for subtitle generation.
"""

from __future__ import annotations

import json
import os
import sys
import subprocess
from typing import Optional

from utils import emit_progress, emit_error, emit_complete
from gpu_utils import (
    gpu_info,
    whisper_device_settings,
    whisper_model_size,
)


# Single shared model instance, keyed by (size, device, compute_type).
# Loading 'small' on GPU takes ~3s and ~1 GB VRAM; reusing it across
# multiple videos in the same Python process is a big win.
_MODEL_CACHE: dict[tuple, "WhisperModel"] = {}  # type: ignore  # noqa: F821


def extract_audio(video_path: str) -> str:
    """
    Extract audio from video as 16 kHz mono WAV.
    WAV decode is much faster than re-decoding the full video for Whisper.
    """
    audio_path = os.path.splitext(video_path)[0] + '_audio.wav'

    # Skip if already extracted
    if os.path.exists(audio_path):
        return audio_path

    emit_progress("transcribe", 1, "Extracting audio from video...")

    cmd = [
        'ffmpeg', '-y',
        '-i', video_path,
        '-vn',                    # No video
        '-acodec', 'pcm_s16le',   # WAV format
        '-ar', '16000',           # 16 kHz (optimal for Whisper)
        '-ac', '1',               # Mono
        audio_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0 and os.path.exists(audio_path):
            return audio_path
    except Exception:
        pass

    # Fallback: use original video file (faster-whisper can decode it directly)
    return video_path


def _load_model(size: str, device: str, compute_type: str):
    """Load (or fetch from cache) a WhisperModel."""
    from faster_whisper import WhisperModel

    key = (size, device, compute_type)
    if key in _MODEL_CACHE:
        return _MODEL_CACHE[key], False

    model = WhisperModel(size, device=device, compute_type=compute_type)
    _MODEL_CACHE[key] = model
    return model, True


def _load_model_with_fallback(size: str, device: str, compute_type: str):
    """
    Try to load the model with the requested settings, fall back through a
    chain of progressively safer options if anything fails.

    Returns (model, model_info_str).
    """
    attempts = []

    # 1. Requested settings (e.g. CUDA + float16)
    attempts.append((size, device, compute_type))

    # 2. If we asked for CUDA, try CUDA + int8_float16 (less VRAM)
    if device == "cuda" and compute_type == "float16":
        attempts.append((size, "cuda", "int8_float16"))

    # 3. CPU + int8 (always-works fallback)
    attempts.append((size, "cpu", "int8"))

    # 4. Last-ditch: tiny model on CPU int8
    attempts.append(("tiny", "cpu", "int8"))

    last_error: Optional[Exception] = None
    for s, d, c in attempts:
        try:
            model, was_loaded = _load_model(s, d, c)
            tag = f"{d}/{c} — {s}"
            if d != device or c != compute_type or s != size:
                tag += " (fallback)"
            if not was_loaded:
                tag += " [cached]"
            return model, tag
        except Exception as e:  # noqa: BLE001
            last_error = e
            continue

    raise RuntimeError(f"Could not load any Whisper model. Last error: {last_error}")


def transcribe_video(video_path: str, language: str = None) -> dict:
    """
    Transcribe audio from a video file using faster-whisper.

    Args:
        video_path: Path to the video file
        language: Language code (e.g., 'en', 'bn'). None for auto-detect.

    Returns:
        Dictionary with segments and word-level timestamps.
    """
    try:
        # Imported lazily so the bridge can spawn this module without
        # paying the import cost when the user is just running, say, `download`.
        import faster_whisper  # noqa: F401
    except ImportError:
        emit_error("faster-whisper not installed. Run: pip install faster-whisper", "transcribe")
        return None

    if not os.path.exists(video_path):
        emit_error(f"Video file not found: {video_path}", "transcribe")
        return None

    emit_progress("transcribe", 0, "Starting transcription...")

    info = gpu_info()
    emit_progress("transcribe", 2, f"Hardware: {info['summary']}")

    # Step 1: Extract audio (much faster than processing video directly)
    audio_path = extract_audio(video_path)

    # Step 2: Decide model settings based on hardware
    device, compute_type = whisper_device_settings()
    model_size = whisper_model_size()

    emit_progress(
        "transcribe", 3,
        f"Loading Whisper {model_size} on {device}/{compute_type}..."
    )

    try:
        model, model_info_str = _load_model_with_fallback(
            model_size, device, compute_type
        )
    except Exception as e:  # noqa: BLE001
        emit_error(f"Failed to load any Whisper model: {e}", "transcribe")
        return None

    emit_progress("transcribe", 8, f"Model loaded: {model_info_str}")
    emit_progress("transcribe", 10, "Transcribing audio...")

    try:
        # Step 3: Transcribe with word-level timestamps.
        # beam_size=5 (default) is noticeably more accurate than 3, and on GPU
        # the speed cost is negligible. CPU users still benefit because we
        # set beam=1 there.
        beam_size = 5 if device == "cuda" else 3
        best_of = 5 if device == "cuda" else 1

        segments_raw, info_obj = model.transcribe(
            audio_path,
            language=language,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200,
            ),
            beam_size=beam_size,
            best_of=best_of,
        )

        detected_language = info_obj.language
        language_probability = info_obj.language_probability
        duration = info_obj.duration

        emit_progress(
            "transcribe", 15,
            f"Language: {detected_language} ({language_probability:.0%}) | "
            f"Duration: {duration:.0f}s"
        )

        segments = []
        all_words = []

        for segment in segments_raw:
            # Calculate progress based on segment timing
            if duration > 0:
                pct = int(15 + (segment.end / duration) * 80)
                emit_progress(
                    "transcribe", min(pct, 95),
                    f"Transcribing... {segment.end:.0f}s / {duration:.0f}s"
                )

            words = []
            if segment.words:
                for word in segment.words:
                    word_data = {
                        "word": word.word.strip(),
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                        "probability": round(word.probability, 3),
                    }
                    words.append(word_data)
                    all_words.append(word_data)

            seg_data = {
                "id": len(segments),
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text.strip(),
                "words": words,
            }
            segments.append(seg_data)

        emit_progress("transcribe", 100, f"Transcription complete: {len(segments)} segments")
        emit_complete("transcribe", {
            "segment_count": len(segments),
            "word_count": len(all_words),
            "language": detected_language,
            "duration": duration,
            "model": model_info_str,
        })

        return {
            "language": detected_language,
            "language_probability": round(language_probability, 3),
            "duration": round(duration, 2),
            "segments": segments,
            "words": all_words,
            "model": model_info_str,
        }

    except Exception as e:  # noqa: BLE001
        emit_error(f"Transcription failed: {str(e)}", "transcribe")
        return None


def save_transcription(transcription: dict, output_path: str):
    """Save transcription to a JSON file."""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(transcription, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python transcriber.py <video_path> [language]"}))
        sys.exit(1)

    video_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else None

    result = transcribe_video(video_path, language)
    if result:
        base = os.path.splitext(video_path)[0]
        save_transcription(result, f"{base}_transcription.json")
    else:
        sys.exit(1)
