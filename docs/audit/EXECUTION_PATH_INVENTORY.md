# ULTRON Execution Path & Process Inventory

This document catalogs every execution primitive, process spawn, shell invocation, and filesystem mutation across the entire ULTRON repository.

---

## 1. Process Execution Primitives

| Module | Exact Function / Call | Target Binary / Primitive | Caller / Trigger | Gateway Protected? | Vulnerability / Risk |
|---|---|---|---|---|---|
| `lib/appLauncher.ts` | `launchShortcut()`: `spawn(file, args, { detached: true })` | `.lnk` target or `.exe` | `launchAppByName()` | **Requires Gateway Token** | If invoked directly without gateway, spawns process. Must enforce gateway execution grant. |
| `lib/systemController.ts` | `getBatteryStatus()`: `exec('powershell ... Get-CimInstance ...')` | `powershell.exe` | Read-only telemetry query | **Read-Only (Exempt)** | None (Hardcoded static query, no user arguments). |
| `lib/systemController.ts` | `controlAudioVolume()`: `exec('powershell ... SendKeys(...)')` | `powershell.exe` | Media keys | **Requires Gateway Token** | Altering system volume must route through Gateway. |
| `lib/systemController.ts` | `openUrlInBrowser()`: `spawn("explorer.exe", [cleanUrl])` | `explorer.exe` | External website link | **Requires Gateway Token** | Opening external URL must route through Gateway. |
| `app/api/chat/route.ts` | `spawn("ollama", ["serve"])` | `ollama.exe` | Daemon readiness check | **Internal Daemon (Exempt)** | Hardcoded arguments, local machine health. |
| `app/api/research/route.ts` | `execFileAsync(python, [RESEARCH_SCRIPT, query])` | `python.exe` | `/api/research` | **Internal Daemon (Exempt)** | Read-only research worker; `execFile` without shell prevents injection. |
| `app/api/transcribe/route.ts` | `execFileAsync(python, [TRANSCRIBE_SCRIPT, ...])` | `python.exe` | `/api/transcribe` | **Internal Daemon (Exempt)** | Read-only audio transcription worker. |
| `app/api/tts/route.ts` | `execFile("powershell.exe", ...)` | `powershell.exe` | `/api/tts` | **Internal Audio (Exempt)** | TTS synthesis via SAPI; arguments escaped. |
| `electron/main.js` | `spawn(process.execPath, [standaloneServer], ...)` | `node.exe` | Desktop startup | **Process Lifecycle (Exempt)** | Host child process management. |
| `ultron_engine/engines/code_engineering.py` | `subprocess.run(cmd, ...)` | `pytest`, `python`, `npm`, `node` | `/engine/code_engineering/process` | **Allowlist Enforced** | Binary allowlist enforced (`python`, `pytest`, `npm`, `node`). |
| `ultron_engine/engines/code_engineering.py` | `subprocess.run(["git", "status", "--short"], ...)` | `git.exe` | `git_status` | **Read-Only (Exempt)** | Fixed arguments, read-only. |

---

## 2. Filesystem Mutation Primitives

| Module | File Operation | Target Path | Protection Mechanism |
|---|---|---|---|
| `lib/memoryManager.ts` | `fs.writeFileSync` / `fs.renameSync` | `ultron_memory_vault.json` | AES-256-GCM encrypted at rest, atomic temporary file write, rolling `.bak` backup. |
| `lib/permissionGateway.ts` | `fs.writeFileSync` | `docs/audit/GATEWAY_AUDIT_LOG.json` | Internal non-sensitive audit logging. |
| `ultron_engine/secure_vault.py` | `sqlite3` mutations | `ultron_memory.db` | Windows DPAPI protected AES-256-GCM encrypted database. |

---

## 3. Findings & Required Hardening Actions

1. **`launchAppByName` Direct Bypass:**
   `launchAppByName` in `lib/appLauncher.ts` must require a valid gateway execution grant so that no internal module can accidentally bypass the Permission Gateway.
2. **`controlAudioVolume` and `openUrlInBrowser` Direct Bypass:**
   Direct execution must require gateway verification.
3. **SessionGate User-Agent Sniffing Bypass:**
   Remove `isDirectLoopbackProcess` User-Agent sniffing completely from `lib/sessionGate.ts`.
4. **Hardcoded Fallback Secret in Memory Vault:**
   Remove static string `"STARK_VAULT_E2EE_KEY_STATIC_DERIVATION_2026"` from `lib/memoryManager.ts`. Use platform DPAPI or user-profile key derivation.
5. **Python Engine Unauthenticated Dispatch Bypass:**
   Remove `if not expected: return True` in `ultron_engine/server.py`. If secret is missing or invalid, FAIL CLOSED with HTTP 403.
