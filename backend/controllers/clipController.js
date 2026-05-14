/**
 * Clip Controller
 * Handles clip retrieval, download, and bulk download with auto titles + hashtags.
 * 
 * Filename format: Clean title with spaces (no numbers, no underscores)
 * Hashtags: Exactly 2 relevant hashtags per clip, entity-aware
 * Hashtag toggle: Supports 'with_tags' and 'plain' modes
 */

const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { CLIPS_DIR, getClipsData, getClipDir } = require('../utils/fileUtils');

class ClipController {
    constructor() {
        if (!fs.existsSync(CLIPS_DIR)) {
            fs.mkdirSync(CLIPS_DIR, { recursive: true });
        }
    }

    /**
     * Auto-generate a clean title from clip transcript text.
     * No numbering prefix. Clean, readable format.
     */
    _generateTitle(clip, index) {
        const text = (clip.text || '').trim();
        if (!text) return `Short Clip ${index + 1}`;
        
        // Take first 8-10 words as title
        const words = text.split(/\s+/).slice(0, 10);
        let title = words.join(' ');
        
        // Clean up punctuation at the end
        title = title.replace(/[.,!?;:]+$/, '').trim();
        
        // Capitalize first letter
        title = title.charAt(0).toUpperCase() + title.slice(1);
        
        // Truncate if too long
        if (title.length > 80) {
            title = title.substring(0, 77) + '...';
        }
        
        return title || `Short Clip ${index + 1}`;
    }

    /**
     * Auto-generate exactly 2 relevant hashtags from clip text.
     * Prioritizes named entities (people, places, topics).
     * 
     * Rules:
     *   - If "Trump" appears → #trump MUST be included
     *   - Named entities get priority over frequency-based words
     *   - Always exactly 2 hashtags
     */
    _generateHashtags(clip) {
        const text = (clip.text || '').trim();
        if (!text) return ['#shorts', '#viral'];
        
        const textLower = text.toLowerCase();
        
        // ============================================
        // Step 1: Detect named entities (high priority)
        // ============================================
        const KNOWN_ENTITIES = [
            // Politicians / public figures
            'trump', 'biden', 'obama', 'putin', 'modi', 'zelensky', 'netanyahu',
            'elon', 'musk', 'bezos', 'gates', 'zuckerberg',
            'kamala', 'harris', 'pence', 'desantis', 'vivek', 'haley',
            'pelosi', 'mcconnell', 'sanders', 'aoc',
            // World leaders
            'macron', 'trudeau', 'erdogan', 'jinping',
            // Organizations
            'nato', 'congress', 'senate', 'pentagon', 'whitehouse', 'kremlin',
            'nasa', 'tesla', 'spacex', 'amazon', 'google', 'apple', 'microsoft',
            // Countries / regions
            'america', 'china', 'russia', 'ukraine', 'israel', 'palestine', 'iran',
            'india', 'pakistan', 'bangladesh', 'europe',
            // Topics
            'economy', 'election', 'debate', 'immigration', 'border',
            'military', 'nuclear', 'climate', 'bitcoin', 'crypto',
            'stock', 'market', 'tariff', 'trade', 'war', 'peace',
            'ai', 'artificial', 'intelligence', 'technology',
        ];
        
        const entityTags = [];
        for (const entity of KNOWN_ENTITIES) {
            if (textLower.includes(entity) && entityTags.length < 2) {
                entityTags.push('#' + entity);
            }
        }
        
        // If we already have 2 entity tags, we're done
        if (entityTags.length >= 2) {
            return entityTags.slice(0, 2);
        }
        
        // ============================================
        // Step 2: Extract meaningful keywords (fill remaining slots)
        // ============================================
        const stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
            'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'this',
            'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'we',
            'you', 'i', 'me', 'my', 'your', 'his', 'her', 'our', 'their', 'and',
            'but', 'or', 'so', 'if', 'then', 'than', 'too', 'very', 'just',
            'not', 'no', 'yes', 'all', 'each', 'every', 'both', 'few', 'more',
            'most', 'some', 'any', 'much', 'many', 'well', 'also', 'up', 'out',
            'what', 'when', 'where', 'who', 'how', 'why', 'which', 'there',
            'here', 'now', 'then', 'like', 'going', 'know', 'think', 'want',
            'get', 'got', 'one', 'two', 'new', 'said', 'say', 'says',
            'really', 'right', 'back', 'over', 'come', 'take', 'make', 'look',
            'been', 'only', 'even', 'because', 'way', 'let', 'thing', 'things',
            'people', 'time', 'year', 'years', 'day', 'days',
        ]);
        
        // Extract meaningful words (4+ chars, not stop words, not already entity)
        const words = textLower.replace(/[^a-z0-9\s]/g, '').split(/\s+/)
            .filter(w => w.length >= 4 && !stopWords.has(w) && !entityTags.includes('#' + w));
        
        // Count word frequency
        const freq = {};
        words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
        
        // Sort by frequency and pick top words
        const topWords = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .map(([word]) => '#' + word);
        
        // Combine: entities first, then frequency-based
        const combined = [...entityTags, ...topWords];
        
        // Ensure we always have exactly 2 hashtags
        const defaults = ['#shorts', '#viral', '#trending', '#news', '#breaking'];
        while (combined.length < 2) {
            const next = defaults.find(d => !combined.includes(d));
            if (next) combined.push(next);
            else break;
        }
        
        return combined.slice(0, 2);
    }

    /**
     * Create a safe filename from a title.
     * Format: Clean title with spaces, NO numbers, NO underscores.
     * Example: "By accident in a way and he said wow he.mp4"
     */
    _safeFilename(title, hashtags = []) {
        let name = title
            .replace(/[<>:"/\\|?*]/g, '')  // Remove filesystem-unsafe chars (keep #)
            .replace(/\s+/g, ' ')            // Normalize spaces
            .trim()
            .substring(0, 60);
        
        // Append hashtags if present
        if (hashtags && hashtags.length > 0) {
            name = name + ' ' + hashtags.join(' ');
        }
        
        return `${name}.mp4`;
    }

    /**
     * GET /api/clips/:videoId
     */
    getClips(req, res) {
        try {
            const { videoId } = req.params;
            const clips = getClipsData(videoId);
            
            if (!clips || clips.length === 0) {
                return res.status(404).json({ error: 'No clips found for this video' });
            }

            const clipsWithUrls = clips.map((clip, index) => ({
                ...clip,
                title: this._generateTitle(clip, index),
                hashtags: this._generateHashtags(clip),
                is_split_screen: clip.is_split_screen || false,
                videoUrl: `/api/clips/${videoId}/${index}/stream`,
                thumbnailUrl: clip.thumbnail_path ? `/api/clips/${videoId}/${index}/thumbnail` : null,
                downloadUrl: `/api/clips/${videoId}/${index}/download`,
            }));

            res.json({ success: true, data: clipsWithUrls });
        } catch (error) {
            console.error('[ClipController] getClips error:', error);
            res.status(500).json({ error: 'Failed to get clips' });
        }
    }

    /**
     * GET /api/clips/:videoId/:index/stream
     */
    streamClip(req, res) {
        try {
            const { videoId, index } = req.params;
            const clips = getClipsData(videoId);
            const clipIndex = parseInt(index);

            if (!clips || clipIndex >= clips.length) {
                return res.status(404).json({ error: 'Clip not found' });
            }

            const clip = clips[clipIndex];
            let filePath = clip.output_path;

            if (!filePath || !fs.existsSync(filePath)) {
                const clipDir = getClipDir(videoId);
                filePath = path.join(clipDir, `clip_${String(clipIndex).padStart(3, '0')}.mp4`);
            }

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Clip file not found' });
            }

            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = end - start + 1;

                const file = fs.createReadStream(filePath, { start, end });
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/mp4',
                });
                file.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                });
                fs.createReadStream(filePath).pipe(res);
            }
        } catch (error) {
            console.error('[ClipController] streamClip error:', error);
            res.status(500).json({ error: 'Failed to stream clip' });
        }
    }

    /**
     * GET /api/clips/:videoId/:index/thumbnail
     */
    getThumbnail(req, res) {
        try {
            const { videoId, index } = req.params;
            const clipDir = getClipDir(videoId);
            const thumbPath = path.join(clipDir, `clip_${String(parseInt(index)).padStart(3, '0')}_thumb.jpg`);

            if (!fs.existsSync(thumbPath)) {
                return res.status(404).json({ error: 'Thumbnail not found' });
            }

            res.type('image/jpeg').sendFile(thumbPath);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get thumbnail' });
        }
    }

    /**
     * GET /api/clips/:videoId/:index/download
     * Download with auto-generated clean filename.
     * Supports hashtagMode via query param: ?hashtagMode=with_tags|plain
     */
    downloadClip(req, res) {
        try {
            const { videoId, index } = req.params;
            const hashtagMode = req.query.hashtagMode || 'with_tags';
            const clips = getClipsData(videoId);
            const clipIndex = parseInt(index);

            if (!clips || clipIndex >= clips.length) {
                return res.status(404).json({ error: 'Clip not found' });
            }

            const clip = clips[clipIndex];
            let filePath = clip.output_path;

            if (!filePath || !fs.existsSync(filePath)) {
                const clipDir = getClipDir(videoId);
                filePath = path.join(clipDir, `clip_${String(clipIndex).padStart(3, '0')}.mp4`);
            }

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Clip file not found' });
            }

            const title = this._generateTitle(clip, clipIndex);
            const hashtags = this._generateHashtags(clip);
            const filename = this._safeFilename(title, hashtags);
            res.download(filePath, filename);
        } catch (error) {
            res.status(500).json({ error: 'Failed to download clip' });
        }
    }

    /**
     * POST /api/clips/:videoId/bulk-download
     * Download all selected clips as a single ZIP with:
     * - Auto-titled filenames (no numbers, no underscores)
     * - info.txt with titles and 2 hashtags per clip
     * - Supports hashtagMode: 'with_tags' | 'plain'
     */
    bulkDownload(req, res) {
        try {
            const { videoId } = req.params;
            const clips = getClipsData(videoId);

            if (!clips || clips.length === 0) {
                return res.status(404).json({ error: 'No clips found' });
            }

            // Get hashtag mode from query or body
            const hashtagMode = req.query.hashtagMode || (req.body && req.body.hashtagMode) || 'with_tags';

            // Support both GET (?indices=0,1,2) and POST ({ clipIndices: [0,1,2] })
            let selectedIndices;
            if (req.query.indices) {
                selectedIndices = req.query.indices.split(',').map(Number);
            } else if (req.body && req.body.clipIndices) {
                selectedIndices = req.body.clipIndices;
            } else {
                selectedIndices = clips.map((_, i) => i);
            }
            
            res.attachment(`Shorts_Pack_${new Date().toISOString().slice(0,10)}.zip`);

            const archive = archiver('zip', { zlib: { level: 5 } });
            archive.pipe(res);

            // Build info text with titles and hashtags
            let infoText = `# 🎬 Shorts Pack — Generated by Shorts Maker\n`;
            infoText += `# Date: ${new Date().toLocaleString()}\n`;
            infoText += `# Total Clips: ${selectedIndices.length}\n`;
            infoText += `# Hashtag Mode: ${hashtagMode === 'with_tags' ? 'With Tags' : 'Plain Title'}\n`;
            infoText += `${'='.repeat(60)}\n\n`;

            for (const idx of selectedIndices) {
                if (idx >= clips.length) continue;
                
                const clip = clips[idx];
                let filePath = clip.output_path;

                if (!filePath || !fs.existsSync(filePath)) {
                    const clipDir = getClipDir(videoId);
                    filePath = path.join(clipDir, `clip_${String(idx).padStart(3, '0')}.mp4`);
                }

                const title = this._generateTitle(clip, idx);
                const hashtags = this._generateHashtags(clip);
                const filename = this._safeFilename(title, hashtagMode === 'with_tags' ? hashtags : []);
                const isSplit = clip.is_split_screen ? ' [Split Screen]' : '';

                if (fs.existsSync(filePath)) {
                    archive.file(filePath, { name: filename });
                }

                // Add to info text
                const duration = clip.duration || 0;
                const mins = Math.floor(duration / 60);
                const secs = Math.floor(duration % 60);
                
                infoText += `📌 ${title}${isSplit}\n`;
                infoText += `   Duration: ${mins}:${String(secs).padStart(2, '0')}\n`;
                
                if (hashtagMode === 'with_tags') {
                    infoText += `   Hashtags: ${hashtags.join(' ')}\n`;
                    infoText += `   Caption: ${title} ${hashtags.join(' ')}\n`;
                } else {
                    infoText += `   Caption: ${title}\n`;
                }
                
                infoText += `   File: ${filename}\n`;
                if (clip.text) {
                    infoText += `   Transcript: ${clip.text.substring(0, 150)}${clip.text.length > 150 ? '...' : ''}\n`;
                }
                infoText += `\n`;
            }

            infoText += `${'='.repeat(60)}\n`;
            infoText += `\n💡 Copy-paste ready captions above!\n`;
            infoText += `🚀 Generated by Shorts Maker (Free & Local)\n`;

            // Add info.txt to the ZIP
            archive.append(infoText, { name: 'clip_info.txt' });

            archive.finalize();
        } catch (error) {
            console.error('[ClipController] bulkDownload error:', error);
            res.status(500).json({ error: 'Failed to create zip' });
        }
    }

    /**
     * DELETE /api/clips/:videoId
     */
    deleteClips(req, res) {
        try {
            const { videoId } = req.params;
            const clipDir = path.join(CLIPS_DIR, videoId);

            if (fs.existsSync(clipDir)) {
                fs.rmSync(clipDir, { recursive: true, force: true });
            }

            res.json({ success: true, message: 'Clips deleted' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete clips' });
        }
    }
}

module.exports = ClipController;
