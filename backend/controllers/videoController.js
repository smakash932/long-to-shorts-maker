/**
 * Video Controller
 * Handles video upload, YouTube download, and video info retrieval.
 */

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { VIDEOS_DIR, UPLOADS_DIR, ensureDirs } = require('../utils/fileUtils');

class VideoController {
    constructor(pythonBridge) {
        this.bridge = pythonBridge;
        this.jobs = new Map(); // Track active jobs
        ensureDirs();
    }

    /**
     * POST /api/video/youtube
     * Start downloading a YouTube video.
     */
    async submitYouTube(req, res) {
        try {
            const { url, language, ratio, template, clipLength, clipCount, mode, hookPosition, subPosition } = req.body;
            
            if (!url) {
                return res.status(400).json({ error: 'YouTube URL is required' });
            }

            const videoId = uuidv4().split('-')[0] + Date.now().toString(36);
            
            // Store job info
            this.jobs.set(videoId, {
                id: videoId,
                type: 'youtube',
                url,
                status: 'processing',
                startedAt: new Date().toISOString(),
                settings: { language, ratio, template, clipLength, clipCount },
            });

            res.json({ 
                success: true, 
                videoId,
                message: 'Processing started! Track progress via Socket.IO.' 
            });

            // Parse clip duration settings
            let minDuration = 15, maxDuration = 90;
            if (clipLength) {
                const ranges = {
                    '<15': [5, 15],
                    '15-30': [15, 30],
                    '15-60': [15, 60],
                    '30-60': [30, 60],
                    '60-90': [60, 90],
                    '90-180': [90, 180],
                    '>180': [180, 600],
                };
                if (ranges[clipLength]) {
                    [minDuration, maxDuration] = ranges[clipLength];
                }
            }

            // Handle 'auto' clip count — 999 means generate as many as possible
            const resolvedClipCount = (clipCount === 'auto' || clipCount === 'Auto') ? 999 : (parseInt(clipCount) || 10);

            // Run the full pipeline in background
            try {
                await this.bridge.runPipeline({
                    url,
                    videoId,
                    language: language || null,
                    ratio: ratio || '9:16',
                    template: template || 'default',
                    minDuration,
                    maxDuration,
                    clipCount: resolvedClipCount,
                    mode: mode || 'classic',
                    hookPosition: hookPosition || 'upper',
                    subPosition: subPosition || 'bottom',
                });

                const job = this.jobs.get(videoId);
                if (job) {
                    job.status = 'completed';
                    job.completedAt = new Date().toISOString();
                }
            } catch (err) {
                console.error(`[VideoController] Pipeline failed for ${videoId}:`, err.message);
                const job = this.jobs.get(videoId);
                if (job) {
                    job.status = 'failed';
                    job.error = err.message;
                }
                // Emit error via Socket.IO
                if (this.bridge.io) {
                    this.bridge.io.emit('engine_event', {
                        jobId: videoId,
                        event: 'error',
                        step: 'pipeline',
                        message: err.message,
                    });
                }
            }

        } catch (error) {
            console.error('[VideoController] submitYouTube error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * POST /api/video/upload
     * Handle local video file upload.
     */
    async uploadVideo(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            const { language, ratio, template, clipLength, clipCount, mode, hookPosition, subPosition } = req.body;
            const videoId = uuidv4().split('-')[0] + Date.now().toString(36);
            
            // Move uploaded file to videos directory
            const ext = path.extname(req.file.originalname) || '.mp4';
            const videoPath = path.join(VIDEOS_DIR, `${videoId}${ext}`);
            fs.renameSync(req.file.path, videoPath);

            // Store job info
            this.jobs.set(videoId, {
                id: videoId,
                type: 'upload',
                filename: req.file.originalname,
                status: 'processing',
                startedAt: new Date().toISOString(),
                settings: { language, ratio, template, clipLength, clipCount },
            });

            res.json({ 
                success: true, 
                videoId,
                filename: req.file.originalname,
                message: 'Upload successful! Processing started.' 
            });

            // Parse clip duration
            let minDuration = 15, maxDuration = 90;
            if (clipLength) {
                const ranges = {
                    '<15': [5, 15],
                    '15-30': [15, 30],
                    '15-60': [15, 60],
                    '30-60': [30, 60],
                    '60-90': [60, 90],
                    '90-180': [90, 180],
                    '>180': [180, 600],
                };
                if (ranges[clipLength]) {
                    [minDuration, maxDuration] = ranges[clipLength];
                }
            }

            // Handle 'auto' clip count
            const resolvedClipCount = (clipCount === 'auto' || clipCount === 'Auto') ? 999 : (parseInt(clipCount) || 10);

            // Run pipeline
            try {
                await this.bridge.runPipeline({
                    videoPath,
                    videoId,
                    language: language || null,
                    ratio: ratio || '9:16',
                    template: template || 'default',
                    minDuration,
                    maxDuration,
                    clipCount: resolvedClipCount,
                    mode: mode || 'classic',
                    hookPosition: hookPosition || 'upper',
                    subPosition: subPosition || 'bottom',
                });

                const job = this.jobs.get(videoId);
                if (job) {
                    job.status = 'completed';
                    job.completedAt = new Date().toISOString();
                }
            } catch (err) {
                console.error(`[VideoController] Pipeline failed for ${videoId}:`, err.message);
                const job = this.jobs.get(videoId);
                if (job) {
                    job.status = 'failed';
                    job.error = err.message;
                }
                if (this.bridge.io) {
                    this.bridge.io.emit('engine_event', {
                        jobId: videoId,
                        event: 'error',
                        step: 'pipeline',
                        message: err.message,
                    });
                }
            }

        } catch (error) {
            console.error('[VideoController] uploadVideo error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * GET /api/video/info?url=...
     * Get YouTube video info without downloading.
     */
    async getVideoInfo(req, res) {
        try {
            const { url } = req.query;
            if (!url) {
                return res.status(400).json({ error: 'URL is required' });
            }

            const info = await this.bridge.getVideoInfo(url);
            res.json({ success: true, data: info });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get video info', details: error.message });
        }
    }

    /**
     * GET /api/video/:id/status
     * Get job status.
     */
    getJobStatus(req, res) {
        const { id } = req.params;
        const job = this.jobs.get(id);
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json({ success: true, data: job });
    }

    /**
     * POST /api/video/:id/cancel
     * Cancel a running job.
     */
    cancelJob(req, res) {
        const { id } = req.params;
        const cancelled = this.bridge.cancelJob(id);
        
        if (cancelled) {
            const job = this.jobs.get(id);
            if (job) job.status = 'cancelled';
            res.json({ success: true, message: 'Job cancelled' });
        } else {
            res.status(404).json({ error: 'No active job found with this ID' });
        }
    }

    /**
     * GET /api/videos
     * List all processed videos.
     */
    listVideos(req, res) {
        const jobs = Array.from(this.jobs.values()).sort((a, b) => 
            new Date(b.startedAt) - new Date(a.startedAt)
        );
        res.json({ success: true, data: jobs });
    }

    /**
     * POST /api/video/:id/clear-session
     * Clear all files related to a specific video from disk.
     * Deletes: clips folder, downloaded video, transcription JSON, audio WAV, clips JSON.
     */
    clearSession(req, res) {
        try {
            const { id: videoId } = req.params;
            const fs = require('fs');
            const path = require('path');
            const { VIDEOS_DIR, CLIPS_DIR } = require('../utils/fileUtils');

            let deletedFiles = 0;
            let freedBytes = 0;

            // 1. Delete clips folder for this video
            const clipDir = path.join(CLIPS_DIR, videoId);
            if (fs.existsSync(clipDir)) {
                const countAndDelete = (dir) => {
                    const items = fs.readdirSync(dir);
                    for (const item of items) {
                        const fullPath = path.join(dir, item);
                        try {
                            const stat = fs.statSync(fullPath);
                            if (stat.isDirectory()) {
                                countAndDelete(fullPath);
                                fs.rmdirSync(fullPath);
                            } else {
                                freedBytes += stat.size;
                                deletedFiles++;
                                fs.unlinkSync(fullPath);
                            }
                        } catch (e) {}
                    }
                };
                countAndDelete(clipDir);
                try { fs.rmdirSync(clipDir); } catch (e) {}
            }

            // 2. Delete all video-related files in the videos directory
            // Pattern: <videoId>.mp4, <videoId>_transcription.json, <videoId>_audio.wav, <videoId>_clips.json
            if (fs.existsSync(VIDEOS_DIR)) {
                const videoFiles = fs.readdirSync(VIDEOS_DIR);
                for (const file of videoFiles) {
                    // Match files that start with this videoId
                    if (file.startsWith(videoId)) {
                        const fullPath = path.join(VIDEOS_DIR, file);
                        try {
                            const stat = fs.statSync(fullPath);
                            freedBytes += stat.size;
                            deletedFiles++;
                            fs.unlinkSync(fullPath);
                        } catch (e) {}
                    }
                }
            }

            // Remove from in-memory jobs
            this.jobs.delete(videoId);

            const formatSize = (bytes) => {
                if (bytes === 0) return '0 MB';
                const mb = bytes / (1024 * 1024);
                if (mb > 1024) return (mb / 1024).toFixed(1) + ' GB';
                return mb.toFixed(1) + ' MB';
            };

            console.log(`[VideoController] Session cleared for ${videoId}: ${deletedFiles} files, ${formatSize(freedBytes)} freed`);

            res.json({
                success: true,
                videoId,
                deletedFiles,
                freedSpace: formatSize(freedBytes),
            });
        } catch (error) {
            console.error('[VideoController] clearSession error:', error);
            res.status(500).json({ error: 'Failed to clear session' });
        }
    }
}

module.exports = VideoController;
