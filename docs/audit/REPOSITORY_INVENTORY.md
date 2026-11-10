# ULTRON Repository Inventory & Discovery Report

> **Audit Date**: 2026-11-09  
> **Auditors**: Principal Software Architect, Senior Application Security Engineer, Windows Desktop Engineer  
> **Status**: Completed Phase Zero Discovery

---

## 1. Executive Summary

This inventory documents all tracked files, entry points, dependencies, configurations, engines, and tests in the ULTRON repository (`https://github.com/ashish7802/ultron`).

---

## 2. Tracked File Inventory

### 2.1 Next.js Application & API Routes
| File Path | Role & Capabilities | Security / Network Exposure |
|:---|:---|:---|
| `app/layout.tsx` | Root layout, font configuration, global shell | Client-side hydration root |
| `app/page.tsx` | Main application entry point, mounts `UltronChat` (SSR disabled) | Public UI page |
| `app/globals.css` | Cyber-dark minimalist theme, custom scrollbars, modal styles | Client CSS |
| `app/api/chat/route.ts` | Natural chat, intent evaluation, app launcher, Ollama LLM, web research escalation | HTTP POST (127.0.0.1:3000), previously unauthenticated |
| `app/api/memory/route.ts` | Memory vault CRUD (`GET`, `POST`, `DELETE`, `clearAll`) | HTTP GET/POST/DELETE, previously unauthenticated |
| `app/api/research/route.ts` | Spawns `quantum_research_agent.py` for multi-vector web research | HTTP POST (127.0.0.1:3000), loopback |
| `app/api/transcribe/route.ts` | Streams audio chunks to local `voice_transcription.py` (Whisper) | HTTP POST (127.0.0.1:3000), loopback |
| `app/api/tts/route.ts` | Speech synthesis via Windows SAPI / pyttsx3 fallback | HTTP POST (127.0.0.1:3000), loopback |
| `app/api/wakeword/route.ts` | Wake-word detection state coordination | HTTP GET/POST (127.0.0.1:3000), loopback |
| `app/api/desktop-ready/route.ts` | Startup handshake verification for Electron parent | HTTP POST (127.0.0.1:3000), secret-gated |

### 2.2 Frontend UI Components
| Component Path | Functionality |
|:---|:---|
| `components/UltronChat.tsx` | ChatGPT-style interface, history drawer, zero-click auto-focus typing, neural memories modal |
| `components/MarkdownRenderer.tsx` | Pure React/TypeScript markdown parser with syntax-highlighted code blocks & copy buttons |
| `components/UltronOrb.tsx` | Legacy 3D holographic orb with Three.js particle sphere and audio visualizer |

### 2.3 Shared TypeScript Libraries (`lib/`)
| Library Path | Responsibility | Critical Risks Identified |
|:---|:---|:---|
| `lib/appLauncher.ts` | Discovers Start Menu shortcuts; launches apps via `spawn` | Unauthenticated execution; no permission gateway |
| `lib/systemController.ts` | Laptop hardware telemetry (battery, RAM, CPU), audio volume, browser URLs | Spawns PowerShell and `explorer.exe` without confirmation |
| `lib/memoryManager.ts` | Persistent memory vault management (`ultron_memory_vault.json`) | Plaintext storage at rest; no encryption; IDOR risk |
| `lib/crypto.ts` | AES-256-GCM transport sealing and Web Crypto helpers | Hardcoded `DEFAULT_KEY_STRING` in production source |
| `lib/knowledgeEngine.ts` | Deterministic fallback knowledge synthesis | Read-only static knowledge base |
| `lib/pythonRuntime.ts` | Spawns Python scripts with virtual environment auto-detection | Subprocess invocation |
| `lib/audioUpload.ts` | Bounded streaming audio reader | Memory-capped streaming reader |
| `lib/responseDecisionEngine.ts` | Intent classification, follow-up windows, confirmation gate | Incomplete action gate; keywords bypassed in text chat |
| `lib/listeningStateMachine.ts` | Audio state machine for voice turns | State coordinator |
| `lib/audioProcessor.ts` | Audio resampling and RMS calculation | DSP math |
| `lib/conversationManager.ts` | Conversation history caching | Ephemeral state |
| `lib/handTracker.ts` | MediaPipe vision hand landmark tracking | Client-side WebAssembly |
| `lib/orbScene.ts` | Three.js particle shaders and 3D rendering | Client WebGL |

### 2.4 Electron Desktop Layer (`electron/`)
| File Path | Role | Security Evaluation |
|:---|:---|:---|
| `electron/main.js` | Main process: port scanning, Next.js child process spawning, BrowserWindow creation | Context isolation enabled, node integration disabled, loopback locked |
| `electron/preload.js` | Context bridge exposing `ultronAPI.getVersion()` and `getPath()` | Safe minimal allowlist |
| `electron/serverStartup.js` | Startup challenge-response handshake with child server | Secret-verified startup |

### 2.5 Python Backend Subsystem (`ultron_engine/`)
| Module Path | Role | Security / Architectural Evaluation |
|:---|:---|:---|
| `ultron_engine/server.py` | FastAPI HTTP service exposing engine orchestrator | Unauthenticated HTTP endpoints (`/dispatch`, `/process`) |
| `ultron_engine/secure_vault.py` | Windows DPAPI master key storage (`vault.bin`), PBKDF2 recovery | OS-bound key management; verified working |
| `ultron_engine/crypto.py` | AES-256-GCM authenticated encryption and blind indexing | Backed by DPAPI vault; verified working |
| `ultron_engine/intruder_defense.py` | Intruder lockout, cooldown, tamper tracking | Not integrated into Next.js HTTP entry points |
| `ultron_engine/windows_hello.py` | Windows Hello biometric consent verification via WinRT | Genuine hardware detection verified |
| `ultron_engine/quantum_research_agent.py` | Multi-vector web search (DDGS), HTML scraping, synthesis | Untrusted web data in prompt; hardcoded 0.99 confidence |
| `ultron_engine/voice_transcription.py` | Local faster-whisper speech recognition | Subprocess-executable script |
| `ultron_engine/registry.py` | Dependency injection & orchestrator construction | Instantiates all 30 engines |
| `ultron_engine/core.py` | BaseEngine, EventBus, SharedState abstractions | Concurrency and event bus layer |
| `ultron_engine/engines/*` (30 engines) | Domain engines: memory, security, execution, code_engineering, etc. | Simulated/stub implementations; execution engine has weak confirmation checks |

### 2.6 Persistence & Data Files
| File Path | Format | Status & Data Integrity Guarantee |
|:---|:---|:---|
| `ultron_memory_vault.json` | JSON (Plaintext) | Active user profile ("Ashish") and facts. Must be preserved & encrypted! |
| `ultron_engine/secure_vault/vault.bin` | Binary (DPAPI protected) | Windows DPAPI wrapped master encryption key. |
| `ultron_engine/secure_vault/recovery_manifest.json` | JSON | PBKDF2 recovery backup manifest. |
| `ultron_memory.db` | SQLite (Encrypted rows) | Research dossiers and episodic memory records. |

### 2.7 Test Suites
| Test File | Type | Target |
|:---|:---|:---|
| `tests_core.py` | Unit / Engine | Core orchestrator and event bus |
| `tests_encryption.py` | Crypto unit | AES-256-GCM and blind indexing |
| `tests_zero_trust.py` | Security integration | Windows DPAPI, zero-trust memory, tamper rejection |
| `tests_adversarial_security.py` | Adversarial security | Tampering, malformed envelopes, unauthenticated access |
| `tests_native_windows_hello.py` | Windows Hardware | Biometric hardware and Windows Hello runtime |
| `tests_quantum_research.py` | Integration | SSRF prevention, multi-vector search, domain credibility |
| `tests_ssrf_dns_pinning.py` | Security unit | DNS pinning and private IP rejection |
| `tests_voice_transcription.py` | Unit | Speech audio decoding and transcription |
| `tests_complete_voice_pipeline.py` | E2E voice | Voice pipeline latency and hardware checks |
| `tests_interaction.py` | Integration | Conversation interaction |
| `tests_intruder_defense.py` | Security unit | Intruder lockout and cooldown |
| `tests_audit_regressions.py` | Regression | Vault tampering, length checks, CORS origins |
| `tests_audio_upload.test.mjs` | Node integration | Bounded stream reader limits |
| `tests_electron_startup.test.mjs` | Node integration | Server readiness challenge-response |
