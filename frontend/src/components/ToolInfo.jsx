import React, { useState, useEffect } from 'react';

export default function ToolInfo({ onClose }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3847/api/stats')
            .then(r => r.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(() => {
                setStats(null);
                setLoading(false);
            });
    }, []);

    return (
        <div className="tool-info-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className="tool-info-modal">
                {/* Close Button */}
                <button className="tool-info-close" onClick={onClose} title="Close">✕</button>

                {/* Hero Header */}
                <div className="tool-info-hero">
                    <div className="tool-info-logo">✂️</div>
                    <h1>Shorts Maker</h1>
                    <p className="tool-info-tagline">AI-Powered Long Video → Short Clips Generator</p>
                    <div className="tool-info-badges">
                        <span className="tool-info-badge badge-free">🆓 100% Free</span>
                        <span className="tool-info-badge badge-local">💻 Runs Locally</span>
                        <span className="tool-info-badge badge-ai">🤖 AI Powered</span>
                        <span className="tool-info-badge badge-privacy">🔒 Privacy First</span>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="tool-info-section">
                    <h2>📊 Lifetime Statistics</h2>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                            Loading stats...
                        </div>
                    ) : stats ? (
                        <div className="tool-info-stats-grid">
                            <div className="stat-card stat-primary">
                                <div className="stat-value">{stats.totalClips || 0}</div>
                                <div className="stat-label">Total Clips Generated</div>
                                <div className="stat-icon">✂️</div>
                            </div>
                            <div className="stat-card stat-accent">
                                <div className="stat-value">{stats.totalVideos || 0}</div>
                                <div className="stat-label">Videos Processed</div>
                                <div className="stat-icon">🎬</div>
                            </div>
                            <div className="stat-card stat-success">
                                <div className="stat-value">{stats.longestVideo || '0:00'}</div>
                                <div className="stat-label">Longest Video</div>
                                <div className="stat-icon">⏱️</div>
                            </div>
                            <div className="stat-card stat-warning">
                                <div className="stat-value">{stats.shortestVideo || '0:00'}</div>
                                <div className="stat-label">Shortest Video</div>
                                <div className="stat-icon">⚡</div>
                            </div>
                            <div className="stat-card stat-info">
                                <div className="stat-value">{stats.splitScreenClips || 0}</div>
                                <div className="stat-label">Split-Screen Clips</div>
                                <div className="stat-icon">👥</div>
                            </div>
                            <div className="stat-card stat-pink">
                                <div className="stat-value">{stats.totalDiskUsage || '0 MB'}</div>
                                <div className="stat-label">Total Disk Usage</div>
                                <div className="stat-icon">💾</div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                            No stats available yet. Process your first video!
                        </div>
                    )}
                </div>

                {/* Features */}
                <div className="tool-info-section">
                    <h2>✨ Key Features</h2>
                    <div className="tool-info-features">
                        <div className="feature-item">
                            <span className="feature-icon">🎯</span>
                            <div>
                                <strong>AI Scene Detection</strong>
                                <p>Automatically finds the best moments from long videos using transcript analysis</p>
                            </div>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">👤</span>
                            <div>
                                <strong>Smart Face Cropping</strong>
                                <p>Detects faces and centers the 9:16 crop frame on the speaker</p>
                            </div>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">👥</span>
                            <div>
                                <strong>Multi-Speaker Split Screen</strong>
                                <p>Auto-detects interviews and creates split-screen layout showing both speakers</p>
                            </div>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">🔒</span>
                            <div>
                                <strong>Anti-Copyright Protection</strong>
                                <p>Subtle zoom/pan effects make each frame unique to avoid copyright detection</p>
                            </div>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">📝</span>
                            <div>
                                <strong>Hook Text Overlay</strong>
                                <p>First 15 seconds show a hook text at the top to grab viewers' attention</p>
                            </div>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">#️⃣</span>
                            <div>
                                <strong>Smart Hashtags</strong>
                                <p>Auto-generates 2 relevant hashtags per clip with entity detection</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tech Stack */}
                <div className="tool-info-section">
                    <h2>🔧 What You Need to Install</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
                        Make sure these are installed on your PC before running the tool:
                    </p>
                    <div className="tool-info-requirements">
                        <div className="req-item">
                            <div className="req-header">
                                <span className="req-icon">🟢</span>
                                <strong>Node.js</strong>
                                <span className="req-version">v18+</span>
                            </div>
                            <p>Runs the backend server. Download from <a href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org</a></p>
                        </div>
                        <div className="req-item">
                            <div className="req-header">
                                <span className="req-icon">🐍</span>
                                <strong>Python</strong>
                                <span className="req-version">3.9+</span>
                            </div>
                            <p>Runs the AI engine (transcription, face detection, scene analysis)</p>
                        </div>
                        <div className="req-item">
                            <div className="req-header">
                                <span className="req-icon">🎬</span>
                                <strong>FFmpeg</strong>
                                <span className="req-version">Latest</span>
                            </div>
                            <p>Video processing engine. Download from <a href="https://ffmpeg.org" target="_blank" rel="noreferrer">ffmpeg.org</a>. Must be in your PATH.</p>
                        </div>
                        <div className="req-item">
                            <div className="req-header">
                                <span className="req-icon">📦</span>
                                <strong>Python Packages</strong>
                                <span className="req-version">Auto Install</span>
                            </div>
                            <p>Run: <code>pip install -r engine/requirements.txt</code> (includes whisper, opencv, yt-dlp)</p>
                        </div>
                    </div>
                </div>

                {/* Built With */}
                <div className="tool-info-section">
                    <h2>🏗️ Built With</h2>
                    <div className="tool-info-tech-grid">
                        <div className="tech-chip"><span>⚛️</span> React</div>
                        <div className="tech-chip"><span>🟢</span> Node.js</div>
                        <div className="tech-chip"><span>🐍</span> Python</div>
                        <div className="tech-chip"><span>🎬</span> FFmpeg</div>
                        <div className="tech-chip"><span>🔌</span> Socket.IO</div>
                        <div className="tech-chip"><span>🗣️</span> Whisper AI</div>
                        <div className="tech-chip"><span>👁️</span> OpenCV</div>
                        <div className="tech-chip"><span>📥</span> yt-dlp</div>
                        <div className="tech-chip"><span>⚡</span> Vite</div>
                    </div>
                </div>

                {/* How to Run */}
                <div className="tool-info-section">
                    <h2>🚀 How to Run</h2>
                    <div className="tool-info-steps">
                        <div className="step-item">
                            <span className="step-num">1</span>
                            <div>
                                <strong>Install Dependencies</strong>
                                <code>cd backend && npm install</code>
                                <code>cd frontend && npm install</code>
                                <code>pip install -r engine/requirements.txt</code>
                            </div>
                        </div>
                        <div className="step-item">
                            <span className="step-num">2</span>
                            <div>
                                <strong>Start Backend Server</strong>
                                <code>cd backend && node server.js</code>
                            </div>
                        </div>
                        <div className="step-item">
                            <span className="step-num">3</span>
                            <div>
                                <strong>Start Frontend</strong>
                                <code>cd frontend && npm run dev</code>
                            </div>
                        </div>
                        <div className="step-item">
                            <span className="step-num">4</span>
                            <div>
                                <strong>Open Browser</strong>
                                <code>http://localhost:5173</code>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="tool-info-footer">
                    <p>Made with ❤️ — Free & Open Source — Your data never leaves your PC</p>
                </div>
            </div>
        </div>
    );
}
