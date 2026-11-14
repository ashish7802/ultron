# ULTRON — Remediation Priority & Action Roadmap

This roadmap organizes the 17 verified findings (F-01 through F-17) into a phased remediation plan.

---

## 1. Phased Priority Architecture

```
Phase 1: Critical Security Gates & Contract Fixes (Immediate)
├── F-02: Repair UI Approval & Rejection Contract
├── F-04: Fix False-Success Behavior in Permission Gateway
├── F-03: Enforce Explicit Approval on File Overwrites
└── F-15: Enforce Approval on Desktop App Launches in Tool Registry

Phase 2: Authentication & Identity Unification
├── F-01: Wire Genuine Windows Hello Challenge into Application Startup
├── F-09: Unify Session Registries (sessionGate + identityEngine)
├── F-11: Enforce Role Boundaries on Permission Approvals
└── F-10: Restrict Emergency Stop Lockdown to Authenticated Sessions

Phase 3: Cryptography & Key Management Hardening
├── F-06: Bridge Node Credential Engine to Real Win32 DPAPI
├── F-16: Encrypt or Restrict Plaintext Founder Recovery Key
├── F-17: Protect Plaintext Master Encryption Key (.vault_key)
└── F-08: Remove or Gate Static Legacy Migration Keys

Phase 4: Persistence, CI & Packaging Integrity
├── F-07: Standardize all Storage Engines on ULTRON_USER_DATA_DIR
├── F-05: Remove Synthetic Get-Date Fallback from Orchestrator
├── F-13: Add npm test / typecheck Scripts and GitHub Actions CI
├── F-12: Expand Automated Test Battery to Exercise HTTP API Routes
└── F-14: Reconcile Markdown Documentation Commit Hashes
```

---

## 2. Detailed Action Plan & Acceptance Criteria

### Phase 1: Critical Security Gates & Contract Fixes

#### Fix F-02 — UI Approval Contract Alignment
- **Problem:** `UltronChat.tsx` sends `decision: "approve"`, omitting `approvalToken`. Backend expects `action: "approve"` with `approvalToken` and returns `{ ok: true, result }`.
- **Changes Needed:**
  1. In `UltronChat.tsx`, update payload to `{ planId: plan.planId, action: "approve", approvalToken: plan.approvalToken }`.
  2. Handle response checking `data.ok` and `data.result`.
  3. Align rejection handler to send `{ planId: plan.planId, action: "reject", reason: "User cancelled" }`.
- **Acceptance Criteria:**
  - Clicking "Approve & Execute" on an approval card successfully calls `/api/permission` and returns HTTP 200.
  - Clicking "Cancel" cleanly marks the plan as cancelled.

#### Fix F-04 — False-Success Elimination in Permission Gateway
- **Problem:** `executeApprovedAction()` treats resolved promises as successful even if `result.success === false`.
- **Changes Needed:**
  1. Inspect `result` from `await executor()`.
  2. If `typeof result === "object" && result !== null && "success" in result && !result.success`:
     - Mark `plan.status = "failed"`.
     - Log audit event with `executionSuccess = false`.
     - Return `{ success: false, error: result.error || "Operation failed", result }`.
  3. In `catch` block, mark `plan.status = "failed"`, not `"executed"`.
- **Acceptance Criteria:**
  - When an executor returns `{ success: false }`, `executeApprovedAction` returns `{ success: false }` and logs `executionSuccess = false`.

#### Fix F-03 & F-15 — Overwrite & App Launch Approval Enforcement
- **Problem:** `write_file` and `launch_application` have `riskLevel: "medium"` and bypass approval gating in `toolRegistry.ts`.
- **Changes Needed:**
  1. In `lib/computer/toolRegistry.ts`, elevate `riskLevel` of `launch_application` to `"high"`, or include `app_launch` and `file_write` (when `overwrite === true`) in `requiresPlan`.
  2. In `app/api/chat/route.ts`, create permission plans for destructive file overwrites.
- **Acceptance Criteria:**
  - Overwriting an existing file requires an approved `ActionPlan`.
  - Launching desktop applications via `toolRegistry` requires an approved `ActionPlan`.

---

### Phase 2: Authentication & Identity Unification

#### Fix F-01 & F-09 — Windows Hello Integration & Unified Session Registry
- **Problem:** Startup dispenses tokens via `sessionGate` with zero biometrics; `identityEngine` is unaware of these tokens.
- **Changes Needed:**
  1. Merge `sessionGate.ts` and `identityEngine.ts` into a single shared session store or make both query a unified backend.
  2. On application boot, require an initial Windows Hello biometric challenge via `/api/security/auth` before dispensing the primary session cookie.
  3. Ensure session revocation in one subsystem invalidates the session globally.
- **Acceptance Criteria:**
  - Chat interface prompts for Windows Hello biometrics on initial startup.
  - Session tokens created during login are accepted across all API routes (`/api/chat`, `/api/security/*`, `/api/permission`).

#### Fix F-11 — Permission Approval Role Boundary
- **Problem:** `POST /api/security/permissions` allows non-admin sessions to approve requests.
- **Changes Needed:**
  1. Add role check in `POST /api/security/permissions`: enforce `auth.session.userRole === "founder" || auth.session.userRole === "admin"`.
  2. In `approveRequest`, verify `decidedByActor` possesses the founder or admin role.
- **Acceptance Criteria:**
  - Sessions with role `"guest"` or `"operator"` receive HTTP 403 when attempting to approve requests.

#### Fix F-10 — Restrict Emergency Stop Lockdown
- **Problem:** Unauthenticated loopback requests trigger global lockdown.
- **Changes Needed:**
  1. Enforce valid session authentication on `POST /api/security/emergency` for `action: "lockdown"`.
- **Acceptance Criteria:**
  - Unauthenticated requests to `/api/security/emergency` receive HTTP 401.

---

### Phase 3: Cryptography & Key Management Hardening

#### Fix F-06, F-16 & F-17 — Real DPAPI Storage & Secret Protection
- **Problem:** Plaintext `.vault_key` and `.security_vault/recovery.key`; false DPAPI claims in metadata.
- **Changes Needed:**
  1. On Windows, bridge `credentialEngine.ts` to `ultron_engine/secure_vault.py` (or Win32 DPAPI via native addon) to encrypt master secrets using Windows `CryptProtectData`.
  2. Set `isDPAPIProtected` to true only when Windows DPAPI was actually invoked.
  3. Secure `recovery.key` storage using DPAPI protection rather than plaintext file writes.
- **Acceptance Criteria:**
  - No plaintext `.vault_key` or `recovery.key` stored in the workspace directory.
  - Vault and credential decryption succeeds only on the same Windows user account via DPAPI.

#### Fix F-08 — Remove Static Legacy Encryption Secrets
- **Problem:** Hardcoded fallback strings remain in source code.
- **Changes Needed:**
  1. Deprecate `LEGACY_MIGRATION_KEY` and `LEGACY_VAULT_MIGRATION_SECRET`.
  2. Provide an explicit, user-initiated migration script rather than silent runtime fallback.
- **Acceptance Criteria:**
  - Source code contains zero hardcoded encryption passphrases.

---

### Phase 4: Persistence, CI & Packaging Integrity

#### Fix F-07 — Standardize on `ULTRON_USER_DATA_DIR`
- **Problem:** Storage modules hardcode `process.cwd()`.
- **Changes Needed:**
  1. Create a helper `getStorageDirectory()` that defaults to `process.env.ULTRON_USER_DATA_DIR || process.cwd()`.
  2. Use this helper across `memoryManager.ts`, `recoveryKey.ts`, `credentialEngine.ts`, `emergencyEngine.ts`, and `vaultStorage.ts`.
- **Acceptance Criteria:**
  - In packaged Electron environments, all data is written to `%APPDATA%\ULTRON` rather than `process.cwd()`.

#### Fix F-05 — Eliminate Synthetic `Get-Date` Fallback
- **Problem:** Step 5 of `_defaultTaskExecutor` fabricates success.
- **Changes Needed:**
  1. Remove step 5 fallback from `_defaultTaskExecutor()`.
  2. If a task cannot be handled by shell, app launch, or file verification, return explicit failure `{ success: false, error: "Unsupported task type: no physical executor available." }`.
- **Acceptance Criteria:**
  - Unsupported tasks fail honestly with explicit error messages.

#### Fix F-13 — Continuous Integration & Automated Scripts
- **Changes Needed:**
  1. Add `"test"` and `"typecheck"` scripts to `package.json`.
  2. Create `.github/workflows/ci.yml` running `npm run typecheck`, `npm run lint`, and `npm test` on PRs to `main`.
- **Acceptance Criteria:**
  - Automated CI runs and passes on every push and pull request.
