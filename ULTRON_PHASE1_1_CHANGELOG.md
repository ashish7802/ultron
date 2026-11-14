# ULTRON Phase 1.1 Changelog: Cryptographic Authorization Boundary & Parameter Integrity

**Branch:** `fix/phase1-security-invariants`  
**Date:** 2026-11-14

---

### Cryptographic Authorization Boundary (F-03 Remediation)
- **lib/permissionGateway.ts**:
  - Implemented `generateSubprocessExecutionGrant(planId, operation, targetPath, ttlMs)` to generate an HMAC-SHA256 signature over `{planId}|{operation}|{canonicalPath}|{expiresAt}|{nonce}` using the active founder recovery key.
- **lib/computer/toolRegistry.ts**:
  - When `tool.actionType === "file_write"` is executed through `executeApprovedAction`, automatically generates a cryptographic subprocess grant bound to the canonical file path and injects it into execution context.
  - Updated `write_file` tool implementation to pass `subprocessExecutionGrant` to `fileSystemIntelligence.writeFile()`.
- **lib/computer/fileSystemIntelligence.ts**:
  - Updated `writeFile()` to accept `executionGrant?: string` and transmit it across the native Python subprocess bridge payload.
- **ultron_engine/computer/computer_intelligence_cli.py**:
  - Extracted `executionGrant` / `execution_grant` from stdin payload and forwarded to `filesystem_driver.write_file()`.
- **ultron_engine/computer/filesystem_driver.py**:
  - Removed plain Boolean trust (`approval_granted: bool`) as the authorization authority for file overwrites.
  - Implemented `verify_subprocess_execution_grant(grant_token, operation, target_path)`:
    - Validates HMAC-SHA256 signature using the active founder recovery key from `.security_vault/recovery.key`.
    - Enforces canonical physical path matching (`os.path.abspath(os.path.normpath(target_path)).lower()`).
    - Enforces expiration timestamp checking.
    - Tracks consumed nonces in-memory and persists to `backups/filesystem/.consumed_grants.log` to guarantee atomic single-use execution across process boundaries.

---

### Runtime Parameter Integrity & Binding (F-15 Remediation)
- **lib/permissionGateway.ts**:
  - Extended `executeApprovedAction()` signature to accept optional `runtimeParams?: Record<string, unknown>`.
  - Computes `runtimeHash = computeActionHash(plan.actionType, runtimeTarget, runtimeParams)`.
  - Enforces `runtimeHash === plan.actionHash` before invoking the executor.
  - Immediately rejects execution, invalidates the plan, and logs security events if the runtime parameters differ from the approved plan.
- **lib/computer/toolRegistry.ts**:
  - Passes runtime `params` directly to `executeApprovedAction(context.planId, context.executionGrantToken, ..., params)` ensuring that all tool executions are bound to the approved plan's canonical action hash.

---

### Automated Test Harness
- **scripts/test_phase1_1_adversarial.cjs**:
  - Created comprehensive 14-test adversarial suite validating all vectors (Boolean spoofing, bridge bypassing, forged signatures, path mismatches, grant expirations, replay attacks, parameter substitutions, and argument tampering).
- **scripts/test_phase1_battery.cjs**:
  - Updated Test 12 to test authorized overwrites with cryptographic execution grants.
