/**
 * Python Bridge Service
 * Spawns Python engine processes and captures JSON output.
 * Emits Socket.IO events for real-time progress updates.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

const ENGINE_DIR = path.join(__dirname, '..', '..', 'engine');

// Cross-platform venv Python resolution.
// Windows venv puts Python at venv/Scripts/python.exe.
// macOS/Linux venv puts it at venv/bin/python.
function resolvePythonCommand() {
    if (process.env.LTS_PYTHON) return process.env.LTS_PYTHON;

    const candidates = [
        path.join(__dirname, '..', '..', 'venv', 'Scripts', 'python.exe'),
        path.join(__dirname, '..', '..', 'venv', 'bin', 'python'),
        path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe'),
        path.join(__dirname, '..', '..', '.venv', 'bin', 'python'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return process.platform === 'win32' ? 'python' : 'python3';
}

const PYTHON_CMD = resolvePythonCommand();

class PythonBridge extends EventEmitter {
    constructor(io) {
        super();
        this.io = io;
        this.activeProcesses = new Map();
    }

    /**
     * Spawn a Python engine command.
     * @param {string} command - The engine command (download, transcribe, etc.)
     * @param {Array} args - Command arguments
     * @param {string} jobId - Unique job identifier
     * @returns {Promise<Object>} - Result data from Python
     */
    runCommand(command, args = [], jobId = null, extraEnv = {}) {
        return new Promise((resolve, reject) => {
            const fullArgs = [
                path.join(ENGINE_DIR, 'main.py'),
                command,
                ...args
            ];

            console.log(`[PythonBridge] Running: ${PYTHON_CMD} ${fullArgs.join(' ')}` +
                (Object.keys(extraEnv).length ? ` (env override: ${JSON.stringify(extraEnv)})` : ''));

            const proc = spawn(PYTHON_CMD, fullArgs, {
                cwd: ENGINE_DIR,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...extraEnv },
            });

            if (jobId) {
                this.activeProcesses.set(jobId, proc);
            }

            let resultData = null;
            let stderrOutput = '';

            // Process stdout line by line for JSON events
            let buffer = '';
            proc.stdout.on('data', (data) => {
                buffer += data.toString('utf-8');
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    try {
                        const event = JSON.parse(trimmed);
                        
                        // Emit to Socket.IO
                        if (this.io && jobId) {
                            this.io.to(jobId).emit('engine_event', event);
                            this.io.emit('engine_event', { jobId, ...event });
                        }

                        // Emit locally
                        this.emit('event', { jobId, ...event });

                        // Capture result
                        if (event.event === 'result') {
                            resultData = event.data;
                        }
                        if (event.event === 'error') {
                            console.error(`[PythonBridge] Error: ${event.message}`);
                        }
                        if (event.event === 'progress') {
                            console.log(`[PythonBridge] [${event.step}] ${event.progress}% - ${event.message}`);
                        }
                    } catch (e) {
                        // Not JSON, just log it
                        if (trimmed) {
                            console.log(`[PythonBridge] stdout: ${trimmed}`);
                        }
                    }
                }
            });

            proc.stderr.on('data', (data) => {
                stderrOutput += data.toString('utf-8');
                // Don't log every stderr line (Whisper produces a lot of info on stderr)
            });

            proc.on('close', (code) => {
                if (jobId) {
                    this.activeProcesses.delete(jobId);
                }

                if (code === 0) {
                    resolve(resultData);
                } else {
                    const errMsg = stderrOutput.slice(-500) || `Process exited with code ${code}`;
                    console.error(`[PythonBridge] Process failed (code ${code}): ${errMsg}`);
                    reject(new Error(errMsg));
                }
            });

            proc.on('error', (err) => {
                if (jobId) {
                    this.activeProcesses.delete(jobId);
                }
                reject(err);
            });
        });
    }

    /**
     * Run the full pipeline.
     */
    async runPipeline(options) {
        const args = [];
        
        if (options.url) args.push('--url', options.url);
        if (options.videoPath) args.push('--video-path', options.videoPath);
        if (options.videoId) args.push('--video-id', options.videoId);
        if (options.language) args.push('--language', options.language);
        if (options.ratio) args.push('--ratio', options.ratio);
        if (options.template) args.push('--template', options.template);
        if (options.minDuration) args.push('--min-duration', String(options.minDuration));
        if (options.maxDuration) args.push('--max-duration', String(options.maxDuration));
        if (options.clipCount) {
            const count = (options.clipCount === 'auto' || options.clipCount === 'Auto') 
                ? 999 
                : parseInt(options.clipCount) || 10;
            args.push('--clip-count', String(count));
        }
        
        // Processing mode: classic (fast) or advanced (face detection)
        const mode = options.mode || 'classic';
        args.push('--mode', mode);
        
        // Position controls — always send with defaults
        args.push('--hook-position', options.hookPosition || 'upper');
        args.push('--sub-position', options.subPosition || 'bottom');

        // Anti-copyright filter strength: off | light | medium | strong
        if (options.anticopy) args.push('--anticopy', options.anticopy);

        // Encoding quality (passed through to NVENC/x264 args): fast | balanced | best
        if (options.quality) args.push('--quality', options.quality);

        // Skip subtitles entirely if user explicitly disabled them
        if (options.subtitles === false) args.push('--subtitles', 'false');

        // GPU/CPU mode toggle from the UI. When the user has flipped "GPU
        // Accelerate" off we hard-force CPU mode via env var (the engine's
        // gpu_utils.py honors LTS_FORCE_CPU=1 and skips all CUDA / NVENC).
        const extraEnv = {};
        if (options.useGpu === false) {
            extraEnv.LTS_FORCE_CPU = '1';
        }

        return this.runCommand('pipeline', args, options.videoId || 'pipeline', extraEnv);
    }

    /**
     * Get hardware / GPU info from the engine (cached after first call).
     */
    async getSystemInfo() {
        return new Promise((resolve, reject) => {
            const proc = spawn(PYTHON_CMD, [path.join(ENGINE_DIR, 'gpu_utils.py')], {
                cwd: ENGINE_DIR,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
            proc.stderr.on('data', (d) => { stderr += d.toString('utf-8'); });
            proc.on('close', (code) => {
                if (code !== 0) return reject(new Error(stderr || `gpu_utils exited ${code}`));
                try { resolve(JSON.parse(stdout)); }
                catch (e) { reject(e); }
            });
            proc.on('error', reject);
        });
    }

    /**
     * Download a YouTube video.
     */
    async downloadVideo(url, videoId) {
        const args = [url];
        if (videoId) args.push('--video-id', videoId);
        return this.runCommand('download', args, videoId || 'download');
    }

    /**
     * Get video info without downloading.
     */
    async getVideoInfo(url) {
        return this.runCommand('download', [url, '--info-only'], 'info');
    }

    /**
     * Cancel a running job.
     */
    cancelJob(jobId) {
        const proc = this.activeProcesses.get(jobId);
        if (proc) {
            console.log(`[PythonBridge] Killing job ${jobId} (PID: ${proc.pid})`);

            if (process.platform === 'win32') {
                // Windows: SIGTERM doesn't work. Use taskkill to kill process tree.
                try {
                    const { execSync } = require('child_process');
                    execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
                } catch (e) {
                    try { proc.kill('SIGKILL'); } catch (e2) {}
                }
            } else {
                // macOS / Linux: SIGKILL works fine.
                try { proc.kill('SIGKILL'); } catch (e) {}
            }

            this.activeProcesses.delete(jobId);
            return true;
        }
        return false;
    }
}

module.exports = PythonBridge;
