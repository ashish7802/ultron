# ULTRON Security Remediation Roadmap

**Repository:** `https://github.com/ashish7802/ultron`  
**Audit Baseline:** `fbd89a672e71a405e9eeae5f6863ac4248ea3760`  
**Working Branch:** `fix/phase1-security-invariants`  
**Date:** 2026-11-14

---

## 1. Remediation Status & Prioritized Phases

| Priority | Finding ID | Description | Severity | Remediation Status |
| :---: | :---: | :--- | :---: | :---: |
| **P0** | **F-02** | Frontend/backend approval contract mismatch | High | **CLOSED (Phase 1)** |
| **P0** | **F-03** | Verifiable file overwrite authorization boundary | High | **CLOSED (Phase 1.1)** |
| **P0** | **F-04** | Permission gateway false-success behavior | High | **CLOSED (Phase 1)** |
| **P0** | **F-15** | Application launch parameter integrity binding | High | **CLOSED (Phase 1.1)** |
| **P1** | **F-01** | Biometric verification gating on desktop session creation | Medium | Planned (Phase 2) |
| **P1** | **F-11** | Founder role enforcement on permission route | Medium | Planned (Phase 2) |
| **P1** | **F-06** | Windows DPAPI protection for Node.js `.vault_key` | Medium | Planned (Phase 2) |
| **P2** | **F-07** | Packaging path abstraction (`ULTRON_USER_DATA_DIR`) | Low | Planned (Phase 3) |
| **P2** | **F-08** | Deprecation of legacy static decryption secrets | Low | Planned (Phase 3) |
| **P2** | **F-10** | Rate-limiting & local auth for emergency lockdown | Low | Planned (Phase 3) |
| **P3** | **F-13** | In-repo CI workflow definition (`.github/workflows`) | Hygiene | Planned (Phase 4) |
| **P3** | **F-16** | DPAPI envelope wrapping for `.security_vault/recovery.key` | Hygiene | Planned (Phase 4) |

---

## 2. Phase 2: Identity & Master Key Hardening (Next Objective)

### Workstream 2.1: Unified Biometric Gate (F-01 & F-11)
- **Objective:** Require an explicit biometric challenge verification or elevated session token before granting access to computer tool execution or action approvals.
- **Tasks:**
  1. Update `app/api/auth/session/route.ts` to require a valid biometric challenge result before issuing a session token with `founder` privileges.
  2. In `app/api/permission/route.ts`, verify that `session.userRole === "founder"` before approving or executing any `ActionPlan`.
  3. Ensure loopback bootstrap tokens are scoped as `unauthenticated_desktop` until biometric challenge succeeds.

### Workstream 2.2: Cryptographic DPAPI Parity (F-06 & F-16)
- **Objective:** Eliminate plaintext `.vault_key` and `.security_vault/recovery.key` on disk for Windows users.
- **Tasks:**
  1. Route Node.js key retrieval through `ultron_engine/secure_vault.py` or a native Node addon using Windows DPAPI (`CryptProtectData`).
  2. Store encrypted blobs rather than plaintext 64-character hexadecimal secrets.
  3. Keep fallback recovery key generation intact for non-Windows test environments.

---

## 3. Data Preservation Invariants

Any future remediation must continue to strictly honor the following non-negotiable rules:
- **Zero Vault Regeneration:** `ultron_memory_vault.json` must never be wiped or re-encrypted with incompatible algorithms.
- **Recovery Key Protection:** `.security_vault/recovery.key` must remain readable by authorized repair tooling.
- **Safe Disposable Testing:** All test harnesses must create isolated temporary test directories (e.g. `temp_test/`) and cleanly unlink them.
