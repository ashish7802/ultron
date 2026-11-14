# ULTRON Phase 1.1 Adversarial Test Results

**Branch:** `fix/phase1-security-invariants`  
**Execution Timestamp:** 2026-11-14T12:11:19+05:30  
**Test Suite:** `scripts/test_phase1_1_adversarial.cjs`  
**Overall Result:** **14 / 14 Tests Passed (100%)**

---

## Adversarial Scenarios & Reproducible Evidence

| Scenario # | Category | Target Invariant | Adversarial Payload / Vector | Expected Behavior | Actual Behavior | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ADV-01** | F-03 Overwrite | Mandatory Grant | Overwriting existing file without any grant token | Block write fail-closed | Returns `"requiresApproval": True, "blocked": True`. Disk file untouched. | **PASS** |
| **ADV-02** | F-03 Overwrite | Boolean Spoofing | Overwriting with `approvalGranted: true` but `executionGrant: undefined` | Block write fail-closed | Returns `"Missing cryptographic execution grant token"`. Disk file untouched. | **PASS** |
| **ADV-03** | F-03 Overwrite | Direct Bridge Call | Direct Node.js bridge `execute("write_file", { approvalGranted: true })` | Block write fail-closed | Returns `"Missing cryptographic execution grant token"`. Disk file untouched. | **PASS** |
| **ADV-04** | F-03 Overwrite | Forged Signature | Grant presented with all-zeros HMAC-SHA256 signature | Signature check fail | Returns `"Cryptographic signature verification failed"`. Disk file untouched. | **PASS** |
| **ADV-05** | F-03 Overwrite | Path Mismatch | Valid grant for `file_a.txt` presented to overwrite `file_b.txt` | Path check fail | Returns `"Target path mismatch: grant is bound to '...file_a.txt'"`. File B untouched. | **PASS** |
| **ADV-06** | F-03 Overwrite | Grant Expiration | Valid grant generated with negative TTL (-5000ms) | Expiration check fail | Returns `"Execution grant token expired 5519ms ago"`. Disk file untouched. | **PASS** |
| **ADV-07** | F-03 Overwrite | Legitimate Grant | Fresh, valid grant with matching path and operation | Write and backup | Success: true, disk updated, `.bak` file created in backup store. | **PASS** |
| **ADV-08** | F-03 Overwrite | Replay Attack | Replaying consumed grant from ADV-07 on `file_a.txt` | Anti-replay check fail | Returns `"Execution grant token has already been consumed (replay rejected)"`. | **PASS** |
| **ADV-09** | F-03 New File | Usability Baseline | Creating a brand new file that does not exist | Normal write allowed | Success: true, new file created on disk without requiring grant. | **PASS** |
| **ADV-10** | F-03 E2E | Lifecycle Invariant | ToolRegistry `write_file` approval lifecycle with backup | End-to-end execution | Verified: true, file updated with backup snapshot created. | **PASS** |
| **ADV-11** | F-15 Parameter | Target Substitution | Approved for `notepad`, but runtime caller invokes `calc` | Hash check fail | Returns `"Security Violation: Runtime invocation parameters do not match approved ActionPlan"`. Process not spawned. | **PASS** |
| **ADV-12** | F-15 Parameter | Argument Tampering | Approved for `['--safe']`, runtime caller invokes `['--malicious']` | Hash check fail | Returns `"Security Violation: Runtime invocation parameters do not match approved ActionPlan"`. Process not spawned. | **PASS** |
| **ADV-13** | F-15 Parameter | Grant Reuse | Reusing consumed grant token for another launch | State check fail | Returns `"Action plan not found."`. Process not spawned. | **PASS** |
| **ADV-14** | F-15 Parameter | Approval Gate | Invoking `launch_application` without prior approval | Gate check fail | Returns `success: false` and generates `permissionPlan` with `riskLevel: "high"`. | **PASS** |

---

## Detailed Execution Output

```
==================================================================
   ULTRON PHASE 1.1 ADVERSARIAL & CRYPTOGRAPHIC VERIFICATION     
==================================================================
Testing invariants: Cryptographic Subprocess Grant (F-03) & Parameter Binding (F-15)

--- [Suite 1: F-03 Cryptographic Subprocess Grant Invariants] ---
  [PASS] Test 1: F-03.1: Overwriting existing file without a grant is rejected fail-closed
         Details: Error: "File overwrite authorization failure: Missing cryptographic execution grant token."
  [PASS] Test 2: F-03.2: Overwriting with approvalGranted: true but NO cryptographic grant is REJECTED
         Details: Error: "File overwrite authorization failure: Missing cryptographic execution grant token."
  [PASS] Test 3: F-03.3: Direct Python bridge invocation with spoofed Boolean is REJECTED
         Details: Bridge error: "File overwrite authorization failure: Missing cryptographic execution grant token."
  [PASS] Test 4: F-03.4: Grant with forged HMAC signature is REJECTED
         Details: Error: "File overwrite authorization failure: Cryptographic signature verification failed: grant token is invalid or forged."
  [PASS] Test 5: F-03.5: Valid grant presented for mismatched file path is REJECTED
         Details: Error: "File overwrite authorization failure: Target path mismatch: grant is bound to 'c:\users\kelvy\onedrive\documents\ultron\temp_phase1_1_test\file_a.txt', but requested 'c:\users\kelvy\onedrive\documents\ultron\temp_phase1_1_test\file_b.txt'."
  [PASS] Test 6: F-03.6: Expired grant token is REJECTED fail-closed
         Details: Error: "File overwrite authorization failure: Execution grant token expired 5519ms ago."
  [PASS] Test 7: F-03.7: Valid cryptographic grant succeeds and writes to disk
         Details: Success=true, backupPath=C:\Users\kelvy\OneDrive\Documents\ultron\backups\filesystem\file_a.txt.1794638474.bak
  [PASS] Test 8: F-03.8: Replaying consumed grant token is REJECTED (anti-replay invariant)
         Details: Error: "File overwrite authorization failure: Execution grant token has already been consumed (replay rejected)."
  [PASS] Test 9: F-03.9: Normal new-file creation succeeds without requiring overwrite grant
         Details: Success=true
  [PASS] Test 10: F-03.10: End-to-end ToolRegistry approval issuance and execution succeeds with backup
         Details: Tool outcome verified=true

--- [Suite 2: F-15 Runtime Parameter Binding Invariants] ---
  [PASS] Test 11: F-15.1: Tampering with executable target (notepad -> calc) is REJECTED by gateway
         Details: Error: "Security Violation: Runtime invocation parameters do not match approved ActionPlan plan_cd2b37b8084b5033cc3198fa (expected hash 2851f817)."
  [PASS] Test 12: F-15.2: Modifying arguments post-approval is REJECTED by gateway
         Details: Error: "Security Violation: Runtime invocation parameters do not match approved ActionPlan plan_f550cd4d421f2796f954a287 (expected hash e148a493)."
  [PASS] Test 13: F-15.3: Replaying consumed execution grant token is REJECTED fail-closed
         Details: Error: "Action plan not found."
  [PASS] Test 14: F-15.4: Unapproved launch attempt returns requiresPlan and does NOT spawn process
         Details: Permission plan generated: plan_c94f82b223b5177966743692

==================================================================
PHASE 1.1 RESULTS: 14 / 14 tests passed (100%)
==================================================================
```
