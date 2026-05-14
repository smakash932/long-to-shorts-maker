"""
Main CLI entry point for the Long to Shorts Maker engine.
Orchestrates the full pipeline: download → transcribe → detect → crop → generate.
Called by Node.js backend via child process spawn.
"""

import os
import sys
import json
import argparse

# Add engine directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils import emit, emit_progress, emit_error, emit_complete, ensure_dirs, generate_id, VIDEOS_DIR


def cmd_download(args):
    """Download a YouTube video."""
    from downloader import download_video, get_video_info
    
    if args.info_only:
        info = get_video_info(args.url)
        if info:
            emit("result", {"data": info})
        return
    
    result = download_video(args.url, args.video_id)
    if result:
        emit("result", {"data": result})


def cmd_transcribe(args):
    """Transcribe a video file."""
    from transcriber import transcribe_video, save_transcription
    
    result = transcribe_video(args.video_path, args.language)
    if result:
        # Save transcription file
        out_path = os.path.splitext(args.video_path)[0] + '_transcription.json'
        save_transcription(result, out_path)
        emit("result", {"data": {"transcription_path": out_path, **{k: v for k, v in result.items() if k != 'segments' and k != 'words'}}})


def cmd_detect(args):
    """Detect best clip moments."""
    from scene_detector import detect_scenes, save_clips_data
    
    transcription = None
    if args.transcription_path and os.path.exists(args.transcription_path):
        with open(args.transcription_path, 'r', encoding='utf-8') as f:
            transcription = json.load(f)
    
    # Convert clip_count: 'auto' -> 999, otherwise int
    clip_count = args.clip_count
    if isinstance(clip_count, str) and clip_count.lower() == 'auto':
        clip_count = 999
    else:
        try:
            clip_count = int(clip_count)
        except (ValueError, TypeError):
            clip_count = 10
    
    clips = detect_scenes(
        args.video_path, transcription,
        args.min_duration, args.max_duration, clip_count
    )
    
    if clips:
        out_path = os.path.splitext(args.video_path)[0] + '_clips.json'
        save_clips_data(clips, out_path)
        emit("result", {"data": {"clips_path": out_path, "clip_count": len(clips)}})


def cmd_crop(args):
    """Analyze clips for face-based cropping."""
    from face_cropper import analyze_clips_for_cropping
    
    with open(args.clips_path, 'r', encoding='utf-8') as f:
        clips = json.load(f)
    
    result = analyze_clips_for_cropping(args.video_path, clips, args.ratio)
    
    if result:
        with open(args.clips_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        emit("result", {"data": {"clips_path": args.clips_path, "clips_analyzed": len(result)}})


def cmd_generate(args):
    """Generate all clips."""
    from clip_generator import generate_all_clips
    
    with open(args.clips_path, 'r', encoding='utf-8') as f:
        clips = json.load(f)
    
    transcription = None
    if args.transcription_path and os.path.exists(args.transcription_path):
        with open(args.transcription_path, 'r', encoding='utf-8') as f:
            transcription = json.load(f)
    
    result = generate_all_clips(
        args.video_path, clips, args.video_id,
        transcription, args.template, args.subtitles
    )
    
    if result:
        emit("result", {"data": {"clip_count": len(result), "video_id": args.video_id}})


def cmd_pipeline(args):
    """Run the full pipeline: download/register → transcribe → detect → crop → generate."""
    ensure_dirs()
    
    video_id = args.video_id or generate_id(args.url or args.video_path or "video")
    video_path = None
    
    # Step 1: Download or use local file
    if args.url:
        emit_progress("pipeline", 0, "Step 1/6: Downloading video...")
        from downloader import download_video
        dl_result = download_video(args.url, video_id)
        if not dl_result:
            emit_error("Download failed", "pipeline")
            sys.exit(1)
        video_path = dl_result['file_path']
    elif args.video_path:
        video_path = args.video_path
        emit_progress("pipeline", 10, "Using local video file...")
    else:
        emit_error("No video URL or path provided", "pipeline")
        sys.exit(1)
    
    if not os.path.exists(video_path):
        emit_error(f"Video file not found: {video_path}", "pipeline")
        sys.exit(1)
    
    # Step 2: Transcribe
    emit_progress("pipeline", 20, "Step 2/6: Transcribing audio...")
    from transcriber import transcribe_video, save_transcription
    transcription = transcribe_video(video_path, args.language)
    
    transcription_path = None
    if transcription:
        transcription_path = os.path.splitext(video_path)[0] + '_transcription.json'
        save_transcription(transcription, transcription_path)
    
    # Step 3: Detect best clips
    emit_progress("pipeline", 50, "Step 3/6: Finding best moments...")
    from scene_detector import detect_scenes, save_clips_data
    # Convert clip_count: 'auto' -> 999, otherwise int
    clip_count = args.clip_count
    if isinstance(clip_count, str) and clip_count.lower() == 'auto':
        clip_count = 999
    else:
        try:
            clip_count = int(clip_count)
        except (ValueError, TypeError):
            clip_count = 10
    
    clips = detect_scenes(
        video_path, transcription,
        args.min_duration, args.max_duration, clip_count
    )
    
    if not clips:
        emit_error("No clips detected", "pipeline")
        sys.exit(1)
    
    clips_path = os.path.splitext(video_path)[0] + '_clips.json'
    save_clips_data(clips, clips_path)
    
    # Step 4: Face detection + crop analysis
    # Classic mode: skip face detection, use simple center crop (FAST)
    # Advanced mode: use face detection + split-screen (SLOWER)
    use_mode = getattr(args, 'mode', 'classic') or 'classic'
    
    if use_mode == 'advanced':
        emit_progress("pipeline", 65, "Step 4/6: Analyzing face positions...")
        from face_cropper import analyze_clips_for_cropping
        clips = analyze_clips_for_cropping(video_path, clips, args.ratio)
    else:
        # Classic mode: fast center crop, no face detection
        emit_progress("pipeline", 65, "Step 4/6: Applying center crop (Classic mode)...")
        from face_cropper import get_video_dimensions, calculate_crop
        width, height = get_video_dimensions(video_path)
        for clip in clips:
            clip['crop'] = calculate_crop(width, height, 0.5, args.ratio)
            clip['face'] = {'center_x': 0.5, 'center_y': 0.5, 'detected': False}
            clip['video_width'] = width
            clip['video_height'] = height
        emit_progress("crop", 100, "Center crop applied!")
    
    # Save updated clips
    save_clips_data(clips, clips_path)
    
    # Step 5: Generate clips
    emit_progress("pipeline", 70, "Step 5/6: Generating clips...")
    from clip_generator import generate_all_clips
    result = generate_all_clips(
        video_path, clips, video_id,
        transcription, args.template, args.subtitles,
        hook_position=getattr(args, 'hook_position', 'upper') or 'upper',
        sub_position=getattr(args, 'sub_position', 'bottom') or 'bottom'
    )
    
    # Step 6: Smart silence removal — tighten clips by removing dead air
    use_silence_removal = getattr(args, 'remove_silence', True)
    if use_silence_removal and result:
        emit_progress("pipeline", 90, "Step 6/6: Removing silence gaps...")
        try:
            from silence_remover import remove_silences_batch
            from utils import get_clip_dir
            clip_dir = get_clip_dir(video_id)
            silence_stats = remove_silences_batch(clip_dir, min_silence=0.7)
            removed_secs = silence_stats.get('total_removed_seconds', 0)
            if removed_secs > 0:
                emit_progress("pipeline", 95, f"Removed {removed_secs:.1f}s of dead air!")
            else:
                emit_progress("pipeline", 95, "No significant silences found — clips are already tight!")
        except Exception as e:
            emit_progress("pipeline", 95, f"Silence removal skipped: {str(e)[:80]}")
    
    emit_progress("pipeline", 100, "Pipeline complete!")
    emit_complete("pipeline", {
        "video_id": video_id,
        "video_path": video_path,
        "clips_count": len(result) if result else 0,
        "transcription_path": transcription_path,
        "clips_path": clips_path,
    })


def main():
    parser = argparse.ArgumentParser(description="Long to Shorts Maker - AI Video Clip Generator")
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Download command
    dl_parser = subparsers.add_parser('download', help='Download a YouTube video')
    dl_parser.add_argument('url', help='YouTube video URL')
    dl_parser.add_argument('--video-id', help='Custom video ID')
    dl_parser.add_argument('--info-only', action='store_true', help='Only get video info')
    
    # Transcribe command
    tr_parser = subparsers.add_parser('transcribe', help='Transcribe audio')
    tr_parser.add_argument('video_path', help='Path to video file')
    tr_parser.add_argument('--language', help='Language code (e.g., en, bn)')
    
    # Detect command
    dt_parser = subparsers.add_parser('detect', help='Detect best clip moments')
    dt_parser.add_argument('video_path', help='Path to video file')
    dt_parser.add_argument('--transcription-path', help='Path to transcription JSON')
    dt_parser.add_argument('--min-duration', type=float, default=15.0)
    dt_parser.add_argument('--max-duration', type=float, default=90.0)
    dt_parser.add_argument('--clip-count', default='10')
    
    # Crop command
    cr_parser = subparsers.add_parser('crop', help='Analyze face positions for cropping')
    cr_parser.add_argument('video_path', help='Path to video file')
    cr_parser.add_argument('clips_path', help='Path to clips JSON')
    cr_parser.add_argument('--ratio', default='9:16')
    
    # Generate command
    gen_parser = subparsers.add_parser('generate', help='Generate clips')
    gen_parser.add_argument('video_path', help='Path to video file')
    gen_parser.add_argument('clips_path', help='Path to clips JSON')
    gen_parser.add_argument('video_id', help='Video ID')
    gen_parser.add_argument('--transcription-path', help='Path to transcription JSON')
    gen_parser.add_argument('--template', default='default')
    gen_parser.add_argument('--subtitles', type=bool, default=True)
    
    # Full pipeline command
    pipe_parser = subparsers.add_parser('pipeline', help='Run full processing pipeline')
    pipe_parser.add_argument('--url', help='YouTube video URL')
    pipe_parser.add_argument('--video-path', help='Path to local video file')
    pipe_parser.add_argument('--video-id', help='Custom video ID')
    pipe_parser.add_argument('--language', help='Language code')
    pipe_parser.add_argument('--ratio', default='9:16')
    pipe_parser.add_argument('--template', default='default')
    pipe_parser.add_argument('--subtitles', type=bool, default=True)
    pipe_parser.add_argument('--min-duration', type=float, default=15.0)
    pipe_parser.add_argument('--max-duration', type=float, default=90.0)
    pipe_parser.add_argument('--clip-count', default='10')
    pipe_parser.add_argument('--mode', default='classic', choices=['classic', 'advanced'],
                             help='classic=fast center crop, advanced=face detection+split-screen')
    pipe_parser.add_argument('--hook-position', default='upper',
                             choices=['top', 'upper', 'center', 'lower', 'bottom'],
                             help='Position of the on-screen hook text')
    pipe_parser.add_argument('--sub-position', default='bottom',
                             choices=['top', 'upper', 'center', 'lower', 'bottom'],
                             help='Position of the subtitles')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    ensure_dirs()
    
    commands = {
        'download': cmd_download,
        'transcribe': cmd_transcribe,
        'detect': cmd_detect,
        'crop': cmd_crop,
        'generate': cmd_generate,
        'pipeline': cmd_pipeline,
    }
    
    commands[args.command](args)


if __name__ == "__main__":
    main()
