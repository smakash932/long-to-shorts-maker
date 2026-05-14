"""
Subtitle style definitions for different templates.
Generates ASS (Advanced SubStation Alpha) subtitle format
for rich styling support (colors, fonts, animations).

Includes:
  - Word-by-word subtitle display
  - On-screen Hook Text (first 15s, white bg, black text, top of screen)
"""


# Subtitle template definitions — font sizes optimized for 1080x1920 mobile viewing
TEMPLATES = {
    "default": {
        "name": "Default",
        "fontname": "Arial",
        "fontsize": 52,
        "primary_color": "&H00FFFFFF",    # White
        "outline_color": "&H00000000",    # Black
        "back_color": "&H80000000",       # Semi-transparent black
        "bold": 1,
        "outline": 4,
        "shadow": 2,
        "alignment": 2,  # Bottom center
        "margin_v": 120,
        "highlight_color": "&H0000FFFF",  # Yellow
    },
    "modern": {
        "name": "Modern",
        "fontname": "Arial",
        "fontsize": 56,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00333333",
        "back_color": "&HC8000000",
        "bold": 1,
        "outline": 5,
        "shadow": 0,
        "alignment": 2,
        "margin_v": 140,
        "highlight_color": "&H0042F5F5",  # Hot pink-ish
    },
    "bouncy": {
        "name": "Bouncy",
        "fontname": "Impact",
        "fontsize": 58,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H000000FF",    # Red outline
        "back_color": "&H00000000",
        "bold": 1,
        "outline": 5,
        "shadow": 3,
        "alignment": 2,
        "margin_v": 130,
        "highlight_color": "&H0000FF00",  # Green
    },
    "mrbeast": {
        "name": "Mr.Beast",
        "fontname": "Impact",
        "fontsize": 62,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00000000",
        "back_color": "&H00000000",
        "bold": 1,
        "outline": 6,
        "shadow": 0,
        "alignment": 2,
        "margin_v": 150,
        "highlight_color": "&H0000D7FF",  # Gold
    },
    "business": {
        "name": "Business",
        "fontname": "Arial",
        "fontsize": 46,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00404040",
        "back_color": "&HB4000000",
        "bold": 0,
        "outline": 3,
        "shadow": 0,
        "alignment": 2,
        "margin_v": 100,
        "highlight_color": "&H00FFA500",  # Orange
    },
    "karaoke": {
        "name": "Karaoke",
        "fontname": "Arial",
        "fontsize": 54,
        "primary_color": "&H00FFFFFF",
        "outline_color": "&H00000000",
        "back_color": "&H00000000",
        "bold": 1,
        "outline": 5,
        "shadow": 0,
        "alignment": 2,
        "margin_v": 140,
        "highlight_color": "&H0000D7FF",
    },
}


def generate_ass_header(template_name: str = "default", 
                         video_width: int = 1080, 
                         video_height: int = 1920,
                         hook_position: str = "upper",
                         sub_position: str = "bottom") -> str:
    """
    Generate ASS subtitle file header with style definitions.
    Includes:
      - Default subtitle style (bottom)
      - Highlight style (word highlighting)
      - HookText style (top of screen, white bg, black text)
    """
    t = TEMPLATES.get(template_name, TEMPLATES["default"])
    
    # Hook text sizing: ~45px on 1080w, bold
    hook_fontsize = max(38, int(video_width * 0.045))
    
    # Hook position margins (alignment 8 = top-center)
    # Position presets: top=8%, upper=20%, center=40%, lower=65%, bottom=80%
    hook_positions = {
        'top': int(video_height * 0.08),
        'upper': int(video_height * 0.20),
        'center': int(video_height * 0.38),
        'lower': int(video_height * 0.55),
        'bottom': int(video_height * 0.72),
    }
    hook_margin = hook_positions.get(hook_position, hook_positions['upper'])
    
    # Subtitle position margins
    sub_positions = {
        'top': int(video_height * 0.05),
        'upper': int(video_height * 0.15),
        'center': int(video_height * 0.35),
        'lower': int(video_height * 0.55),
        'bottom': 120,
    }
    sub_margin = sub_positions.get(sub_position, sub_positions['bottom'])
    sub_align = 8 if sub_position in ('top', 'upper') else (5 if sub_position == 'center' else t['alignment'])
    
    header = f"""[Script Info]
Title: Long to Shorts Maker Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: {video_width}
PlayResY: {video_height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{t['fontname']},{t['fontsize']},{t['primary_color']},{t['highlight_color']},{t['outline_color']},{t['back_color']},{t['bold']},0,0,0,100,100,0,0,1,{t['outline']},{t['shadow']},{sub_align},20,20,{sub_margin},1
Style: Highlight,{t['fontname']},{t['fontsize']},{t['highlight_color']},{t['primary_color']},{t['outline_color']},{t['back_color']},1,0,0,0,100,100,0,0,1,{t['outline']},{t['shadow']},{sub_align},20,20,{sub_margin},1
Style: HookText,Arial,{hook_fontsize},&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,10,0,8,60,60,{hook_margin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    return header


def format_ass_time(seconds: float) -> str:
    """Format seconds to ASS time format (H:MM:SS.CC)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    cs = int((s % 1) * 100)
    return f"{h}:{m:02d}:{int(s):02d}.{cs:02d}"


def generate_hook_text(words: list, clip_start: float,
                        clip_duration: float,
                        video_width: int = 1080) -> str:
    """
    Generate engaging on-screen hook text for the first 15 seconds.
    
    Creates an attention-grabbing hook by:
      1. Finding complete sentence fragments (not random word dumps)
      2. Looking for the first impactful statement
      3. Capitalizing and formatting for maximum visual impact
    
    The hook appears at the configured position with white bg + black text.
    
    IMPORTANT: `words` list uses ORIGINAL video timestamps, so we must
    filter using clip_start to find words that belong to this clip.
    """
    if not words:
        return ""
    
    clip_end = clip_start + clip_duration
    
    # ★ FIX: Filter words that fall within this clip's first ~12 seconds
    # using absolute timestamps from the original video
    hook_window_end = clip_start + min(12.0, clip_duration * 0.8)
    
    clip_words = [w for w in words 
                  if w.get('start', 0) >= clip_start - 0.3
                  and w.get('start', 0) <= hook_window_end
                  and w.get('end', 0) <= clip_end + 0.5][:25]
    
    if not clip_words or len(clip_words) < 3:
        return ""
    
    # Build the full text from clip words
    full_text = ' '.join(w['word'].strip() for w in clip_words if w.get('word', '').strip())
    
    if not full_text or len(full_text) < 5:
        return ""
    
    # Strategy: Find the first meaningful sentence/fragment
    # Split by sentence-ending punctuation
    import re
    sentences = re.split(r'[.!?]', full_text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 8]
    
    if sentences:
        # Use the first complete sentence (or combine if first is too short)
        hook_text = sentences[0]
        if len(hook_text) < 15 and len(sentences) > 1:
            hook_text = sentences[0] + '. ' + sentences[1]
    else:
        # No sentence breaks — take first ~10 words
        hook_text = ' '.join(full_text.split()[:10])
    
    # Trim to max ~60 chars for readability (about 2 short lines)
    words_list = hook_text.split()
    if len(words_list) > 12:
        hook_text = ' '.join(words_list[:12])
    
    # Clean up
    hook_text = hook_text.strip('.,!?;: ')
    
    # Capitalize first letter for impact
    if hook_text:
        hook_text = hook_text[0].upper() + hook_text[1:]
    
    if not hook_text or len(hook_text) < 5:
        return ""
    
    # Add trailing "..." if it's a fragment (not ending with punctuation)
    if hook_text[-1] not in '.!?':
        hook_text += '...'
    
    # Split into 2 lines for readability (max ~6 words per line)
    words_list = hook_text.split()
    if len(words_list) > 5:
        mid = len(words_list) // 2
        line1 = ' '.join(words_list[:mid])
        line2 = ' '.join(words_list[mid:])
        hook_text = line1 + '\\N' + line2
    
    # Hook shows for first 15 seconds (or clip duration if shorter)
    hook_duration = min(15.0, clip_duration * 0.85)
    
    start_str = format_ass_time(0.3)
    end_str = format_ass_time(hook_duration)
    
    # Fade in 500ms, fade out 800ms
    fade_tag = "{\\fad(500,800)}"
    
    line = f"Dialogue: 1,{start_str},{end_str},HookText,,0,0,0,,{fade_tag}{hook_text}\n"
    
    return line


def generate_word_by_word_ass(words: list, clip_start: float,
                               template_name: str = "default",
                               video_width: int = 1080,
                               video_height: int = 1920,
                               words_per_line: int = 4,
                               highlight_keywords: list = None,
                               clip_duration: float = 0,
                               hook_position: str = "upper",
                               sub_position: str = "bottom") -> str:
    """
    Generate ASS subtitle with word-by-word display + hook text.
    Groups words into lines and shows them with timing.
    
    Args:
        words: List of word dicts with 'word', 'start', 'end' keys
        clip_start: Start time of the clip in the original video
        template_name: Subtitle template name
        video_width: Output video width
        video_height: Output video height
        words_per_line: Number of words per subtitle line
        highlight_keywords: List of keywords to highlight
        clip_duration: Duration of clip for hook text timing
        hook_position: Position preset for hook text (top/upper/center/lower/bottom)
        sub_position: Position preset for subtitles (top/upper/center/lower/bottom)
    
    Returns:
        Complete ASS subtitle file content.
    """
    ass_content = generate_ass_header(template_name, video_width, video_height,
                                       hook_position, sub_position)
    
    if not words:
        return ass_content
    
    # --- Add hook text at top (first 15 seconds) ---
    if clip_duration > 0:
        hook_lines = generate_hook_text(words, clip_start, clip_duration, video_width)
        if hook_lines:
            ass_content += hook_lines
    
    highlight_keywords = [k.lower() for k in (highlight_keywords or [])]
    
    # Group words into lines
    lines = []
    current_line = []
    
    for word in words:
        current_line.append(word)
        if len(current_line) >= words_per_line:
            lines.append(current_line)
            current_line = []
    
    if current_line:
        lines.append(current_line)
    
    # Generate dialogue events for each line
    for line_words in lines:
        if not line_words:
            continue
        
        line_start = line_words[0]['start'] - clip_start
        line_end = line_words[-1]['end'] - clip_start
        
        # Skip if timing is negative (before clip start)
        if line_end < 0:
            continue
        line_start = max(0, line_start)
        
        # Build text with optional highlighting
        text_parts = []
        for w in line_words:
            word_text = w['word']
            if highlight_keywords and word_text.lower().strip('.,!?;:') in highlight_keywords:
                text_parts.append(f"{{\\rHighlight}}{word_text}{{\\rDefault}}")
            else:
                text_parts.append(word_text)
        
        text = ' '.join(text_parts)
        text = text.replace('\n', '\\N')
        
        start_str = format_ass_time(line_start)
        end_str = format_ass_time(line_end)
        
        ass_content += f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{text}\n"
    
    return ass_content


def generate_srt(words: list, clip_start: float, words_per_line: int = 6) -> str:
    """Generate SRT subtitle format as fallback."""
    if not words:
        return ""
    
    lines = []
    current_line = []
    
    for word in words:
        current_line.append(word)
        if len(current_line) >= words_per_line:
            lines.append(current_line)
            current_line = []
    if current_line:
        lines.append(current_line)
    
    srt_content = ""
    for i, line_words in enumerate(lines, 1):
        start = max(0, line_words[0]['start'] - clip_start)
        end = max(0, line_words[-1]['end'] - clip_start)
        
        if end <= 0:
            continue
        
        start_str = format_srt_time(start)
        end_str = format_srt_time(end)
        text = ' '.join(w['word'] for w in line_words)
        
        srt_content += f"{i}\n{start_str} --> {end_str}\n{text}\n\n"
    
    return srt_content


def format_srt_time(seconds: float) -> str:
    """Format seconds to SRT time format."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def get_template_names() -> list:
    """Get list of available template names."""
    return [{"id": k, "name": v["name"]} for k, v in TEMPLATES.items()]

