import React, { useState } from 'react';
import ClipCard from './ClipCard';

export default function ClipGrid({ clips, videoId, onEditClip, onBulkDownload, hashtagMode }) {
    const [selectedClips, setSelectedClips] = useState(new Set());

    if (!clips || clips.length === 0) {
        return (
            <div className="clips-section glass-card">
                <div className="empty-state">
                    <div className="empty-state-icon">🎬</div>
                    <h3>No clips generated yet</h3>
                    <p>Submit a YouTube URL or upload a video to get started</p>
                </div>
            </div>
        );
    }

    const toggleSelect = (index) => {
        setSelectedClips(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedClips.size === clips.length) {
            setSelectedClips(new Set());
        } else {
            setSelectedClips(new Set(clips.map((_, i) => i)));
        }
    };

    const handleBulkDownload = () => {
        const indices = selectedClips.size > 0 
            ? Array.from(selectedClips) 
            : null; // null = download all
        onBulkDownload(indices);
    };

    const allSelected = selectedClips.size === clips.length;
    const someSelected = selectedClips.size > 0;

    // Count split-screen clips
    const splitCount = clips.filter(c => c.is_split_screen).length;

    return (
        <div className="clips-section">
            {/* Header */}
            <div className="clips-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>✂️</span> Generated Clips
                    </h2>
                    <span className="clips-count">{clips.length} clips</span>
                    {splitCount > 0 && (
                        <span className="clips-count" style={{ 
                            background: 'rgba(236, 72, 153, 0.12)',
                            color: '#ec4899',
                            border: '1px solid rgba(236, 72, 153, 0.2)',
                        }}>
                            👥 {splitCount} split-screen
                        </span>
                    )}
                </div>

                <div className="clips-header-actions">
                    <button 
                        className="btn btn-secondary btn-sm"
                        onClick={handleSelectAll}
                    >
                        {allSelected ? '☐ Deselect All' : '☑ Select All'}
                    </button>
                    
                    <button 
                        className="btn btn-success btn-sm"
                        onClick={handleBulkDownload}
                    >
                        📦 {someSelected 
                            ? `Download Selected (${selectedClips.size})` 
                            : 'Download All'
                        }
                    </button>
                </div>
            </div>

            {/* Clips Grid */}
            <div className="clips-grid">
                {clips.map((clip, index) => (
                    <ClipCard
                        key={index}
                        clip={clip}
                        videoId={videoId}
                        index={index}
                        isSelected={selectedClips.has(index)}
                        onSelect={toggleSelect}
                        onEdit={onEditClip}
                        onDownload={() => {}}
                        hashtagMode={hashtagMode}
                    />
                ))}
            </div>
        </div>
    );
}
