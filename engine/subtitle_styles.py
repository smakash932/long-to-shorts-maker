"""
Subtitle style definitions and ASS generation.

Each template produces visually distinct subtitles that look like a real
short-form template (Mr.Beast bold yellow, Karaoke per-word fill, Bouncy
red outline, etc.). The same template metadata is exported via
`get_templates_for_preview()` so the React frontend can render an
honest CSS preview of how each template will look BEFORE generating
clips.

ASS color format: &HAABBGGRR (BGR, NOT RGB!). Alpha 00=opaque, FF=transparent.
"""

from __future__ import annotations

import os


# Allow templates to specify a fallback Windows-friendly font. Linux render
# tests use Arial/DejaVuSans which both ship in the libass test corpus.
# Outline / shadow values are tuned for 1080x1920 mobile viewing.

TEMPLATES = {
    "default": {
        "name": "Clean White",
        "description": "Clean white text with thick black outline. Safe, readable, works everywhere.",
        "fontname": "Arial",
        "fontsize": 56,
        "primary_color": "&H00FFFFFF",     # White
        "secondary_color": "&H00FFFFFF",
        "outline_color": "&H00000000",     # Black outline
        "back_color": "&H80000000",        # Semi-transparent black box
        "border_style": 1,                 # 1=outline+shadow, 3=opaque box
        "bold": 1,
        "italic": 0,
        "outline": 4,
        "shadow": 2,
        "margin_v": 140,
        "highlight_color": "&H0000FFFF",   # Yellow word highlight
        "preview": {
            "color": "#FFFFFF",
            "stroke": "#000000",
            "background": "transparent",
            "highlightColor": "#FFD700",
            "fontWeight": 700,
            "fontFamily": "Arial, sans-serif",
            "fontSize": 26,
        },
    },
    "mrbeast": {
        "name": "Mr.Beast",
        "description": "Big bold Impact font, thick black outline, yellow word highlight.",
        "fontname": "Impact",
        "fontsize": 70,
        "primary_color": "&H00FFFFFF",
        "secondary_color": "&H00FFFFFF",
        "outline_color": "&H00000000",
        "back_color": "&H00000000",
        "border_style": 1,
        "bold": 1,
        "italic": 0,
        "outline": 7,
        "shadow": 3,
        "margin_v": 160,
        "highlight_color": "&H0000D7FF",   # Gold (BGR: FFD700)
        "preview": {
            "color": "#FFFFFF",
            "stroke": "#000000",
            "background": "transparent",
            "highlightColor": "#FFD700",
            "fontWeight": 900,
            "fontFamily": "Impact, 'Arial Black', sans-serif",
            "fontSize": 32,
            "letterSpacing": "0.5px",
            "textTransform": "uppercase",
        },
    },
    "karaoke": {
        "name": "Karaoke",
        "description": "Each word lights up as it's spoken — perfect for music or fast-talking videos.",
        "fontname": "Arial",
        "fontsize": 58,
        "primary_color": "&H00FFFFFF",     # White (unspoken)
        "secondary_color": "&H0000FFFF",   # Yellow (animated to)
        "outline_color": "&H00000000",
        "back_color": "&H00000000",
        "border_style": 1,
        "bold": 1,
        "italic": 0,
        "outline": 5,
        "shadow": 0,
        "margin_v": 150,
        "highlight_color": "&H0000FFFF",   # Yellow
        "karaoke": True,                   # Special flag — use \k tag
        "preview": {
            "color": "#FFFFFF",
            "stroke": "#000000",
            "background": "transparent",
            "highlightColor": "#FFEE00",
            "fontWeight": 800,
            "fontFamily": "Arial, sans-serif",
            "fontSize": 28,
        },
    },
    "bouncy": {
        "name": "Bouncy Red",
        "description": "Impact font, red outline, scale-up animation per word.",
        "fontname": "Impact",
        "fontsize": 64,
        "primary_color": "&H00FFFFFF",
        "secondary_color": "&H00FFFFFF",
        "outline_color": "&H000000FF",     # Red (BGR: FF0000)
        "back_color": "&H00000000",
        "border_style": 1,
        "bold": 1,
        "italic": 0,
        "outline": 5,
        "shadow": 2,
        "margin_v": 150,
        "highlight_color": "&H001144FF",   # Red/orange word highlight (BGR: FF4411)
        "bouncy": True,                    # Use bounce animation
        "preview": {
            "color": "#FFFFFF",
            "stroke": "#FF0000",
            "background": "transparent",
            "highlightColor": "#FF4411",
            "fontWeight": 900,
            "fontFamily": "Impact, 'Arial Black', sans-serif",
            "fontSize": 30,
            "textTransform": "uppercase",
        },
    },
    "neon": {
        "name": "Neon Glow",
        "description": "Pink/cyan glow effect — gaming, late-night, vibe-y content.",
        "fontname": "Arial",
        "fontsize": 58,
        "primary_color": "&H00FFFFFF",
        "secondary_color": "&H00FFFFFF",
        "outline_color": "&H00FF00FF",     # Magenta outline (BGR: FF00FF)
        "back_color": "&H40000000",
        "border_style": 1,
        "bold": 1,
        "italic": 0,
        "outline": 4,
        "shadow": 6,                        # big shadow → glow look
        "margin_v": 150,
        "highlight_color": "&H00FFFF00",   # Cyan (BGR: 00FFFF)
        "preview": {
            "color": "#FFFFFF",
            "stroke": "#FF00FF",
            "background": "transparent",
            "highlightColor": "#00FFFF",
            "fontWeight": 800,
            "fontFamily": "Arial, sans-serif",
            "fontSize": 28,
            "textShadow": "0 0 8px #FF00FF, 0 0 14px #00FFFF",
        },
    },
    "business": {
        "name": "Business",
        "description": "Calm, professional. Smaller font, soft grey outline.",
        "fontname": "Arial",
        "fontsize": 46,
        "primary_color": "&H00FFFFFF",
        "secondary_color": "&H00FFFFFF",
        "outline_color": "&H00404040",
        "back_color": "&HB4000000",        # Translucent dark box
        "border_style": 3,                 # opaque box
        "bold": 0,
        "italic": 0,
        "outline": 0,
        "shadow": 0,
        "margin_v": 110,
        "highlight_color": "&H0000A5FF",   # Orange highlight (BGR: FFA500)
        "preview": {
            "color": "#FFFFFF",
            "stroke": "transparent",
            "background": "rgba(0,0,0,0.7)",
            "highlightColor": "#FFA500",
            "fontWeight": 500,
            "fontFamily": "Arial, sans-serif",
            "fontSize": 24,
            "padding": "4px 12px",
            "borderRadius": "4px",
        },
    },
}


def get_template(name: str) -> dict:
    """Return the template dict; falls back to 'default' on unknown name."""
    return TEMPLATES.get(name, TEMPLATES["default"])


def get_template_names() -> list[dict]:
    """Get template id+name list (used by the /api/templates endpoint)."""
    return [
        {"id": k, "name": v["name"], "description": v["description"]}
        for k, v in TEMPLATES.items()
    ]


def get_templates_for_preview() -> dict:
    """
    Return a dict of {template_id: {name, description, preview}} for
    frontend live-preview rendering.
    """
    return {
        k: {
            "name": v["name"],
            "description": v["description"],
            "preview": v["preview"],
        }
        for k, v in TEMPLATES.items()
    }


# ---------------------------------------------------------------------------
# ASS generation
# ---------------------------------------------------------------------------


def format_ass_time(seconds: float) -> str:
    """Format seconds to ASS time format (H:MM:SS.CC)."""
    seconds = max(0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    cs = int((s % 1) * 100)
    return f"{h}:{m:02d}:{int(s):02d}.{cs:02d}"


def format_srt_time(seconds: float) -> str:
    """Format seconds to SRT time format."""
    seconds = max(0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def generate_ass_header(
    template_name: str = "default",
    video_width: int = 1080,
    video_height: int = 1920,
    hook_position: str = "upper",
    sub_position: str = "bottom",
) -> str:
    """
    Generate ASS subtitle file header with style definitions.
    Adds: Default subtitle style, Highlight word style, HookText style.
    """
    t = get_template(template_name)

    # Position presets (alignment 2 = bottom-center, 5 = middle-center, 8 = top-center)
    hook_positions = {
        'top':    int(video_height * 0.08),
        'upper':  int(video_height * 0.20),
        'center': int(video_height * 0.38),
        'lower':  int(video_height * 0.55),
        'bottom': int(video_height * 0.72),
    }
    sub_positions = {
        'top':    int(video_height * 0.05),
        'upper':  int(video_height * 0.15),
        'center': int(video_height * 0.35),
        'lower':  int(video_height * 0.55),
        'bottom': 140,
    }

    hook_margin = hook_positions.get(hook_position, hook_positions['upper'])
    sub_margin = sub_positions.get(sub_position, sub_positions['bottom'])
    sub_align = 8 if sub_position in ('top', 'upper') else (5 if sub_position == 'center' else 2)

    hook_fontsize = max(38, int(video_width * 0.045))

    header = f"""[Script Info]
Title: Long to Shorts Maker Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: {video_width}
PlayResY: {video_height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{t['fontname']},{t['fontsize']},{t['primary_color']},{t['secondary_color']},{t['outline_color']},{t['back_color']},{t['bold']},{t['italic']},0,0,100,100,0,0,{t['border_style']},{t['outline']},{t['shadow']},{sub_align},40,40,{sub_margin},1
Style: Highlight,{t['fontname']},{t['fontsize']},{t['highlight_color']},{t['secondary_color']},{t['outline_color']},{t['back_color']},1,{t['italic']},0,0,100,100,0,0,{t['border_style']},{t['outline']},{t['shadow']},{sub_align},40,40,{sub_margin},1
Style: HookText,Arial,{hook_fontsize},&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,10,0,8,60,60,{hook_margin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    return header


# ---------------------------------------------------------------------------
# Hook text generation (top-of-screen attention grabber)
# ---------------------------------------------------------------------------


def generate_hook_text(
    words: list,
    clip_start: float,
    clip_duration: float,
    video_width: int = 1080,
) -> str:
    """
    Create an attention-grabbing hook line for the first ~12 seconds.

    Looks for the first complete sentence in the clip's opening words and
    formats it as a 1-2 line ALL-CAPS hook with fade in/out.
    """
    if not words:
        return ""

    clip_end = clip_start + clip_duration
    hook_window_end = clip_start + min(12.0, clip_duration * 0.8)

    clip_words = [
        w for w in words
        if w.get('start', 0) >= clip_start - 0.3
        and w.get('start', 0) <= hook_window_end
        and w.get('end', 0) <= clip_end + 0.5
    ][:25]

    if not clip_words or len(clip_words) < 3:
        return ""

    full_text = ' '.join(w['word'].strip() for w in clip_words if w.get('word', '').strip())
    if not full_text or len(full_text) < 5:
        return ""

    import re
    sentences = re.split(r'[.!?]', full_text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 8]

    if sentences:
        hook_text = sentences[0]
        if len(hook_text) < 15 and len(sentences) > 1:
            hook_text = sentences[0] + '. ' + sentences[1]
    else:
        hook_text = ' '.join(full_text.split()[:10])

    words_list = hook_text.split()
    if len(words_list) > 12:
        hook_text = ' '.join(words_list[:12])

    hook_text = hook_text.strip('.,!?;: ')
    if hook_text:
        hook_text = hook_text[0].upper() + hook_text[1:]
    if not hook_text or len(hook_text) < 5:
        return ""

    if hook_text[-1] not in '.!?':
        hook_text += '...'

    # 2-line wrap
    wl = hook_text.split()
    if len(wl) > 5:
        mid = len(wl) // 2
        hook_text = ' '.join(wl[:mid]) + '\\N' + ' '.join(wl[mid:])

    hook_duration = min(15.0, clip_duration * 0.85)
    start_str = format_ass_time(0.3)
    end_str = format_ass_time(hook_duration)
    fade_tag = "{\\fad(500,800)}"

    return f"Dialogue: 1,{start_str},{end_str},HookText,,0,0,0,,{fade_tag}{hook_text}\n"


# ---------------------------------------------------------------------------
# Word-by-word subtitle line generation
# ---------------------------------------------------------------------------


def _escape_text(text: str) -> str:
    """Escape ASS-special characters in a text token."""
    return text.replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}')


def _karaoke_line(line_words: list, line_start: float, line_end: float) -> str:
    """
    Build a karaoke-style line where each word is animated to highlight color
    in sync with the spoken timing. Uses \\kf (fill) for per-word fill animation.
    """
    parts = []
    for w in line_words:
        word_text = _escape_text(w['word'].strip())
        if not word_text:
            continue
        dur_cs = max(1, int(round((w['end'] - w['start']) * 100)))  # centiseconds
        parts.append(f"{{\\kf{dur_cs}}}{word_text}")
    text = ' '.join(parts)
    return f"Dialogue: 0,{format_ass_time(line_start)},{format_ass_time(line_end)},Default,,0,0,0,,{text}\n"


def _word_pop_line(
    line_words: list,
    line_start: float,
    line_end: float,
    clip_start_offset: float,
    bouncy: bool = False,
    highlight_color: str | None = None,
) -> list[str]:
    """
    Vizard-style "word pop" — render each word on its own line that gets
    bolder/larger as the speaker says it.

    Returns a list of Dialogue lines (one per moment in the clip).
    """
    if not line_words:
        return []

    lines: list[str] = []
    text_tokens = [_escape_text(w['word'].strip()) for w in line_words]

    for i, w in enumerate(line_words):
        seg_start = max(0.0, w['start'] - clip_start_offset)
        # End at the next word's start, or 0.3s after this word if it's the last
        if i + 1 < len(line_words):
            seg_end = max(seg_start + 0.05, line_words[i + 1]['start'] - clip_start_offset)
        else:
            seg_end = max(seg_start + 0.15, w['end'] - clip_start_offset + 0.05)

        if seg_end <= 0 or seg_end < seg_start:
            continue

        rendered = []
        for j, token in enumerate(text_tokens):
            if j == i:
                # Active word: render in Highlight style + optional scale pop
                if bouncy:
                    rendered.append(f"{{\\rHighlight\\fscx115\\fscy115}}{token}{{\\rDefault}}")
                else:
                    rendered.append(f"{{\\rHighlight}}{token}{{\\rDefault}}")
            else:
                rendered.append(token)

        line_text = ' '.join(rendered)
        lines.append(
            f"Dialogue: 0,{format_ass_time(seg_start)},{format_ass_time(seg_end)},"
            f"Default,,0,0,0,,{line_text}\n"
        )

    return lines


def generate_word_by_word_ass(
    words: list,
    clip_start: float,
    template_name: str = "default",
    video_width: int = 1080,
    video_height: int = 1920,
    words_per_line: int = 4,
    highlight_keywords: list = None,
    clip_duration: float = 0,
    hook_position: str = "upper",
    sub_position: str = "bottom",
) -> str:
    """
    Generate ASS subtitle with word-by-word display + hook text.

    Template-specific behavior:
      - karaoke: per-word fill animation via \\kf
      - bouncy:  per-word size pop on active word
      - others:  active word renders in Highlight style
    """
    t = get_template(template_name)
    ass_content = generate_ass_header(
        template_name, video_width, video_height, hook_position, sub_position,
    )

    if not words:
        return ass_content

    # Hook text (first ~12s)
    if clip_duration > 0:
        hook_line = generate_hook_text(words, clip_start, clip_duration, video_width)
        if hook_line:
            ass_content += hook_line

    # Group words into lines of `words_per_line`
    lines: list[list] = []
    current_line: list = []
    for w in words:
        current_line.append(w)
        if len(current_line) >= words_per_line:
            lines.append(current_line)
            current_line = []
    if current_line:
        lines.append(current_line)

    is_karaoke = bool(t.get("karaoke"))
    is_bouncy = bool(t.get("bouncy"))

    for line_words in lines:
        if not line_words:
            continue

        line_start = max(0, line_words[0]['start'] - clip_start)
        line_end = max(0, line_words[-1]['end'] - clip_start)
        if line_end <= 0 or line_end <= line_start:
            continue

        if is_karaoke:
            # Adjust word timings to clip-relative for karaoke
            adjusted = [
                {**w, 'start': max(0, w['start'] - clip_start),
                 'end': max(0, w['end'] - clip_start)}
                for w in line_words
            ]
            ass_content += _karaoke_line(adjusted, line_start, line_end)
        else:
            for line in _word_pop_line(
                line_words, line_start, line_end,
                clip_start_offset=clip_start,
                bouncy=is_bouncy,
            ):
                ass_content += line

    return ass_content


def generate_srt(words: list, clip_start: float, words_per_line: int = 6) -> str:
    """Generate SRT subtitle format as fallback."""
    if not words:
        return ""

    lines: list[list] = []
    current_line: list = []
    for w in words:
        current_line.append(w)
        if len(current_line) >= words_per_line:
            lines.append(current_line)
            current_line = []
    if current_line:
        lines.append(current_line)

    srt = ""
    for i, line_words in enumerate(lines, 1):
        start = max(0, line_words[0]['start'] - clip_start)
        end = max(0, line_words[-1]['end'] - clip_start)
        if end <= 0:
            continue
        text = ' '.join(w['word'] for w in line_words)
        srt += f"{i}\n{format_srt_time(start)} --> {format_srt_time(end)}\n{text}\n\n"

    return srt
