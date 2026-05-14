import React, { useEffect, useState } from 'react';

const RATIOS = [
    { value: '9:16', label: '9:16 (Shorts)' },
    { value: '1:1', label: '1:1 (Square)' },
    { value: '16:9', label: '16:9 (Wide)' },
];

const CLIP_LENGTHS = [
    { value: '', label: 'Any' },
    { value: '<15', label: '⚡ <15s' },
    { value: '15-30', label: '15-30s' },
    { value: '15-60', label: '🔥 15-60s' },
    { value: '30-60', label: '30-60s' },
    { value: '60-90', label: '60-90s' },
    { value: '90-180', label: '90s-3m' },
    { value: '>180', label: '3m+' },
];

// Fallback templates if /api/templates is not reachable (e.g. before server
// has fully started). These match the keys in engine/subtitle_styles.py.
const FALLBACK_TEMPLATES = [
    { id: 'default', name: 'Clean White', description: 'Clean white text with thick black outline.' },
    { id: 'mrbeast', name: 'Mr.Beast', description: 'Big bold Impact font, yellow word highlight.' },
    { id: 'karaoke', name: 'Karaoke', description: 'Word-by-word fill animation as you speak.' },
    { id: 'bouncy', name: 'Bouncy Red', description: 'Bouncy red-outlined text, words pop on cue.' },
    { id: 'neon', name: 'Neon Glow', description: 'Magenta + cyan glow look, very high contrast.' },
    { id: 'business', name: 'Business', description: 'Clean professional style on a dark plate.' },
];

const LANGUAGES = [
    { value: '', label: 'Auto Detect' },
    { value: 'en', label: '🇬🇧 English' },
    { value: 'bn', label: '🇧🇩 বাংলা' },
    { value: 'hi', label: '🇮🇳 हिन्दी' },
    { value: 'es', label: '🇪🇸 Español' },
    { value: 'fr', label: '🇫🇷 Français' },
    { value: 'ar', label: '🇸🇦 العربية' },
    { value: 'ja', label: '🇯🇵 日本語' },
    { value: 'ko', label: '🇰🇷 한국어' },
    { value: 'zh', label: '🇨🇳 中文' },
    { value: 'pt', label: '🇧🇷 Português' },
    { value: 'de', label: '🇩🇪 Deutsch' },
    { value: 'ru', label: '🇷🇺 Русский' },
    { value: 'tr', label: '🇹🇷 Türkçe' },
    { value: 'ur', label: '🇵🇰 اردو' },
];

const API_BASE = (import.meta?.env?.VITE_API_BASE) || 'http://localhost:3847';

// Build inline CSS for a template chip / preview from the engine's CSS dict.
function styleFromPreview(preview) {
    if (!preview) return {};
    const stroke = preview.stroke;
    // CSS text-stroke isn't well-supported, fake it with layered text-shadow.
    const shadow = stroke
        ? `-2px -2px 0 ${stroke}, 2px -2px 0 ${stroke}, -2px 2px 0 ${stroke}, 2px 2px 0 ${stroke}, 0 0 6px rgba(0,0,0,0.6)`
        : '2px 2px 4px rgba(0,0,0,0.7)';
    return {
        color: preview.color || '#fff',
        fontFamily: preview.fontFamily || 'Arial Black, Arial, sans-serif',
        fontWeight: preview.fontWeight || 800,
        fontSize: preview.fontSize ? `${preview.fontSize}px` : '20px',
        letterSpacing: preview.letterSpacing || '0.3px',
        textTransform: preview.textTransform || 'none',
        textShadow: shadow,
        lineHeight: 1.15,
        textAlign: 'center',
        padding: '4px 10px',
    };
}

// Big live preview block — shows what subtitles will look like.
function LivePreview({ template, hookPosition = 'upper', subPosition = 'bottom' }) {
    if (!template) return null;
    const previewStyle = styleFromPreview(template.preview);
    const highlightColor = template.preview?.highlightColor || '#FFD700';
    const isUpper = (pos) => pos === 'top' || pos === 'upper';
    const isLower = (pos) => pos === 'bottom' || pos === 'lower';

    // Demo word stream — visually shows highlight on a single active word.
    const words = ['This', 'is', 'how', 'your', 'subs', 'will', 'look'];
    const activeIndex = 3; // "your"

    return (
        <div className="live-preview-box" id="live-preview">
            <div className="live-preview-frame">
                {/* Faux 9:16 video frame */}
                <div className="live-preview-bg">
                    <div className="live-preview-bg-overlay" />

                    {/* Hook text at top/upper */}
                    {isUpper(hookPosition) && (
                        <div className={`preview-hook preview-hook-${hookPosition}`}>
                            HOW THIS TOOL WILL{'\n'}10X YOUR REACH
                        </div>
                    )}
                    {isLower(hookPosition) && (
                        <div className={`preview-hook preview-hook-${hookPosition}`}>
                            HOW THIS TOOL WILL{'\n'}10X YOUR REACH
                        </div>
                    )}

                    {/* Subtitles */}
                    <div className={`preview-subs preview-subs-${subPosition}`} style={previewStyle}>
                        {words.map((w, i) => (
                            <span key={i} style={{
                                color: i === activeIndex ? highlightColor : previewStyle.color,
                                marginRight: '6px',
                                transform: i === activeIndex && template.id === 'bouncy' ? 'scale(1.15)' : 'none',
                                display: 'inline-block',
                                transition: 'transform 0.2s',
                            }}>{w}</span>
                        ))}
                    </div>
                </div>
            </div>
            <div className="live-preview-caption">
                <strong style={{ color: '#fff' }}>{template.name}</strong>
                <span style={{ color: '#aaa', marginLeft: 8, fontSize: '0.78rem' }}>
                    {template.description}
                </span>
            </div>
        </div>
    );
}

export default function ClipSettings({ settings, onSettingsChange, disabled }) {
    const [templates, setTemplates] = useState(FALLBACK_TEMPLATES);
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    const [sysInfo, setSysInfo] = useState(null);

    useEffect(() => {
        let alive = true;
        fetch(`${API_BASE}/api/templates`)
            .then(r => r.json())
            .then(j => {
                if (!alive) return;
                if (j?.data?.length) {
                    setTemplates(j.data);
                    setTemplatesLoaded(true);
                }
            })
            .catch(() => { /* keep fallback */ });

        fetch(`${API_BASE}/api/system`)
            .then(r => r.json())
            .then(j => { if (alive && j?.data) setSysInfo(j.data); })
            .catch(() => { });
        return () => { alive = false; };
    }, []);

    const updateSetting = (key, value) => {
        onSettingsChange({ ...settings, [key]: value });
    };

    const selectedTemplate = templates.find(t => t.id === (settings.template || 'default')) || templates[0];

    // Hardware badge text
    let gpuBadge = null;
    if (sysInfo) {
        if (sysInfo?.nvenc?.available) {
            gpuBadge = `GPU encode: ${sysInfo?.nvidia?.name || 'NVIDIA'} (NVENC on)`;
        } else if (sysInfo?.nvidia?.available) {
            gpuBadge = `GPU detected: ${sysInfo.nvidia.name} — NVENC unavailable`;
        } else {
            gpuBadge = 'CPU encode (no NVIDIA GPU detected)';
        }
    }

    return (
        <div className="settings-panel glass-card" style={{ padding: '12px 16px' }}>
            <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                <span>⚙️</span> Clip Settings
                {gpuBadge && (
                    <span title="Hardware detection from engine"
                          style={{
                              marginLeft: 'auto', fontSize: '0.72rem', color: '#bbb',
                              padding: '3px 8px', background: 'rgba(255,255,255,0.06)',
                              borderRadius: 6, fontWeight: 500,
                          }}>
                        🖥️ {gpuBadge}
                    </span>
                )}
            </h3>

            {/* Row 1: Core settings — 6 columns compact */}
            <div className="settings-grid-compact">
                <div className="setting-group-sm">
                    <label className="setting-label-sm">Ratio</label>
                    <select className="setting-select-sm" value={settings.ratio || '9:16'}
                        onChange={(e) => updateSetting('ratio', e.target.value)} disabled={disabled} id="ratio-select">
                        {RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                </div>
                <div className="setting-group-sm">
                    <label className="setting-label-sm">Length</label>
                    <select className="setting-select-sm" value={settings.clipLength || '15-60'}
                        onChange={(e) => updateSetting('clipLength', e.target.value)} disabled={disabled} id="clip-length-select">
                        {CLIP_LENGTHS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </div>
                <div className="setting-group-sm">
                    <label className="setting-label-sm">Language</label>
                    <select className="setting-select-sm" value={settings.language || ''}
                        onChange={(e) => updateSetting('language', e.target.value)} disabled={disabled} id="language-select">
                        {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                </div>
                <div className="setting-group-sm">
                    <label className="setting-label-sm">Clips</label>
                    <select className="setting-select-sm" value={settings.clipCount || 10}
                        onChange={(e) => updateSetting('clipCount', e.target.value === 'auto' ? 'auto' : parseInt(e.target.value))} disabled={disabled} id="clip-count-select">
                        <option value="auto">🤖 Auto</option>
                        {[3, 5, 10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
                <div className="setting-group-sm">
                    <label className="setting-label-sm">📌 Hook</label>
                    <select className="setting-select-sm" value={settings.hookPosition || 'upper'}
                        onChange={(e) => updateSetting('hookPosition', e.target.value)} disabled={disabled} id="hook-position-select">
                        <option value="top">⬆ Top</option>
                        <option value="upper">🔼 Upper</option>
                        <option value="center">⏺ Center</option>
                        <option value="lower">🔽 Lower</option>
                        <option value="bottom">⬇ Bottom</option>
                    </select>
                </div>
                <div className="setting-group-sm">
                    <label className="setting-label-sm">💬 Subs</label>
                    <select className="setting-select-sm" value={settings.subPosition || 'bottom'}
                        onChange={(e) => updateSetting('subPosition', e.target.value)} disabled={disabled} id="sub-position-select">
                        <option value="top">⬆ Top</option>
                        <option value="upper">🔼 Upper</option>
                        <option value="center">⏺ Center</option>
                        <option value="lower">🔽 Lower</option>
                        <option value="bottom">⬇ Bottom</option>
                    </select>
                </div>
            </div>

            {/* Row 2: Mode + Title + Anti-copyright + Quality */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', minWidth: '180px' }}>
                    <label className="setting-label-sm" style={{ marginBottom: '3px', display: 'block' }}>Mode</label>
                    <div className="toggle-row">
                        <button className={`toggle-btn ${(settings.mode || 'classic') === 'classic' ? 'active' : ''}`}
                            onClick={() => !disabled && updateSetting('mode', 'classic')} disabled={disabled} id="mode-classic"
                            title="Fast center crop, no face detection">⚡ Classic</button>
                        <button className={`toggle-btn ${settings.mode === 'advanced' ? 'active' : ''}`}
                            onClick={() => !disabled && updateSetting('mode', 'advanced')} disabled={disabled} id="mode-advanced"
                            title="Face detection + smooth tracking">🎯 Advanced</button>
                    </div>
                </div>
                <div style={{ flex: '1', minWidth: '180px' }}>
                    <label className="setting-label-sm" style={{ marginBottom: '3px', display: 'block' }}>Title</label>
                    <div className="toggle-row">
                        <button className={`toggle-btn ${settings.hashtagMode === 'with_tags' || !settings.hashtagMode ? 'active' : ''}`}
                            onClick={() => !disabled && updateSetting('hashtagMode', 'with_tags')} disabled={disabled} id="hashtag-mode-tags"
                            title="Auto 2 hashtags per clip">#️⃣ Tags</button>
                        <button className={`toggle-btn ${settings.hashtagMode === 'plain' ? 'active' : ''}`}
                            onClick={() => !disabled && updateSetting('hashtagMode', 'plain')} disabled={disabled} id="hashtag-mode-plain"
                            title="Clean title, no tags">📝 Plain</button>
                    </div>
                </div>
                <div style={{ flex: '1', minWidth: '200px' }}>
                    <label className="setting-label-sm" style={{ marginBottom: '3px', display: 'block' }}
                           title="Slightly modifies each clip to avoid duplicate-detection (rotation, color, audio pitch).">
                        🛡 Anti-Copyright
                    </label>
                    <div className="toggle-row">
                        {['off', 'light', 'medium', 'strong'].map(s => (
                            <button key={s}
                                className={`toggle-btn ${(settings.anticopy || 'medium') === s ? 'active' : ''}`}
                                onClick={() => !disabled && updateSetting('anticopy', s)} disabled={disabled}
                                id={`anticopy-${s}`}
                                style={{ flex: 1, fontSize: '0.75rem' }}>
                                {s[0].toUpperCase() + s.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ flex: '1', minWidth: '180px' }}>
                    <label className="setting-label-sm" style={{ marginBottom: '3px', display: 'block' }}
                           title="Encoder preset. Fast = lowest quality/highest speed.">
                        🎞 Quality
                    </label>
                    <div className="toggle-row">
                        {['fast', 'balanced', 'best'].map(q => (
                            <button key={q}
                                className={`toggle-btn ${(settings.quality || 'balanced') === q ? 'active' : ''}`}
                                onClick={() => !disabled && updateSetting('quality', q)} disabled={disabled}
                                id={`quality-${q}`}
                                style={{ flex: 1, fontSize: '0.75rem' }}>
                                {q[0].toUpperCase() + q.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Row 3: Subtitle template strip — chips load from /api/templates */}
            <div style={{ marginTop: '12px' }}>
                <label className="setting-label-sm" style={{ marginBottom: '4px', display: 'block' }}>
                    Subtitle Style {templatesLoaded ? '' : ' (loading…)'}
                </label>
                <div className="template-strip">
                    {templates.map(t => {
                        const chipStyle = t.preview ? styleFromPreview(t.preview) : {
                            color: '#fff', fontWeight: 700, fontSize: '14px',
                            textShadow: '2px 2px 0 #000',
                        };
                        const sample = t.id === 'mrbeast' ? 'SUBSCRIBE'
                            : t.id === 'karaoke' ? 'Karaoke'
                            : t.id === 'bouncy' ? 'BOUNCE'
                            : t.id === 'neon' ? 'NEON'
                            : t.id === 'business' ? 'Business'
                            : 'Subtitle';
                        return (
                            <div key={t.id}
                                className={`template-chip ${settings.template === t.id ? 'selected' : ''}`}
                                onClick={() => !disabled && updateSetting('template', t.id)}
                                title={`${t.name}: ${t.description || ''}`}
                                style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                                <div className="template-chip-preview" style={{
                                    background: 'linear-gradient(135deg, #1a1a2e, #16213e)'
                                }}>
                                    <span style={{ ...chipStyle, fontSize: '0.6rem', lineHeight: 1.2 }}>
                                        {sample}
                                    </span>
                                </div>
                                <span className="template-chip-name">{t.name}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Row 4: Live preview block */}
            <div style={{ marginTop: '12px' }}>
                <LivePreview
                    template={selectedTemplate}
                    hookPosition={settings.hookPosition || 'upper'}
                    subPosition={settings.subPosition || 'bottom'}
                />
            </div>
        </div>
    );
}
