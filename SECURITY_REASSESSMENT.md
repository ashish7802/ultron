# ULTRON — Security Reassessment Report

**Assessment Date:** 2026-11-18  
**Scope:** Re-verification of all Phase 1 security findings (`SECURITY_FINDINGS.md`), newly added API endpoints (`/api/models`, `/api/settings`, `/api/diagnostics`), cryptographic vault integrity, and fail-closed hardware invariants.

---

## 1. Security Finding Remediation Matrix

| Finding ID | Severity | Vulnerability Description | Remediation Applied | Current Status |
|---|---|---|---|---|
| **SEC-001** | **CRITICAL** | Privilege escalation in `app/api/learning/route.ts`: desktop sessions were unconditionally granted `actorRole: "founder"`. | Fixed `isLearningAuthorized()` to derive `actorRole` strictly from `desktopVal.session?.userRole \|\| "operator"`. | **REMEDIATED & VERIFIED** (`tests_runtime_config_and_security.test.ts`) |
| **SEC-002** | **HIGH** | Unauthenticated voice routes (`/api/tts`, `/api/transcribe`, `/api/wakeword`) lacked session & origin validation. | Enforced `validateDesktopSession(req)` + `createAuthErrorResponse()` on all HTTP methods in all three routes. | **REMEDIATED & VERIFIED** (`tests_audio_upload.test.mjs`) |
| **SEC-003** | **HIGH** | Misleading biometric hardware security indicator (`Synaptics VFS7552 Touch Sensor` / `Available` fallback) in `SecurityDashboardModal.tsx`. | Removed all fabricated biometric strings across both legacy modal and redesigned `SecurityCenterView.tsx`. Reports `Unavailable on Host` when `windowsHelloBridge.ts` cannot verify OS hardware. | **REMEDIATED & VERIFIED** (unit test + Playwright Round 1 & 2) |
| **SEC-004** | **MEDIUM** | Information disclosure & CSRF exposure on GET handlers (`/api/security/auth` leaking `activeSessions`; `/api/security/emergency` & `/api/security/policies` missing origin/fetch-site guards). | Restricted `activeSessions` exclusively to authenticated callers; enforced loopback `Origin` & `Sec-Fetch-Site !== "cross-site"` checks on GET routes. | **REMEDIATED & VERIFIED** |
| **SEC-005** *(New Attack Surface)* | **HIGH (Prevented)** | Potential SSRF via user-configurable Ollama endpoint in Settings / Model Manager. | Enforced `validateLoopbackEndpoint()` in `lib/runtimeConfig.ts`, rejecting non-`http:`/`https:` schemes and any host outside `localhost`, `127.0.0.1`, `[::1]`. Locked `strictLoopbackOnly: true` immutably. | **HARDENED & VERIFIED** (`tests_runtime_config_and_security.test.ts`) |
| **SEC-006** *(New Attack Surface)* | **MEDIUM (Prevented)** | Secret leakage into Developer & Diagnostics log buffer / JSON export. | Built `redactDiagnosticText()` in `lib/diagnosticsLog.ts` to redact Bearer tokens, `sk-*` keys, session tokens, recovery keys, and passwords before storage or return. | **HARDENED & VERIFIED** (`tests_runtime_config_and_security.test.ts`) |

---

## 2. Preserved Security Invariants

None of ULTRON's foundational security controls were weakened during the overhaul:

1. **AES-256-GCM Memory Vault**: `ultron_memory_vault.json` remains byte-identical (`29,096` bytes, SHA-256 `ae451defcf685e6b27a1862be871cbc7516f82013ee179f3c198e217812bf387`, matching `backups/pre_migration_safe_snapshot/ultron_memory_vault.json`). `getCryptoStatus()` now verifies the on-disk v2 JSON envelope (`encrypted`, `iv`, `tag`, `ciphertext`) read-only before reporting active encryption.
2. **Zero Raw Biometric Storage Policy**: Enforced and displayed truthfully (`0` raw templates stored).
3. **Fail-Closed Permission Gateway & Emergency Lockdown**: `/api/security/monitoring`, `/api/security/audit`, `/api/security/permissions`, `/api/security/gateway`, and `/api/security/emergency` retain full fail-closed authentication and Founder recovery key enforcement.
4. **Tamper-Evident Audit Chain**: Verified via live HMAC-SHA256 verification (`Verify Cryptographic Chain` in Security Center & Diagnostics).
5. **Isolated Configuration Persistence**: Persisted user settings are stored atomically in `.ultron_config/settings.json`, completely separate from `ultron_memory_vault.json` and `.security_vault`.

---

## 3. Security Controls Pending Local Windows Verification (`NOT VERIFIED IN CLOUD`)

- **Windows DPAPI Key Custody** (`lib/security/dpapiBridge.ts` + `.vault_key.dpapi` roundtrip unprotect on Windows).
- **Windows Hello `UserConsentVerifier`** real biometric challenge/response flow.
- **Packaged Electron Production Mode** fail-closed missing-key enforcement (`ULTRON_USER_DATA_DIR` + packaged executable).
