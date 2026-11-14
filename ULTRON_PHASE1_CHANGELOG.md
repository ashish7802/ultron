# ULTRON Phase 1 Changelog: Security Invariants & Execution Integrity

**Branch:** `fix/phase1-security-invariants`  
**Baseline Commit:** `fbd89a672e71a405e9eeae5f6863ac4248ea3760`  
**Date:** 2026-11-14

---

### Security & Invariant Hardening
- **lib/permissionGateway.ts**:
  - Added `"failed"` to `ActionPlanStatus` type union.
  - In `executeApprovedAction()`: added inspection of execution outcomes (null/undefined, `success === false`, `ok === false`, `exitCode !== 0`, and `verified === false`). Failed operations now explicitly transition plan status to `"failed"` and log audit events with `executionSuccess = false` instead of reporting synthetic success (F-04).
  - In `approveActionPlan()` and `cancelActionPlan()`: invalidated `approvalToken` upon first use (`plan.approvalToken = ""`) to prevent replay attacks.
  - In `evaluateActionRisk()`: elevated `app_launch` default risk from `"medium"` to `"high"` (F-15).

- **lib/computer/toolRegistry.ts**:
  - Elevated `launch_application` tool definition from `riskLevel: "medium"` to `riskLevel: "high"`.
  - Added gate logic in `executeTool()` requiring user approval whenever `tool.actionType === "app_launch"` (F-15).
  - Added filesystem check in `executeTool()` for `file_write`: if target file exists and `overwrite !== false`, approval plan generation is enforced (F-03).
  - Injected `approvalGranted: true` into execution context when executing through `executeApprovedAction()`.
  - Passed `approvalGranted` from context to `defaultFileSystemIntelligence.writeFile()`.

- **lib/computer/fileSystemIntelligence.ts**:
  - Updated `writeFile(targetPath, content, overwrite, approvalGranted)` signature and documentation to pass `approvalGranted` to the Python bridge (F-03).

- **ultron_engine/computer/filesystem_driver.py**:
  - Updated `write_file(target_path, content, overwrite, is_binary_hex, approval_granted)`: enforced defense-in-depth invariant blocking overwrites when `exists and overwrite and not approval_granted`, returning `requiresApproval: True, blocked: True` (F-03).

- **ultron_engine/computer/computer_intelligence_cli.py**:
  - Updated `write_file` command handler to extract `approvalGranted` from JSON payload and pass to `filesystem_driver.write_file()` (F-03).

### Frontend & API Protocol Alignment
- **components/UltronChat.tsx**:
  - Aligned approval request payload with backend contract: now sends `{ planId: plan.planId, action: "approve", approvalToken: plan.approvalToken }` (F-02).
  - Aligned rejection request payload: now sends `{ planId: plan.planId, action: "reject", reason: "User cancelled in chat UI" }` (F-02).
  - Enhanced UI outcome detection to check `data.ok || data.success` and `data.executionSuccess !== false`, accurately displaying success or failure cards without silent dropouts.

- **app/api/permission/route.ts**:
  - Normalized action parameters supporting both modern `action` and legacy `decision` fields.
  - Added execution dispatchers for `app_launch`, `file_write`, `file_delete`, and `shell_exec` routing directly to `defaultComputerToolRegistry` with verified tokens.
  - Returns unified `{ ok: true, success: true, executionSuccess: true, result }` on success, and `{ ok: false, success: false, executionSuccess: false, error }` with status 500 on execution failure.

### Test Automation
- **scripts/test_phase1_battery.cjs**:
  - Implemented 15-test automated verification battery verifying F-02, F-03, F-04, and F-15 invariants and contracts.
