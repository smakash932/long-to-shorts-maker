import React from 'react';

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

const TEMPLATES = [
    {
        id: 'default', name: 'Default',
        subtitle: 'Your title',
        fontStyle: { color: '#fff', textShadow: '1px 1px 2px #000', fontWeight: 700, fontSize: '0.45rem' },
        bg: 'linear-gradient(135deg, #1a1a2e, #16213e)',
    },
    {
        id: 'modern', name: 'Modern',
        subtitle: 'SUBTITLE',
        fontStyle: { color: '#fff', textShadow: '2px 2px 0 #333', fontWeight: 800, fontSize: '0.42rem', letterSpacing: '0.5px' },
        bg: 'linear-gradient(135deg, #0f0c29, #302b63)',
    },
    {
        id: 'bouncy', name: 'Bouncy',
        subtitle: 'YOUR TEXT',
        fontStyle: { color: '#fff', textShadow: '2px 2px 0 #e94560', fontWeight: 900, fontSize: '0.45rem' },
        bg: 'linear-gradient(135deg, #0f3460, #16213e)',
    },
    {
        id: 'mrbeast', name: 'Mr.Beast',
        subtitle: 'SUBSCRIBE',
        fontStyle: { color: '#FFD700', textShadow: '2px 2px 0 #000', fontWeight: 900, fontSize: '0.45rem' },
        bg: 'linear-gradient(135deg, #1a0a2e, #2d1b69)',
    },
    {
        id: 'business', name: 'Business',
        subtitle: 'Pro text',
        fontStyle: { color: '#e0e0e0', fontWeight: 500, fontSize: '0.42rem' },
        bg: 'linear-gradient(135deg, #1a1a1a, #2d2d2d)',
    },
    {
        id: 'karaoke', name: 'Karaoke',
        subtitle: 'Word',
        fontStyle: { color: '#00d4ff', textShadow: '2px 2px 0 #000', fontWeight: 800, fontSize: '0.45rem' },
        bg: 'linear-gradient(135deg, #1a1a2e, #0d0d30)',
        highlight: true,
    },
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

export default function ClipSettings({ settings, onSettingsChange, disabled }) {
    const updateSetting = (key, value) => {
        onSettingsChange({ ...settings, [key]: value });
    };

    return (
        <div className="settings-panel glass-card" style={{ padding: '12px 16px' }}>
            <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                <span>⚙️</span> Clip Settings
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

            {/* Row 2: Inline toggles — compact */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', minWidth: '180px' }}>
                    <label className="setting-label-sm" style={{ marginBottom: '3px', display: 'block' }}>Mode</label>
                    <div className="toggle-row">
                        <button className={`toggle-btn ${(settings.mode || 'classic') === 'classic' ? 'active' : ''}`}
                            onClick={() => !disabled && updateSetting('mode', 'classic')} disabled={disabled} id="mode-classic"
                            title="Fast center crop, no face detection">⚡ Classic</button>
                        <button className={`toggle-btn ${settings.mode === 'advanced' ? 'active' : ''}`}
                            onClick={() => !disabled && updateSetting('mode', 'advanced')} disabled={disabled} id="mode-advanced"
                            title="Face detection + split-screen">🎯 Advanced</button>
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
                {/* Subtitle style inline */}
                <div style={{ flex: '2', minWidth: '300px' }}>
                    <label className="setting-label-sm" style={{ marginBottom: '3px', display: 'block' }}>Subtitle Style</label>
                    <div className="template-strip">
                        {TEMPLATES.map(t => (
                            <div key={t.id}
                                className={`template-chip ${settings.template === t.id ? 'selected' : ''}`}
                                onClick={() => !disabled && updateSetting('template', t.id)}
                                title={`${t.name}: ${t.subtitle}`}
                                style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                                <div className="template-chip-preview" style={{ background: t.bg }}>
                                    <span style={{
                                        ...t.fontStyle,
                                        fontSize: '0.55rem',
                                        textAlign: 'center',
                                        lineHeight: 1.2,
                                        padding: '2px 4px',
                                        wordBreak: 'break-word',
                                    }}>
                                        {t.highlight ? (<><span style={{ color: '#FFD700' }}>Hi</span> text</>) : t.subtitle}
                                    </span>
                                </div>
                                <span className="template-chip-name">{t.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
