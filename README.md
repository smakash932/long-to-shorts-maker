# Long-to-Shorts Maker

Local AI tool that turns long-form videos (YouTube URL or upload) into 9:16 vertical short clips with hook text, burned-in subtitles, smart cropping, and optional anti-copyright filters. Runs entirely on your PC — no cloud, no subscription.

GPU acceleration (CUDA + NVENC) is auto-detected for NVIDIA cards; everything also works on CPU as a fallback.

---

## Easy setup on Windows (two files, two clicks)

1. **Download the repo** — green `Code` button → `Download ZIP`. Extract anywhere on your PC.

2. **Install three system tools once** (these only need to be installed once per PC, not per project):
   - **Python 3.10+:** https://www.python.org/downloads/ — tick **"Add python.exe to PATH"** during install.
   - **Node.js 18+:** https://nodejs.org/en/download
   - **FFmpeg:** https://www.gyan.dev/ffmpeg/builds/ — download the **"release essentials"** zip, extract it, and add the `bin` folder to your `PATH`.

3. **Double-click `SETUP.bat`** — one-time setup (only needed once per PC).
   - Checks Python / Node / FFmpeg are on PATH.
   - Creates the Python venv if it doesn't exist.
   - Installs Python + Node packages (skips anything already installed).
   - Prints a clear `[DONE] All requirements installed!` message at the end.
   - You can run it again any time — already-installed parts are skipped.

4. **Double-click `START.bat`** to launch the tool.
   - No install step here — just starts the backend + frontend and opens your browser at `http://localhost:5187`.
   - This is the file you'll use every day.
   - If you accidentally run it before `SETUP.bat`, it will tell you to run setup first.

### GPU vs CPU mode

Inside the UI, in the **Clip Settings** panel, there's a toggle:

- **🚀 GPU On** — uses your NVIDIA GPU (CUDA for transcription + NVENC for video encoding). Auto-falls back to CPU if no GPU is detected.
- **🐢 CPU Only** — forces CPU mode everywhere. Useful when you share the tool with students or clients whose PCs don't have an NVIDIA GPU.

The hardware badge in the top right of Clip Settings shows what's actually being used at any moment.

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
