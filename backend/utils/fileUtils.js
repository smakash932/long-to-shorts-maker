/**
 * File utility functions.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..', '..');
const STORAGE_DIR = path.join(BASE_DIR, 'storage');
const VIDEOS_DIR = path.join(STORAGE_DIR, 'videos');
const CLIPS_DIR = path.join(STORAGE_DIR, 'clips');
const THUMBNAILS_DIR = path.join(STORAGE_DIR, 'thumbnails');
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');

function ensureDirs() {
    [STORAGE_DIR, VIDEOS_DIR, CLIPS_DIR, THUMBNAILS_DIR, UPLOADS_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

function getVideoPath(videoId, ext = 'mp4') {
    return path.join(VIDEOS_DIR, `${videoId}.${ext}`);
}

function getClipDir(videoId) {
    const dir = path.join(CLIPS_DIR, videoId);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function getClipsData(videoId) {
    const clipDir = path.join(CLIPS_DIR, videoId);
    const clipsJsonPath = path.join(clipDir, 'clips.json');
    
    if (fs.existsSync(clipsJsonPath)) {
        try {
            return JSON.parse(fs.readFileSync(clipsJsonPath, 'utf-8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

function listVideoIds() {
    ensureDirs();
    const files = fs.readdirSync(CLIPS_DIR);
    return files.filter(f => {
        const fullPath = path.join(CLIPS_DIR, f);
        return fs.statSync(fullPath).isDirectory();
    });
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
    BASE_DIR, STORAGE_DIR, VIDEOS_DIR, CLIPS_DIR, THUMBNAILS_DIR, UPLOADS_DIR,
    ensureDirs, getVideoPath, getClipDir, getClipsData, listVideoIds, formatBytes
};
