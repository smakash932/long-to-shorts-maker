/**
 * Clip API Routes
 */

const express = require('express');

module.exports = function(clipController) {
    const router = express.Router();

    // Get all clips for a video
    router.get('/:videoId', (req, res) => clipController.getClips(req, res));

    // Stream a clip
    router.get('/:videoId/:index/stream', (req, res) => clipController.streamClip(req, res));

    // Get clip thumbnail
    router.get('/:videoId/:index/thumbnail', (req, res) => clipController.getThumbnail(req, res));

    // Download single clip
    router.get('/:videoId/:index/download', (req, res) => clipController.downloadClip(req, res));

    // Bulk download clips as ZIP — supports both GET and POST
    router.get('/:videoId/bulk-download', (req, res) => clipController.bulkDownload(req, res));
    router.post('/:videoId/bulk-download', (req, res) => clipController.bulkDownload(req, res));

    // Delete all clips for a video
    router.delete('/:videoId', (req, res) => clipController.deleteClips(req, res));

    return router;
};
