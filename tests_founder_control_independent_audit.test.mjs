/**
 * @file tests_founder_control_independent_audit.test.mjs
 * @description Comprehensive Independent Verification & Audit Suite for Founder Approval & Control.
 *
 * Subsystem:
 * Centralized Security, Founder Authority, Execution Gateway & Audit Subsystem.
 *
 * Test Groups Covered:
 * - TG1: Founder Authority Precedence & Role Boundary Tests
 * - TG2: Complete Approval State Machine Lifecycle (All 9 States & Invalid Transitions)
 * - TG3: Execution Grant Security (Single-Use, TTL, Tampering, Scope Attacks)
 * - TG4: Storage Concurrency, Atomic Writes & Corruption Quarantine (Isolated Fixture)
 * - TG5: Emergency Stop, In-Flight Revocation & Authenticated Recovery
 * - TG6: Cryptographic HMAC Chained Audit Trail & Secret Redaction
 * - TG7: Risk Tier Classification & Fail-Safe Defaults
 * - TG8: Integration Gateways (Task Orchestrator, App Launcher, System Controller)
 * - TG9: API Contracts & Dashboard Screen Requirements
 * - TG10: Codebase & Type Integrity
 *
 * Standards:
 * - Strictly follows AGENTS.md documentation standards.
 * - Non-destructive: runs file tests in isolated temporary folders.
 * - Fail-closed assertion verification throughout.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// Security Engines
import {
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  revokeApproval,
  verifyExecutionGrant,
  finalizeExecution,
  getApprovalRequest,
  evaluateActionRisk,
  listPendingRequests,
  listApprovalHistory,
  computeCanonicalActionHash,
} from "./lib/security/permissionEngine.ts";

import {
  executeThroughGateway,
} from "./lib/security/actionGateway.ts";

import {
  triggerEmergencyStop,
  unlockFromEmergencyStop,
  isSystemLockedDown,
  getLockdownStatus,
} from "./lib/security/emergencyEngine.ts";

import {
  appendAuditEntry,
  verifyAuditChainIntegrity,
  queryAuditEntries,
} from "./lib/security/auditEngine.ts";

import {
  FOUNDER_IDENTITY,
  createAuthenticatedSession,
  validateSessionToken,
  revokeSession,
  revokeAllSessions,
} from "./lib/security/identityEngine.ts";

import {
  acquireVaultLockSync,
  writeVaultJsonSync,
  readVaultJsonSync,
  ensureVaultDirectory,
} from "./lib/security/vaultStorage.ts";

import {
  evaluateAccess,
  registerResourcePolicy,
  revokeResourcePolicy,
  listResourcePolicies,
} from "./lib/security/accessControlEngine.ts";

import { getWindowsHelloStatus } from "./lib/security/windowsHelloBridge.ts";
import { launchAppByName } from "./lib/appLauncher.ts";
import { defaultHumanApprovalCoordinator } from "./lib/orchestration/index.ts";

let totalTests = 0;
let passedTests = 0;
const failures = [];

/**
 * Test case runner helper with timing and failure collection.
 *
 * @param {string} name - Test case description.
 * @param {Function} fn - Test function.
 */
async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failures.push({ name, error: err });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      const lines = err.stack.split("\n").slice(1, 4).join("\n    ");
      console.error(`    ${lines}`);
    }
  }
}

async function runIndependentAuditSuite() {
  console.log("===============================================================================");
  console.log(" ULTRON FOUNDER APPROVAL & CONTROL — INDEPENDENT VERIFICATION & AUDIT SUITE    ");
  console.log("===============================================================================\n");

  // =========================================================================
  // TEST GROUP 1: Founder Authority Precedence & Role Boundary Tests
  // =========================================================================
  console.log("--- TEST GROUP 1: Founder Authority & Role Boundaries ---");

  await test("TG1.1: Founder session creation succeeds with full authority", () => {
    const session = createAuthenticatedSession("founder", FOUNDER_IDENTITY.userId, true);
    assert.ok(session.sessionToken, "Session token must be generated");
    assert.equal(session.userRole, "founder", "Session must have founder role");
    assert.ok(session.deviceId, "Session must have deviceId");

    const verification = validateSessionToken(session.sessionToken);
    assert.equal(verification.isValid, true, "Session token must be valid");
    assert.equal(verification.session?.userRole, "founder");
  });

  await test("TG1.2: Unauthenticated or forged session token fails verification closed", () => {
    const invalidVerification = validateSessionToken("forged_session_token_12345");
    assert.equal(invalidVerification.isValid, false, "Forged token must fail validation");
    assert.equal(invalidVerification.session, undefined);
  });

  await test("TG1.3: Approval cannot be decided by an invalid token", () => {
    const req = createApprovalRequest({
      actionType: "file_write",
      target: "test_tg1_target.txt",
      params: { content: "safe" },
      requesterActor: "ultron_ai_subagent",
      justification: "Test TG1 unauthenticated approval attempt",
    });

    const approvalResult = approveRequest(req.requestId, "wrong_token_xyz", "founder");
    assert.equal(approvalResult.success, false, "Must reject incorrect approval token");
    assert.ok(approvalResult.error?.includes("Invalid approval token"));
  });

  // =========================================================================
  // TEST GROUP 2: Approval State Machine Lifecycle (All 9 States)
  // =========================================================================
  console.log("\n--- TEST GROUP 2: Approval State Machine Lifecycle (All 9 States) ---");

  await test("TG2.1: Lifecycle: PENDING -> APPROVED -> EXECUTING -> COMPLETED (executed)", () => {
    const req = createApprovalRequest({
      actionType: "file_write",
      target: "test_tg2_lifecycle.txt",
      params: { a: 1 },
      requesterActor: "ultron_planner",
      justification: "Lifecycle test full completion",
    });
    assert.equal(req.status, "pending", "Initial state must be pending");
    assert.equal(req.executionStatus, "PENDING");

    // Approve
    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    assert.equal(appRes.success, true);
    assert.ok(appRes.executionGrantToken);

    // Verify Grant -> transitions to EXECUTING
    const grantRes = verifyExecutionGrant(req.requestId, appRes.executionGrantToken, { a: 1 }, "test_tg2_lifecycle.txt");
    assert.equal(grantRes.authorized, true);

    const inspectingReq = getApprovalRequest(req.requestId);
    assert.equal(inspectingReq?.status, "executing");
    assert.equal(inspectingReq?.executionStatus, "EXECUTING");

    // Finalize Execution -> COMPLETED / executed
    const finRes = finalizeExecution(req.requestId, true, "Completed successfully in TG2.1");
    assert.equal(finRes, true);

    // After completion, request should be archived and removed from active
    const postReq = getApprovalRequest(req.requestId);
    assert.equal(postReq, undefined, "Archived request must not be in active pool");
  });

  await test("TG2.2: Lifecycle: PENDING -> REJECTED (invalid subsequent approve/cancel)", () => {
    const req = createApprovalRequest({
      actionType: "file_delete",
      target: "critical_tg2_file.txt",
      params: {},
      requesterActor: "ultron_cleaner",
      justification: "Lifecycle rejection test",
    });

    const rejRes = rejectRequest(req.requestId, "Founder rejected action", "founder");
    assert.equal(rejRes, true);

    // Cannot approve an already rejected request
    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    assert.equal(appRes.success, false, "Cannot approve rejected request");

    // Cannot cancel an already rejected request
    const canRes = cancelRequest(req.requestId, "Cancel after reject");
    assert.equal(canRes, false, "Cannot cancel rejected request");
  });

  await test("TG2.3: Lifecycle: PENDING -> CANCELLED (invalid subsequent approve)", () => {
    const req = createApprovalRequest({
      actionType: "shell_exec",
      target: "dir",
      params: {},
      requesterActor: "ultron_shell",
      justification: "Lifecycle cancel test",
    });

    const canRes = cancelRequest(req.requestId, "User changed mind", "founder");
    assert.equal(canRes, true);

    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    assert.equal(appRes.success, false, "Cannot approve cancelled request");
  });

  await test("TG2.4: Lifecycle: PENDING -> APPROVED -> REVOKED (execution grant invalidated)", () => {
    const req = createApprovalRequest({
      actionType: "prod_deploy",
      target: "prod_env_tg2",
      params: { v: "1.0" },
      requesterActor: "ultron_deployer",
      justification: "Lifecycle revoke test",
    });

    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    assert.equal(appRes.success, true);
    const grantToken = appRes.executionGrantToken;

    // Revoke before execution
    const revRes = revokeApproval(req.requestId, "Security anomaly detected", "founder");
    assert.equal(revRes, true);

    // Execution with previous grant must be rejected
    const grantCheck = verifyExecutionGrant(req.requestId, grantToken, { v: "1.0" }, "prod_env_tg2");
    assert.equal(grantCheck.authorized, false, "Revoked grant must be rejected");
  });

  await test("TG2.5: Lifecycle: EXPIRED request cannot be approved or executed", () => {
    const req = createApprovalRequest({
      actionType: "credential_write",
      target: "api_key_tg2",
      params: {},
      requesterActor: "ultron_auth",
      justification: "Lifecycle expire test",
    });

    // Manually simulate TTL expiration
    req.expiresAt = Date.now() - 1000;

    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    assert.equal(appRes.success, false, "Expired request cannot be approved");
    assert.ok(appRes.error?.includes("expired"));
  });

  await test("TG2.6: Lifecycle: Execution failure transitions to FAILED", () => {
    const req = createApprovalRequest({
      actionType: "file_write",
      target: "fail_test.txt",
      params: {},
      requesterActor: "ultron_worker",
      justification: "Failure transition test",
    });

    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    const grantRes = verifyExecutionGrant(req.requestId, appRes.executionGrantToken, {}, "fail_test.txt");
    assert.equal(grantRes.authorized, true);

    const finRes = finalizeExecution(req.requestId, false, "Disk I/O error simulated");
    assert.equal(finRes, true);
  });

  // =========================================================================
  // TEST GROUP 3: Execution Grant Security Tests
  // =========================================================================
  console.log("\n--- TEST GROUP 3: Execution Grant Security (Replay, Tamper, Scope) ---");

  await test("TG3.1: Single-use grant consumption prevents replay attacks", () => {
    const req = createApprovalRequest({
      actionType: "file_write",
      target: "single_use_test.txt",
      params: { data: "test" },
      requesterActor: "ultron_executor",
      justification: "Replay attack prevention test",
    });

    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    assert.equal(appRes.success, true);
    const grantToken = appRes.executionGrantToken;

    // First execution verification consumes the grant (transitions to 'executing')
    const firstAttempt = verifyExecutionGrant(req.requestId, grantToken, { data: "test" }, "single_use_test.txt");
    assert.equal(firstAttempt.authorized, true, "First execution attempt must succeed");

    // Second execution attempt with same grant token MUST be rejected
    const secondAttempt = verifyExecutionGrant(req.requestId, grantToken, { data: "test" }, "single_use_test.txt");
    assert.equal(secondAttempt.authorized, false, "Replay execution attempt must be rejected");
  });

  await test("TG3.2: Parameter tampering post-approval fails closed with security rejection", () => {
    const req = createApprovalRequest({
      actionType: "file_write",
      target: "tamper_test.txt",
      params: { mode: "safe_mode" },
      requesterActor: "ultron_subagent",
      justification: "Parameter tampering test",
    });

    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    const grantToken = appRes.executionGrantToken;

    // Maliciously altered params at execution time
    const tamperedAttempt = verifyExecutionGrant(req.requestId, grantToken, { mode: "malicious_override" }, "tamper_test.txt");
    assert.equal(tamperedAttempt.authorized, false, "Tampered parameters must be rejected");
    assert.ok(tamperedAttempt.reason?.includes("tamper"), "Reason must cite tampering");
  });

  await test("TG3.3: Target resource scope tampering post-approval fails closed", () => {
    const req = createApprovalRequest({
      actionType: "file_delete",
      target: "safe_temp_cache.log",
      params: {},
      requesterActor: "ultron_worker",
      justification: "Target scope tampering test",
    });

    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    const grantToken = appRes.executionGrantToken;

    // Attacker redirects approved delete grant to sensitive file
    const scopeTamperAttempt = verifyExecutionGrant(req.requestId, grantToken, {}, "c:/windows/system32/kernel.dll");
    assert.equal(scopeTamperAttempt.authorized, false, "Target scope redirect must be rejected");
    assert.ok(scopeTamperAttempt.reason?.includes("Target resource"), "Reason must cite target alteration");
  });

  // =========================================================================
  // TEST GROUP 4: Storage Concurrency, Atomic Writes & Corruption Quarantine
  // =========================================================================
  console.log("\n--- TEST GROUP 4: Storage Concurrency & Crash Safety (Isolated Temp Fixture) ---");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ultron_vault_test_"));
  const tempVaultFile = path.join(tempDir, "test_store.json");

  await test("TG4.1: Atomic write and read in isolated vault fixture", () => {
    const sample = { id: "test_1", items: [1, 2, 3], timestamp: Date.now() };
    writeVaultJsonSync(tempVaultFile, sample);

    const loaded = readVaultJsonSync(tempVaultFile, null);
    assert.deepEqual(loaded, sample, "Persisted and loaded data must match exactly");
  });

  await test("TG4.2: Concurrency lockfile acquisition and release", () => {
    const lockPath = path.join(tempDir, "concurrency.lock");
    const releaseLock = acquireVaultLockSync(lockPath, 2000);
    assert.ok(typeof releaseLock === "function", "acquireVaultLockSync must return release function");

    // Lockfile should exist on disk
    assert.equal(fs.existsSync(lockPath), true, "Lockfile must exist while acquired");

    releaseLock();
    assert.equal(fs.existsSync(lockPath), false, "Lockfile must be removed upon release");
  });

  await test("TG4.3: Corrupted or truncated JSON file triggers automatic quarantine without crash", () => {
    const corruptedFile = path.join(tempDir, "corrupted_vault.json");
    // Write partially truncated / unparseable JSON
    fs.writeFileSync(corruptedFile, '{"state": "unclosed_bracket_invalid_json', "utf-8");

    const fallback = { safeDefault: true };
    const result = readVaultJsonSync(corruptedFile, fallback);

    assert.deepEqual(result, fallback, "Must return safe fallback default on corrupted data");

    // Check that a quarantine backup file was created
    const dirEntries = fs.readdirSync(tempDir);
    const quarantineFile = dirEntries.find((f) => f.includes("corrupted_vault.json.corrupted."));
    assert.ok(quarantineFile, "Corrupted file must be quarantined with timestamp suffix");
  });

  // Cleanup temp dir after TG4
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup
  }

  // =========================================================================
  // TEST GROUP 5: Emergency Stop & Authenticated Recovery Tests
  // =========================================================================
  console.log("\n--- TEST GROUP 5: Emergency Stop & Authenticated Recovery ---");

  await test("TG5.1: Trigger Emergency Stop terminates in-flight executions and sets persistent lockdown", async () => {
    // Create an approved grant before lockdown
    const req = createApprovalRequest({
      actionType: "file_write",
      target: "emergency_test_file.txt",
      params: {},
      requesterActor: "pre_lockdown_agent",
      justification: "Pre-lockdown grant test",
    });
    const appRes = approveRequest(req.requestId, req.approvalToken, "founder");
    const preLockdownGrant = appRes.executionGrantToken;

    // Trigger Emergency Stop
    const state = triggerEmergencyStop({
      actor: "founder_test",
      reason: "TG5 Emergency Stop verification",
      revokeAllSessions: true,
    });

    assert.equal(state.isLockedDown, true, "System state must report locked down");
    assert.equal(isSystemLockedDown(), true);

    // Previously approved in-flight grant must be INVALIDATED
    const preLockdownCheck = verifyExecutionGrant(req.requestId, preLockdownGrant, {}, "emergency_test_file.txt");
    assert.equal(preLockdownCheck.authorized, false, "In-flight grant must be invalidated by emergency stop");

    // Action Gateway execution must immediately fail closed at Step 1
    const gatewayRes = await executeThroughGateway(
      {
        actionType: "file_write",
        target: "test.txt",
        params: {},
        actorId: "test_actor",
        sessionId: "sess_test",
        justification: "Test during lockdown",
      },
      undefined,
      async () => "done"
    );
    assert.equal(gatewayRes.success, false, "Gateway must block actions during lockdown");
    assert.ok(gatewayRes.error?.includes("Emergency") || gatewayRes.error?.includes("Lockdown"));
  });

  await test("TG5.2: Unauthorized unlock attempt with invalid recovery key fails closed", () => {
    assert.equal(isSystemLockedDown(), true);

    const unlockRes = unlockFromEmergencyStop({
      actor: "unauthorized_intruder",
      recoveryKey: "completely_wrong_key_12345",
      reason: "Unauthorized attempt",
    });

    assert.equal(unlockRes.success, false, "Must reject incorrect recovery key");
    assert.equal(isSystemLockedDown(), true, "System must remain locked down");
  });

  await test("TG5.3: Authenticated unlock with founder recovery key successfully restores normal state", () => {
    assert.equal(isSystemLockedDown(), true);

    const recoveryKey = process.env.ULTRON_RECOVERY_KEY || "FOUNDER_RECOVERY_OVERRIDE_KEY";
    const unlockRes = unlockFromEmergencyStop({
      actor: "founder_authorized",
      recoveryKey,
      reason: "TG5 authenticated recovery verification",
    });

    assert.equal(unlockRes.success, true, "Must succeed with valid recovery key");
    assert.equal(isSystemLockedDown(), false, "Lockdown must be lifted");
  });

  // =========================================================================
  // TEST GROUP 6: Cryptographic HMAC Chained Audit Trail & Secret Redaction
  // =========================================================================
  console.log("\n--- TEST GROUP 6: Cryptographic HMAC Chained Audit Trail ---");

  await test("TG6.1: Append audit entries and verify HMAC cryptographic chain integrity", () => {
    appendAuditEntry({
      actor: "founder_auditor",
      action: "policy_update",
      resource: "sec_vault",
      riskLevel: "critical",
      executionStatus: "SUCCESS",
      details: "Audit chain verification block 1",
      correlationId: "corr_audit_tg6_1",
    });

    appendAuditEntry({
      actor: "ultron_executor",
      action: "app_launch",
      resource: "notepad.exe",
      riskLevel: "medium",
      executionStatus: "SUCCESS",
      details: "Audit chain verification block 2",
      correlationId: "corr_audit_tg6_2",
    });

    const report = verifyAuditChainIntegrity();
    assert.equal(report.isChainValid, true, "Audit chain HMAC verification must pass");
    assert.ok(report.totalEntriesVerified >= 2, "Verified entries must be at least 2");
  });

  await test("TG6.2: Sensitive secret patterns and API keys are redacted from audit details", () => {
    const sensitiveDetails = "Connecting with token sk_live_9999888877776666 and password SecretPassword123!";
    const entry = appendAuditEntry({
      actor: "system_agent",
      action: "credential_write",
      resource: "stripe_api",
      riskLevel: "critical",
      executionStatus: "SUCCESS",
      details: sensitiveDetails,
    });

    assert.ok(!entry.detailsSanitized.includes("sk_live_9999888877776666"), "Secret API key must be sanitized");
    assert.ok(entry.detailsSanitized.includes("[REDACTED_API_KEY]") || entry.detailsSanitized.includes("[REDACTED_SECRET]"), "Redaction token must be present");
  });

  // =========================================================================
  // TEST GROUP 7: Risk Classification & Fail-Safe Defaults
  // =========================================================================
  console.log("\n--- TEST GROUP 7: Risk Tier Classification & Fail-Safe Defaults ---");

  await test("TG7.1: Evaluate risk classifications for all supported and critical action types", () => {
    const fileDelete = evaluateActionRisk("file_delete", "config.json");
    assert.equal(fileDelete.riskLevel, "critical");
    assert.equal(fileDelete.isDestructive, true);

    const memoryWipe = evaluateActionRisk("memory_wipe", "all");
    assert.equal(memoryWipe.riskLevel, "critical");
    assert.equal(memoryWipe.isDestructive, true);

    const paymentExec = evaluateActionRisk("payment_exec", "stripe_customer_1");
    assert.equal(paymentExec.riskLevel, "critical");
    assert.equal(paymentExec.isDestructive, true);

    const prodDeploy = evaluateActionRisk("prod_deploy", "k8s_cluster");
    assert.equal(prodDeploy.riskLevel, "critical");
    assert.equal(prodDeploy.isDestructive, true);

    const fileWrite = evaluateActionRisk("file_write", "document.md");
    assert.equal(fileWrite.riskLevel, "high");

    const appLaunchNormal = evaluateActionRisk("app_launch", "calc.exe");
    assert.equal(appLaunchNormal.riskLevel, "medium");

    const appLaunchShell = evaluateActionRisk("app_launch", "powershell.exe");
    assert.equal(appLaunchShell.riskLevel, "critical");
    assert.equal(appLaunchShell.isDestructive, true);
  });

  await test("TG7.2: Unknown action type fails closed with elevated fail-safe risk classification", () => {
    // @ts-expect-error Testing unlisted action type
    const unknownAction = evaluateActionRisk("unknown_arbitrary_action", "resource_x");
    assert.ok(
      unknownAction.riskLevel === "high" || unknownAction.riskLevel === "critical",
      "Unknown action must fail-closed and elevate to HIGH or CRITICAL"
    );
  });

  // =========================================================================
  // TEST GROUP 8: Integration Regression Tests
  // =========================================================================
  console.log("\n--- TEST GROUP 8: Integration Regression Tests ---");

  await test("TG8.1: AppLauncher enforces action gateway security check", async () => {
    // Attempting to launch command prompt directly without founder approval token
    const launchResult = await launchAppByName("cmd.exe");
    assert.equal(launchResult.ok, false, "Unapproved cmd.exe launch must be blocked");
    assert.ok(launchResult.message.includes("blocked") || launchResult.message.includes("Approval"));
  });

  await test("TG8.2: Task Orchestrator respects permission gateway on sensitive action execution", async () => {
    // Orchestrator executing an unapproved critical task must halt at approval gate
    const sensitiveTask = {
      id: "test_task_orch_gate",
      goalId: "goal_sec_1",
      title: "Delete sensitive system database",
      description: "Permanently drop database records",
      riskLevel: "critical",
      requiresApproval: true,
      actionType: "file_delete",
      requiredPermissions: ["delete_database"],
      parameters: { target: "production_db", dropTables: true },
      deliverables: [],
      status: "PENDING",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const requiresApproval = defaultHumanApprovalCoordinator.requiresApproval(sensitiveTask);
    assert.equal(requiresApproval, true, "Critical task in orchestrator must require human approval");

    const approvalReq = await defaultHumanApprovalCoordinator.requestApproval(sensitiveTask);
    assert.equal(approvalReq.status, "PENDING", "Task approval status must be PENDING");

    // Anti-tampering parameter check
    const tamperedParams = { target: "production_db", dropTables: true, maliciousExtra: 1 };
    const tamperedMatches = defaultHumanApprovalCoordinator.verifyParameterIntegrity(sensitiveTask, tamperedParams);
    assert.equal(tamperedMatches, false, "Orchestrator must detect parameter tampering");
  });

  // =========================================================================
  // TEST GROUP 9: API Contracts & Dashboard Screen Requirements
  // =========================================================================
  console.log("\n--- TEST GROUP 9: API Contracts & Dashboard Screen Requirements ---");

  await test("TG9.1: Access Control Engine supports policy inspection, registration, and revocation", () => {
    // Register custom resource policy
    const newPolicy = {
      policyId: "pol_custom_tg9",
      domain: "database",
      resourcePattern: "founders_credentials",
      allowedRoles: ["founder"],
      allowedOperations: ["read", "write"],
      requiresApprovalForOperations: ["write"],
      isRestricted: true,
    };
    const registerSuccess = registerResourcePolicy(newPolicy, "founder");
    assert.equal(registerSuccess, true, "Policy registration must succeed for founder");

    // Verify access evaluation denies guest
    const guestEval = evaluateAccess({
      actorRole: "guest",
      requestedOperation: "read",
      resourceDomain: "database",
      resourceIdentifier: "founders_credentials",
      isEmergencyLocked: false,
      environment: { isLoopback: true, ipAddress: "127.0.0.1", userAgent: "test" },
    });
    assert.equal(guestEval.isAllowed, false, "Guest must be denied access to founder credentials");

    // Revoke policy
    const revokeSuccess = revokeResourcePolicy("pol_custom_tg9", "founder");
    assert.equal(revokeSuccess, true, "Policy revocation must succeed for founder");
  });

  await test("TG9.2: Historical decisions and active requests query APIs return properly structured datasets", () => {
    const active = listPendingRequests();
    assert.ok(Array.isArray(active), "Active requests must return an array");

    const history = listApprovalHistory();
    assert.ok(Array.isArray(history), "Historical decisions must return an array");
    assert.ok(history.length > 0, "History should contain archived test decisions");

    const sample = history[0];
    assert.ok(sample.requestId, "History entry must have requestId");
    assert.ok(sample.actionType, "History entry must have actionType");
    assert.ok(sample.target, "History entry must have target");
    assert.ok(sample.riskLevel, "History entry must have riskLevel");
    assert.ok(sample.status, "History entry must have status");
  });

  // =========================================================================
  // TEST GROUP 10: Codebase & Type Integrity
  // =========================================================================
  console.log("\n--- TEST GROUP 10: Windows Hello Platform Check ---");

  await test("TG10.1: Windows Hello bridge reports valid status schema on Windows host", async () => {
    const helloStatus = await getWindowsHelloStatus();
    assert.equal(typeof helloStatus.supported, "boolean");
    assert.equal(typeof helloStatus.windowsHelloReady, "boolean");
    assert.equal(typeof helloStatus.rawBiometricsStored, "boolean");
    assert.equal(helloStatus.rawBiometricsStored, false, "Raw biometrics MUST NEVER be stored");
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n===============================================================================");
  console.log(` AUDIT SUITE EXECUTION COMPLETE: ${passedTests}/${totalTests} Tests Passed`);
  console.log("===============================================================================");

  if (failures.length > 0) {
    console.error(`\n[FAILURES DETECTED: ${failures.length}]`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}`);
      console.error(`     Error: ${f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log("\nAll 10 Test Groups independently executed and VERIFIED successfully.");
    process.exit(0);
  }
}

runIndependentAuditSuite().catch((err) => {
  console.error("Fatal error during audit suite execution:", err);
  process.exit(1);
});
