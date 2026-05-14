import React, { useState, useEffect, useRef } from 'react';

const STEPS = [
    { key: 'download',   icon: '📥', short: 'Download' },
    { key: 'transcribe', icon: '🎙️', short: 'Transcribe' },
    { key: 'detect',     icon: '🔍', short: 'Find Parts' },
    { key: 'crop',       icon: '📐', short: 'Crop' },
    { key: 'generate',   icon: '🎬', short: 'Generate' },
    { key: 'finalize',   icon: '✅', short: 'Done' },
];

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export default function ProcessingStatus({ status, onCancel }) {
    const [elapsedTime, setElapsedTime] = useState(0);
    const startTimeRef = useRef(null);
    const timerRef = useRef(null);

    const isActive = status?.active;
    const steps = status?.steps || {};
    const error = status?.error;

    useEffect(() => {
        if (isActive && !startTimeRef.current) {
            startTimeRef.current = Date.now();
            timerRef.current = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);
        }
        const allDone = STEPS.every(s => steps[s.key]?.progress === 100);
        if (allDone || !isActive) {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (!isActive) {
                startTimeRef.current = null;
                if (timerRef.current) clearInterval(timerRef.current);
            }
        };
    }, [isActive, steps]);

    useEffect(() => {
        if (isActive && Object.keys(steps).length <= 1 && steps.download?.progress === 0) {
            startTimeRef.current = Date.now();
            setElapsedTime(0);
        }
    }, [isActive]);

    const calculateOverallProgress = () => {
        let completedSteps = 0;
        let currentProgress = 0;
        for (const { key } of STEPS) {
            if (steps[key]?.progress === 100) {
                completedSteps++;
            } else if (steps[key]?.progress > 0) {
                currentProgress = steps[key].progress;
                break;
            } else {
                break;
            }
        }
        return ((completedSteps + currentProgress / 100) / STEPS.length) * 100;
    };

    const overallProgress = calculateOverallProgress();

    if (!isActive && Object.keys(steps).length === 0) return null;

    // Find current active step message
    let activeMsg = '';
    for (const { key } of STEPS) {
        const s = steps[key];
        if (s && s.progress > 0 && s.progress < 100 && s.message) {
            activeMsg = s.message;
            break;
        }
    }

    return (
        <div className="processing-pipeline glass-card" style={{ padding: '10px 16px', marginBottom: '16px' }}>
            {/* Top row: title + timer + progress */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.9rem' }}>⚡</span>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Processing</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>⏱ {formatTime(elapsedTime)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                        {Math.round(overallProgress)}%
                    </span>
                    {onCancel && (
                        <button className="btn btn-secondary btn-sm" onClick={onCancel}
                            style={{ fontSize: '0.65rem', padding: '3px 8px' }}>✕</button>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    padding: '6px 10px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: '#f87171',
                    marginBottom: '8px',
                }}>⚠️ {error}</div>
            )}

            {/* Progress bar */}
            <div style={{
                height: '3px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '3px',
                overflow: 'hidden',
                marginBottom: '8px',
            }}>
                <div style={{
                    height: '100%',
                    width: `${overallProgress}%`,
                    background: 'var(--accent-gradient)',
                    borderRadius: '3px',
                    transition: 'width 0.5s ease',
                }} />
            </div>

            {/* Horizontal pipeline: 1 → 2 → 3 → 4 → 5 → 6 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '2px',
            }}>
                {STEPS.map(({ key, icon, short }, i) => {
                    const step = steps[key];
                    let state = 'waiting';
                    if (step) {
                        if (step.error) state = 'error';
                        else if (step.progress === 100) state = 'done';
                        else if (step.progress > 0) state = 'active';
                        else state = 'active';
                    }

                    const isDone = state === 'done';
                    const isRunning = state === 'active';
                    const isErr = state === 'error';

                    return (
                        <React.Fragment key={key}>
                            {/* Step node */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '2px',
                                flex: '0 0 auto',
                                opacity: state === 'waiting' ? 0.35 : 1,
                                transition: 'opacity 0.3s',
                            }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    background: isDone ? 'var(--success)' 
                                        : isRunning ? 'var(--accent-primary)' 
                                        : isErr ? 'var(--error)'
                                        : 'rgba(255,255,255,0.06)',
                                    color: (isDone || isRunning || isErr) ? '#fff' : 'var(--text-muted)',
                                    border: isRunning ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                    boxShadow: isRunning ? '0 0 8px rgba(139,92,246,0.4)' : 'none',
                                    animation: isRunning ? 'pulse-ring 2s infinite' : 'none',
                                }}>
                                    {isDone ? '✓' : isErr ? '✕' : icon}
                                </div>
                                <span style={{
                                    fontSize: '0.55rem',
                                    fontWeight: 600,
                                    color: isDone ? 'var(--success)' 
                                        : isRunning ? 'var(--accent-primary)'
                                        : 'var(--text-muted)',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                }}>{short}</span>
                            </div>
                            {/* Arrow connector */}
                            {i < STEPS.length - 1 && (
                                <div style={{
                                    flex: '1',
                                    height: '2px',
                                    background: isDone ? 'var(--success)' : 'rgba(255,255,255,0.08)',
                                    borderRadius: '1px',
                                    minWidth: '12px',
                                    transition: 'background 0.3s',
                                    marginBottom: '14px',
                                }} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Active step message — compact single line */}
            {activeMsg && (
                <div style={{
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                    marginTop: '4px',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {activeMsg}
                </div>
            )}
        </div>
    );
}
