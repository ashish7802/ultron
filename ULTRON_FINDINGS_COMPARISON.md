# ULTRON — Findings Comparison Matrix

## Overview

This report provides a side-by-side comparison between the initial audit findings and our independent verification conducted at commit `fbd89a672e71a405e9eeae5f6863ac4248ea3760` on branch `main`.

---

## 1. Summary Comparison Table

| Finding ID | Title | Previous Finding Claim | Independent Verification Result | Previous Severity | Verified Severity | Agreement Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | Windows Hello / Biometric Bypass | `/api/auth/session` dispenses sessions without biometric check; chat accepts it. | Confirmed: `getOrCreatePrimarySessionToken()` bypasses biometrics entirely; chat connects directly. | High | **High** | **CONFIRMED** |
| **F-02** | Frontend/Backend Approval Mismatch | UI sends `decision: "approve"`, backend expects `action: "approve"` & `approvalToken`. | Confirmed: Broken contract causes 100% rejection of UI approvals and rejections. | High | **High** | **CONFIRMED** |
| **F-03** | File Write Approval Bypass | `write_file` is medium risk; approval only checks high/critical/shell/delete. | Confirmed: Files overwritten without approval via `write_file` with default `overwrite: true`. | High | **High** | **CONFIRMED** |
| **F-04** | False-Success in Permission Gateway | `executeApprovedAction()` treats resolved promises as success even with `{ success: false }`. | Confirmed: Gateway logs `executionSuccess: true` and sets `plan.status = "executed"` on failed results. | High | **High** | **CONFIRMED** |
| **F-05** | Orchestrator Synthetic Success Fallback | `_defaultTaskExecutor()` runs `Get-Date` and returns synthetic success for unhandled tasks. | Confirmed: Fallback Step 5 runs `Get-Date` and fabricates `exitCode: 0`, passing verification. | High | **High** | **CONFIRMED** |
| **F-06** | Actual DPAPI vs Reported Metadata | Node credential engine sets `isDPAPIProtected = win32` but uses software AES with plaintext master key. | Confirmed: No DPAPI is called in Node; `.vault_key` is plaintext on disk. | High | **High** | **CONFIRMED** |
| **F-07** | Electron `userData` Path Consistency | `ULTRON_USER_DATA_DIR` set by Electron is ignored by modules using `process.cwd()`. | Confirmed: All persistence modules use `process.cwd()`, failing in packaged production paths. | High | **High** | **CONFIRMED** |
| **F-08** | Static Legacy Encryption Secrets | Hardcoded legacy keys remain active for decryption fallback. | Confirmed: Hardcoded static secrets decrypt legacy vaults and envelopes. | Medium | **Medium** | **CONFIRMED** |
| **F-09** | Session Registry Synchronization | Asymmetric validation and missing cross-module session revocation. | Confirmed: `identityEngine` never checks `sessionGate`; tokens created by `sessionGate` fail on security routes. | High | **High** | **CONFIRMED** |
| **F-10** | Emergency Lockdown Authorization | Missing session allows anonymous lockdown triggering on `/api/security/emergency`. | Partially Confirmed: Allows unauthenticated loopback DoS, though external cross-origin web CSRF is blocked. | High | **Medium** | **PARTIALLY CONFIRMED** |
| **F-11** | Permission Approval Role Enforcement | `GET` checks founder/admin, but `POST` only checks valid session without role verification. | Confirmed: `POST` allows any authenticated user role to approve or cancel actions. | High | **High** | **CONFIRMED** |
| **F-12** | M5 Integration-Test Coverage | M5 test batteries test internal class methods, not full UI/API/OS paths. | Confirmed: Tests bypassed HTTP APIs, evaluated local JS expressions, and only enumerated biometrics. | Medium | **Medium** | **CONFIRMED** |
| **F-13** | CI and Automated Test Enforcement | No standard test script in `package.json` and no GitHub Actions workflow. | Confirmed: No `.github/` folder and no test/typecheck scripts in `package.json`. | Medium | **Medium** | **CONFIRMED** |
| **F-14** | Remediation Report Commit Inconsistencies | Progress tracker and M5 report reference mismatched commit hashes. | Confirmed: `ULTRON_REMEDIATION_PROGRESS.md` lists `9bb76cb` while actual commit was amended to `18276c5`. | Low | **Low** | **CONFIRMED** |
| **F-15 (New)** | App Launch Approval Bypass | Tool registry registers `launch_application` as medium risk, bypassing `appLauncher.ts`. | Discovered: Direct execution launches apps via Python bridge with zero user approval. | N/A | **High** | **NEWLY IDENTIFIED** |
| **F-16 (New)** | Plaintext Founder Recovery Key | Recovery key stored in plaintext at `.security_vault/recovery.key`. | Discovered: File permissions `0o600` are ignored on Windows NTFS, exposing master recovery key. | N/A | **High** | **NEWLY IDENTIFIED** |
| **F-17 (New)** | Plaintext Master Encryption Key | Dynamic master key stored in plaintext at `.vault_key`. | Discovered: Any local process can read `.vault_key` and decrypt the entire credentials vault. | N/A | **High** | **NEWLY IDENTIFIED** |

---

## 2. Detailed Finding-by-Finding Comparison

### F-01: Windows Hello / Biometric Authentication Bypass
- **Previous Auditor's Position:** Application startup initializes a session through `/api/auth/session` without biometrics, and chat accepts it through `validateDesktopSession()`.
- **Independent Result:** Fully verified. `getOrCreatePrimarySessionToken()` in `lib/sessionGate.ts` generates a 32-byte hex string and stores it in `activeSessions` with zero biometric checks. `components/UltronChat.tsx` calls this on mount and sets `isSessionReady(true)`. Chat requests pass `validateDesktopSession()`.
- **Severity Assessment:** Agreement (High).

### F-02: Frontend & Backend Approval Contract Mismatch
- **Previous Auditor's Position:** Frontend sends `decision: "approve"`, backend expects `action: "approve"` and `approvalToken`. Response structures are mismatched.
- **Independent Result:** Fully verified. `UltronChat.tsx` lines 587-593 send `{ planId, decision: "approve" }`. `app/api/permission/route.ts` line 98 extracts `{ action, planId, approvalToken }` and rejects missing `action` with HTTP 400. Rejection flow sends `decision: "deny"` while backend expects `"reject"`.
- **Severity Assessment:** Agreement (High).

### F-03: File Write Approval Bypass
- **Previous Auditor's Position:** `write_file` is medium risk and bypasses approval; overwrite behavior is unrestricted.
- **Independent Result:** Fully verified. `lib/computer/toolRegistry.ts` line 200 checks only `high`, `critical`, `shell_exec`, and `file_delete`. `write_file` executes directly with `overwrite: true` defaulted, overwriting existing files without user approval.
- **Severity Assessment:** Agreement (High).

### F-04: False-Success in Permission Gateway
- **Previous Auditor's Position:** `executeApprovedAction()` treats any resolved executor promise as success even when returning `{ success: false }`.
- **Independent Result:** Fully verified. `executeApprovedAction()` in `lib/permissionGateway.ts` marks `plan.status = "executed"`, logs `executionSuccess = true`, and returns `{ success: true, result }` whenever `executor()` does not throw an exception.
- **Severity Assessment:** Agreement (High).

### F-05: Orchestrator Synthetic Success Fallback
- **Previous Auditor's Position:** `_defaultTaskExecutor()` runs `Get-Date -Format o` as a fallback and fabricates success without completing the task.
- **Independent Result:** Fully verified. Step 5 of `_defaultTaskExecutor()` runs `Get-Date -Format o`, returns `exitCode: 0`, and `taskVerificationEngine.ts` marks the task verified if criteria are empty or match the exit code.
- **Severity Assessment:** Agreement (High).

### F-06: Actual DPAPI Protection vs Reported Metadata
- **Previous Auditor's Position:** Metadata reports `isDPAPIProtected: true` on Windows, but Node uses software AES-GCM with a separate plaintext master key.
- **Independent Result:** Fully verified. `credentialEngine.ts` sets `isDPAPIProtected: process.platform === "win32"` without calling Win32 DPAPI. The master key is stored in plaintext at `.vault_key`.
- **Severity Assessment:** Agreement (High).

### F-07: Electron `userData` Path Consistency
- **Previous Auditor's Position:** `ULTRON_USER_DATA_DIR` is set by Electron, but persistence modules use `process.cwd()`.
- **Independent Result:** Fully verified. `memoryManager.ts`, `recoveryKey.ts`, `credentialEngine.ts`, and `emergencyEngine.ts` hardcode `process.cwd()`. In a packaged Windows application, writes to `process.cwd()` fail.
- **Severity Assessment:** Agreement (High).

### F-08: Static Legacy Encryption Secrets
- **Previous Auditor's Position:** Legacy static secrets remain active in source code for decryption/migration.
- **Independent Result:** Fully verified. `STARK_ULTRON_MARK_LXXXV_OMEGA_SEC_256BIT_KEY` in `crypto.ts` and `STARK_VAULT_E2EE_KEY_STATIC_DERIVATION_2026` in `memoryManager.ts` remain active as decryption fallbacks.
- **Severity Assessment:** Agreement (Medium).

### F-09: Session Registry Synchronization
- **Previous Auditor's Position:** Asymmetric validation between `sessionGate` and `identityEngine`.
- **Independent Result:** Fully verified. `sessionGate` falls back to `identityEngine`, but `identityEngine` never checks `sessionGate`. Tokens dispensed by `/api/auth/session` fail on `identityEngine`-protected routes. Revocations do not cross-propagate.
- **Severity Assessment:** Agreement (High).

### F-10: Emergency Lockdown Authorization
- **Previous Auditor's Position:** Anonymous requests can trigger global lockdown and session revocation.
- **Independent Result:** Partially confirmed. Unauthenticated loopback requests can trigger lockdown; however, cross-origin web CSRF is blocked via `Sec-Fetch-Site` checks. The issue is an unauthenticated local DoS rather than a remote attack.
- **Severity Assessment:** Reduced from High to **Medium**.

### F-11: Permission Approval Role Enforcement
- **Previous Auditor's Position:** `GET` checks founder/admin, but `POST` does not enforce roles on approval.
- **Independent Result:** Fully verified. `POST /api/security/permissions` only requires `auth.isValid`. `approveRequest` in `permissionEngine.ts` does not check the role of `decidedByActor`.
- **Severity Assessment:** Agreement (High).

### F-12: M5 Integration-Test Coverage Overstatement
- **Previous Auditor's Position:** M5 tests ran internal functions directly rather than full UI-to-API-to-OS paths.
- **Independent Result:** Fully verified. `test_milestone5_battery.cjs` and `test_milestone5_extended.cjs` called TypeScript functions in isolation, never made HTTP requests to `/api/permission`, and evaluated inline JS variables for anti-poisoning checks.
- **Severity Assessment:** Agreement (Medium).

### F-13: CI and Automated Test Enforcement
- **Previous Auditor's Position:** No CI workflow or test script in `package.json`.
- **Independent Result:** Fully verified. `.github/` does not exist; `package.json` lacks `test` and `typecheck` scripts.
- **Severity Assessment:** Agreement (Medium).

### F-14: Remediation Report Commit Inconsistencies
- **Previous Auditor's Position:** Reports reference mismatched commit SHAs.
- **Independent Result:** Fully verified. `ULTRON_REMEDIATION_PROGRESS.md` lists `9bb76cb` while Git history has `18276c5` (amended) and `fbd89a6` (merge). M5 reports list Head SHA as `892cf8c`.
- **Severity Assessment:** Agreement (Low).
