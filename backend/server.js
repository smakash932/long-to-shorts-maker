/**
 * Long to Shorts Maker - Backend Server
 * Express + Socket.IO server that bridges the React frontend 
 * with the Python AI engine.
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Import modules
const PythonBridge = require('./services/pythonBridge');
const VideoController = require('./controllers/videoController');
const ClipController = require('./controllers/clipController');
const videoRoutes = require('./routes/videoRoutes');
const clipRoutes = require('./routes/clipRoutes');
const { ensureDirs, CLIPS_DIR, THUMBNAILS_DIR } = require('./utils/fileUtils');

const PORT = process.env.PORT || 3847;
const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5187', 'http://localhost:3000', 'http://127.0.0.1:5187'],
        methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e8, // 100MB
});

// Middleware
app.use(cors({
    origin: ['http://localhost:5187', 'http://localhost:3000', 'http://127.0.0.1:5187'],
    exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for clips and thumbnails
app.use('/storage/clips', express.static(CLIPS_DIR));
app.use('/storage/thumbnails', express.static(THUMBNAILS_DIR));

// Ensure directories exist
ensureDirs();

// Initialize services
const pythonBridge = new PythonBridge(io);
const videoController = new VideoController(pythonBridge);
const clipController = new ClipController();

// API Routes
app.use('/api/video', videoRoutes(videoController));
app.use('/api/clips', clipRoutes(clipController));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        server: 'Long to Shorts Maker',
        version: '1.0.0',
        uptime: process.uptime(),
    });
});

// Get subtitle templates
app.get('/api/templates', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 'default', name: 'Default', description: 'Clean white text with dark outline' },
            { id: 'modern', name: 'Modern', description: 'Bold text with thick outline' },
            { id: 'bouncy', name: 'Bouncy', description: 'Impact font with colored outline' },
            { id: 'mrbeast', name: 'Mr.Beast', description: 'Large Impact font, heavy outline' },
            { id: 'business', name: 'Business', description: 'Clean professional style' },
            { id: 'karaoke', name: 'Karaoke', description: 'Word-by-word highlight effect' },
        ]
    });
});

// Lifetime stats
app.get('/api/stats', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');

        let totalClips = 0;
        let totalVideos = 0;
        let splitScreenClips = 0;
        let longestDuration = 0;
        let shortestDuration = Infinity;
        let totalBytes = 0;

        // Scan clips directory
        if (fs.existsSync(CLIPS_DIR)) {
            const videoDirs = fs.readdirSync(CLIPS_DIR).filter(f => {
                const fullPath = path.join(CLIPS_DIR, f);
                return fs.statSync(fullPath).isDirectory();
            });

            totalVideos = videoDirs.length;

            for (const vdir of videoDirs) {
                const clipDir = path.join(CLIPS_DIR, vdir);
                const clipsJsonPath = path.join(clipDir, 'clips.json');

                // Count clip files
                const mp4Files = fs.readdirSync(clipDir).filter(f => f.endsWith('.mp4'));
                totalClips += mp4Files.length;

                // Calculate disk usage
                for (const file of fs.readdirSync(clipDir)) {
                    try {
                        const stat = fs.statSync(path.join(clipDir, file));
                        totalBytes += stat.size;
                    } catch (e) {}
                }

                // Read clips.json for detailed stats
                if (fs.existsSync(clipsJsonPath)) {
                    try {
                        const clips = JSON.parse(fs.readFileSync(clipsJsonPath, 'utf-8'));
                        for (const clip of clips) {
                            if (clip.is_split_screen) splitScreenClips++;
                            const dur = clip.duration || 0;
                            if (dur > longestDuration) longestDuration = dur;
                            if (dur > 0 && dur < shortestDuration) shortestDuration = dur;
                        }
                    } catch (e) {}
                }
            }
        }

        // Format durations
        const formatDur = (s) => {
            if (!s || s === Infinity) return '0:00';
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return `${m}:${sec.toString().padStart(2, '0')}`;
        };

        // Format bytes
        const formatSize = (bytes) => {
            if (bytes === 0) return '0 MB';
            const mb = bytes / (1024 * 1024);
            if (mb > 1024) return (mb / 1024).toFixed(1) + ' GB';
            return mb.toFixed(1) + ' MB';
        };

        res.json({
            totalClips,
            totalVideos,
            splitScreenClips,
            longestVideo: formatDur(longestDuration),
            shortestVideo: formatDur(shortestDuration === Infinity ? 0 : shortestDuration),
            totalDiskUsage: formatSize(totalBytes),
        });
    } catch (error) {
        console.error('[Server] Stats error:', error);
        res.json({
            totalClips: 0,
            totalVideos: 0,
            splitScreenClips: 0,
            longestVideo: '0:00',
            shortestVideo: '0:00',
            totalDiskUsage: '0 MB',
        });
    }
});

// Full cleanup — delete all storage
app.post('/api/cleanup', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const { VIDEOS_DIR, UPLOADS_DIR, STORAGE_DIR } = require('./utils/fileUtils');

        let freedBytes = 0;
        let deletedFiles = 0;

        // Helper: recursively calculate size and delete
        const cleanDir = (dir) => {
            if (!fs.existsSync(dir)) return;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        cleanDir(fullPath);
                        fs.rmdirSync(fullPath);
                    } else {
                        freedBytes += stat.size;
                        deletedFiles++;
                        fs.unlinkSync(fullPath);
                    }
                } catch (e) {
                    console.error(`[Cleanup] Failed to delete ${fullPath}:`, e.message);
                }
            }
        };

        // Clean all storage directories
        cleanDir(CLIPS_DIR);
        cleanDir(VIDEOS_DIR);
        cleanDir(UPLOADS_DIR);

        // Also clean any temp/cache in storage root
        const tempDirs = ['temp', 'cache'];
        for (const td of tempDirs) {
            const tdPath = path.join(STORAGE_DIR, td);
            if (fs.existsSync(tdPath)) {
                cleanDir(tdPath);
            }
        }

        // Recreate empty dirs
        const { ensureDirs } = require('./utils/fileUtils');
        ensureDirs();

        // Format freed space
        const formatSize = (bytes) => {
            if (bytes === 0) return '0 MB';
            const mb = bytes / (1024 * 1024);
            if (mb > 1024) return (mb / 1024).toFixed(1) + ' GB';
            return mb.toFixed(1) + ' MB';
        };

        console.log(`[Cleanup] Deleted ${deletedFiles} files, freed ${formatSize(freedBytes)}`);

        res.json({
            success: true,
            freedSpace: formatSize(freedBytes),
            deletedFiles,
        });
    } catch (error) {
        console.error('[Cleanup] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Join a job room for targeted updates
    socket.on('join_job', (jobId) => {
        socket.join(jobId);
        console.log(`[Socket.IO] Client ${socket.id} joined job ${jobId}`);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Server] Error:', err.message);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 5GB.' });
    }
    
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
httpServer.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║     Long to Shorts Maker - Backend Server    ║
║     Running on http://localhost:${PORT}          ║
╚══════════════════════════════════════════════╝
    `);
});

module.exports = { app, httpServer, io };
