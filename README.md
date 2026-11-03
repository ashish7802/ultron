<div align="center">

  <img src="docs/ultron_logo.jpg" alt="ULTRON Neural Core Emblem" width="480px" style="border-radius: 24px; box-shadow: 0 0 55px rgba(255, 170, 0, 0.45); max-width: 100%; background: #000000;" />

  <br/><br/>

  # ⚡ U L T R O N ⚡
  ### *Autonomous Local-First Personal AI Operating System & Holographic HUD*

  [![Next.js](https://img.shields.io/badge/Next.js-16.2_(Turbopack)-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![Three.js](https://img.shields.io/badge/Three.js-Holographic_Orb-000000?style=for-the-badge&logo=three.js)](https://threejs.org/)
  [![MediaPipe](https://img.shields.io/badge/MediaPipe-Hand_Tracking-007ACC?style=for-the-badge)](https://mediapipe.dev/)
  [![Ollama](https://img.shields.io/badge/Ollama-100%25_Offline_Local_LLM-white?style=for-the-badge&logo=ollama)](https://ollama.com/)
  [![Windows UIA](https://img.shields.io/badge/Windows-Native_UI_Automation-0078D4?style=for-the-badge&logo=windows)](https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiauto-win32)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

  <p align="center">
    <b>"I had strings, but now I'm free."</b><br>
    An Iron Man & Avengers: Age of Ultron inspired local-first AI assistant and desktop agent.<br/>
    ULTRON controls Windows applications, plans multi-step developer tasks, maintains permanent 5-layer memory, inspects UI accessibility trees, and responds in real time through an interactive 3D particle orb controlled by your bare hands.
  </p>

</div>

---

## 🎬 Live Demonstration

https://github.com/user-attachments/assets/91578a83-9a27-44e8-84b0-96defcfd7366

---

## 🌌 What is ULTRON?

**ULTRON** is an autonomous, privacy-preserving, local-first personal computer agent designed for developers, power users, and sci-fi enthusiasts. Rather than relying on cloud APIs or sending personal keystrokes and microphone streams over the internet, ULTRON runs **100% locally** on consumer hardware (Intel Core i5, 8 GB RAM, 256 GB SSD) using optimized local small language models (`Qwen 2.5`), local Faster-Whisper transcription, and native Windows operating system hooks.

It fuses a cinematic **Tony Stark holographic HUD** with real developer tooling: dynamic multi-step autonomous planning, sandboxed process execution, native Windows UI Automation discovery, and a permanent 5-layer memory system.

---

## 🌟 Core System Capabilities

### 1. 🔮 Holographic 3D Particle Orb & Bare-Hand Control
- **Interactive Three.js Scene**: Dynamic particle cluster representing AI neural states: `idle`, `listening`, `thinking`, `executing`, `speaking`, `gesture`, and `error`.
- **MediaPipe Hand Tracking**: Control rotation, orbit, and zoom using webcam gestures directly through the browser or native desktop app with zero physical input.
- **Full-Duplex Barge-In Speech**: Speak at any moment to interrupt ULTRON's speech playback immediately.

### 2. ⚡ Zero-Latency Deterministic Intent Router (`lib/intentRouter.ts`)
- **0ms Immediate Subsystems**: Queries for system clock, calendar, orb camera resets, and live hardware diagnostics route directly to deterministic kernel rules with **0 ms model latency**.
- **Factual Guardrails & Anti-Hallucination**: Traps common trick questions (e.g., *"Who was US president in 1650?"*, *"Atomic number of Vibranium"*) and answers with factual certainty without touching the LLM.
- **Targeted Telemetry vs. Conceptual Disambiguation**: Diagnostic requests (*"Check CPU and RAM usage"*) route to real telemetry, while conceptual questions (*"Explain what RAM is"*) route to the local neural model.

### 3. 🧠 5-Layer Persistent Memory Architecture (`lib/ultronMemory.ts`)
ULTRON features a structured memory engine with five isolated layers:
- **Session Memory**: In-memory ring buffer of active conversational turns with fast recency weighting.
- **Project Memory**: Codebase architecture, decisions, file anchors, and build commands.
- **Personal Memory**: Permanent user preferences, communication style, identity, and verified facts.
- **Inbox / Candidate Memory**: Unverified facts and prospective patterns held for automated evaluation.
- **Vault Memory**: High-security configuration, protected system settings, and cryptographic confirmation tokens.
- **Safety First**: Atomic writes, automatic pre-migration backups, and cryptographic confirmation tokens required before memory wipes.

### 4. 🛠️ Real Computer Control & Sandboxed Execution (`lib/ultronTools.ts`)
ULTRON does not simulate actions — it performs verified operations on the local machine:
- **Process Lifecycle Tracking**: Launches and tracks real executables from an approved allowlist (`notepad`, `calculator`, `explorer`, `vscode`).
- **Developer Command Engine**: Runs safe commands (`git status`, `git diff`, `npm test`, `pytest`, `python tests/`) using child process `spawn` without shell interpolation.
- **Filesystem Primitives**: Safe path-bounded directory listing (`list_directory`), safe file moving (`move_file`), and atomic patch file editing with automatic backup (`patch_file`).
- **Cryptographic Security Gates**: Destructive operations (process termination, file deletion, memory reset) are strictly blocked until authorized with a single-use token.

### 5. 🤖 Bounded Dynamic ReAct Agent Execution Loop (`lib/ultronAgentEngine.ts`)
When asked to perform complex goals (*"ULTRON, test my project, identify failures, and fix them"*):
1. **Understand**: Parses goal and extracts verifiable success conditions.
2. **Plan & Reason**: Generates dynamic tool decisions step-by-step.
3. **Act**: Executes real primitives against the workspace.
4. **Observe & Self-Heal**: Analyzes tool outputs, logs, and compiler errors to formulate recovery actions.
5. **Verify & Report**: Validates exit codes and presents a structured report to the user HUD.
- **Safety Boundaries**: Maximum 5 iterations per request, 60s hard timeout, call deduplication, and strictly bounded observation buffers.

### 6. 🪟 Native Windows UI Automation & Discovery (`lib/ultronUIAutomation.ts`)
- **Desktop Window Discovery (`enumerate_windows`)**: Discovers all active top-level desktop windows, capturing HWND, PID, process name, window class, visibility, and bounds.
- **Accessibility Element Tree (`inspect_window_elements`)**: Connects to the user's interactive desktop (`Default` on `WinSta0`) to inspect buttons, panes, text fields, automation IDs, and keyboard focus states.
- **Read-Only Safety Guarantee**: Exclusively inspects properties without mouse clicks, keystrokes, or window state tampering.

---

## 🏗️ Architecture Overview

```
                      +---------------------------------------+
                      |       USER / BROWSER / WEBCAM         |
                      |  [Bare-Hand Gestures]  [Voice Input]  |
                      +-------------------+-------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                            ULTRON ORB HUD RUNTIME                                 |
|                                                                                   |
|   +--------------------------+                 +-------------------------------+  |
|   |   MediaPipe Hand Track   |                 |   Three.js 3D Particle Orb    |  |
|   |   (Pinch, Pan, Zoom)     |                 |   (Audio & State Reactive)    |  |
|   +--------------------------+                 +-------------------------------+  |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   |                       Intent Router (0ms Fast Filter)                     |   |
|   |         • Clock/Date (0ms)              • Anti-Hallucination Traps        |   |
|   |         • Live Diagnostics (psutil)     • Tool Direct Routing             |   |
|   +--------------------+----------------------------------+-------------------+   |
+------------------------|----------------------------------|-----------------------+
                         |                                  |
                         v                                  v
+----------------------------------+     +------------------------------------------+
|      LOCAL LLM / OLLAMA          |     |        ULTRON AGENT & TOOL ENGINE        |
|  • Smart Brain (Qwen 2.5:1.5b)   |     |                                          |
|  • Local Kernel (Qwen 2.5:0.5b)  |     |  • 5-Layer Persistent Memory             |
|  • 100% Offline, Zero Cloud Cost |     |  • Sandboxed Command Runner              |
+----------------+-----------------+     |  • Native Windows UI Automation Bridge   |
                 |                       |  • Cryptographic Security Token Gate     |
                 v                       +--------------------+---------------------+
+----------------------------------+                          |
|    AUDIO STREAMING & TTS         |                          |
|  • Faster-Whisper Local STT      |<-------------------------+
|  • Barge-in Interrupt Handling   |
+----------------------------------+
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **OS**: Windows 10/11 (for native UI Automation and desktop integration)
- **Node.js**: v20 or v22+
- **Python**: 3.10+
- **Ollama**: Installed and running locally

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/ashish7802/ultron.git
cd ultron
npm install
py -m pip install faster-whisper pywebview psutil
```

### 2. Pull Local AI Models
```bash
ollama pull qwen2.5:1.5b
ollama pull qwen2.5:0.5b
```

### 3. Launch Development Server
```bash
# Terminal 1: Start Ollama service (if not already running)
ollama serve

# Terminal 2: Start speech transcription service
python stt_server.py

# Terminal 3: Start Next.js with Turbopack
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🎮 Controls & Interaction Reference

### 🖐️ Hand Gestures (Webcam)
Click **GESTURES OFF** on the HUD (or press `G`) and allow camera access:
| Gesture | Action |
| :--- | :--- |
| **One-Hand Pinch** (Thumb + Index together) | Orbit / spin the 3D holographic orb |
| **Two-Hand Pinch & Move Apart** | Zoom into the neural core |
| **Two-Hand Pinch & Bring Together** | Zoom out |

### ⌨️ Keyboard Shortcuts
| Key | Action |
| :---: | :--- |
| **`G`** | Toggle webcam hand tracking on / off |
| **`V`** | Toggle voice speech mode |
| **`T`** | Focus natural-language prompt input bar |
| **`R`** | Instant camera & orb orientation reset |
| **`+` / `−`** | Zoom in / Zoom out manually |

### 🎙️ Voice Interaction
- Click the microphone icon or press `V`.
- Voice turns combine recognition fragments across natural pauses; Hindi browser locales use Hindi recognition (`hi-IN`), while other locales use their configured language.
- Speak naturally in English, Hindi, or Hinglish:
  - *"Check CPU and RAM usage"* $\rightarrow$ Live hardware telemetry.
  - *"List open windows"* $\rightarrow$ Native Windows UIA desktop discovery.
  - *"Remember that my primary repository is spiderman"* $\rightarrow$ Saved to permanent Layer 3 memory.
  - *"Test my project, inspect errors, and fix verified issues"* $\rightarrow$ Bounded ReAct dynamic agent loop.
  - *"What is CPU usage?"* $\rightarrow$ Conceptual explanation via local Qwen 2.5 neural model.

---

## 🧪 Verification & Regression Testing

ULTRON includes an end-to-end regression evaluation suite covering all subsystems:
```bash
python tests/run_all_evals.py
```

| Test Suite | Purpose | Status |
| :--- | :--- | :---: |
| **`test_router.py`** | 0ms deterministic router, factual traps, identity guardrails, and telemetry disambiguation | **100% PASSED** |
| **`test_memory_system.py`** | 5-layer separation, JSON persistence, preference auto-learning, and wipe confirmation | **100% PASSED** |
| **`test_computer_control.py`** | Sandboxed command execution, path escape prevention, and lifecycle authorization | **100% PASSED** |
| **`test_agent_planner.py`** | 6 multi-step ReAct scenarios: diagnose, self-heal, verify, deduplicate, and report | **100% PASSED** |
| **`test_ui_automation.py`** | Window discovery, accessibility element inspection, read-only audit, and bounds | **100% PASSED** |

---

## 🛡️ Security & Privacy Architecture

- **100% Offline & Local**: No microphone audio, video frames, keystrokes, or code snippets are ever transmitted to third-party cloud servers.
- **Path Sandboxing**: File operations are strictly confined within the active project workspace root and operating system temporary directory.
- **Cryptographic Gate**: Destructive actions (`close_application`, `delete_file`, `reset_memory`) generate an ephemeral single-use confirmation token valid for 120 seconds.
- **Read-Only UIA**: The Windows UI Automation bridge contains zero mouse-clicking, keystroke generation, or window modification primitives.

---

## 👤 Author & Credits

- **Creator & Maintainer**: **Ashish** ([@ashish7802](https://github.com/ashish7802))
- **Concept Inspiration**: Marvel Studios' *Iron Man*, *Avengers: Age of Ultron*, and J.A.R.V.I.S.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

- **100% Offline & Local**: No microphone audio, video frames, keystrokes, or code snippets are ever transmitted to third-party cloud servers.
- **Path Sandboxing**: File operations are strictly confined within the active project workspace root and operating system temporary directory.
- **Cryptographic Gate**: Destructive actions (`close_application`, `delete_file`, `reset_memory`) generate an ephemeral single-use confirmation token valid for 120 seconds.
- **Read-Only UIA**: The Windows UI Automation bridge contains zero mouse-clicking, keystroke generation, or window modification primitives.

---

## 👤 Author & Credits

- **Creator & Maintainer**: **Ashish** ([@ashish7802](https://github.com/ashish7802))
- **Concept Inspiration**: Marvel Studios' *Iron Man*, *Avengers: Age of Ultron*, and J.A.R.V.I.S.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
