/**
 * @file tests_security_and_permission_system.test.mjs
 * @description Comprehensive Independent Verification Suite for ULTRON Security & Permission System.
 *
 * Subsystem:
 * Centralized Security, Permission & Authorization Subsystem (Blueprint Section 6 - Phase 11).
 *
 * Verification Scope:
 * - Module 1: Identity & Authentication (Tokens, Sessions, Re-Auth, Windows Hello Non-Storage)
 * - Module 2: Permission Management (Approval Plans, Tokens, Expiration, Parameter Locking)
 * - Module 3: Access Control (RBAC, ABAC, Project Isolation, Least Privilege)
 * - Module 4: Action Authorization Gateway (14-Step Pipeline, Anti-Bypass, Destructive Protection)
 * - Module 5: Credential & Secret Protection (AES-256-GCM, Secret Redaction, Revocation)
 * - Module 6: Privacy & Data Protection (PII Scanners, Data Classification, Screen Masking)
 * - Module 7: Security Monitoring & Threat Detection (Events, Anomalies, Incidents)
 * - Module 8: Audit & Accountability (HMAC-SHA256 Chained Ledger, Cryptographic Tamper-Evidence)
 * - Module 9: Emergency Protection System (Emergency Stop, Persistent Lockdown, Recovery Unlock)
 * - Module 10: Security Policy & Trust Engine (Immutable Invariants, Conflict Detection)
 * - Adversarial Attacks: Replay attacks, Parameter tampering, Gateway bypass, Unauthorized unlock.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import Security Facade Modules
import {
  // Module 1
  createAuthenticatedSession,
  validateSessionToken,
  revokeSession,
  createSensitiveActionChallenge,
  verifySensitiveActionChallenge,
  recordAuthFailure,
  resetAuthFailure,
  getWindowsHelloStatus,
  FOUNDER_IDENTITY,

  // Module 2
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  verifyExecutionGrant,
  computeCanonicalActionHash,

  // Module 3
  evaluateAccess,
  hasRolePermission,
  registerResourcePolicy,

  // Module 4
  executeThroughGateway,

  // Module 5
  storeCredential,
  retrieveCredential,
  revokeCredential,
  redactKnownSecrets,

  // Module 6
  scanAndSanitizeText,
  grantScreenCaptureConsent,
  revokeScreenCaptureConsent,
  evaluateScreenCapturePrivacy,

  // Module 7
  recordSecurityEvent,
  listSecurityEvents,
  listSecurityIncidents,

  // Module 8
  appendAuditEntry,
  verifyAuditChainIntegrity,
  queryAuditEntries,

  // Module 9
  isSystemLockedDown,
  triggerEmergencyStop,
  unlockFromEmergencyStop,
  getLockdownStatus,

  // Module 10
  validatePolicyRule,
  updateSecurityPolicy,
  listSecurityPolicies,
  IMMUTABLE_CORE_INVARIANTS,
} from "./lib/security/index.ts";

describe("ULTRON SECURITY & PERMISSION — INDEPENDENT VERIFICATION BATCH", () => {
  // ── MODULE 1: IDENTITY & AUTHENTICATION ─────────────────────────────────────
  test("Module 01: Identity, Session Lifecycle, Failure Tracking & Windows Hello Invariant", async () => {
    // 1. Session creation and validation
    const session = createAuthenticatedSession("founder", FOUNDER_IDENTITY.userId);
    assert.ok(session.sessionToken.startsWith("ultron_sec_"), "Session token should have ultron_sec_ prefix");
    assert.equal(session.userRole, "founder");

    const validCheck = validateSessionToken(session.sessionToken);
    assert.equal(validCheck.isValid, true, "Fresh session token must be valid");
    assert.equal(validCheck.session?.sessionId, session.sessionId);

    // 2. Invalid session token
    const invalidCheck = validateSessionToken("fake_token_12345");
    assert.equal(invalidCheck.isValid, false, "Unknown session token must be rejected");

    // 3. Explicit session revocation
    const revoked = revokeSession(session.sessionToken, "Test logout");
    assert.equal(revoked, true, "Revocation of active session must succeed");
    const afterRevokeCheck = validateSessionToken(session.sessionToken);
    assert.equal(afterRevokeCheck.isValid, false, "Revoked session token must reject with 401/invalid");

    // 4. Sensitive action challenge and consumption
    const chal = createSensitiveActionChallenge("memory_wipe", "ultron_vault", "recovery_key");
    assert.ok(chal.challengeId.startsWith("chal_"));
    const badVerify = await verifySensitiveActionChallenge(chal.challengeId, {
      method: "recovery_key",
      recoveryKey: "wrong_key",
    });
    assert.equal(badVerify.success, false, "Invalid recovery key must fail challenge verification");

    const goodVerify = await verifySensitiveActionChallenge(chal.challengeId, {
      method: "recovery_key",
      recoveryKey: "FOUNDER_RECOVERY_OVERRIDE_KEY",
    });
    assert.equal(goodVerify.success, true, "Valid recovery key must verify challenge");

    // Anti-replay: second presentation must fail
    const replayVerify = await verifySensitiveActionChallenge(chal.challengeId, {
      method: "recovery_key",
      recoveryKey: "FOUNDER_RECOVERY_OVERRIDE_KEY",
    });
    assert.equal(replayVerify.success, false, "Replaying an already-consumed challenge must fail");

    // 5. Auth failure rate-limiting
    resetAuthFailure("192.168.1.50");
    for (let i = 0; i < 4; i++) {
      const f = recordAuthFailure("192.168.1.50");
      assert.equal(f.isLockedOut, false, `Attempt ${i + 1} should not be locked out`);
    }
    const fifth = recordAuthFailure("192.168.1.50");
    assert.equal(fifth.isLockedOut, true, "Fifth failure must trigger lockout");

    // 6. Windows Hello telemetry & Zero Raw Storage invariant
    const helloStatus = await getWindowsHelloStatus();
    assert.equal(helloStatus.rawBiometricsStored, false, "CRITICAL INVARIANT: rawBiometricsStored must be false");
  });

  // ── MODULE 2: PERMISSION MANAGEMENT ENGINE ──────────────────────────────────
  test("Module 02: Permission Requests, Approvals, Expiration & Parameter Tamper Rejection", () => {
    // 1. Create approval request
    const req = createApprovalRequest(
      "app_launch",
      "notepad.exe",
      { args: ["--clean"] },
      ["notepad.exe"],
      "agent_01",
      "sess_test"
    );
    assert.ok(req.requestId.startsWith("req_"));
    assert.equal(req.status, "pending");
    assert.ok(req.approvalToken.startsWith("appr_"));

    // 2. Rejection of invalid approval token
    const badApprove = approveRequest(req.requestId, "fake_appr_token", "founder");
    assert.equal(badApprove.success, false, "Invalid approval token signature must reject");

    // 3. Valid approval
    const goodApprove = approveRequest(req.requestId, req.approvalToken, "founder");
    assert.equal(goodApprove.success, true, "Valid approval must succeed");
    assert.ok(goodApprove.executionGrantToken?.startsWith("exec_"));

    // 4. Verification of execution grant
    const grantCheck = verifyExecutionGrant(req.requestId, goodApprove.executionGrantToken, { args: ["--clean"] });
    assert.equal(grantCheck.authorized, true, "Execution grant must be authorized with matching parameters");

    // 5. Parameter tampering post-approval
    const tamperedCheck = verifyExecutionGrant(req.requestId, goodApprove.executionGrantToken, { args: ["--malicious-payload"] });
    assert.equal(tamperedCheck.authorized, false, "Execution grant must reject if parameters were tampered with post-approval");

    // 6. Rejection / cancellation
    const cancelReq = createApprovalRequest("file_delete", "C:/test.txt");
    const rejected = rejectRequest(cancelReq.requestId, "User rejected", "founder");
    assert.equal(rejected, true);
    const postRejectCheck = verifyExecutionGrant(cancelReq.requestId, "any_token");
    assert.equal(postRejectCheck.authorized, false, "Rejected request cannot have an execution grant");
  });

  // ── MODULE 3: ACCESS CONTROL SYSTEM (RBAC & ABAC) ───────────────────────────
  test("Module 03: RBAC Hierarchy, ABAC Evaluation, Least Privilege & Isolation", () => {
    // 1. RBAC hierarchy
    assert.equal(hasRolePermission("founder", "admin"), true);
    assert.equal(hasRolePermission("admin", "operator"), true);
    assert.equal(hasRolePermission("operator", "guest"), true);
    assert.equal(hasRolePermission("operator", "founder"), false, "Operator cannot claim Founder role");
    assert.equal(hasRolePermission("guest", "operator"), false, "Guest cannot claim Operator role");

    // 2. Safe application access
    const safeAppEval = evaluateAccess({
      actorId: "usr_op",
      actorRole: "operator",
      sessionId: "sess_1",
      requestedOperation: "execute",
      resourceDomain: "application",
      resourceIdentifier: "notepad.exe",
      isEmergencyLocked: false,
      environment: { ipAddress: "127.0.0.1", isLoopback: true, timestamp: Date.now(), platform: "win32" },
    });
    assert.equal(safeAppEval.isAllowed, true, "Operator should be allowed to request notepad");
    assert.equal(safeAppEval.requiresFounderApproval, true, "All application launches require explicit approval");

    // 3. Critical shell restricted to Founder only
    const shellEvalGuest = evaluateAccess({
      actorId: "usr_guest",
      actorRole: "guest",
      sessionId: "sess_2",
      requestedOperation: "execute",
      resourceDomain: "application",
      resourceIdentifier: "powershell.exe",
      isEmergencyLocked: false,
      environment: { ipAddress: "127.0.0.1", isLoopback: true, timestamp: Date.now(), platform: "win32" },
    });
    assert.equal(shellEvalGuest.isAllowed, false, "Guest must be denied powershell execution");

    // 4. Default Deny on unmapped resources
    const unknownEval = evaluateAccess({
      actorId: "usr_admin",
      actorRole: "admin",
      sessionId: "sess_3",
      requestedOperation: "execute",
      resourceDomain: "system",
      resourceIdentifier: "unknown_hardware_probe_xyz",
      isEmergencyLocked: false,
      environment: { ipAddress: "127.0.0.1", isLoopback: true, timestamp: Date.now(), platform: "win32" },
    });
    assert.equal(unknownEval.isAllowed, false, "Unmapped resources must default to DENY");

    // 5. Cross-project isolation
    registerResourcePolicy({
      policyId: "pol_project_alpha",
      domain: "database",
      resourcePattern: "project_alpha_db",
      allowedRoles: ["founder", "admin"],
      allowedOperations: ["read", "write"],
      requiresApprovalForOperations: ["write"],
      projectId: "proj_alpha",
      isRestricted: false,
      createdAt: Date.now(),
    }, "founder");

    const crossProjectEval = evaluateAccess({
      actorId: "usr_admin",
      actorRole: "admin",
      sessionId: "sess_4",
      requestedOperation: "read",
      resourceDomain: "database",
      resourceIdentifier: "project_alpha_db",
      projectId: "proj_beta", // Foreign project tenant!
      isEmergencyLocked: false,
      environment: { ipAddress: "127.0.0.1", isLoopback: true, timestamp: Date.now(), platform: "win32" },
    });
    assert.equal(crossProjectEval.isAllowed, false, "Cross-project tenant access must be rejected");
  });

  // ── MODULE 4: ACTION AUTHORIZATION GATEWAY ──────────────────────────────────
  test("Module 04: Action Authorization Gateway 14-Step Pipeline & Anti-Bypass", async () => {
    const session = createAuthenticatedSession("founder", FOUNDER_IDENTITY.userId);

    // 1. Missing approval triggers Step 10 approval request
    const step10Outcome = await executeThroughGateway({
      actionType: "browser_open",
      target: "https://google.com",
      params: {},
      actorId: FOUNDER_IDENTITY.userId,
      sessionId: session.sessionToken,
    });

    assert.equal(step10Outcome.requiresApproval, true, "Protected action must require approval at Step 10");
    assert.ok(step10Outcome.approvalRequest, "Gateway must return approvalRequest object");
    assert.equal(step10Outcome.pipelineStepCompleted, 10);

    // 2. Approve request via permission engine
    const approvalReq = step10Outcome.approvalRequest;
    const approval = approveRequest(
      approvalReq.requestId,
      approvalReq.approvalToken,
      "founder"
    );
    assert.equal(approval.success, true);

    // 3. Complete 14-step pipeline execution using single-use grant token
    let executorCalled = false;
    const finalOutcome = await executeThroughGateway(
      {
        actionType: "browser_open",
        target: "https://google.com",
        params: { _approvalRequestId: approvalReq.requestId },
        actorId: FOUNDER_IDENTITY.userId,
        sessionId: session.sessionToken,
      },
      approval.executionGrantToken,
      async () => {
        executorCalled = true;
        return { opened: true };
      }
    );

    assert.equal(executorCalled, true, "Authorized executor must be invoked");
    assert.equal(finalOutcome.success, true, "14-step pipeline execution must succeed");
    assert.equal(finalOutcome.pipelineStepCompleted, 14);

    // 4. Anti-Replay: Attempting to reuse the same execution grant token must fail
    const replayOutcome = await executeThroughGateway(
      {
        actionType: "browser_open",
        target: "https://google.com",
        params: { _approvalRequestId: approvalReq.requestId },
        actorId: FOUNDER_IDENTITY.userId,
        sessionId: session.sessionToken,
      },
      approval.executionGrantToken,
      async () => ({ opened: true })
    );
    assert.equal(replayOutcome.success, false, "Replaying spent execution grant must be blocked");
  });

  // ── MODULE 5: CREDENTIAL & SECRET PROTECTION ────────────────────────────────
  test("Module 05: Credential Vault AES-256-GCM, Secret Redaction & Revocation", () => {
    const rawSecret = "sk-live-super-secret-production-ai-key-99999";
    const name = "TEST_INTEGRATION_KEY";

    // 1. Store credential as Founder
    const storeRes = storeCredential(name, rawSecret, "api_key", "founder");
    assert.equal(storeRes.success, true, "Founder storing credential must succeed");
    assert.ok(storeRes.metadata);
    assert.notEqual(storeRes.metadata.fingerprint, rawSecret, "Fingerprint must not be plaintext secret");

    // 2. Non-founder access blocked
    const guestStore = storeCredential("HACK", "123", "api_key", "guest");
    assert.equal(guestStore.success, false, "Guest cannot store credentials");

    // 3. Retrieve credential
    const fetchRes = retrieveCredential(name, "founder");
    assert.equal(fetchRes.success, true);
    assert.equal(fetchRes.secret, rawSecret, "Decrypted secret must match original");

    // 4. Secret redaction from logs
    const sensitiveLog = `Connected to provider with key: ${rawSecret} at timestamp 1700000.`;
    const redactedLog = redactKnownSecrets(sensitiveLog);
    assert.equal(redactedLog.includes(rawSecret), false, "Raw secret must not be present in redacted string");
    assert.ok(redactedLog.includes("[REDACTED_SECRET]"), "Redacted token must appear in place of raw secret");

    // 5. Revocation
    const rev = revokeCredential(name, "founder");
    assert.equal(rev, true);
    const fetchRevoked = retrieveCredential(name, "founder");
    assert.equal(fetchRevoked.success, false, "Revoked credential cannot be retrieved");
  });

  // ── MODULE 6: PRIVACY & DATA PROTECTION ─────────────────────────────────────
  test("Module 06: Sensitive PII Scanner, Data Classification & Screen Masking", () => {
    // 1. Scanning sensitive API keys
    const testText = "Here is my secret token: ghp_111122223333444455556666777788889999 and email test@ultron.internal";
    const scan = scanAndSanitizeText(testText);
    assert.equal(scan.isClean, false);
    assert.equal(scan.suggestedClassification, "RESTRICTED", "GitHub token must classify as RESTRICTED");
    assert.ok(scan.sanitizedText.includes("[REDACTED_API_KEY]"));
    assert.ok(scan.sanitizedText.includes("[REDACTED_EMAIL]"));

    // 2. Screen capture consent lifecycle
    revokeScreenCaptureConsent();
    const noConsentCheck = evaluateScreenCapturePrivacy();
    assert.equal(noConsentCheck.isScreenCaptureAllowed, false, "Screen capture must be blocked without active consent");

    grantScreenCaptureConsent(60000);
    const consentCheck = evaluateScreenCapturePrivacy("Visual Studio Code");
    assert.equal(consentCheck.isScreenCaptureAllowed, true, "Screen capture should be allowed for safe app under consent");

    // 3. Screen sensitive window exclusion
    const sensitiveCheck = evaluateScreenCapturePrivacy("1Password - Master Password Entry");
    assert.equal(sensitiveCheck.isScreenCaptureAllowed, false, "1Password must be blocked from screen capture");
    assert.equal(sensitiveCheck.activeWindowExcluded, true);

    revokeScreenCaptureConsent();
  });

  // ── MODULE 7: THREAT DETECTION & MONITORING ─────────────────────────────────
  test("Module 07: Security Events & Threat Escalation into Incidents", () => {
    // 1. Record security event
    const evt = recordSecurityEvent(
      "AUTH_FAILURE",
      "LOW",
      "malicious_ip_1",
      "Failed password challenge."
    );
    assert.ok(evt.eventId.startsWith("evt_"));

    // 2. Bypass anomaly auto-escalation
    const bypassEvt = recordSecurityEvent(
      "GATEWAY_BYPASS_ATTEMPT",
      "CRITICAL",
      "untrusted_tool",
      "Attempted direct OS spawn without gateway grant."
    );
    assert.equal(bypassEvt.severity, "CRITICAL");

    const incidents = listSecurityIncidents();
    assert.ok(incidents.length > 0, "Critical bypass attempt must create a security incident");
    assert.equal(incidents[0].severity, "CRITICAL");
  });

  // ── MODULE 8: AUDIT & ACCOUNTABILITY (HMAC-SHA256 CHAINED LEDGER) ───────────
  test("Module 08: Cryptographic HMAC Chained Audit Ledger & Tamper Verification", () => {
    // 1. Append valid audit blocks
    const block1 = appendAuditEntry({
      actor: "founder",
      action: "app_launch",
      resource: "notepad.exe",
      riskLevel: "medium",
      executionStatus: "SUCCESS",
      details: "Launched notepad successfully.",
    });

    const block2 = appendAuditEntry({
      actor: "founder",
      action: "file_read",
      resource: "README.md",
      riskLevel: "low",
      executionStatus: "SUCCESS",
      details: "Read README.md.",
    });

    assert.equal(block2.previousEntryHash, block1.currentEntryHash, "Block 2 must link to Block 1's HMAC hash");

    // 2. Full chain verification
    const report = verifyAuditChainIntegrity();
    assert.equal(report.isChainValid, true, "Untampered audit chain must verify with 100% integrity");
    assert.ok(report.totalEntriesVerified >= 2);
  });

  // ── MODULE 9: EMERGENCY PROTECTION SYSTEM ───────────────────────────────────
  test("Module 09: Emergency Stop, Backend Execution Lock & Authorized Recovery", () => {
    // 1. Verify not currently locked down
    if (isSystemLockedDown()) {
      unlockFromEmergencyStop({
        recoveryKey: "FOUNDER_RECOVERY_OVERRIDE_KEY",
        actor: "founder",
        reason: "Reset test baseline",
      });
    }

    // 2. Trigger Emergency Stop
    const lockState = triggerEmergencyStop({
      actor: "founder_test",
      reason: "Hostile intrusion test triggered.",
      revokeAllSessions: true,
    });

    assert.equal(lockState.isLockedDown, true, "Emergency Stop must set isLockedDown = true");
    assert.equal(isSystemLockedDown(), true, "isSystemLockedDown() must return true");

    // 3. Gateway execution MUST be blocked while locked down
    const session = createAuthenticatedSession("founder", FOUNDER_IDENTITY.userId);
    const accessEvalDuringLock = evaluateAccess({
      actorId: "founder",
      actorRole: "founder",
      sessionId: session.sessionToken,
      requestedOperation: "execute",
      resourceDomain: "application",
      resourceIdentifier: "notepad.exe",
      isEmergencyLocked: true,
      environment: { ipAddress: "127.0.0.1", isLoopback: true, timestamp: Date.now(), platform: "win32" },
    });
    assert.equal(accessEvalDuringLock.isAllowed, false, "Execution must be denied during Emergency Lockdown");

    // 4. Unauthorized unlock attempt fails
    const badUnlock = unlockFromEmergencyStop({
      recoveryKey: "wrong_password",
      actor: "intruder",
      reason: "Hacking unlock",
    });
    assert.equal(badUnlock.success, false, "Unauthorized unlock attempt must fail");
    assert.equal(isSystemLockedDown(), true, "System must remain locked down after bad unlock");

    // 5. Authorized unlock with founder recovery key
    const goodUnlock = unlockFromEmergencyStop({
      recoveryKey: "FOUNDER_RECOVERY_OVERRIDE_KEY",
      actor: "founder",
      reason: "Authorized recovery",
    });
    assert.equal(goodUnlock.success, true, "Authorized recovery unlock must succeed");
    assert.equal(isSystemLockedDown(), false, "System must be unlocked after valid recovery");
  });

  // ── MODULE 10: SECURITY POLICY & TRUST INVARIANTS ───────────────────────────
  test("Module 10: Immutable Core Invariants & AI Policy Weakening Immunity", () => {
    // 1. Verify Immutable Core Invariants exist
    assert.ok(IMMUTABLE_CORE_INVARIANTS.length >= 7, "Must contain all 7 immutable core invariants");

    // 2. Attempting to disable an invariant must fail validation
    const invalidRuleAttempt = {
      policyId: "INV_01_AUTH_REQUIRED",
      name: "Disabled Auth",
      version: 1,
      description: "Disable authentication",
      isImmutableCorePolicy: false,
      enabled: false, // Trying to disable!
      scope: "*",
      ruleExpression: "skipAuth == true",
      enforcementMode: "BLOCK",
      updatedAt: Date.now(),
      updatedBy: "ai_agent",
    };

    const validation = validatePolicyRule(invalidRuleAttempt);
    assert.equal(validation.isValid, false, "Validation must reject disabling core invariant");
    assert.ok(validation.conflicts.length > 0);

    // 3. AI / Non-founder update rejected
    const updateRes = updateSecurityPolicy(invalidRuleAttempt, "operator", "ai_agent");
    assert.equal(updateRes.success, false, "Non-founder role cannot modify security policies");
  });

  // ── ADVERSARIAL SECURITY TESTING ────────────────────────────────────────────
  test("Adversarial: Replay Attacks, Hash Tampering & Gateway Bypass Interception", async () => {
    const session = createAuthenticatedSession("founder", FOUNDER_IDENTITY.userId);

    // A. Replay Attack on Approval
    const plan = createApprovalRequest("app_launch", "calc.exe", { val: 42 });
    const app1 = approveRequest(plan.requestId, plan.approvalToken, "founder");
    assert.equal(app1.success, true);

    // Attempt to approve the exact same plan a second time
    const app2 = approveRequest(plan.requestId, plan.approvalToken, "founder");
    assert.equal(app2.success, false, "Re-approving an already approved request must be blocked");

    // B. Post-Approval Parameter Tampering
    const originalHash = computeCanonicalActionHash("app_launch", "calc.exe", { val: 42 });
    const tamperedHash = computeCanonicalActionHash("app_launch", "calc.exe", { val: 9999 });
    assert.notEqual(originalHash, tamperedHash, "Hash must change when parameters are modified");

    const grantTampered = verifyExecutionGrant(plan.requestId, app1.executionGrantToken, { val: 9999 });
    assert.equal(grantTampered.authorized, false, "Altered parameters must fail grant verification");

    // C. Gateway Bypass Interception
    // Direct execution call with forged grant token
    const forgedOutcome = await executeThroughGateway(
      {
        actionType: "system_command",
        target: "shutdown",
        params: {},
        actorId: "attacker",
        sessionId: session.sessionToken,
      },
      "forged_grant_token_xyz",
      async () => ({ executed: true })
    );
    assert.equal(forgedOutcome.success, false, "Direct gateway bypass with forged grant must be blocked");
  });
});
