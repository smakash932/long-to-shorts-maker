import React, { useState, useRef } from 'react';

export default function VideoInput({ onSubmitUrl, onSubmitBatch, onUploadFile, isProcessing, settings }) {
    const [url, setUrl] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploadFileName, setUploadFileName] = useState('');
    const [batchMode, setBatchMode] = useState(false);
    const fileInputRef = useRef(null);

    const handleSubmitUrl = (e) => {
        e.preventDefault();
        if (isProcessing) return;
        
        const text = url.trim();
        if (!text) return;
        
        // Check if multiple URLs (newline-separated)
        const urls = text.split('\n').map(u => u.trim()).filter(u => u.length > 5);
        
        if (urls.length > 1 && onSubmitBatch) {
            onSubmitBatch(urls);
        } else if (urls.length === 1) {
            onSubmitUrl(urls[0]);
        }
    };

    const urlCount = url.trim() ? url.trim().split('\n').filter(u => u.trim().length > 5).length : 0;

    const handleFileSelect = (file) => {
        if (!file || isProcessing) return;
        const validTypes = ['video/mp4', 'video/x-matroska', 'video/avi', 'video/quicktime', 'video/webm', 'video/x-flv'];
        const validExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v'];
        
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            alert(`File type "${ext}" not supported.\nSupported: ${validExts.join(', ')}`);
            return;
        }
        
        setUploadFileName(file.name);
        onUploadFile(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    return (
        <div className="video-input-section glass-card">
            <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>🎬</span> Add Your Video
                {/* Batch mode toggle */}
                <button
                    type="button"
                    onClick={() => setBatchMode(!batchMode)}
                    style={{
                        marginLeft: 'auto', fontSize: '0.75rem', padding: '4px 12px',
                        borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)',
                        background: batchMode ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                        color: batchMode ? '#fff' : 'var(--text-muted)',
                        cursor: 'pointer', transition: 'all 0.2s',
                    }}
                    disabled={isProcessing}
                >
                    {batchMode ? '📦 Batch Mode ON' : '📦 Batch Mode'}
                </button>
            </h2>

            {/* YouTube URL Input */}
            <form onSubmit={handleSubmitUrl}>
                <div className="url-input-group">
                    {batchMode ? (
                        /* Batch mode: textarea for multiple URLs */
                        <div className="url-input-wrapper" style={{ flex: 1 }}>
                            <span className="url-input-icon" style={{ alignSelf: 'flex-start', marginTop: '10px' }}>🔗</span>
                            <textarea
                                id="youtube-url-input"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder={"Paste multiple YouTube URLs, one per line:\nhttps://youtube.com/watch?v=abc123\nhttps://youtube.com/watch?v=def456\nhttps://youtube.com/watch?v=ghi789"}
                                disabled={isProcessing}
                                rows={4}
                                style={{
                                    width: '100%', resize: 'vertical', minHeight: '80px',
                                    background: 'transparent', border: 'none', outline: 'none',
                                    color: 'var(--text-primary)', fontSize: '0.9rem',
                                    fontFamily: 'inherit', lineHeight: 1.5,
                                    padding: '8px 4px',
                                }}
                            />
                            {urlCount > 1 && (
                                <span style={{
                                    position: 'absolute', top: '8px', right: '12px',
                                    background: 'var(--accent-primary)', color: '#fff',
                                    padding: '2px 10px', borderRadius: '10px', fontSize: '0.7rem',
                                    fontWeight: 700,
                                }}>
                                    {urlCount} videos
                                </span>
                            )}
                        </div>
                    ) : (
                        /* Single URL mode */
                        <div className="url-input-wrapper">
                            <span className="url-input-icon">🔗</span>
                            <input
                                id="youtube-url-input"
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="Paste YouTube video URL here... (e.g., https://youtube.com/watch?v=...)"
                                disabled={isProcessing}
                            />
                        </div>
                    )}
                    <button 
                        type="submit" 
                        className="btn btn-primary btn-lg"
                        disabled={!url.trim() || isProcessing}
                        id="submit-url-btn"
                    >
                        {isProcessing ? (
                            <>
                                <span className="spinner"></span>
                                Processing...
                            </>
                        ) : urlCount > 1 ? (
                            <>📦 Process {urlCount} Videos</>
                        ) : (
                            <>✨ Get AI Clips</>
                        )}
                    </button>
                </div>
            </form>

            {/* OR Divider */}
            <div className="divider-or">or upload from your PC</div>

            {/* File Upload Zone */}
            <div 
                className={`upload-zone ${isDragOver ? 'drag-over' : ''} ${uploadFileName ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                id="upload-zone"
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,.mp4,.mkv,.avi,.mov,.webm,.flv,.wmv,.m4v"
                    onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) handleFileSelect(file);
                    }}
                    disabled={isProcessing}
                    style={{ display: 'none' }}
                />
                
                {uploadFileName ? (
                    <>
                        <div className="upload-zone-icon">✅</div>
                        <h3>{uploadFileName}</h3>
                        <p>File selected — processing will start automatically</p>
                    </>
                ) : (
                    <>
                        <div className="upload-zone-icon">📁</div>
                        <h3>Drag & drop your video here</h3>
                        <p>Supports MP4, MKV, AVI, MOV, WebM (up to 5GB)</p>
                        <p style={{ marginTop: '8px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                            Click to browse files
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
