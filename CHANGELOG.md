# Changelog

All notable engineering, security, architecture, and UI/UX changes completed during the ULTRON repository overhaul.

---

## [Overhaul 2026-11-18] — Complete Engineering Repair, Security Hardening & 9-Surface UI/UX Redesign

### Added
- **Unified AI Operating Environment (`components/UltronWorkspace.tsx`)**: Full dark-mode operating shell with 248px desktop rail, mobile slide-over drawer, 56px glass top bar, Emergency Lockdown alert banner, `motion/react` view transitions, and top-right non-blocking toast stack.
- **All 9 Dedicated Operational Views (`components/views/`)**:
  - `CommandCenterView.tsx` (Command Center & English/Hinglish quick launcher)
  - `ChatView.tsx` (AI Chat with local history sidebar, edit/regenerate/copy, markdown/code blocks, inline approvals, abort control)
  - `VoiceView.tsx` (Voice Studio with real microphone permission checks, `MediaRecorder` → `/api/transcribe`, Web Audio `AnalyserNode` meter, TTS output & interrupt)
  - `MemoryCenterView.tsx` (Encrypted Memory Center with search, category filter, CRUD, and verified on-disk AES-256-GCM status)
  - `SystemControlView.tsx` (Real CPU/RAM/Storage/OS/Uptime telemetry, explicit `Unavailable` labels for unsupported GPU/window sensors, Task Orchestration planner)
  - `ModelManagerView.tsx` (Ollama connectivity probe, model listing & switching, validated runtime config form)
  - `SecurityCenterView.tsx` (Truthful Windows Hello & DPAPI attestation, Approvals, Policies, HMAC-SHA256 Audit Chain verification, Emergency Lockdown/Recovery, Sessions)
  - `SettingsCenterView.tsx` (Complete 9-section persisted settings center replacing legacy dead stub)
  - `DiagnosticsView.tsx` (Live Node runtime metrics, 7-endpoint API probe runner, secret-redacted server log viewer, JSON diagnostic export)
- **Backend Infrastructure & APIs**:
  - `lib/runtimeConfig.ts` — Atomic persisted 9-section config store (`.ultron_config/settings.json`) with loopback-only SSRF validation (`validateLoopbackEndpoint`) and immutable `strictLoopbackOnly: true`.
  - `lib/diagnosticsLog.ts` — Bounded 250-entry secret-redacting in-memory diagnostic log buffer.
  - `app/api/models/route.ts`, `app/api/settings/route.ts`, `app/api/diagnostics/route.ts` — Session-gated REST endpoints.
  - `postcss.config.mjs` — Tailwind CSS v4 PostCSS pipeline (`@tailwindcss/postcss`).
- **Automated Regression & Contract Tests**:
  - `tests_ollama_contract.test.ts` — 6 controlled mock HTTP contract tests for `localModelClient.ts`.
  - `tests_runtime_config_and_security.test.ts` — 6 unit/security regression tests (SSRF guard, schema bounds, secret redaction, `/api/learning` RBAC, Synaptics UI honesty, byte-identical memory vault).
- **Phase 1 & Phase 9 Engineering Reports**:
  - Phase 1: `REPOSITORY_ARCHITECTURE_REPORT.md`, `FEATURE_IMPLEMENTATION_AUDIT.md`, `BUG_AND_ERROR_REGISTER.md`, `SECURITY_FINDINGS.md`, `UI_UX_AUDIT.md`.
  - Phase 9: `FINAL_ENGINEERING_AUDIT.md`, `UI_UX_REDESIGN_REPORT.md`, `BUG_REMEDIATION_REPORT.md`, `SECURITY_REASSESSMENT.md`, `TEST_EXECUTION_REPORT.md`, `LOCAL_OLLAMA_VERIFICATION.md`, `PRODUCTION_READINESS_REPORT.md`.

### Security
- **CRITICAL (`app/api/learning/route.ts`)**: Fixed privilege escalation where `isLearningAuthorized()` hardcoded `"founder"` role for any desktop session; now enforces actual `desktopVal.session?.userRole || "operator"`.
- **HIGH (`app/api/tts/route.ts`, `app/api/transcribe/route.ts`, `app/api/wakeword/route.ts`)**: Added `validateDesktopSession(req)` loopback/session authentication gates across all methods.
- **HIGH (`components/SecurityDashboardModal.tsx`, `components/views/SecurityCenterView.tsx`)**: Removed all fabricated `"Synaptics VFS7552 Touch Sensor"` / `"Available"` biometric fallback strings.
- **MEDIUM (`app/api/security/auth/route.ts`, `emergency/route.ts`, `policies/route.ts`)**: Restricted detailed `activeSessions` array to authenticated sessions only, added `authenticationLevel` field, and added loopback `Origin` / `Sec-Fetch-Site` checks to GET handlers.

### Fixed
- **Cross-Platform Python CLI (`ultron_engine/computer/desktop_engine.py`, `input_driver.py`, `computer_intelligence_cli.py`)**: Guarded Windows-only `winreg`, `wintypes`, and `ctypes.windll.*` imports on non-Windows hosts; restored 100% pass rate on `scripts/test_milestone5_battery.cjs`.
- **Portable Python Resolution (`lib/screen/screenCaptureEngine.ts`)**: Replaced hardcoded `"python"` with `resolvePythonExecutable()`.
- **Dynamic Runtime AI Config (`app/api/chat/route.ts`, `app/api/dashboard/route.ts`)**: Replaced hardcoded env reads with `getActiveAiConfig()`.
- **Read-Only On-Disk Vault Encryption Verification (`lib/crypto.ts`)**: Updated `getCryptoStatus()` to verify the actual AES-256-GCM JSON envelope (`encrypted`, `iv`, `tag`, `ciphertext`) on disk without mutating `ultron_memory_vault.json`.
- **Zero Browser Console Errors (`CommandCenterView.tsx`, `SecurityCenterView.tsx`)**: Gated identity-only security fetches behind `authenticated` status and fixed approvals endpoint to `/api/security/permissions`, eliminating all 401/405 console errors.
