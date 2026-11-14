# ULTRON Audit Evidence Index

**Repository:** `https://github.com/ashish7802/ultron`  
**Working Branch:** `fix/phase1-security-invariants`  
**Audit Baseline Commit:** `fbd89a672e71a405e9eeae5f6863ac4248ea3760`  
**Date:** 2026-11-14

---

## 1. Master Evidence Index

| Evidence ID | Finding ID | Target Source File | Relevant Lines | Test Script / Command | Actual Result | Related Report Section |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **EVD-01-A** | F-01 | `app/api/auth/session/route.ts` | 38–72 | `curl -s http://localhost:3000/api/auth/session` | Issues valid desktop session token without Windows Hello prompt | Master Audit § F-01 |
| **EVD-01-B** | F-01 | `lib/sessionGate.ts` | 74–107, 309–311 | Node eval `getOrCreatePrimarySessionToken()` | Issues 32-byte session token with 24-hr TTL without biometric verification | Master Audit § F-01 |
| **EVD-01-C** | F-01 | `app/api/security/auth/route.ts` | 115–135 | Node integration test | Windows Hello required ONLY on `/api/security/auth` "login" endpoint | Master Audit § F-01 |
| **EVD-02-A** | F-02 | `components/UltronChat.tsx` | 583–596 | `test_phase1_battery.cjs` Test 13 | UI passes `approvalToken` and `action: "approve"` | Master Audit § F-02 |
| **EVD-02-B** | F-02 | `app/api/permission/route.ts` | 99–115 | `test_phase1_battery.cjs` Test 14 | Rejection clears tokens, invalidates plan | Master Audit § F-02 |
| **EVD-02-C** | F-02 | `app/api/permission/route.ts` | 115–165 | `test_phase1_battery.cjs` Test 15 | Valid approval returns unified payload; missing token returns HTTP 400 | Master Audit § F-02 |
| **EVD-03-A** | F-03 | `lib/computer/toolRegistry.ts` | 211–223 | `test_phase1_1_adversarial.cjs` Test 1 | `write_file` on existing file gates with `requiresPlan: true` | Master Audit § F-03 |
| **EVD-03-B** | F-03 | `ultron_engine/computer/filesystem_driver.py` | 473–485 | `test_phase1_1_adversarial.cjs` Test 2 | Overwrite without grant returns `"Missing cryptographic execution grant token"` | Master Audit § F-03 |
| **EVD-03-C** | F-03 | `ultron_engine/computer/filesystem_driver.py` | 100–165 | `test_phase1_1_adversarial.cjs` Test 4 | Forged HMAC signature rejected; path mismatch rejected | Master Audit § F-03 |
| **EVD-03-D** | F-03 | `ultron_engine/computer/filesystem_driver.py` | 65–95 | `test_phase1_1_adversarial.cjs` Test 8 | Replay of consumed grant token rejected fail-closed via nonce log | Master Audit § F-03 |
| **EVD-04-A** | F-04 | `lib/permissionGateway.ts` | 425–455 | `test_phase1_battery.cjs` Test 1 | Resolved Promise with `{ success: false }` caught, marks status `"failed"` | Master Audit § F-04 |
| **EVD-04-B** | F-04 | `lib/permissionGateway.ts` | 438–442 | `test_phase1_battery.cjs` Test 4 | Non-zero `exitCode` caught, marks status `"failed"` | Master Audit § F-04 |
| **EVD-04-C** | F-04 | `lib/permissionGateway.ts` | 458–462 | `test_phase1_battery.cjs` Test 3 | Thrown exception caught, marks status `"failed"` | Master Audit § F-04 |
| **EVD-05-A** | F-05 | `lib/orchestration/taskVerificationEngine.ts` | 130–245 | `test_milestone5_battery.cjs` Group 5 | Missing exit code rejected with `isVerified: false` | Master Audit § F-05 |
| **EVD-05-B** | F-05 | `lib/orchestration/taskVerificationEngine.ts` | 200–220 | `test_milestone5_battery.cjs` Group 5 | Empty file on disk rejected with `isVerified: false` | Master Audit § F-05 |
| **EVD-06-A** | F-06 | `lib/crypto.ts` | 55–82 | File inspection | `.vault_key` contains 64-char plaintext hex string in project directory | Master Audit § F-06 |
| **EVD-06-B** | F-06 | `ultron_engine/secure_vault.py` | 130–170 | Python inspection | Python engine uses DPAPI (`win32crypt.CryptProtectData`); TS uses raw file | Master Audit § F-06 |
| **EVD-07-A** | F-07 | `electron/main.js` | 127–145 | Code review | Electron sets `ULTRON_USER_DATA_DIR = app.getPath("userData")` | Master Audit § F-07 |
| **EVD-07-B** | F-07 | `lib/security/recoveryKey.ts` | 42–46 | Code review | `process.cwd()` is used directly; ignores `ULTRON_USER_DATA_DIR` | Master Audit § F-07 |
| **EVD-08-A** | F-08 | `lib/crypto.ts` | 24 | Source code grep | `LEGACY_MIGRATION_KEY = "STARK_ULTRON_MARK_LXXXV_OMEGA_SEC_256BIT_KEY"` | Master Audit § F-08 |
| **EVD-08-B** | F-08 | `lib/memory/securityEngine.ts` | 27 | Source code grep | `_legacySecret = "STARK_VAULT_E2EE_KEY_STATIC_DERIVATION_2026"` | Master Audit § F-08 |
| **EVD-09-A** | F-09 | `lib/sessionGate.ts` | 335–350 | `test_milestone5_battery.cjs` Group 2 | `validateDesktopSession` synchronizes with `identityEngine` | Master Audit § F-09 |
| **EVD-09-B** | F-09 | `lib/security/identityEngine.ts` | 215–240 | `test_milestone5_battery.cjs` Group 2 | Session revocation immediately invalidates across both registries | Master Audit § F-09 |
| **EVD-10-A** | F-10 | `app/api/security/emergency/route.ts` | 30–42 | HTTP POST test | Loopback and SameSite check prevents cross-site browser DoS | Master Audit § F-10 |
| **EVD-10-B** | F-10 | `app/api/security/emergency/route.ts` | 48–58 | HTTP POST test | Any local process on loopback can trigger lockdown with `actor="emergency_user"` | Master Audit § F-10 |
| **EVD-11-A** | F-11 | `app/api/permission/route.ts` | 45, 92 | Code review | Validates desktop session only; does not check `userRole === "founder"` | Master Audit § F-11 |
| **EVD-11-B** | F-11 | `app/api/security/permissions/route.ts` | 132 | Code review | Central security permission API explicitly passes `auth.session.userRole` | Master Audit § F-11 |
| **EVD-12-A** | F-12 | `scripts/` directory | 1–250 | Directory analysis | Extensive integration batteries exist, but UI rendering is mocked in Node | Master Audit § F-12 |
| **EVD-13-A** | F-13 | Repository root | N/A | `Test-Path .\.github` | `.github/workflows` does not exist in repository root; CI runs off-repo | Master Audit § F-13 |
| **EVD-14-A** | F-14 | Git log | N/A | `git log --oneline` | Verified commit ancestry `fbd89a6` (PR #3 merge) back to baseline | Master Audit § F-14 |
| **EVD-15-A** | F-15 | `lib/permissionGateway.ts` | 445–465 | `test_phase1_1_adversarial.cjs` Test 11 | Tampering target executable post-approval is rejected fail-closed | Master Audit § F-15 |
| **EVD-15-B** | F-15 | `lib/permissionGateway.ts` | 445–465 | `test_phase1_1_adversarial.cjs` Test 12 | Modifying command arguments post-approval is rejected fail-closed | Master Audit § F-15 |
| **EVD-16-A** | F-16 | `.security_vault/recovery.key` | N/A | File inspection | Recovery key stored in plaintext (64 hex characters) in local filesystem | Master Audit § F-16 |
