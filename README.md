# ULTRON Orb UI

An Iron Man–inspired holographic orb built with **Next.js**, **Three.js**, and **MediaPipe** hand tracking — control it with your bare hands through your webcam.

> 🔮 This repository contains the open-source interface for **ULTRON**, a real-time AI assistant and control system built and maintained by **Ashish (@ashish7802)**.
>
> 🧑‍💻 GitHub: [@ashish7802](https://github.com/ashish7802)
>
> 📱 **[Watch the demo on Instagram](https://www.instagram.com/p/DayJ17OTwvx/)**

![ULTRON orb UI](docs/screenshot.png)

https://github.com/user-attachments/assets/91578a83-9a27-44e8-84b0-96defcfd7366

## About this project

ULTRON Orb UI is a futuristic holographic interface inspired by sci-fi HUD design. It combines:

- a 3D orb environment built with **Three.js**
- gesture control via **MediaPipe** hand tracking
- browser-based voice interaction and local AI orchestration
- a cinematic, immersive dashboard experience

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Windows desktop app

Run `npm run build:desktop` to create `installer/output/ULTRON-Setup.exe`.
The installer creates Start Menu and desktop shortcuts and pins ULTRON to the
taskbar. The desktop app opens in its own window; it does not require a browser
window. It uses the laptop's front-facing webcam for hand gestures and requires
the Microsoft Edge WebView2 Runtime, which is included with current Windows
installations.

Building the Windows setup requires an unexpired, trusted Authenticode Code
Signing certificate with an accessible private key and SignTool from the Windows
in the `CurrentUser\My` certificate store. Set `ULTRON_SIGN_CERT_SHA1` to its
40-character thumbprint, and optionally set `ULTRON_SIGNTOOL` to `signtool.exe`
and `ULTRON_TIMESTAMP_URL` to a trusted RFC 3161 timestamp service:

```powershell
$env:ULTRON_SIGN_CERT_SHA1 = "<40-character-thumbprint>"
$env:ULTRON_SIGNTOOL = "C:\path\to\signtool.exe" # optional if already on PATH
npm run build:desktop
```

The build signs all unsigned executable and DLL payloads and the
setup/uninstaller, timestamps and verifies each signature, and only replaces
the installer after verification. Self-signed certificates are rejected and do
not satisfy Smart App Control. Microsoft recommends Artifact Signing for Smart
App Control compliance; a publicly trusted code-signing certificate is not a
guarantee of Smart App Control's reputation decision. Cloud signing services
must provide a SignTool-compatible certificate/key provider for this build
flow; otherwise, provider-specific signing integration is required.

Voice chat uses the Windows default microphone, local Whisper transcription,
and Ollama with dual-brain intelligent routing:
- **Smart Brain (`qwen2.5:1.5b`)**: Complex reasoning, multi-step problem solving, math logic, tool calling, and anti-hallucination.
- **Fast Router / Local Kernel**: Instant (0ms) system actions (time/date, orb reset, diagnostics) and low-latency greetings (`qwen2.5:0.5b`).

Pull both models before starting:
```bash
ollama pull qwen2.5:1.5b
ollama pull qwen2.5:0.5b
```

## Controls

### Mouse / touch

| Input | Action |
| --- | --- |
| Drag | Spin the orb |
| Scroll / pinch | Zoom in & out |

### Hand gestures (webcam)

Click **GESTURES OFF** (or press `G`) and allow camera access, then:

| Gesture | Action |
| --- | --- |
| Pinch (thumb + index) one hand and move it | Spin the orb |
| Pinch with **both** hands, spread apart / bring together | Zoom in / out |

### Keyboard

| Key | Action |
| --- | --- |
| `G` | Toggle hand gestures |
| `V` | Toggle voice chat |
| `T` | Open the text prompt |
| `R` | Reset the view |
| `+` / `−` | Zoom in / out |

### Voice chat setup

Voice chat uses the browser's speech playback, the Windows default microphone,
local Whisper transcription, and Ollama. Allow microphone access when prompted.
If ULTRON does not hear you, select the intended input under **Windows Settings
→ System → Sound → Input**; a virtual audio device can be selected as the
system default instead of the built-in microphone or headset. When voice mode
is enabled, speak and watch the MIC meter; if it stays at 0%, check that input
with **Windows Settings → System → Sound → Input → Start test**. Calling apps
can override the Windows default, so select **Microphone Array (Intel Smart
Sound Technology)** (or the mic you actually use) in each app's audio settings.

Install the local requirements once:

```bash
py -m pip install faster-whisper pywebview
ollama pull qwen2.5:1.5b
ollama pull qwen2.5:0.5b
```

Run test and benchmark suites:
```bash
python benchmark_models.py
python tests/run_all_evals.py
```

`ULTRON.bat` starts the local services and desktop window from the source
folder. When running the UI with `npm run dev`, start `python stt_server.py`
and make sure Ollama is running separately.

## How it works

- **`lib/intentRouter.ts`** — Dual-brain & hybrid router with zero-hallucination guardrails, routing instant commands, permanent memory ops, agent planning, and desktop tool calls.
- **`ultron_memory.py`** — Permanent SQLite memory engine with FTS5 virtual tables for BM25 semantic/keyword search, selective fact preservation, and memory lifecycle management.
- **`ultron_tools.py`** — Real computer control engine with system telemetry (`psutil`), app launch/close, file search/IO, developer commands, and confirmation token security gates.
- **`ultron_planner.py`** — Autonomous controlled agent loop: Understand $\rightarrow$ Plan $\rightarrow$ Execute $\rightarrow$ Verify $\rightarrow$ Report with step-by-step verifiable success criteria.
- **`launch_app.py`** — Production Windows supervisor with single-instance Named Mutex, auto-restart exponential backoff, structured JSONL logging, and clean process-tree termination.
- **`lib/orbScene.ts`** — Three.js holographic particle orb connected to real assistant states (`idle`, `listening`, `thinking`, `executing`, `speaking`, `error`, `gesture`).
- **`components/JarvisOrb.tsx`** — Interactive HUD interface with full-duplex barge-in voice interruption, sentence-by-sentence streaming TTS, and cancel/stop controls.
- **`stt_server.py`** — Local Whisper STT & unified Core API server for memory, tools, and planner execution.

## Evaluation Suite

Run the full evaluation runner to verify all 6 test suites:
```bash
python tests/run_all_evals.py
```

| Suite | Status |
| --- | :---: |
| Hybrid Intent Router | 100% PASSED |
| Permanent Memory (SQLite + FTS5) | 100% PASSED |
| Real Computer Control & Safety | 100% PASSED |
| Autonomous Agent Planner | 100% PASSED |
| Tool-Calling (Smart Brain 1.5B) | 100% PASSED |
| Anti-Hallucination & Factual Guardrails | 100% PASSED |

## License

MIT
