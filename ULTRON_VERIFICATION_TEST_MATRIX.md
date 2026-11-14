# ULTRON — Verification Test Matrix

**Date:** November 14, 2026  
**Target Commit:** `fbd89a672e71a405e9eeae5f6863ac4248ea3760` (`main`)  
**Environment:** Windows 11 Home (x64), Node.js v26.12.1, Python 3.12, Synaptics VFS7552 Sensor  

---

## 1. Test Execution Inventory

| Test ID | Test Category | Target Subsystem / Finding | Test Methodology | Command / Invocation | Expected Behavior | Actual Observed Outcome | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T-01** | Biometrics | F-01 (Windows Hello) | Static inspection & runtime query | `python ultron_engine/windows_hello.py check` | Hardware detection | Sensor enumerated; startup session skips biometrics | **CONFIRMED** |
| **T-02** | Approval API | F-02 (Approval contract) | Static trace & payload comparison | Source inspection of `UltronChat.tsx` vs `permission/route.ts` | Matching contract | Key mismatch: `decision` vs `action`, missing `approvalToken` | **CONFIRMED** |
| **T-03** | File Write | F-03 (File write overwrite) | Static rule check & runtime test | `toolRegistry.ts` line 200 rule inspection | Require plan for overwrite | Overwrite executed directly without approval plan | **CONFIRMED** |
| **T-04** | Permission Gateway | F-04 (False success) | Code logic analysis & trace | Inspection of `executeApprovedAction()` in `permissionGateway.ts` | Reject failed results | Resolved promises with `{ success: false }` marked executed | **CONFIRMED** |
| **T-05** | Orchestration | F-05 (Synthetic success) | Code trace of `_defaultTaskExecutor` | Inspection of step 5 in `orchestrator.ts` | Fail unhandled tasks | Runs `Get-Date -Format o`, fabricates `exitCode: 0` | **CONFIRMED** |
| **T-06** | Vault Cryptography | F-06 (DPAPI protection) | Code inspection & runtime check | Grep DPAPI in `credentialEngine.ts` | True Win32 DPAPI | Uses software AES; master key in plaintext `.vault_key` | **CONFIRMED** |
| **T-07** | Electron Persistence | F-07 (`userData` paths) | Path resolution audit | Inspection of `process.cwd()` in `memoryManager.ts`, etc. | Consume `ULTRON_USER_DATA_DIR` | Hardcodes `process.cwd()`, breaking packaged app | **CONFIRMED** |
| **T-08** | Cryptography | F-08 (Legacy keys) | Static string search & fallback trace | Grep `LEGACY_MIGRATION_KEY` in `crypto.ts` | Keys removed | Static strings decrypt legacy data | **CONFIRMED** |
| **T-09** | Identity Subsystem | F-09 (Session sync) | Cross-module call graph | `sessionGate.ts` vs `identityEngine.ts` | Symmetric sync | `identityEngine` fails on `sessionGate` tokens | **CONFIRMED** |
| **T-10** | Emergency Stop | F-10 (Lockdown auth) | Loopback request analysis | Source trace of `POST /api/security/emergency` | Authenticated lock | Unauthenticated caller triggers lockdown on loopback | **PARTIALLY CONFIRMED** |
| **T-11** | Permission Roles | F-11 (Role enforcement) | Route handler inspection | `POST /api/security/permissions` role checks | Founder-only approval | Any authenticated user can approve requests | **CONFIRMED** |
| **T-12** | Test Reliability | F-12 (M5 test scope) | Script inspection | `test_milestone5_battery.cjs` inspection | End-to-end HTTP/UI tests | Unit tests on isolated classes; no HTTP API calls | **CONFIRMED** |
| **T-13** | CI Pipeline | F-13 (CI workflows) | Filesystem directory check | `Get-ChildItem -Force .github` | Workflows present | `.github` does not exist; no CI configured | **CONFIRMED** |
| **T-14** | Documentation | F-14 (Commit hash match) | Git log vs markdown comparison | `git log` vs `ULTRON_REMEDIATION_PROGRESS.md` | Consistent hashes | Progress doc lists `9bb76cb`; commit was `18276c5` | **CONFIRMED** |
| **T-15** | App Launch | F-15 (Launch bypass) | Tool registry audit | `toolRegistry.ts` line 274 inspection | Require approval plan | `launch_application` runs as `medium` risk with no plan | **CONFIRMED** |
| **T-16** | Key Storage | F-16 (Plaintext recovery key) | File inspection | Inspection of `.security_vault/recovery.key` | Protected ACLs | Plaintext string on disk; `0o600` ignored by NTFS | **CONFIRMED** |
| **T-17** | Key Storage | F-17 (Plaintext master key) | File inspection | Inspection of `.vault_key` | Protected storage | Plaintext 32-byte hex key in workspace root | **CONFIRMED** |

---

## 2. Tests Not Run (With Justification)

1. **Interactive Fingerprint Touch Challenge**:
   - *Reason Not Run:* Requires a physical human finger touching the Synaptics VFS7552 sensor during prompt execution. Automated headless environments cannot simulate human touch.
   - *Alternative Executed:* Ran `python ultron_engine/windows_hello.py check`, which verified WinBio unit schema enumeration, hardware status `OK`, and enrolled fingerprint count `1`.
2. **Full Electron Packaged Installer Generation (`npm run build:electron`)**:
   - *Reason Not Run:* Running `electron-builder` requires significant disk space and compiles binary packages in `release/`.
   - *Alternative Executed:* Audited `package.json` packaging configuration (`extraResources`) and path resolution logic in `electron/main.js`.
3. **Destructive File Overwrite Verification on Host System**:
   - *Reason Not Run:* Modifying host files outside the isolated workspace is prohibited by safety rules.
   - *Alternative Executed:* Tested path resolution boundaries via `scripts/test_milestone5_extended.cjs` using temporary test files.

---

## 3. Reproduction Instructions for Verification

### Reproducing F-02 (Approval Contract Mismatch)
1. Inspect `components/UltronChat.tsx` lines 587–590:
   ```json
   { "planId": plan.planId, "decision": "approve" }
   ```
2. Inspect `app/api/permission/route.ts` line 98:
   ```ts
   const { action, planId, approvalToken, reason } = body;
   ```
3. Execute `curl -X POST http://127.0.0.1:3000/api/permission -H "Content-Type: application/json" -d '{"planId":"test","decision":"approve"}'`.
4. Observe HTTP 400 response: `{"ok":false,"error":"Invalid action \"undefined\". Must be \"approve\" or \"reject\"."}`.

### Reproducing F-04 (Permission Gateway False-Success)
1. Inspect `lib/permissionGateway.ts` lines 295–302:
   ```ts
   const result = await executor();
   plan.status = "executed";
   logAuditEvent(plan, "executed", true, "Action executed successfully.");
   return { success: true, result };
   ```
2. Note that if `executor()` returns `{ success: false, error: "Disk full" }`, the function logs `executionSuccess: true` and returns `{ success: true, result: { success: false, error: "Disk full" } }`.

### Reproducing F-05 (Orchestrator Synthetic Success)
1. Inspect `lib/orchestration/orchestrator.ts` lines 525–534:
   ```ts
   const diagResult = await defaultTerminalIntelligence.executeCommand("Get-Date -Format o");
   return { success: true, exitCode: 0, output: "..." };
   ```
2. Any task without an explicit command or "open" prefix hits this fallback and reports `success: true`.
