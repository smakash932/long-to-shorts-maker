"""
YouTube video downloader using yt-dlp.
Downloads videos in best available quality (up to 1080p).
Emits progress events for the Node.js backend.
"""

import os
import json
import yt_dlp
from utils import (
    emit_progress, emit_error, emit_complete,
    VIDEOS_DIR, generate_id, ensure_dirs
)


def get_video_info(url: str) -> dict:
    """Extract video metadata without downloading."""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'resolution': info.get('resolution', 'Unknown'),
                'uploader': info.get('uploader', 'Unknown'),
                'description': info.get('description', ''),
                'webpage_url': info.get('webpage_url', url),
            }
    except Exception as e:
        emit_error(f"Failed to get video info: {str(e)}", "info")
        return None


def download_video(url: str, video_id: str = None) -> dict:
    """
    Download a YouTube video in best quality (up to 1080p).
    Returns video metadata and file path.
    """
    ensure_dirs()
    
    if not video_id:
        video_id = generate_id(url)
    
    output_path = os.path.join(VIDEOS_DIR, f"{video_id}.%(ext)s")
    final_path = os.path.join(VIDEOS_DIR, f"{video_id}.mp4")
    
    # Progress hook for real-time updates
    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)
            if total > 0:
                pct = int((downloaded / total) * 100)
                speed = d.get('speed', 0)
                speed_str = ""
                if speed:
                    speed_mb = speed / (1024 * 1024)
                    speed_str = f" ({speed_mb:.1f} MB/s)"
                emit_progress("download", pct, f"Downloading...{pct}%{speed_str}")
        elif d['status'] == 'finished':
            emit_progress("download", 100, "Download complete, processing...")
    
    # Robust format selection:
    # 1. Best video <=1080p mp4 + best audio m4a (ideal)
    # 2. Best video <=1080p any format + best audio (ffmpeg merges)
    # 3. Best pre-merged <=1080p
    # 4. Absolute fallback: best available (rare)
    # NEVER download 4K — wastes bandwidth and causes errors on some systems
    format_str = (
        'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/'
        'bestvideo[height<=1080]+bestaudio/'
        'best[height<=1080][ext=mp4]/'
        'best[height<=1080]/'
        'best'
    )
    
    ydl_opts = {
        'format': format_str,
        'outtmpl': output_path,
        'merge_output_format': 'mp4',
        'progress_hooks': [progress_hook],
        'quiet': True,
        'no_warnings': True,
        'retries': 3,
        'fragment_retries': 5,
        'postprocessors': [{
            'key': 'FFmpegVideoConvertor',
            'preferedformat': 'mp4',
        }],
    }
    
    try:
        emit_progress("download", 0, "Starting download...")
        
        # ★ FIX: Clean up stale temp/partial files from previous runs
        # Windows locks files and prevents rename if old processes left handles open
        import time
        import glob
        stale_patterns = [
            os.path.join(VIDEOS_DIR, f"{video_id}.*"),
            os.path.join(VIDEOS_DIR, f"{video_id}.temp.*"),
            os.path.join(VIDEOS_DIR, f"{video_id}.*.part"),
        ]
        for pattern in stale_patterns:
            for stale_file in glob.glob(pattern):
                try:
                    os.remove(stale_file)
                except Exception:
                    pass
        
        # Small delay to let Windows release any file handles
        time.sleep(0.5)
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
            # Find the actual downloaded file (with retry for Windows file lock)
            # yt-dlp may need a moment to finalize the rename on Windows
            found_path = None
            for attempt in range(5):
                if os.path.exists(final_path):
                    found_path = final_path
                    break
                    
                # Check for other extensions
                for ext in ['mp4', 'mkv', 'webm']:
                    check_path = os.path.join(VIDEOS_DIR, f"{video_id}.{ext}")
                    if os.path.exists(check_path):
                        found_path = check_path
                        break
                
                if found_path:
                    break
                
                # Check for .temp.mp4 that yt-dlp couldn't rename
                temp_path = os.path.join(VIDEOS_DIR, f"{video_id}.temp.mp4")
                if os.path.exists(temp_path):
                    try:
                        time.sleep(1)  # Wait for lock release
                        os.rename(temp_path, final_path)
                        found_path = final_path
                        break
                    except OSError:
                        pass  # Will retry
                
                time.sleep(1)  # Wait and retry
            
            if not found_path:
                # Last resort: check for any file matching the video_id
                for f in os.listdir(VIDEOS_DIR):
                    if f.startswith(video_id) and not f.endswith('.part'):
                        found_path = os.path.join(VIDEOS_DIR, f)
                        break
            
            if not found_path:
                emit_error("Download completed but file not found", "download")
                return None
            
            final_path = found_path
            
            result = {
                'video_id': video_id,
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'resolution': f"{info.get('width', '?')}x{info.get('height', '?')}",
                'width': info.get('width', 1920),
                'height': info.get('height', 1080),
                'file_path': final_path,
                'file_size': os.path.getsize(final_path) if os.path.exists(final_path) else 0,
            }
            
            emit_complete("download", result)
            return result
            
    except Exception as e:
        emit_error(f"Download failed: {str(e)}", "download")
        return None


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python downloader.py <youtube_url> [video_id]"}))
        sys.exit(1)
    
    url = sys.argv[1]
    vid = sys.argv[2] if len(sys.argv) > 2 else None
    result = download_video(url, vid)
    if not result:
        sys.exit(1)
