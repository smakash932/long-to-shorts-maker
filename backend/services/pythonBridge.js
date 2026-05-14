/**
 * Python Bridge Service
 * Spawns Python engine processes and captures JSON output.
 * Emits Socket.IO events for real-time progress updates.
 */

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

const ENGINE_DIR = path.join(__dirname, '..', '..', 'engine');
const VENV_PYTHON = path.join(__dirname, '..', '..', 'venv', 'Scripts', 'python.exe');
const PYTHON_CMD = require('fs').existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python';

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
    runCommand(command, args = [], jobId = null) {
        return new Promise((resolve, reject) => {
            const fullArgs = [
                path.join(ENGINE_DIR, 'main.py'),
                command,
                ...args
            ];

            console.log(`[PythonBridge] Running: ${PYTHON_CMD} ${fullArgs.join(' ')}`);

            const proc = spawn(PYTHON_CMD, fullArgs, {
                cwd: ENGINE_DIR,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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

        return this.runCommand('pipeline', args, options.videoId || 'pipeline');
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
            
            // On Windows, SIGTERM doesn't work. Use taskkill to kill process tree.
            try {
                const { execSync } = require('child_process');
                execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
            } catch (e) {
                // Fallback: try regular kill
                try { proc.kill('SIGKILL'); } catch (e2) {}
            }
            
            this.activeProcesses.delete(jobId);
            return true;
        }
        return false;
    }
}

module.exports = PythonBridge;
