# ULTRON Repository Architecture Report (Phase 1 Baseline Audit)

**Audit Scope**: Complete source-level inspection of the ULTRON Desktop AI Assistant repository prior to engineering overhaul.  
**Environment**: Linux cloud verification container (`Node v22.23.2`, `Python 3` at `/usr/bin/python3`, Next.js `16.4.6`, React `19.2.7`, TypeScript `5.x`).  
**Git Metadata Status**: `.git` directory is not present in this workspace snapshot (`git status` exited with code 128: `not a git repository`). Architectural findings below are derived exclusively from direct file inspection and executable verification.

---

## 1. High-Level System Topology

ULTRON is a hybrid desktop + web AI assistant composed of four tightly coupled runtime layers:

| Layer | Technology & Entrypoints | Role |
| :--- | :--- | :--- |
| **Desktop Shell** | Electron `45.0.0` (`/electron/main.js`, `/electron/preload.js`) | Spawns embedded standalone Next.js server on `127.0.0.1` (ephemeral/3000 port), verifies startup via HMAC-SHA256 challenge (`POST /api/desktop-ready`), sets `ULTRON_USER_DATA_DIR`, enforces Chromium `setPermissionRequestHandler`, isolates renderer via `contextIsolation: true` and `nodeIntegration: false`. |
| **Web Frontend** | Next.js `16.4.6` App Router (`/app/layout.tsx`, `/app/page.tsx`, `/components/*`) | Client-rendered dark interface (dynamically loaded with `ssr: false`). Baseline consists of monolithic `UltronChat.tsx` (2,096 lines), `CommandCenterDashboard.tsx` (694 lines), `SecurityDashboardModal.tsx` (1,900 lines), `UltronOrb.tsx` (1,876 lines), `TaskOrchestrationModal.tsx`, `LearningEvolutionModal.tsx`, `ScreenAwarenessIndicator.tsx`, and `MarkdownRenderer.tsx`. |
| **Backend API & Domain Services** | Next.js API Routes (`/app/api/**/route.ts`, 40 route files) + TypeScript Domain Libraries (`/lib/*`) | Handles chat orchestration, Ollama LLM integration, AES-256-GCM memory vault management, desktop telemetry, permission approvals, security governance, research pipeline, computer intelligence, screen awareness, task orchestration, learning evolution, game dev management, and voice bridges. |
| **Native OS & Python Workers** | Python 3 (`/ultron_engine/*`) + Windows PowerShell/Win32 bridges | Native helpers for computer automation (`ultron_engine/computer/*`), screen capture (`screen_capture_driver.py`), quantum research (`quantum_research_agent.py`), DPAPI key wrapping (`dpapiBridge.ts`), Windows Hello verification (`windowsHelloBridge.ts`), TTS, transcription, and wakeword detection. |

---

## 2. Directory & Subsystem Inventory

### 2.1 Frontend (`/app` & `/components`)
- `/app/layout.tsx` & `/app/page.tsx`: Root HTML shell and dynamic mount of `UltronChat`.
- `/app/globals.css`: Large raw CSS file mixing layout rules, glowing gradients, pulsing dots, and modal styles; supplemented by extensive inline React `style={{ ... }}` blocks across components.
- `/components/UltronChat.tsx` (2,096 lines): Monolithic primary workspace combining sidebar conversation history, chat messaging, voice recording/TTS, memory modal, and modal launchers for Dashboard, Security, Orchestration, and Learning.
- `/components/CommandCenterDashboard.tsx` (694 lines): Full-screen overlay with 4 tabs (`Command`, `System`, `Memory`, `Settings`). Settings tab explicitly renders `"Settings are not available in this build."`.
- `/components/SecurityDashboardModal.tsx` (1,900 lines): Multi-tab modal (Overview, Approvals, Auth & Hello, Policies, Audit Trail, Lockdown, Sessions). Contains hardcoded fallback UI strings for Windows Hello sensor when unavailable.
- `/components/UltronOrb.tsx` (1,876 lines): Three.js holographic 3D orb + MediaPipe hand-gesture tracking module (currently disconnected from primary page mount unless imported).
- `/components/TaskOrchestrationModal.tsx`, `/components/LearningEvolutionModal.tsx`, `/components/ScreenAwarenessIndicator.tsx`, `/components/MarkdownRenderer.tsx`: Subsystem overlays and Markdown rendering.

### 2.2 Backend API Surface (`/app/api/*`)
40 API route files organized into 12 functional namespaces:
1. **Authentication & Session**: `/api/auth/session`, `/api/desktop-ready`
2. **Chat & Cognition**: `/api/chat`
3. **Memory Vault**: `/api/memory`
4. **System & Dashboard**: `/api/dashboard`, `/api/computer`, `/api/permission`
5. **Security Governance (10 routes)**: `/api/security/auth`, `/api/security/access-control`, `/api/security/audit`, `/api/security/credentials`, `/api/security/emergency`, `/api/security/gateway`, `/api/security/monitoring`, `/api/security/permissions`, `/api/security/policies`, `/api/security/privacy`
6. **Voice & Audio**: `/api/transcribe`, `/api/tts`, `/api/wakeword`
7. **Screen Awareness (5 routes)**: `/api/screen/capture`, `/api/screen/context`, `/api/screen/control`, `/api/screen/diagnostics`, `/api/screen/vqa`
8. **Research Engine (12 routes)**: `/api/research`, `/api/research/{analyze,contradictions,discover,extract,freshness,memory,plan,reliability,report,safety,verify}`, `/api/research/project/[id]`
9. **Task Orchestration**: `/api/orchestration`
10. **Learning & Evolution**: `/api/learning`
11. **Game Development**: `/api/gamedev`

**Notable Missing Backend APIs (Required for Production Architecture)**:
- No `/api/models` endpoint to inspect Ollama connectivity, list available models, test latency, or dynamically switch active model/parameters.
- No `/api/settings` endpoint to persist user configuration across sessions.
- No `/api/diagnostics` endpoint to aggregate real runtime metrics, server error logs, vault health, and API connectivity diagnostics.

### 2.3 Core Domain Libraries (`/lib/*`)
- **AI / Cognitive (`/lib/cognitive/*`)**: `localModelClient.ts`, `multiModelEngine.ts`, plus reasoning, intent, and routing engines. `app/api/chat/route.ts` reads `OLLAMA_MODEL` statically at module load (`qwen2.5:7b-instruct-q4_K_M` default) instead of dynamic runtime config.
- **Security (`/lib/security/*`, `/lib/sessionGate.ts`, `/lib/crypto.ts`)**:
  - `crypto.ts`: AES-256-GCM authenticated encryption with per-record random 96-bit IVs and 128-bit auth tags; key custody via Windows DPAPI (`dpapiBridge.ts`) or `ULTRON_VAULT_KEY` environment variable, fail-closed in production.
  - `sessionGate.ts`: Loopback-only origin checks (`localhost` / `127.0.0.1`), `sec-fetch-site` cross-site blocking, HttpOnly session cookie + header validation bridged with `identityEngine.ts`.
  - `windowsHelloBridge.ts`: Native Windows Hello / biometric verification bridge; fails closed on non-Windows platforms with Zero Raw Biometric Storage Policy.
  - `vaultStorage.ts`: Cross-process atomic lockfile (`wx`) + atomic temp-file rename persistence for `.security_vault/*.json` with corruption quarantine.
  - `emergencyEngine.ts`: Independent lockdown state + session revocation + founder recovery key verification (`recoveryKey.ts`, constant-time comparison, prohibited default passphrases rejected).
- **Memory (`/lib/memoryManager.ts`, `/lib/memory/*`)**: Encrypted vault persistence in `ultron_memory_vault.json` (currently `29,096` bytes; SHA-256 `ae451defcf685e6b27a1862be871cbc7516f82013ee179f3c198e217812bf387`, matching `backups/pre_migration_safe_snapshot/ultron_memory_vault.json`).
- **Computer Intelligence (`/lib/computer/*`)**: Tool registry, safety controls (`safetyControls.ts`), Python subprocess bridge (`pythonBridge.ts`).

---

## 3. Configuration, Build & Runtime Analysis

- **`package.json`**:
  - `dev`: `next dev -p 3000 -H 127.0.0.1`
  - `build:next`: `next build`
  - `build:electron`: `electron-builder --dir`
  - `build`: `npm run build:next && npm run build:electron` (Note: `electron-builder` targets desktop packaging; in headless Linux cloud containers `next build` is the verifiable web build step).
  - `test`: Chains 4 `tsx` batteries (`test_milestone5_battery.cjs`, `test_phase2_battery.cjs`, `test_final_security_invariants.cjs`, `test_gamedev_battery.cjs`).
- **Dependencies**:
  - Runtime: `next@16.4.6`, `react@19.2.7`, `react-dom@19.2.7`, `three@0.185.1`, `@mediapipe/tasks-vision@0.10.35`.
  - Missing modern UI primitives at baseline: No icon library (`lucide-react`), no motion library (`motion`), no Tailwind CSS framework (`tailwindcss` / `@tailwindcss/postcss`), leading to Unicode icon fallbacks (`⌂`, `◌`, `◖`, `▤`) and raw inline styling.
- **Static Verification Baseline**:
  - `npx tsc --noEmit`: **PASS** (0 errors).
  - `npm run lint`: **PASS** (0 errors, 93 warnings across legacy `.cjs`/`.ts` files).
  - `python3 -m compileall -q ultron_engine`: **PASS** (exit 0).
- **Architectural Bottlenecks Identified**:
  1. **Cross-platform Python CLI crash**: `ultron_engine/computer/computer_intelligence_cli.py` unconditionally imports `desktop_engine.py`, which performs a top-level `import winreg` and `ctypes.windll.*`. On non-Windows hosts this crashes even platform-agnostic commands (`emergency_stop_status`, `os_info`), triggering fail-closed lockdown across the entire computer safety subsystem.
  2. **Monolithic UI coupling**: `UltronChat.tsx` (2,096 lines) owns chat, voice, sidebar, modal orchestration, keyboard shortcuts, and API bootstrapping, causing focus-theft bugs and unmaintainable styling.
  3. **Static AI model configuration**: Ollama model name and base URL are fixed at process start, preventing runtime model switching or connection diagnostics from the UI.
  4. **Inconsistent API authentication**: Voice routes (`/api/tts`, `/api/transcribe`, `/api/wakeword`) and select security GET routes lack session/origin guards, and `/api/learning` contains a critical RBAC escalation bug.
