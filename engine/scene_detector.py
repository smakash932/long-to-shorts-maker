"""
Smart scene detection for finding the best clip moments in a video.
Uses PySceneDetect + transcription data to score and rank potential clips.
"""

import os
import json
import sys
from utils import emit_progress, emit_error, emit_complete


def _subdivide_clip(clip, max_duration, segments=None):
    """
    Split an oversized clip into sub-clips that respect max_duration.
    Uses segment boundaries when available for natural splits.
    """
    start = clip['start']
    end = clip['end']
    total_dur = end - start
    
    if total_dur <= max_duration:
        return [clip]
    
    sub_clips = []
    
    if segments:
        # Find segments within this clip's time range
        clip_segs = [s for s in segments if s['end'] > start and s['start'] < end]
        
        sub_start = start
        sub_text = []
        sub_words = 0
        
        for seg in clip_segs:
            sub_dur = seg['end'] - sub_start
            sub_text.append(seg.get('text', ''))
            sub_words += len(seg.get('words', []))
            
            # Force-split if we hit or exceed max, or split naturally around 60-100%
            if sub_dur >= max_duration or sub_dur >= max_duration * 0.6:
                sub_clips.append({
                    'start': round(sub_start, 3),
                    'end': round(seg['end'], 3),
                    'duration': round(seg['end'] - sub_start, 3),
                    'text': ' '.join(sub_text),
                    'word_count': sub_words,
                })
                sub_start = seg['end']
                sub_text = []
                sub_words = 0
        
        # Handle remaining
        if sub_start < end and (end - sub_start) >= 5.0:
            sub_clips.append({
                'start': round(sub_start, 3),
                'end': round(end, 3),
                'duration': round(end - sub_start, 3),
                'text': ' '.join(sub_text),
                'word_count': sub_words,
            })
    
    if not sub_clips:
        # Fallback: evenly split
        target_len = max_duration * 0.75
        pos = start
        while pos < end:
            chunk_end = min(pos + target_len, end)
            remaining = end - chunk_end
            # Absorb tiny remainder ONLY if it won't push us over max
            if remaining > 0 and remaining < target_len * 0.3 and (end - pos) <= max_duration:
                chunk_end = end  # absorb tiny remainder
            sub_clips.append({
                'start': round(pos, 3),
                'end': round(chunk_end, 3),
                'duration': round(chunk_end - pos, 3),
                'text': clip.get('text', ''),
                'word_count': clip.get('word_count', 0),
            })
            pos = chunk_end
    
    return sub_clips


def _detect_skip_zones(segments, video_duration, scene_list=None):
    """
    Detect segments to skip: intros, outros, sponsor reads, and ad segments.
    
    Detection strategies:
      1. INTRO: First 5-30s with no speech, or generic intro phrases
      2. OUTRO: Last 15-60s with subscribe/outro keywords
      3. SPONSOR/AD: Mid-video segments with sponsor keywords + sudden topic change
      4. SILENCE GAP: Long gaps (>10s) with no speech (usually music/b-roll intros)
    
    Returns list of skip zones: [{'start', 'end', 'type', 'reason'}]
    """
    if not segments or video_duration < 30:
        return []
    
    skip_zones = []
    
    # ---- 1. INTRO DETECTION ----
    # Check if the first segment starts late (music intro before speech)
    first_seg_start = segments[0]['start'] if segments else 0
    if first_seg_start > 5.0:
        # Long silence before first speech = likely intro music/animation
        skip_zones.append({
            'start': 0,
            'end': first_seg_start,
            'type': 'intro',
            'reason': f'No speech for first {first_seg_start:.0f}s (intro music/animation)'
        })
    
    # Check for intro keywords in first 30 seconds
    intro_keywords = [
        'welcome', 'intro', 'hey guys', 'what\'s up', 'subscribe', 
        'channel', 'before we start', 'in this video', 'today we',
        'let me introduce', 'what is going on', 'hey everyone'
    ]
    intro_end = 0
    for seg in segments:
        if seg['start'] > 30:
            break
        text_lower = seg.get('text', '').lower()
        if any(kw in text_lower for kw in intro_keywords):
            intro_end = seg['end']
    
    if intro_end > 8:
        skip_zones.append({
            'start': 0,
            'end': intro_end,
            'type': 'intro',
            'reason': 'Intro segment with generic greeting/intro phrases'
        })
    
    # ---- 2. OUTRO DETECTION ----
    # Check for outro keywords in the last 60 seconds
    outro_keywords = [
        'subscribe', 'like and subscribe', 'hit the bell', 'notification',
        'thanks for watching', 'see you next', 'peace out', 'bye',
        'next video', 'comment below', 'follow me', 'follow us',
        'patreon', 'merchandise', 'link in description', 'outro'
    ]
    outro_start = video_duration
    for seg in reversed(segments):
        if seg['start'] < video_duration - 90:
            break
        text_lower = seg.get('text', '').lower()
        if any(kw in text_lower for kw in outro_keywords):
            outro_start = min(outro_start, seg['start'])
    
    # Also check if last segment ends well before video_duration (outro music)
    if segments:
        last_seg_end = segments[-1]['end']
        if video_duration - last_seg_end > 10:
            outro_start = min(outro_start, last_seg_end)
    
    if outro_start < video_duration - 5:
        skip_zones.append({
            'start': outro_start,
            'end': video_duration,
            'type': 'outro',
            'reason': 'Outro segment (subscribe/thanks/no speech)'
        })
    
    # ---- 3. SPONSOR/AD DETECTION ----
    sponsor_keywords = [
        'sponsor', 'sponsored', 'brought to you', 'partnership',
        'promo code', 'discount code', 'use code', 'coupon',
        'check out', 'link below', 'link in the description',
        'affiliat', 'ad break', 'today\'s sponsor',
        'squarespace', 'nordvpn', 'surfshark', 'skillshare', 'audible',
        'raid shadow', 'manscaped', 'hello fresh', 'brilliant.org',
    ]
    
    for i, seg in enumerate(segments):
        text_lower = seg.get('text', '').lower()
        if any(kw in text_lower for kw in sponsor_keywords):
            # Find the span of the sponsor segment (consecutive sponsor-ish segments)
            sponsor_start = seg['start']
            sponsor_end = seg['end']
            
            # Expand forward to find end of sponsor read
            for j in range(i + 1, min(i + 8, len(segments))):
                next_text = segments[j].get('text', '').lower()
                if any(kw in next_text for kw in sponsor_keywords):
                    sponsor_end = segments[j]['end']
                elif segments[j]['start'] - sponsor_end < 3:
                    sponsor_end = segments[j]['end']  # Include short gap
                else:
                    break
            
            skip_zones.append({
                'start': sponsor_start,
                'end': sponsor_end,
                'type': 'sponsor',
                'reason': f'Sponsor/ad segment detected'
            })
    
    # ---- 4. LONG SILENCE GAPS (music/b-roll without speech) ----
    for i in range(len(segments) - 1):
        gap = segments[i + 1]['start'] - segments[i]['end']
        if gap > 10.0:
            skip_zones.append({
                'start': segments[i]['end'],
                'end': segments[i + 1]['start'],
                'type': 'silence',
                'reason': f'{gap:.0f}s gap with no speech'
            })
    
    return skip_zones


def detect_scenes(video_path: str, transcription: dict = None,
                  min_clip_duration: float = 15.0,
                  max_clip_duration: float = 90.0,
                  target_clip_count: int = 10) -> list:
    """
    Detect the best short clip candidates from a video.
    
    Combines scene detection with speech analysis to find moments that
    make great short-form content.
    
    Args:
        video_path: Path to the video file
        transcription: Transcription dict from transcriber.py
        min_clip_duration: Minimum clip length in seconds
        max_clip_duration: Maximum clip length in seconds
        target_clip_count: Desired number of clips to generate
    
    Returns:
        List of clip candidates with start, end, score, and text.
    """
    try:
        from scenedetect import detect, ContentDetector, AdaptiveDetector
    except ImportError:
        emit_error("scenedetect not installed. Run: pip install scenedetect[opencv]", "detect")
        return None
    
    if not os.path.exists(video_path):
        emit_error(f"Video file not found: {video_path}", "detect")
        return None
    
    emit_progress("detect", 0, f"Analyzing video (target: {min_clip_duration}-{max_clip_duration}s clips)...")
    
    try:
        # Step 1: Detect scene boundaries using content-based detection
        emit_progress("detect", 10, "Detecting scene boundaries...")
        scene_list = detect(video_path, ContentDetector(threshold=30.0))
        
        emit_progress("detect", 30, f"Found {len(scene_list)} scene changes")
        
        # Step 2: Build clip candidates based on transcription segments
        raw_clips = []
        all_segments = None
        
        if transcription and transcription.get('segments'):
            emit_progress("detect", 35, "Detecting intros, outros & filler segments...")
            segments = transcription['segments']
            all_segments = segments
            video_duration = transcription.get('duration', 0)
            
            # ★ NEW: Smart intro/outro/ad detection
            # Identify segments to SKIP (intro music, sponsor reads, outros)
            skip_zones = _detect_skip_zones(segments, video_duration, scene_list)
            
            if skip_zones:
                zone_desc = ', '.join(f"{z['type']}({z['start']:.0f}-{z['end']:.0f}s)" for z in skip_zones[:5])
                emit_progress("detect", 38, f"Skipping: {zone_desc}")
            
            emit_progress("detect", 40, "Analyzing speech patterns...")
            
            # Group segments into clip-sized chunks
            # Find natural breakpoints (pauses > 1 second)
            current_clip_start = None
            current_clip_text = []
            current_word_count = 0
            # Track the segment index where current clip started
            clip_start_seg_idx = 0
            
            for i, seg in enumerate(segments):
                if current_clip_start is None:
                    current_clip_start = seg['start']
                    current_clip_text = [seg['text']]
                    current_word_count = len(seg.get('words', []))
                    clip_start_seg_idx = i
                    continue
                
                current_duration = seg['end'] - current_clip_start
                current_clip_text.append(seg['text'])
                current_word_count += len(seg.get('words', []))
                
                # Check for natural break points
                gap_to_next = 0
                if i + 1 < len(segments):
                    gap_to_next = segments[i + 1]['start'] - seg['end']
                
                is_scene_boundary = any(
                    abs(seg['end'] - scene[1].get_seconds()) < 2.0
                    for scene in scene_list
                ) if scene_list else False
                
                # ★ FIX: Force-split BEFORE exceeding max_clip_duration
                # Look ahead: if adding the next segment would exceed max, split NOW
                next_seg_end = segments[i + 1]['end'] if i + 1 < len(segments) else seg['end']
                would_exceed_max = (next_seg_end - current_clip_start) > max_clip_duration
                
                # ★ FIX: Hard cap — if current duration already exceeds max, MUST split NOW
                # This handles continuous speech with zero pauses
                hard_cap_hit = current_duration >= max_clip_duration
                
                should_split = (
                    hard_cap_hit or
                    (current_duration >= min_clip_duration and gap_to_next > 1.0) or
                    (current_duration >= min_clip_duration and is_scene_boundary) or
                    (current_duration >= min_clip_duration and would_exceed_max) or
                    (i == len(segments) - 1 and current_duration >= min_clip_duration)
                )
                
                if should_split:
                    clip_end = seg['end']
                    clip_duration = clip_end - current_clip_start
                    
                    # Score the clip based on multiple factors
                    ideal_duration = (min_clip_duration + max_clip_duration) / 2
                    speech_density = current_word_count / max(clip_duration, 1)
                    duration_score = 1.0 - abs(clip_duration - ideal_duration) / ideal_duration
                    duration_score = max(0.1, duration_score)
                    
                    # Bonus for clips with more speech (more engaging)
                    engagement_score = min(speech_density / 3.0, 1.0)
                    
                    total_score = round((duration_score * 0.4 + engagement_score * 0.6) * 100, 1)
                    
                    # ★ NEW: Penalize clips that overlap with skip zones (intro/outro/ads)
                    if skip_zones:
                        for zone in skip_zones:
                            overlap_start = max(current_clip_start, zone['start'])
                            overlap_end = min(clip_end, zone['end'])
                            overlap = max(0, overlap_end - overlap_start)
                            overlap_pct = overlap / max(clip_duration, 1)
                            
                            if overlap_pct > 0.5:
                                # More than 50% overlap with skip zone → near-zero score
                                total_score *= 0.1
                            elif overlap_pct > 0.2:
                                # 20-50% overlap → heavy penalty
                                total_score *= 0.4
                            elif overlap_pct > 0.05:
                                # 5-20% overlap → light penalty
                                total_score *= 0.7
                    
                    raw_clips.append({
                        'index': len(raw_clips),
                        'start': round(current_clip_start, 3),
                        'end': round(clip_end, 3),
                        'duration': round(clip_duration, 3),
                        'text': ' '.join(current_clip_text),
                        'word_count': current_word_count,
                        'score': round(total_score, 1),
                    })
                    
                    current_clip_start = None
                    current_clip_text = []
                    current_word_count = 0
                
                pct = int(40 + (i / max(len(segments), 1)) * 40)
                emit_progress("detect", min(pct, 80), f"Analyzing segment {i+1}/{len(segments)}")
        
        else:
            # No transcription - use scene detection only
            emit_progress("detect", 40, "No transcription available, using scene-based splitting...")
            
            if scene_list:
                # Group scenes into clip-sized segments
                current_start = scene_list[0][0].get_seconds()
                
                for i, (start, end) in enumerate(scene_list):
                    current_duration = end.get_seconds() - current_start
                    
                    # ★ FIX: Also enforce max_clip_duration for scene-only path
                    if current_duration >= max_clip_duration or \
                       (current_duration >= min_clip_duration and i == len(scene_list) - 1):
                        raw_clips.append({
                            'index': len(raw_clips),
                            'start': round(current_start, 3),
                            'end': round(end.get_seconds(), 3),
                            'duration': round(current_duration, 3),
                            'text': '',
                            'word_count': 0,
                            'score': 50.0,
                        })
                        if i + 1 < len(scene_list):
                            current_start = scene_list[i + 1][0].get_seconds()
                    elif current_duration >= min_clip_duration:
                        raw_clips.append({
                            'index': len(raw_clips),
                            'start': round(current_start, 3),
                            'end': round(end.get_seconds(), 3),
                            'duration': round(current_duration, 3),
                            'text': '',
                            'word_count': 0,
                            'score': 50.0,
                        })
                        if i + 1 < len(scene_list):
                            current_start = scene_list[i + 1][0].get_seconds()
            else:
                # No scenes detected - split evenly
                import subprocess
                result = subprocess.run(
                    ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                     '-of', 'json', video_path],
                    capture_output=True, text=True
                )
                duration = 60.0
                try:
                    probe = json.loads(result.stdout)
                    duration = float(probe['format']['duration'])
                except Exception:
                    pass
                
                # Create evenly spaced clips
                clip_len = min(max_clip_duration, 60.0)
                pos = 0
                while pos + min_clip_duration <= duration:
                    end = min(pos + clip_len, duration)
                    raw_clips.append({
                        'index': len(raw_clips),
                        'start': round(pos, 3),
                        'end': round(end, 3),
                        'duration': round(end - pos, 3),
                        'text': '',
                        'word_count': 0,
                        'score': 40.0,
                    })
                    pos = end
        
        # ★ FIX: Post-processing — subdivide oversized clips & filter by duration
        emit_progress("detect", 85, "Enforcing duration limits...")
        clips = []
        for clip in raw_clips:
            if clip['duration'] > max_clip_duration:
                # Subdivide oversized clip at segment boundaries
                subs = _subdivide_clip(clip, max_clip_duration, all_segments)
                for sub in subs:
                    sub['score'] = clip.get('score', 50.0) * 0.9  # slightly lower score for split clips
                    clips.append(sub)
            else:
                clips.append(clip)
        
        # ★ FIX: Hard filter — remove anything outside [min, max] range
        before_filter = len(clips)
        clips = [c for c in clips if min_clip_duration <= c['duration'] <= max_clip_duration]
        filtered_out = before_filter - len(clips)
        if filtered_out > 0:
            emit_progress("detect", 88, f"Filtered out {filtered_out} clips outside {min_clip_duration}-{max_clip_duration}s range")
        
        # Sort by score (best clips first)
        clips.sort(key=lambda c: c['score'], reverse=True)
        
        # Limit to target count
        clips = clips[:target_clip_count]
        
        # Re-sort by time for consistent ordering
        clips.sort(key=lambda c: c['start'])
        
        # Re-index
        for i, clip in enumerate(clips):
            clip['index'] = i
        
        # Log final durations for debugging
        durations = [f"{c['duration']:.1f}s" for c in clips]
        emit_progress("detect", 100, f"Found {len(clips)} clips! Durations: {', '.join(durations[:8])}")
        emit_complete("detect", {"clip_count": len(clips)})
        
        return clips
        
    except Exception as e:
        emit_error(f"Scene detection failed: {str(e)}", "detect")
        return None


def save_clips_data(clips: list, output_path: str):
    """Save clips data to JSON."""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(clips, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python scene_detector.py <video_path> [transcription.json] [min_dur] [max_dur]"}))
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    transcription = None
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        with open(sys.argv[2], 'r', encoding='utf-8') as f:
            transcription = json.load(f)
    
    min_dur = float(sys.argv[3]) if len(sys.argv) > 3 else 15.0
    max_dur = float(sys.argv[4]) if len(sys.argv) > 4 else 90.0
    
    clips = detect_scenes(video_path, transcription, min_dur, max_dur)
    if clips:
        base = os.path.splitext(video_path)[0]
        save_clips_data(clips, f"{base}_clips.json")
    else:
        sys.exit(1)
