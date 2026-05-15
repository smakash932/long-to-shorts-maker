# Long-to-Shorts Maker

Local AI tool that turns long-form videos (YouTube URL or upload) into 9:16 vertical short clips with hook text, burned-in subtitles, smart cropping, and optional anti-copyright filters. Runs entirely on your PC — no cloud, no subscription.

GPU acceleration (CUDA + NVENC) is auto-detected for NVIDIA cards; everything also works on CPU as a fallback.

---

## One-click run on Windows

1. **Download the repo** — green `Code` button → `Download ZIP`. Extract anywhere.
2. **Install three system tools first** (these only need to be installed once on your PC):
   - Python 3.10+: https://www.python.org/downloads/ — tick **"Add python.exe to PATH"** during install.
   - Node.js 18+: https://nodejs.org/en/download
   - FFmpeg: https://www.gyan.dev/ffmpeg/builds/ — download the "release essentials" zip, extract, and add the `bin` folder to your `PATH`.
3. **Double-click `START.bat`.**
   - The first time you run it, it will create a Python venv, install all Python + Node packages (a few minutes), then start both servers.
   - Subsequent runs skip the install step and start in a few seconds.
   - Your browser will open `http://localhost:5187` automatically.

If anything is missing, `START.bat` will tell you exactly what to install.

---

## How it works

1. Paste a YouTube URL or drag-and-drop a video file.
2. Pick template, subtitle style, hook/sub position, anti-copyright strength, and quality.
3. The engine: downloads → transcribes (faster-whisper, CUDA float16 if available) → finds best moments → smart-crops to 9:16 → burns subtitles → encodes (NVENC if available, otherwise libx264).
4. Generated clips appear in the UI with preview + download.

---

## Hardware

Designed for mid-range PCs:
- **i5 / Ryzen 5 6c+** ideal for CPU paths.
- **NVIDIA GTX 1650 / 1060 or newer** unlocks faster transcription + NVENC encoding (auto-detected).
- 16+ GB RAM recommended.
- Everything runs locally; nothing is uploaded.

---

## Manual setup (advanced)

If you don't want to use `START.bat`:

```bat
python -m venv venv
venv\Scripts\pip install -r engine\requirements.txt
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

REM Then in two separate terminals:
set LTS_PYTHON=%cd%\venv\Scripts\python.exe
cd backend && node server.js

REM Other terminal:
cd frontend && npm run dev
```

Open http://localhost:5187.

---

## Verify GPU is being used

After installation, run:
```
venv\Scripts\python engine\gpu_utils.py
```
The JSON output should show `"nvenc": {"available": true}` and `"cuda": {"available": true}` if your GPU is detected.

---

## Optional environment variables

- `LTS_WHISPER_MODEL=tiny|base|small|medium` — change Whisper model size (default: `small` on GPU, `base` on CPU).
- `LTS_CLIP_WORKERS=N` — parallel clip generations (default: 2).
- `LTS_PYTHON=<path>` — point backend to a specific Python interpreter (auto-set by `START.bat`).
