import React, { useState, useRef, useCallback } from 'react';
import { downloadSingleClip } from '../utils/api';

export default function ClipCard({ clip, videoId, index, isSelected, onSelect, onEdit, hashtagMode }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [showVideo, setShowVideo] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const videoRef = useRef(null);
    const hoverTimerRef = useRef(null);

    const duration = clip.duration || 0;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const score = clip.score || 0;
    const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    
    const streamUrl = `http://localhost:3847/api/clips/${videoId}/${index}/stream`;
    const thumbUrl = `http://localhost:3847/api/clips/${videoId}/${index}/thumbnail`;

    const title = clip.title || `Short Clip ${index + 1}`;
    const hashtags = clip.hashtags || ['#shorts', '#viral'];
    const isSplitScreen = clip.is_split_screen || false;

    // === Hover auto-preview (muted) ===
    const handleMouseEnter = useCallback(() => {
        setIsHovering(true);
        // Small delay before loading video to avoid unnecessary loads on quick mouse-overs
        hoverTimerRef.current = setTimeout(() => {
            setShowVideo(true);
            // Wait for video element to mount, then play muted
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.muted = true;
                    videoRef.current.currentTime = 0;
                    videoRef.current.play().catch(() => {});
                }
            }, 100);
        }, 400);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsHovering(false);
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        // Pause and reset to thumbnail
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.muted = true;
        }
        setShowVideo(false);
        setIsPlaying(false);
    }, []);

    // === Click to play with sound ===
    const handlePlayClick = () => {
        setShowVideo(true);
        setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.muted = false;
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => {});
                setIsPlaying(true);
            }
        }, 100);
    };

    const handleVideoClick = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
                setIsPlaying(false);
            } else {
                videoRef.current.muted = false;
                videoRef.current.play().catch(() => {});
                setIsPlaying(true);
            }
        }
    };

    // Download individual clip as properly named MP4
    const handleDownload = async (e) => {
        e.stopPropagation();
        if (downloading) return;
        
        setDownloading(true);
        try {
            await downloadSingleClip(videoId, index, title);
        } catch (err) {
            alert('Download failed: ' + err.message);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div 
            className={`clip-card ${isSelected ? 'selected' : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Selection Checkbox */}
            <div 
                className={`clip-card-select ${isSelected ? 'checked' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(index);
                }}
            >
                {isSelected && <span style={{ fontSize: '0.7rem' }}>✓</span>}
            </div>

            {/* Split Screen Badge */}
            {isSplitScreen && (
                <div className="clip-card-split-badge" title="This clip uses split-screen layout (two speakers)">
                    👥 Split
                </div>
            )}

            {/* Video / Thumbnail */}
            <div className="clip-card-video">
                {showVideo ? (
                    <>
                        <video
                            ref={videoRef}
                            src={streamUrl}
                            onClick={handleVideoClick}
                            onEnded={() => setIsPlaying(false)}
                            preload="metadata"
                            playsInline
                            muted
                            style={{ cursor: 'pointer' }}
                        />
                        {/* "Click for sound" overlay when hovering-muted */}
                        {isHovering && !isPlaying && (
                            <div className="clip-card-sound-hint" onClick={handlePlayClick}>
                                <span>🔊 Click for sound</span>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <img 
                            src={thumbUrl} 
                            alt={title}
                            onError={(e) => {
                                e.target.style.display = 'none';
                            }}
                        />
                        <div className="clip-card-play-overlay" onClick={handlePlayClick}>
                            <div className="clip-card-play-btn">▶</div>
                        </div>
                    </>
                )}
                
                <div className="clip-card-badge">{durationStr}</div>
            </div>

            {/* Body */}
            <div className="clip-card-body">
                {/* Title */}
                <h4 style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: 700, 
                    color: 'var(--text-primary)',
                    marginBottom: '6px',
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}>
                    {title}
                </h4>

                <div className="clip-card-meta">
                    <span className="clip-card-duration">Clip #{index + 1}</span>
                    <span className={`clip-card-score ${scoreClass}`}>
                        ⭐ {score.toFixed(0)}%
                    </span>
                </div>
                
                {/* Hashtags — only show in 'with_tags' mode */}
                {hashtagMode !== 'plain' && (
                <div style={{
                    display: 'flex',
                    gap: '6px',
                    flexWrap: 'wrap',
                    marginBottom: '10px',
                }}>
                    {hashtags.map((tag, i) => (
                        <span key={i} style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: 'rgba(139, 92, 246, 0.12)',
                            color: 'var(--accent-primary)',
                            border: '1px solid rgba(139, 92, 246, 0.2)',
                        }}>
                            {tag}
                        </span>
                    ))}
                </div>
                )}

                <div className="clip-card-actions">
                    <button 
                        className="btn btn-secondary btn-sm"
                        onClick={handleDownload}
                        disabled={downloading}
                    >
                        {downloading ? '⏳ Saving...' : '📥 Download'}
                    </button>
                    <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => onEdit(index)}
                    >
                        ✏️ Preview
                    </button>
                </div>
            </div>
        </div>
    );
}
