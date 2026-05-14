import React, { useRef, useEffect } from 'react';

export default function ClipEditor({ clip, videoId, clipIndex, onClose }) {
    const videoRef = useRef(null);

    if (!clip) return null;

    const streamUrl = `http://localhost:3847/api/clips/${videoId}/${clipIndex}/stream`;
    const downloadUrl = `http://localhost:3847/api/clips/${videoId}/${clipIndex}/download`;

    const duration = clip.duration || 0;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    // Close on Escape key
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Clip #{clipIndex + 1} Preview</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                
                <div className="modal-body">
                    <div className="editor-layout">
                        {/* Video Player */}
                        <div className="editor-video">
                            <video
                                ref={videoRef}
                                src={streamUrl}
                                controls
                                autoPlay
                                playsInline
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                        </div>

                        {/* Info Panel */}
                        <div className="editor-controls">
                            <div className="glass-card" style={{ padding: '16px' }}>
                                <h4 style={{ marginBottom: '12px', color: 'var(--text-primary)' }}>
                                    📊 Clip Info
                                </h4>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Duration</span>
                                        <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{durationStr}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Score</span>
                                        <span style={{ fontWeight: 600, color: 'var(--success)' }}>⭐ {(clip.score || 0).toFixed(0)}%</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Time Range</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                            {formatTime(clip.start)} → {formatTime(clip.end)}
                                        </span>
                                    </div>
                                    {clip.word_count > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Words</span>
                                            <span style={{ fontWeight: 600 }}>{clip.word_count}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Transcript */}
                            {clip.text && (
                                <div className="glass-card" style={{ padding: '16px' }}>
                                    <h4 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>
                                        📝 Transcript
                                    </h4>
                                    <p style={{ 
                                        fontSize: '0.85rem', 
                                        color: 'var(--text-secondary)', 
                                        lineHeight: 1.6,
                                        maxHeight: '150px',
                                        overflowY: 'auto'
                                    }}>
                                        {clip.text}
                                    </p>
                                </div>
                            )}

                            {/* Download Button */}
                            <a 
                                href={downloadUrl}
                                download={`short_clip_${clipIndex + 1}.mp4`}
                                className="btn btn-primary btn-lg"
                                style={{ width: '100%', textDecoration: 'none' }}
                            >
                                📥 Download This Clip
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
