"""
Smart Silence Remover — tightens clips by removing dead air.

Uses FFmpeg silencedetect to find silent gaps, then concatenates
the speech segments back together for a snappy, professional result.

Only removes gaps > configurable threshold (default 0.7s).
Preserves a tiny 0.05s padding around each cut for natural feel.
"""

import os
import json
import subprocess
import tempfile
from utils import emit_progress
from gpu_utils import video_encoder_args


def detect_silences(clip_path: str, 
                     silence_threshold: float = -35.0,
                     min_silence_duration: float = 0.7) -> list:
    """
    Detect silent segments in a clip using FFmpeg silencedetect.
    
    Args:
        clip_path: Path to the clip MP4
        silence_threshold: dB threshold below which audio is "silent" (-35 dB default)
        min_silence_duration: Minimum silence length to detect (seconds)
    
    Returns:
        List of {'start': float, 'end': float, 'duration': float}
    """
    cmd = [
        'ffmpeg', '-i', clip_path,
        '-af', f'silencedetect=noise={silence_threshold}dB:d={min_silence_duration}',
        '-f', 'null', '-'
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        stderr = result.stderr
    except Exception:
        return []
    
    # Parse silencedetect output from stderr
    silences = []
    current_start = None
    
    for line in stderr.split('\n'):
        if 'silence_start:' in line:
            try:
                current_start = float(line.split('silence_start:')[1].strip().split()[0])
            except (ValueError, IndexError):
                current_start = None
        
        if 'silence_end:' in line and current_start is not None:
            try:
                parts = line.split('silence_end:')[1].strip().split()
                silence_end = float(parts[0])
                # Duration is in the same line after |
                silence_dur = silence_end - current_start
                
                silences.append({
                    'start': round(current_start, 3),
                    'end': round(silence_end, 3),
                    'duration': round(silence_dur, 3),
                })
                current_start = None
            except (ValueError, IndexError):
                current_start = None
    
    return silences


def get_clip_duration(clip_path: str) -> float:
    """Get the duration of a clip in seconds."""
    cmd = [
        'ffprobe', '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'json', clip_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        data = json.loads(result.stdout)
        return float(data['format']['duration'])
    except Exception:
        return 0.0


def remove_silences(clip_path: str, output_path: str = None,
                     min_silence: float = 0.7,
                     padding: float = 0.05,
                     threshold_db: float = -35.0) -> dict:
    """
    Remove silent gaps from a clip, producing a tighter version.
    
    Args:
        clip_path: Input clip path
        output_path: Output path (default: replaces original)
        min_silence: Minimum silence duration to remove (seconds)
        padding: Padding to keep around cuts for natural feel (seconds)
        threshold_db: Silence threshold in dB
    
    Returns:
        Dict with stats: {'original_duration', 'new_duration', 'removed_seconds', 'cuts_made'}
    """
    if not os.path.exists(clip_path):
        return None
    
    original_duration = get_clip_duration(clip_path)
    if original_duration < 3.0:
        return {'original_duration': original_duration, 'new_duration': original_duration,
                'removed_seconds': 0, 'cuts_made': 0, 'skipped': True}
    
    # Step 1: Detect silences
    silences = detect_silences(clip_path, threshold_db, min_silence)
    
    if not silences:
        return {'original_duration': original_duration, 'new_duration': original_duration,
                'removed_seconds': 0, 'cuts_made': 0}
    
    # Step 2: Build speech segments (inverse of silences)
    speech_segments = []
    current_pos = 0.0
    
    for silence in silences:
        # Speech segment before this silence
        speech_start = current_pos
        speech_end = silence['start'] + padding  # Keep tiny padding
        
        if speech_end > speech_start + 0.1:  # Minimum 100ms segment
            speech_segments.append({
                'start': round(max(0, speech_start), 3),
                'end': round(min(speech_end, original_duration), 3),
            })
        
        current_pos = silence['end'] - padding  # Start after silence with padding
    
    # Add final segment after last silence
    if current_pos < original_duration:
        speech_segments.append({
            'start': round(max(0, current_pos), 3),
            'end': round(original_duration, 3),
        })
    
    if not speech_segments:
        return {'original_duration': original_duration, 'new_duration': original_duration,
                'removed_seconds': 0, 'cuts_made': 0}
    
    # Step 3: Build FFmpeg concat filter to stitch speech segments
    # Use the select+aselect approach for frame-accurate cuts
    if output_path is None:
        base, ext = os.path.splitext(clip_path)
        output_path = base + '_tight' + ext
    
    # Build select expression: between(t,start1,end1)+between(t,start2,end2)+...
    select_parts = [f"between(t\\,{seg['start']}\\,{seg['end']})" for seg in speech_segments]
    select_expr = '+'.join(select_parts)
    
    filter_complex = (
        f"[0:v]select='{select_expr}',setpts=N/FRAME_RATE/TB[v];"
        f"[0:a]aselect='{select_expr}',asetpts=N/SR/TB[a]"
    )
    
    encoder_args = video_encoder_args(quality="balanced")
    cmd = [
        'ffmpeg', '-y',
        '-i', clip_path,
        '-filter_complex', filter_complex,
        '-map', '[v]', '-map', '[a]',
        *encoder_args,
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        output_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            # If complex filter fails, return original unchanged
            return {'original_duration': original_duration, 'new_duration': original_duration,
                    'removed_seconds': 0, 'cuts_made': 0, 'error': 'ffmpeg_failed'}
        
        new_duration = get_clip_duration(output_path)
        removed = original_duration - new_duration
        
        # If we barely removed anything (<1s), keep original
        if removed < 0.5:
            try:
                os.remove(output_path)
            except Exception:
                pass
            return {'original_duration': original_duration, 'new_duration': original_duration,
                    'removed_seconds': 0, 'cuts_made': 0}
        
        # Replace original with tightened version
        if output_path != clip_path:
            try:
                os.remove(clip_path)
                os.rename(output_path, clip_path)
            except Exception:
                pass
        
        return {
            'original_duration': round(original_duration, 2),
            'new_duration': round(new_duration, 2),
            'removed_seconds': round(removed, 2),
            'cuts_made': len(silences),
        }
        
    except subprocess.TimeoutExpired:
        return {'original_duration': original_duration, 'new_duration': original_duration,
                'removed_seconds': 0, 'cuts_made': 0, 'error': 'timeout'}
    except Exception as e:
        return {'original_duration': original_duration, 'new_duration': original_duration,
                'removed_seconds': 0, 'cuts_made': 0, 'error': str(e)}


def remove_silences_batch(clip_dir: str, min_silence: float = 0.7) -> dict:
    """
    Remove silences from all clips in a directory.
    
    Returns summary stats.
    """
    if not os.path.exists(clip_dir):
        return {'processed': 0}
    
    mp4_files = sorted([f for f in os.listdir(clip_dir) if f.endswith('.mp4') and '_tight' not in f])
    
    total_removed = 0.0
    total_cuts = 0
    processed = 0
    
    for i, mp4 in enumerate(mp4_files):
        clip_path = os.path.join(clip_dir, mp4)
        pct = int((i / max(len(mp4_files), 1)) * 100)
        emit_progress("silence", pct, f"Removing silence from clip {i+1}/{len(mp4_files)}...")
        
        result = remove_silences(clip_path, min_silence=min_silence)
        if result:
            total_removed += result.get('removed_seconds', 0)
            total_cuts += result.get('cuts_made', 0)
            processed += 1
    
    emit_progress("silence", 100, f"Removed {total_removed:.1f}s of silence from {processed} clips!")
    
    return {
        'processed': processed,
        'total_removed_seconds': round(total_removed, 2),
        'total_cuts': total_cuts,
    }
