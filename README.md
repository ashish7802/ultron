# ULTRON

ULTRON is a local-first AI desktop assistant built as a Next.js app wrapped in Electron. It blends a conversational interface, persistent memory, local voice processing, and Windows desktop awareness into a single developer-focused desktop agent.

The project is designed for privacy-first local execution: models, memory, and command handling stay on-device rather than depending on a cloud AI backend.

## What this project includes

- Next.js 16 interface with App Router
- Electron desktop shell for local Windows desktop execution
- Local speech/transcription pipeline with Python components
- Memory and reasoning systems in the TypeScript `lib` layer
- Screen awareness and desktop capability hooks
- Research / cognitive planning modules for higher-level AI behavior
- Safety and permission gating around sensitive actions

## Architecture at a glance

```text
┌──────────────────────┐
│ Browser / Electron UI │
│   app/ + components/ │
└───────────┬──────────┘
            │ HTTPS / local IPC
            ▼
┌──────────────────────┐
│ Next.js runtime      │
│ app/api/* + lib/*    │
├──────────────────────┤
│ Intent routing       │
│ Memory + planning    │
│ Screen / desktop APIs│
└───────────┬──────────┘
            │
            ├──────────────► Python voice engine (ultron_engine/)
            │
            └──────────────► Electron desktop shell (electron/)
```

## Repository structure

```text
.
├── app/                       # Next.js app entry and API routes
│   ├── api/                  # API endpoints for chat, memory, permission, transit, research, etc.
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/               # UI components used by the frontend
├── electron/                 # Electron main process, preload, startup logic
├── lib/                      # Core TypeScript logic for memory, reasoning, orchestration, screen, permissions
│   ├── cognitive/            # Cognitive planning and reasoning engines
│   ├── memory/               # Persistent memory modules
│   ├── research/             # Research-oriented workflows
│   ├── screen/               # Screen awareness logic
│   ├── audioProcessor.ts
│   ├── conversationManager.ts
│   ├── memoryManager.ts
│   ├── permissionGateway.ts
│   ├── responseDecisionEngine.ts
│   └── systemController.ts
├── ultron_engine/            # Python-based voice/transcription engine and related logic
├── docs/                    # Additional documentation and assets
├── public/                  # Static assets
├── supabase/                # Supabase-related project resources
├── .gitignore
├── AGENTS.md                # Coding standards for agents working in this repo
├── LICENSE
├── README.md
├── next.config.ts
├── package.json
├── requirements-voice.txt
├── tsconfig.json
├── ultron_memory_vault.json
├── ultron_research_vault.json
├── *.test.mjs               # JavaScript validation test files
├── *.py                    # Python security / verification scripts
└── *.mjs                   # Utility scripts for research and verification
```

## Key subsystems

### Frontend and desktop shell

- `app/` hosts the main Next.js UI.
- `components/` contains the interactive interface logic.
- `electron/main.js` manages the desktop app runtime, app lifecycle, permission handling, and local server startup.

### Intelligence and reasoning

- `lib/cognitive/` contains planning, reasoning, critical thinking, uncertainty modeling, and orchestration layers.
- `lib/responseDecisionEngine.ts` chooses whether the assistant should respond, react, listen, ignore, or require confirmation.
- `lib/systemController.ts` and related modules coordinate operational control logic.

### Memory and safety

- `lib/memory/` contains the memory stack and self-healing/security logic.
- `lib/permissionGateway.ts` enforces permission boundaries.
- `ultron_memory_vault.json` and related state artifacts represent persistent memory storage.

### Voice and local runtime

- `ultron_engine/` houses the local speech / transcription runtime.
- `requirements-voice.txt` captures the Python dependency set for voice features.
- `app/api/transcribe`, `app/api/tts`, and related API routes connect the voice stack to the UI.

## Prerequisites

- Node.js 20+ or 22+
- Python 3.10+
- Windows 10/11 for native desktop automation and UI-related features
- Ollama installed and running locally for local model usage

## Quick start

1. Clone the repository

```bash
git clone https://github.com/ashish7802/ultron.git
cd ultron
```

2. Install JavaScript dependencies

```bash
npm install
```

3. Install Python dependencies for voice features

```bash
python -m pip install -r requirements-voice.txt
```

4. Pull local models with Ollama

```bash
ollama pull qwen2.5:1.5b
ollama pull qwen2.5:0.5b
```

5. Start the app in development mode

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:3000
```

## Desktop app

This repo also includes an Electron desktop wrapper.

```bash
npm run build
npm start
```

The Electron runtime starts a local Next.js server and embeds it in a secure desktop window with media permission restrictions and navigation guardrails.

## Useful scripts

The project defines the following package scripts in `package.json`:

```bash
npm run dev
npm run build:next
npm run build:electron
npm run build
npm run lint
npm start
npm run package
```

## Security and privacy posture

This repo emphasizes safety by design:

- local execution and local memory storage
- permission gating around desktop actions
- guarded UI access in Electron
- explicit app-path restrictions in the desktop preload layer
- read-only or conservative behaviors for certain screen/desktop features

These safeguards are designed to avoid uncontrolled external access or broad permission escalation while maintaining useful desktop automation.

## Notes for contributors

- The repository combines JavaScript/TypeScript frontend logic with Python audio and model tooling.
- UI, reasoning, memory, and desktop layers all communicate through the app and lib structure.
- Follow the project standards in `AGENTS.md` before making changes, especially regarding comments, documentation, and safety-sensitive logic.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Maintainer

Ashish: https://github.com/ashish7802

---

If you want, I can also produce a more polished, marketing-style README or a shorter project teaser version tailored for GitHub landing pages.
