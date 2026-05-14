/**
 * Video API Routes
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { UPLOADS_DIR, ensureDirs } = require('../utils/fileUtils');

module.exports = function(videoController) {
    const router = express.Router();

    ensureDirs();

    // Multer config for file uploads
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, UPLOADS_DIR);
        },
        filename: (req, file, cb) => {
            const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname);
            cb(null, uniqueName);
        }
    });

    const upload = multer({
        storage,
        limits: {
            fileSize: 5 * 1024 * 1024 * 1024, // 5GB max
        },
        fileFilter: (req, file, cb) => {
            const allowedTypes = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v'];
            const ext = path.extname(file.originalname).toLowerCase();
            if (allowedTypes.includes(ext)) {
                cb(null, true);
            } else {
                cb(new Error(`File type ${ext} not supported. Allowed: ${allowedTypes.join(', ')}`));
            }
        }
    });

    // YouTube video submission
    router.post('/youtube', (req, res) => videoController.submitYouTube(req, res));

    // Local file upload
    router.post('/upload', upload.single('video'), (req, res) => videoController.uploadVideo(req, res));

    // Get YouTube video info
    router.get('/info', (req, res) => videoController.getVideoInfo(req, res));

    // Get job status
    router.get('/:id/status', (req, res) => videoController.getJobStatus(req, res));

    // Cancel a job
    router.post('/:id/cancel', (req, res) => videoController.cancelJob(req, res));

    // Clear session — delete all files for a specific video
    router.post('/:id/clear-session', (req, res) => videoController.clearSession(req, res));

    // List all processed videos
    router.get('/', (req, res) => videoController.listVideos(req, res));

    return router;
};
