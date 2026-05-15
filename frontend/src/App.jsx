import React, { useState, useCallback, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { submitYouTubeUrl, uploadVideoFile, getClips, bulkDownloadClips, cancelJob, clearSession } from './utils/api';
import VideoInput from './components/VideoInput';
import ClipSettings from './components/ClipSettings';
import ProcessingStatus from './components/ProcessingStatus';
import ClipGrid from './components/ClipGrid';
import ClipEditor from './components/ClipEditor';
import ToolInfo from './components/ToolInfo';

const API_BASE = 'http://localhost:3847/api';

export default function App() {
    // State — restore from localStorage where possible
    const [settings, setSettings] = useState(() => {
        const defaults = {
            ratio: '9:16',
            clipLength: '15-60',
            template: 'default',
            language: '',
            clipCount: 10,
            hashtagMode: 'with_tags',
            mode: 'classic',
            hookPosition: 'upper',
            subPosition: 'bottom',
            anticopy: 'medium',
            quality: 'balanced',
            subtitles: true,
            useGpu: true,   // GPU Accelerate toggle. true = use NVIDIA GPU if present;
                            // false = force CPU mode (for PCs without an NVIDIA GPU)
        };
        try {
            const saved = localStorage.getItem('shorts_settings');
            if (saved) return { ...defaults, ...JSON.parse(saved) };
        } catch (e) {}
        return defaults;
    });
    
    const [processingStatus, setProcessingStatus] = useState({
        active: false,
        currentStep: '',
        steps: {},
        error: null,
    });
    
    const [currentVideoId, setCurrentVideoId] = useState(() => {
        return localStorage.getItem('shorts_videoId') || null;
    });
    const [clips, setClips] = useState([]);
    const [editingClipIndex, setEditingClipIndex] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [serverConnected, setServerConnected] = useState(false);
    const [showToolInfo, setShowToolInfo] = useState(false);
    const [showCleanup, setShowCleanup] = useState(false);
    const [cleanupStatus, setCleanupStatus] = useState(null);
    
    // Batch queue state
    const [batchQueue, setBatchQueue] = useState([]);  // [{url, status: 'pending'|'processing'|'done'|'error'}]
    const [batchResults, setBatchResults] = useState([]); // accumulated clips from all videos
    const batchQueueRef = React.useRef([]);
    // Keep ref in sync
    React.useEffect(() => { batchQueueRef.current = batchQueue; }, [batchQueue]);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('shorts_settings', JSON.stringify(settings));
    }, [settings]);

    // Save videoId to localStorage whenever it changes
    useEffect(() => {
        if (currentVideoId) {
            localStorage.setItem('shorts_videoId', currentVideoId);
        }
    }, [currentVideoId]);

    // On mount: restore clips from last session
    useEffect(() => {
        const savedVideoId = localStorage.getItem('shorts_videoId');
        if (savedVideoId) {
            console.log('[App] Restoring clips from last session:', savedVideoId);
            fetchClips(savedVideoId);
        }
    }, []);

    // Socket.IO connection
    const { isConnected, joinJob, onEngineEvent } = useSocket();

    useEffect(() => {
        setServerConnected(isConnected);
    }, [isConnected]);

    // Handle engine events from Socket.IO
    useEffect(() => {
        onEngineEvent((event) => {
            console.log('[App] Engine event:', event);

            if (event.event === 'progress') {
                setProcessingStatus(prev => ({
                    ...prev,
                    active: true,
                    currentStep: event.step,
                    steps: {
                        ...prev.steps,
                        [event.step]: {
                            progress: event.progress,
                            message: event.message,
                        }
                    }
                }));
            }

            if (event.event === 'complete') {
                setProcessingStatus(prev => ({
                    ...prev,
                    steps: {
                        ...prev.steps,
                        [event.step]: {
                            progress: 100,
                            message: 'Complete!',
                        }
                    }
                }));

                // If pipeline complete, fetch clips
                if (event.step === 'pipeline' || event.step === 'generate') {
                    const videoId = event.data?.video_id || currentVideoId;
                    if (videoId) {
                        fetchClips(videoId);
                    }
                    
                    // Mark finalize as complete
                    setProcessingStatus(prev => ({
                        ...prev,
                        steps: {
                            ...prev.steps,
                            finalize: { progress: 100, message: 'All done!' }
                        }
                    }));
                    
                    setIsProcessing(false);
                    
                    // ★ Batch queue: advance to next video
                    const currentQueue = batchQueueRef.current;
                    if (currentQueue.length > 0) {
                        // Mark current as done
                        const updated = currentQueue.map(item => 
                            item.status === 'processing' ? { ...item, status: 'done' } : item
                        );
                        const nextIdx = updated.findIndex(item => item.status === 'pending');
                        if (nextIdx >= 0) {
                            updated[nextIdx].status = 'processing';
                            setBatchQueue(updated);
                            // Process next URL after a short delay
                            setTimeout(() => {
                                handleSubmitUrl(updated[nextIdx].url);
                            }, 2000);
                        } else {
                            setBatchQueue(updated);
                        }
                    }
                }
            }

            if (event.event === 'error') {
                setProcessingStatus(prev => ({
                    ...prev,
                    error: event.message,
                    steps: {
                        ...prev.steps,
                        [event.step]: {
                            progress: 0,
                            message: event.message,
                            error: true,
                        }
                    }
                }));
                setIsProcessing(false);
                
                // ★ Batch queue: mark as error and advance to next
                const currentQueue = batchQueueRef.current;
                if (currentQueue.length > 0) {
                    const updated = currentQueue.map(item => 
                        item.status === 'processing' ? { ...item, status: 'error' } : item
                    );
                    const nextIdx = updated.findIndex(item => item.status === 'pending');
                    if (nextIdx >= 0) {
                        updated[nextIdx].status = 'processing';
                        setBatchQueue(updated);
                        setTimeout(() => {
                            handleSubmitUrl(updated[nextIdx].url);
                        }, 2000);
                    } else {
                        setBatchQueue(updated);
                    }
                }
            }
        });
    }, [onEngineEvent, currentVideoId]);

    // Fetch clips for a video
    const fetchClips = async (videoId) => {
        try {
            const result = await getClips(videoId);
            if (result.success && result.data) {
                setClips(result.data);
                setCurrentVideoId(videoId);
            }
        } catch (err) {
            console.error('Failed to fetch clips:', err);
            // Don't retry forever on restore — just clear
            localStorage.removeItem('shorts_videoId');
        }
    };

    // Submit YouTube URL
    const handleSubmitUrl = useCallback(async (url) => {
        try {
            // Cancel any existing job first
            if (currentVideoId && isProcessing) {
                try { await cancelJob(currentVideoId); } catch (e) {}
            }

            setIsProcessing(true);
            setClips([]);
            setProcessingStatus({
                active: true,
                currentStep: 'download',
                steps: {
                    download: { progress: 0, message: 'Starting...' }
                },
                error: null,
            });

            const result = await submitYouTubeUrl(url, settings);
            
            if (result.success) {
                setCurrentVideoId(result.videoId);
                joinJob(result.videoId);
            } else {
                throw new Error(result.error || 'Failed to submit URL');
            }
        } catch (err) {
            setProcessingStatus(prev => ({
                ...prev,
                error: err.message,
            }));
            setIsProcessing(false);
        }
    }, [settings, joinJob, currentVideoId, isProcessing]);

    // Submit batch of YouTube URLs
    const handleSubmitBatch = useCallback(async (urls) => {
        if (!urls || urls.length === 0) return;
        
        // Create queue items
        const queue = urls.map((url, i) => ({
            url,
            status: i === 0 ? 'processing' : 'pending',
            index: i,
        }));
        
        setBatchQueue(queue);
        setBatchResults([]);
        
        // Start processing first URL
        handleSubmitUrl(urls[0]);
    }, [handleSubmitUrl]);

    // Upload local file
    const handleUploadFile = useCallback(async (file) => {
        try {
            // Cancel any existing job first
            if (currentVideoId && isProcessing) {
                try { await cancelJob(currentVideoId); } catch (e) {}
            }

            setIsProcessing(true);
            setClips([]);
            setProcessingStatus({
                active: true,
                currentStep: 'download',
                steps: {
                    download: { progress: 50, message: `Uploading ${file.name}...` }
                },
                error: null,
            });

            const result = await uploadVideoFile(file, settings);
            
            if (result.success) {
                setCurrentVideoId(result.videoId);
                joinJob(result.videoId);
                
                // Mark upload as done
                setProcessingStatus(prev => ({
                    ...prev,
                    steps: {
                        ...prev.steps,
                        download: { progress: 100, message: 'Upload successful' }
                    }
                }));
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (err) {
            setProcessingStatus(prev => ({
                ...prev,
                error: err.message,
            }));
            setIsProcessing(false);
        }
    }, [settings, joinJob, currentVideoId, isProcessing]);

    // Cancel processing — actually kills the Python process
    const handleCancel = useCallback(async () => {
        if (currentVideoId) {
            try {
                await cancelJob(currentVideoId);
                console.log('[App] Job cancelled:', currentVideoId);
            } catch (e) {
                console.log('[App] Cancel request sent');
            }
        }
        setIsProcessing(false);
        setProcessingStatus({
            active: false,
            currentStep: '',
            steps: {},
            error: null,
        });
    }, [currentVideoId]);

    // Bulk download
    const handleBulkDownload = useCallback(async (clipIndices) => {
        if (!currentVideoId) return;
        try {
            await bulkDownloadClips(currentVideoId, clipIndices, settings.hashtagMode);
        } catch (err) {
            alert('Download failed: ' + err.message);
        }
    }, [currentVideoId, settings.hashtagMode]);

    // Edit clip
    const handleEditClip = useCallback((index) => {
        setEditingClipIndex(index);
    }, []);

    // Clear current session — delete all files for this video from disk + clear UI
    const handleClearSession = useCallback(async () => {
        // Delete all files for this video from disk (clips, video, transcription, cache)
        if (currentVideoId) {
            try {
                const result = await clearSession(currentVideoId);
                console.log('[App] Session cleared:', result);
            } catch (e) {
                console.log('[App] Clear session request sent (server may be offline)');
            }
        }
        setClips([]);
        setCurrentVideoId(null);
        setProcessingStatus({ active: false, currentStep: '', steps: {}, error: null });
        setIsProcessing(false);
        localStorage.removeItem('shorts_videoId');
    }, [currentVideoId]);

    // Full cleanup — delete everything from disk
    const handleFullCleanup = useCallback(async () => {
        if (!window.confirm('⚠️ This will DELETE all clips, videos, and cache from disk. Are you sure?')) {
            return;
        }
        setCleanupStatus('cleaning');
        try {
            const res = await fetch(`${API_BASE}/cleanup`, { method: 'POST' });
            const data = await res.json();
            setCleanupStatus('done');
            handleClearSession();
            setTimeout(() => {
                setCleanupStatus(null);
                setShowCleanup(false);
            }, 2000);
        } catch (err) {
            setCleanupStatus('error');
            setTimeout(() => setCleanupStatus(null), 3000);
        }
    }, [handleClearSession]);

    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div className="app-logo">
                    <div className="app-logo-icon">✂️</div>
                    <div>
                        <h1>Shorts Maker</h1>
                    </div>
                    <span className="app-logo-badge">Free & Local</span>
                    <button 
                        className="tool-info-btn"
                        onClick={() => setShowToolInfo(true)}
                        title="Tool Info & Stats"
                    >
                        📊 Tool Info
                    </button>
                    <button 
                        className="tool-info-btn cleanup-btn"
                        onClick={() => setShowCleanup(true)}
                        title="Clean storage & cache"
                    >
                        🧹 Clean Up
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: serverConnected ? 'var(--success)' : 'var(--error)',
                        boxShadow: serverConnected 
                            ? '0 0 8px rgba(16, 185, 129, 0.5)' 
                            : '0 0 8px rgba(239, 68, 68, 0.5)',
                    }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {serverConnected ? 'Server Connected' : 'Server Offline'}
                    </span>
                </div>
            </header>

            {/* Server Offline Warning */}
            {!serverConnected && (
                <div style={{
                    padding: '16px 20px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--error)',
                    marginBottom: '20px',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                }}>
                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                    <div>
                        <strong>Server is not running!</strong> Start the backend with: <code style={{ 
                            background: 'rgba(0,0,0,0.3)', 
                            padding: '2px 8px', 
                            borderRadius: '4px',
                            fontSize: '0.85rem'
                        }}>cd backend && node server.js</code>
                    </div>
                </div>
            )}

            {/* Settings */}
            <ClipSettings 
                settings={settings} 
                onSettingsChange={setSettings}
                disabled={isProcessing}
            />

            {/* Video Input */}
            <VideoInput
                onSubmitUrl={handleSubmitUrl}
                onSubmitBatch={handleSubmitBatch}
                onUploadFile={handleUploadFile}
                isProcessing={isProcessing}
                settings={settings}
            />

            {/* Processing Status */}
            <ProcessingStatus 
                status={processingStatus}
                onCancel={isProcessing ? handleCancel : null}
            />

            {/* Batch Queue Progress */}
            {batchQueue.length > 1 && (
                <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '1.1rem' }}>📦</span>
                        <strong>Batch Queue</strong>
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {batchQueue.filter(q => q.status === 'done').length}/{batchQueue.length} completed
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {batchQueue.map((item, idx) => (
                            <div key={idx} style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem',
                                background: item.status === 'processing' ? 'rgba(99, 102, 241, 0.15)'
                                    : item.status === 'done' ? 'rgba(16, 185, 129, 0.1)'
                                    : 'rgba(255,255,255,0.03)',
                                border: item.status === 'processing' ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                            }}>
                                <span style={{ fontSize: '0.9rem' }}>
                                    {item.status === 'done' ? '✅' : item.status === 'processing' ? '⏳' : item.status === 'error' ? '❌' : '⏸️'}
                                </span>
                                <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.url.length > 60 ? item.url.substring(0, 60) + '...' : item.url}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    {item.status === 'processing' ? 'In Progress...' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Generated Clips */}
            {clips.length > 0 && (
                <>
                    {/* Session controls above clips */}
                    <div className="session-bar">
                        <span className="session-info">
                            🎬 {clips.length} clips generated
                        </span>
                        <button 
                            className="session-clear-btn"
                            onClick={handleClearSession}
                            title="Clear clips and delete all cached files from disk"
                        >
                            🗑️ Clear & Clean Files
                        </button>
                    </div>
                    <ClipGrid
                        clips={clips}
                        videoId={currentVideoId}
                        onEditClip={handleEditClip}
                        onBulkDownload={handleBulkDownload}
                        hashtagMode={settings.hashtagMode}
                    />
                </>
            )}

            {/* Clip Editor Modal */}
            {editingClipIndex !== null && clips[editingClipIndex] && (
                <ClipEditor
                    clip={clips[editingClipIndex]}
                    videoId={currentVideoId}
                    clipIndex={editingClipIndex}
                    onClose={() => setEditingClipIndex(null)}
                />
            )}

            {/* Tool Info Modal */}
            {showToolInfo && (
                <ToolInfo onClose={() => setShowToolInfo(false)} />
            )}

            {/* Cleanup Modal */}
            {showCleanup && (
                <div className="tool-info-overlay" onClick={(e) => {
                    if (e.target === e.currentTarget) setShowCleanup(false);
                }}>
                    <div className="cleanup-modal">
                        <button className="tool-info-close" onClick={() => setShowCleanup(false)}>✕</button>
                        <h2 style={{ marginBottom: '6px' }}>🧹 Storage Cleanup</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.85rem' }}>
                            Free up disk space by removing generated clips, cached videos, and temp files.
                        </p>

                        <div className="cleanup-options">
                            <button 
                                className="cleanup-option-btn cleanup-soft"
                                onClick={() => { handleClearSession(); setShowCleanup(false); }}
                            >
                                <span className="cleanup-icon">🔄</span>
                                <div>
                                    <strong>Clear Current Session</strong>
                                    <p>Remove clips from view only. Files stay on disk. Use for starting fresh.</p>
                                </div>
                            </button>

                            <button 
                                className="cleanup-option-btn cleanup-hard"
                                onClick={handleFullCleanup}
                                disabled={cleanupStatus === 'cleaning'}
                            >
                                <span className="cleanup-icon">🗑️</span>
                                <div>
                                    <strong>Delete All Storage</strong>
                                    <p>Remove ALL clips, videos, and cache files from disk. Frees maximum space.</p>
                                    {cleanupStatus === 'cleaning' && (
                                        <span style={{ color: 'var(--accent-primary)' }}>⏳ Cleaning...</span>
                                    )}
                                    {cleanupStatus === 'done' && (
                                        <span style={{ color: 'var(--success)' }}>✅ All cleaned!</span>
                                    )}
                                    {cleanupStatus === 'error' && (
                                        <span style={{ color: 'var(--error)' }}>❌ Failed — try restarting server</span>
                                    )}
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
