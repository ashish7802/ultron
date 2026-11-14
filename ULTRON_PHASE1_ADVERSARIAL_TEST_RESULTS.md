# ULTRON Phase 1 Adversarial Test Results

**Branch:** `fix/phase1-security-invariants`  
**Baseline Commit:** `fbd89a672e71a405e9eeae5f6863ac4248ea3760`  
**Execution Timestamp:** 2026-11-14T11:42:00+05:30  
**Test Suite Type:** Automated, Adversarial, Differential & Invariant Testing

---

## 1. Summary of Adversarial Test Results

| Test Category | Invariant Tested | Adversarial Vector / Scenario | Result | Proof / Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **F-02 Approval Contract** | Token Invalidation | Replay attack using valid `approvalToken` after plan approved | **PASS (Blocked)** | `approveActionPlan()` rejected second attempt with `success: false`. Token wiped to `""`. |
| **F-02 Approval Contract** | Cancellation Invalidation | Replay attack using valid `approvalToken` after plan rejected | **PASS (Blocked)** | `cancelActionPlan()` cleared token, `approveActionPlan()` rejected with `success: false`. |
| **F-02 Approval Contract** | Concurrent Approvals | Race condition: 2 simultaneous `approveActionPlan()` calls | **PASS (Atomic)** | Only one call succeeded (`true`), second call rejected (`false`). |
| **F-02 Approval Contract** | Missing Token | HTTP POST `/api/permission` with `action: "approve"` but no token | **PASS (Blocked)** | Returns HTTP 400 Bad Request with `"approvalToken is required"`. |
| **F-02 Approval Contract** | Legacy Compatibility | HTTP POST `/api/permission` with `decision: "deny"` | **PASS (Unified)** | Normalized to `action: "reject"`, returns `{ ok: true, success: true }`. |
| **F-03 File Overwrite** | Direct Overwrite Gate | `toolRegistry.executeTool("write_file", { overwrite: true })` on existing file | **PASS (Gated)** | Operation blocked, `requiresPlan: true`, `permissionPlan` returned. |
| **F-03 File Overwrite** | Physical File Immutability | Inspect disk file bytes after blocked overwrite attempt | **PASS (Untouched)** | Original file content remained 100% identical. |
| **F-03 File Overwrite** | Python Driver Defense | Direct call to Python `filesystem_driver.write_file(approval_granted=False)` | **PASS (Blocked)** | Returns `{"success": False, "requiresApproval": True, "blocked": True}`. |
| **F-03 File Overwrite** | Context Forgery Attempt | Caller passes `{ approvalGranted: true }` in params/context to `toolRegistry` without grantToken | **PASS (Blocked)** | `requiresPlan` enforced via `fs.existsSync()`; forge attempt fails. |
| **F-03 File Overwrite** | Direct Bridge Bypass | Caller bypasses tool registry and calls `defaultPythonBridge.execute("write_file", { approvalGranted: true })` | **FAIL (Bypassed)** | Python driver trusts Boolean; physical file overwritten with backup created. |
| **F-04 False-Success** | Outcome Inspection | Executor returns `{ success: false, error: "Disk denied" }` | **PASS (Failed)** | Gateway detects failure, returns `success: false`, sets `status = "failed"`. |
| **F-04 False-Success** | Null/Undefined Return | Executor returns `null` or `undefined` | **PASS (Failed)** | Gateway detects empty output, returns `success: false`, sets `status = "failed"`. |
| **F-04 False-Success** | Non-Zero Exit Code | Executor returns `{ exitCode: 1, stderr: "fail" }` | **PASS (Failed)** | Gateway detects non-zero exit code, sets `status = "failed"`. |
| **F-04 False-Success** | Unverified Status | Executor returns `{ exitCode: 0, verified: false }` | **PASS (Failed)** | Gateway catches `verified: false`, sets `status = "failed"`. |
| **F-04 False-Success** | Exception Handling | Executor throws unhandled runtime `Error("crash")` | **PASS (Failed)** | Gateway catches exception, returns `success: false`, sets `status = "failed"`. |
| **F-04 False-Success** | Concurrent Execution | Race condition: 2 simultaneous `executeApprovedAction()` calls | **PASS (Single-use)** | Execution count = 1. First execution succeeds, second returns `success: false`. |
| **F-15 App Launch** | Direct App Launch Gate | `toolRegistry.executeTool("launch_application", { appName: "notepad" })` | **PASS (Gated)** | Blocked, returns `permissionPlan` with `actionType: "app_launch"`. |
| **F-15 App Launch** | Risk Elevation | Verify risk level assigned to `launch_application` | **PASS (Elevated)** | Registry and permission gateway assign `riskLevel: "high"`. |
| **F-15 App Launch** | Invalid Token Launch | `executeTool("launch_application")` with fake grant token | **PASS (Blocked)** | Gateway rejects execution: `"Action plan not found"`. |
| **F-15 App Launch** | Parameter Tampering | Plan approved for `notepad`, but caller invokes `calc` using same grant token | **FAIL (Weakness)** | Gateway validates grant token for planId, but does not verify parameters match `plan.actionHash`. |

---

## 2. Detailed Reproduction Logs

### A. Concurrent Approval Invalidation
```javascript
const plan = planAction('app_launch', 'notepad', { appName: 'notepad' });
const token = plan.approvalToken;
const [res1, res2] = await Promise.all([
  Promise.resolve(approveActionPlan(plan.planId, token)),
  Promise.resolve(approveActionPlan(plan.planId, token))
]);
// Output: Concurrent approvals: true false
// Verdict: PASS - Replay / double approval prevented atomically.
```

### B. Single-Use Execution Grant Token Enforcement
```javascript
const plan = planAction('app_launch', 'notepad', { appName: 'notepad' });
const approval = approveActionPlan(plan.planId, plan.approvalToken);
const grantToken = approval.executionGrantToken;

let executionCount = 0;
const execFn = async () => { executionCount++; return { success: true }; };

const [res1, res2] = await Promise.all([
  executeApprovedAction(plan.planId, grantToken, execFn),
  executeApprovedAction(plan.planId, grantToken, execFn)
]);
// Output: Concurrent exec results: true false; Execution count: 1
// Verdict: PASS - Single-use execution guaranteed.
```

### C. Direct Python Bridge Invocation with `approvalGranted: true`
```javascript
const res = await defaultPythonBridge.execute('write_file', {
  path: 'tmp_bridge_forge.txt',
  content: 'FORGED_VIA_BRIDGE',
  overwrite: true,
  approvalGranted: true
});
// Output: Bridge direct invocation result: { success: true, verified: true }
// Verdict: CRITICAL LIMITATION - Python driver trusts caller-supplied Boolean if caller bypasses ToolRegistry.
```
