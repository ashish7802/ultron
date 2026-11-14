# ULTRON Runtime Adversarial Test Results

**Repository:** `https://github.com/ashish7802/ultron`  
**Audit Baseline Commit:** `fbd89a672e71a405e9eeae5f6863ac4248ea3760`  
**Working Branch:** `fix/phase1-security-invariants`  
**Execution Timestamp:** 2026-11-14T12:26:04+05:30  
**Test Harnesses:**
- `scripts/test_phase1_1_adversarial.cjs`
- `scripts/test_phase1_battery.cjs`
- `scripts/test_milestone5_battery.cjs`
- `scripts/test_milestone5_extended.cjs`
- `scripts/test_predicate_security.cjs`

---

## 1. Test Execution Inventory & Status

| Test Suite | Total Tests | Passed | Failed | Exit Code | Mocked vs Real Execution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 1.1 Adversarial Battery** | 14 | 14 | 0 | 0 | Real OS processes, disk writes, and HMAC cryptography |
| **Phase 1 Integration Battery** | 15 | 15 | 0 | 0 | Real tool registry, permission gateway, and filesystem |
| **Milestone 5 Full Regression** | 11 | 11 | 0 | 0 | Real Python subprocesses, emergency stops, session engine |
| **Milestone 5 Extended Suite** | 4 | 4 | 0 | 0 | Real terminal driver, path defense, and anti-poisoning |
| **Safe Predicate Security Suite** | 8 | 8 | 0 | 0 | Pure AST/Regex restricted expression evaluator |
| **Total Automated Tests** | **52** | **52** | **0** | **0** | **100% Passed Across All Suites** |

---

## 2. Adversarial Test Scenarios & Results

### F-02: Approval Contract & State Integrity
```
[PASS] Test 1: Permission route accepts action: 'reject' and returns ok: true, success: true
       Details: Status: 200, body: {"ok":true,"success":true,"message":"Action was cancelled successfully."}
[PASS] Test 2: Approval without approvalToken is rejected with 400 Bad Request
       Details: Status: 400, error: "approvalToken is required to authorize action"
[PASS] Test 3: Valid approval returns ok: true, success: true, and executionSuccess: true
       Details: Status: 200, executionSuccess=true
[PASS] Test 4: Approval token is invalidated upon first use (replay prevented)
       Details: First approval=true, second approval=false
```

### F-03: Verifiable File Overwrite Authorization
```
[PASS] Test 1: Overwriting existing file without a grant is rejected fail-closed
       Details: Error: "File overwrite authorization failure: Missing cryptographic execution grant token."
[PASS] Test 2: Overwriting with approvalGranted: true but NO cryptographic grant is REJECTED
       Details: Error: "File overwrite authorization failure: Missing cryptographic execution grant token."
[PASS] Test 3: Direct Python bridge invocation with spoofed Boolean is REJECTED
       Details: Bridge error: "File overwrite authorization failure: Missing cryptographic execution grant token."
[PASS] Test 4: Grant with forged HMAC signature is REJECTED
       Details: Error: "File overwrite authorization failure: Cryptographic signature verification failed: grant token is invalid or forged."
[PASS] Test 5: Valid grant presented for mismatched file path is REJECTED
       Details: Error: "File overwrite authorization failure: Target path mismatch: grant is bound to '...file_a.txt', but requested '...file_b.txt'."
[PASS] Test 6: Expired grant token is REJECTED fail-closed
       Details: Error: "File overwrite authorization failure: Execution grant token expired 5574ms ago."
[PASS] Test 7: Valid cryptographic grant succeeds and writes to disk
       Details: Success=true, backupPath=C:\Users\kelvy\OneDrive\Documents\ultron\backups\filesystem\file_a.txt.1794639337.bak
[PASS] Test 8: Replaying consumed grant token is REJECTED (anti-replay invariant)
       Details: Error: "File overwrite authorization failure: Execution grant token has already been consumed (replay rejected)."
[PASS] Test 9: Normal new-file creation succeeds without requiring overwrite grant
       Details: Success=true
```

### F-04: False-Success Elimination
```
[PASS] Test 1: Resolved Promise returning { success: false } is recognized as execution failure
       Details: Outcome success=false, error="Disk write permission denied"
[PASS] Test 2: Plan status becomes 'failed' in audit log and state
       Details: Plan status is: "failed"
[PASS] Test 3: Thrown exception marks plan failed and returns success: false
       Details: Plan status="failed", error="Physical process crash"
[PASS] Test 4: Non-zero exitCode is caught by gateway and marked failed
       Details: Plan status="failed", outcome success=false
[PASS] Test 5: Genuine physical success marks plan 'executed'
       Details: Plan status="executed", outcome success=true
```

### F-15: Application Launch Parameter Binding
```
[PASS] Test 1: Tampering with executable target (notepad -> calc) is REJECTED by gateway
       Details: Error: "Security Violation: Runtime invocation parameters do not match approved ActionPlan plan_62b5ac776fbee9393e5d036d (expected hash 2851f817)."
[PASS] Test 2: Modifying arguments post-approval is REJECTED by gateway
       Details: Error: "Security Violation: Runtime invocation parameters do not match approved ActionPlan plan_48e10bb1f620f75be6c3d12b (expected hash e148a493)."
[PASS] Test 3: Replaying consumed execution grant token is REJECTED fail-closed
       Details: Error: "Action plan not found."
[PASS] Test 4: Unapproved launch attempt returns requiresPlan and does NOT spawn process
       Details: Permission plan generated: plan_f4a6a102badf81813bd339d6
```
