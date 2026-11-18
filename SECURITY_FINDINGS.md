# ULTRON Security Findings Report (Phase 1 Baseline Audit)

**Security Posture Baseline**: ULTRON implements a strong cryptographic and fail-closed security foundation (AES-256-GCM memory vault encryption, Windows DPAPI key custody, Windows Hello native verification bridge, Zero Raw Biometric Storage Policy, HMAC-SHA256 tamper-evident audit chain, single-use permission grants, and Emergency Lockdown). However, this audit identified **5 actionable vulnerabilities/gaps** in API authorization boundaries and UI honesty that must be remediated without weakening any existing security invariants.

---

## Findings Summary

| ID | Severity | Area | Finding | Impact |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-001** | **CRITICAL** | `/app/api/learning/route.ts` | **Founder Role Privilege Escalation**: `isLearningAuthorized()` accepts any valid `operator` desktop session cookie (`CHAT_AUTHENTICATED`) and returns `{ authorized: true, role: "founder" }`. | Any standard operator session (issued automatically on localhost page load) can approve, activate, or rollback AI learning evolutions intended exclusively for Founder authorization. |
| **SEC-002** | **HIGH** | `/app/api/tts/route.ts`, `/app/api/transcribe/route.ts`, `/app/api/wakeword/route.ts` | **Unauthenticated Subprocess & I/O Endpoints**: None of the three voice API routes call `validateDesktopSession()` or verify loopback `Origin`/`Sec-Fetch-Site`. | Local cross-site requests from untrusted browser tabs can invoke `/api/tts` (spawning PowerShell on Windows), `/api/transcribe` (writing temp files and spawning Python), or mutate wakeword state. |
| **SEC-003** | **HIGH** | `/components/SecurityDashboardModal.tsx` | **Fabricated Biometric Hardware Status**: Lines 820–833 render hardcoded `"Synaptics VFS7552 Touch Sensor"`, `"Available"`, and `1 fingerprint(s)` when backend Windows Hello status is null or unavailable. | Misleads operators into believing biometric protection and hardware sensors are active when they are absent or unsupported. Violates fail-closed honesty invariants. |
| **SEC-004** | **MEDIUM** | `/app/api/security/auth/route.ts`, `/app/api/security/emergency/route.ts`, `/app/api/security/policies/route.ts` | **Unauthenticated Metadata Disclosure**: `GET /api/security/auth` exposes `activeSessions` (`sessionId`, `deviceId`, `userId`, roles) to unauthenticated callers; `GET /api/security/emergency` and `GET /api/security/policies` lack loopback origin checks. | Enables local metadata enumeration of active desktop sessions and security policy configuration without session authentication. |
| **SEC-005** | **MEDIUM** | AI Model Configuration (Planned `/api/models`) | **Potential SSRF Risk on Configurable Ollama Endpoint**: Allowing arbitrary user-supplied URLs for the Ollama backend could turn the server into an SSRF proxy. | Any runtime model endpoint configuration MUST strictly restrict allowed hosts to loopback (`127.0.0.1`, `localhost`, `[::1]`) and `http:`/`https:` schemes with bounded timeouts. |

---

## Preserved Security Invariants (Verified Intact at Baseline)

The following controls were inspected and verified intact and MUST NOT be weakened during remediation:
1. **AES-256-GCM Memory Encryption (`/lib/crypto.ts`)**: Authenticated encryption with random 96-bit IVs and 128-bit tags. Fail-closed key resolution.
2. **Windows DPAPI Key Custody (`/lib/security/dpapiBridge.ts`)**: Stdin-only secret transport (no CLI secret arguments); fails closed on non-Windows (`NOT VERIFIED IN CLOUD` for live DPAPI round-trip).
3. **Windows Hello & Zero Raw Biometric Storage (`/lib/security/windowsHelloBridge.ts`, `/lib/security/identityEngine.ts`)**: Challenges expire and enforce anti-replay; zero raw biometric templates stored. Live Windows Hello verification is `NOT VERIFIED IN CLOUD`.
4. **Immutable Founder Recovery Key Verification (`/lib/security/recoveryKey.ts`)**: Constant-time comparison; known default passphrases (`FOUNDER_RECOVERY_OVERRIDE_KEY`, `TEST_RECOVERY_KEY_ULTRON_FOUNDER`, empty) are unconditionally rejected.
5. **Emergency Lockdown & Session Revocation (`/lib/security/emergencyEngine.ts`, `/lib/computer/safetyControls.ts`)**: Independent disk lockfile + vault JSON + synchronized revocation across `identityEngine` and `sessionGate`.
6. **Memory Vault Preservation (`/ultron_memory_vault.json`)**: Existing encrypted vault (`29,096` bytes, identical to `/backups/pre_migration_safe_snapshot/ultron_memory_vault.json`) must remain preserved and uncorrupted.
7. **Electron Renderer Sandbox (`/electron/main.js`)**: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, explicit permission handler, HMAC startup handshake (`/api/desktop-ready`).
