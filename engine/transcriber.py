"""
Audio transcription using faster-whisper with CPU processing.
Extracts audio first for maximum speed, then transcribes.
Supports word-level timestamps for subtitle generation.
"""

import os
import json
import sys
import subprocess
from utils import emit_progress, emit_error, emit_complete


def extract_audio(video_path: str) -> str:
    """
    Extract audio from video as WAV file for faster transcription.
    WAV is faster than decoding video for Whisper.
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
        '-ar', '16000',           # 16kHz (optimal for Whisper)
        '-ac', '1',               # Mono
        audio_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode == 0 and os.path.exists(audio_path):
            return audio_path
    except Exception:
        pass
    
    # Fallback: use original video file
    return video_path


def transcribe_video(video_path: str, language: str = None) -> dict:
    """
    Transcribe audio from a video file using faster-whisper.
    Extracts audio first for speed, uses small model on CPU.
    
    Args:
        video_path: Path to the video file
        language: Language code (e.g., 'en', 'bn'). None for auto-detect.
    
    Returns:
        Dictionary with segments and word-level timestamps.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        emit_error("faster-whisper not installed. Run: pip install faster-whisper", "transcribe")
        return None
    
    if not os.path.exists(video_path):
        emit_error(f"Video file not found: {video_path}", "transcribe")
        return None
    
    emit_progress("transcribe", 0, "Starting transcription...")
    
    # Step 1: Extract audio (much faster than processing video directly)
    audio_path = extract_audio(video_path)
    
    try:
        # Step 2: Load model — use 'small' for speed on CPU
        model = None
        model_info = ""
        
        try:
            emit_progress("transcribe", 3, "Loading Whisper small model...")
            model = WhisperModel("small", device="cpu", compute_type="int8")
            model_info = "CPU — small model (fast + good quality)"
        except Exception:
            try:
                emit_progress("transcribe", 4, "Small failed, trying tiny...")
                model = WhisperModel("tiny", device="cpu", compute_type="int8")
                model_info = "CPU — tiny model (fastest)"
            except Exception as e:
                emit_error(f"Failed to load any Whisper model: {str(e)}", "transcribe")
                return None
        
        emit_progress("transcribe", 8, f"Model loaded: {model_info}")
        emit_progress("transcribe", 10, "Transcribing audio (this may take a while for long videos)...")
        
        # Step 3: Transcribe with word-level timestamps
        segments_raw, info = model.transcribe(
            audio_path,
            language=language,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200,
            ),
            beam_size=3,         # Reduced for speed (default is 5)
            best_of=1,           # Reduced for speed (default is 5)
        )
        
        detected_language = info.language
        language_probability = info.language_probability
        duration = info.duration
        
        emit_progress("transcribe", 15, f"Language: {detected_language} ({language_probability:.0%}) | Duration: {duration:.0f}s")
        
        segments = []
        all_words = []
        
        for segment in segments_raw:
            # Calculate progress based on segment timing
            if duration > 0:
                pct = int(15 + (segment.end / duration) * 80)
                emit_progress("transcribe", min(pct, 95), f"Transcribing... {segment.end:.0f}s / {duration:.0f}s")
            
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
        
        result = {
            "language": detected_language,
            "language_probability": round(language_probability, 3),
            "duration": round(duration, 3),
            "segments": segments,
            "words": all_words,
            "segment_count": len(segments),
            "word_count": len(all_words),
        }
        
        emit_progress("transcribe", 100, "Transcription complete!")
        emit_complete("transcribe", {
            "language": detected_language,
            "duration": round(duration, 3),
            "segment_count": len(segments),
            "word_count": len(all_words),
        })
        
        # Cleanup extracted audio to save disk space
        if audio_path != video_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except Exception:
                pass
        
        return result
        
    except Exception as e:
        emit_error(f"Transcription failed: {str(e)}", "transcribe")
        # Cleanup
        if audio_path != video_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except Exception:
                pass
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
    lang = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = transcribe_video(video_path, lang)
    if result:
        # Save transcription alongside video
        base = os.path.splitext(video_path)[0]
        save_transcription(result, f"{base}_transcription.json")
    else:
        sys.exit(1)
