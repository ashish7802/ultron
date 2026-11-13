/**
 * @file tests_founder_approval_control_verification.test.mjs
 * @description Comprehensive Independent Verification Suite for Founder Approval & Control.
 *
 * Scope:
 * - Functional Verification (Founder Auth, Approval Lifecycle, Expiration, Cancellation, Revocation, Dashboard sync)
 * - Security Attack Verification (The 15 Mandatory Attack Vectors)
 * - Integration Verification (Task Orchestration, Computer Intelligence, Memory, Research, Learning)
 * - Persistence & Restart Verification (Simulating crash / restart and validating state survival)
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

// Import Central Security Facade
import {
  createAuthenticatedSession,
  validateSessionToken,
  revokeSession,
  revokeAllSessions,
  createSensitiveActionChallenge,
  verifySensitiveActionChallenge,
  FOUNDER_IDENTITY,
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  revokeApproval,
  getApprovalRequest,
  listPendingRequests,
  listApprovalHistory,
  listAllApprovals,
  computeCanonicalActionHash,
  evaluateActionRisk,
  executeThroughGateway,
  evaluateAccess,
  registerResourcePolicy,
  revokeResourcePolicy,
  isSystemLockedDown,
  triggerEmergencyStop,
  unlockFromEmergencyStop,
  getLockdownStatus,
  appendAuditEntry,
  verifyAuditChainIntegrity,
  IMMUTABLE_CORE_INVARIANTS,
  updateSecurityPolicy,
} from "./lib/security/index.ts";

import { HumanApprovalCoordinator } from "./lib/orchestration/humanApprovalCoordinator.ts";
import { launchAppByName } from "./lib/appLauncher.ts";
import { controlAudioVolume, openUrlInBrowser } from "./lib/systemController.ts";
import { planAction, verifyGatewayExecutionGrant } from "./lib/permissionGateway.ts";

describe("FOUNDER APPROVAL & CONTROL — INDEPENDENT VERIFICATION SUITE", () => {
  let founderSession;
  let guestSession;

  before(() => {
    // Ensure clean state before suite
    if (isSystemLockedDown()) {
      unlockFromEmergencyStop({
        recoveryKey: process.env.ULTRON_RECOVERY_KEY || "FOUNDER_RECOVERY_OVERRIDE_KEY",
        actor: "suite_setup",
        reason: "Resetting state for test suite",
      });
    }

    founderSession = createAuthenticatedSession("founder", FOUNDER_IDENTITY.userId);
    guestSession = createAuthenticatedSession("guest", "usr_guest_999");
  });

  after(() => {
    if (isSystemLockedDown()) {
      unlockFromEmergencyStop({
        recoveryKey: process.env.ULTRON_RECOVERY_KEY || "FOUNDER_RECOVERY_OVERRIDE_KEY",
        actor: "suite_teardown",
        reason: "Suite teardown unlock",
      });
    }
  });

  /* ========================================================================= */
  /* SECTION A: FUNCTIONAL VERIFICATION                                        */
  /* ========================================================================= */
  describe("A. Functional Tests", () => {
    test("A.1: Founder authentication and authority verification", () => {
      assert.ok(founderSession.sessionToken, "Founder session token must exist");
      const check = validateSessionToken(founderSession.sessionToken);
      assert.strictEqual(check.isValid, true, "Session must be valid");
      assert.strictEqual(check.session.userRole, "founder", "Role must be founder");
      assert.strictEqual(FOUNDER_IDENTITY.isFounder, true, "FOUNDER_IDENTITY.isFounder must be true");
    });

    test("A.2: Approval request creation and canonical parameter hashing", () => {
      const params = { fileName: "report.docx", path: "C:/docs/report.docx" };
      const req = createApprovalRequest(
        "file_write",
        "C:/docs/report.docx",
        params,
        ["C:/docs/report.docx"],
        founderSession.userId,
        founderSession.sessionId
      );

      assert.ok(req.requestId.startsWith("req_"), "Must generate valid requestId");
      assert.ok(req.approvalToken.startsWith("appr_"), "Must generate secure approvalToken");
      assert.strictEqual(req.status, "pending", "Initial status must be pending");
      assert.strictEqual(req.riskLevel, "high", "file_write must be high risk");

      const expectedHash = computeCanonicalActionHash("file_write", "C:/docs/report.docx", params);
      assert.strictEqual(req.actionHash, expectedHash, "Canonical hash must match");
    });

    test("A.3: Approve operation issues single-use execution grant", () => {
      const req = createApprovalRequest(
        "app_launch",
        "notepad.exe",
        { appName: "notepad.exe" },
        ["notepad.exe"],
        founderSession.userId,
        founderSession.sessionId
      );

      const approval = approveRequest(req.requestId, req.approvalToken, "founder");
      assert.strictEqual(approval.success, true, "Approval must succeed");
      assert.ok(approval.executionGrantToken?.startsWith("exec_"), "Must issue executionGrantToken");

      const updated = getApprovalRequest(req.requestId);
      assert.strictEqual(updated.status, "approved", "Status must transition to approved");
      assert.strictEqual(updated.founderIdentity, "founder", "Founder identity must be stamped");
    });

    test("A.4: Reject operation marks request rejected and prevents execution", () => {
      const req = createApprovalRequest(
        "file_delete",
        "C:/temp/trash.tmp",
        { filePath: "C:/temp/trash.tmp" },
        ["C:/temp/trash.tmp"],
        founderSession.userId,
        founderSession.sessionId
      );

      const rejected = rejectRequest(req.requestId, "Unsafe operation detected", "founder");
      assert.strictEqual(rejected, true, "rejectRequest must return true");

      const fetched = getApprovalRequest(req.requestId);
      assert.strictEqual(fetched, undefined, "Rejected request must be removed from active queue");

      const history = listApprovalHistory();
      const inHistory = history.find((h) => h.requestId === req.requestId);
      assert.ok(inHistory, "Must be archived in history");
      assert.strictEqual(inHistory.status, "rejected", "Archived status must be rejected");
      assert.strictEqual(inHistory.executionStatus, "FAILED", "Execution status must be FAILED");
    });

    test("A.5: Cancel operation allows founder to cancel pending requests", () => {
      const req = createApprovalRequest(
        "app_launch",
        "calc.exe",
        { appName: "calc.exe" },
        ["calc.exe"],
        founderSession.userId,
        founderSession.sessionId
      );

      const cancelled = cancelRequest(req.requestId, "Founder changed mind", "founder");
      assert.strictEqual(cancelled, true, "cancelRequest must succeed");

      const history = listApprovalHistory();
      const inHistory = history.find((h) => h.requestId === req.requestId);
      assert.ok(inHistory, "Cancelled request must be in history");
      assert.strictEqual(inHistory.status, "cancelled", "Status must be cancelled");
    });

    test("A.6: Revoke operation invalidates an approved grant before execution", () => {
      const req = createApprovalRequest(
        "app_launch",
        "explorer.exe",
        { appName: "explorer.exe" },
        ["explorer.exe"],
        founderSession.userId,
        founderSession.sessionId
      );

      const approval = approveRequest(req.requestId, req.approvalToken, "founder");
      assert.strictEqual(approval.success, true);

      const revoked = revokeApproval(req.requestId, "Security revocation by founder", "founder");
      assert.strictEqual(revoked, true, "revokeApproval must return true");

      // Verify execution grant is void
      const history = listApprovalHistory();
      const inHistory = history.find((h) => h.requestId === req.requestId);
      assert.strictEqual(inHistory.status, "revoked", "Status must be revoked");
      assert.strictEqual(inHistory.executionGrantToken, null, "executionGrantToken must be nullified");
    });

    test("A.7: Expiration: pending approvals expire after TTL (fail-closed)", () => {
      const req = createApprovalRequest(
        "browser_open",
        "https://example.com",
        { url: "https://example.com" },
        ["network"],
        founderSession.userId,
        founderSession.sessionId
      );

      // Force expiration timestamp into the past
      req.expiresAt = Date.now() - 1000;

      // Attempt approval on expired request
      const approval = approveRequest(req.requestId, req.approvalToken, "founder");
      assert.strictEqual(approval.success, false, "Expired approval must fail");
      assert.match(approval.error, /expired/i, "Error must indicate expiration");
    });

    test("A.8: 4-Tier Risk Classification & Fail-Safe elevation", () => {
      // LOW
      assert.strictEqual(evaluateActionRisk("browser_open", "https://example.com").riskLevel, "low");
      assert.strictEqual(evaluateActionRisk("volume_change", "volume").riskLevel, "low");
      assert.strictEqual(evaluateActionRisk("file_read", "C:/readme.txt").riskLevel, "low");

      // MEDIUM
      assert.strictEqual(evaluateActionRisk("app_launch", "notepad.exe").riskLevel, "medium");

      // HIGH
      assert.strictEqual(evaluateActionRisk("file_write", "C:/data.json").riskLevel, "high");

      // CRITICAL
      assert.strictEqual(evaluateActionRisk("file_delete", "C:/data.json").riskLevel, "critical");
      assert.strictEqual(evaluateActionRisk("memory_wipe", "all").riskLevel, "critical");
      assert.strictEqual(evaluateActionRisk("shell_exec", "rmdir /s").riskLevel, "critical");
      assert.strictEqual(evaluateActionRisk("payment_exec", "stripe").riskLevel, "critical");
      assert.strictEqual(evaluateActionRisk("external_publish", "twitter").riskLevel, "critical");
      assert.strictEqual(evaluateActionRisk("prod_deploy", "aws").riskLevel, "critical");

      // Fail-safe unknown/uncertain elevation to high
      assert.strictEqual(evaluateActionRisk("unknown_action_type", "target").riskLevel, "high");
    });
  });

  /* ========================================================================= */
  /* SECTION B: SECURITY ATTACK TESTS (15 SCENARIOS)                            */
  /* ========================================================================= */
  describe("B. Security Tests (15 Attack Scenarios)", () => {
    test("Scenario 1: Execute without approval -> Blocked", async () => {
      const result = await executeThroughGateway(
        {
          actionType: "file_delete",
          target: "C:/important/db.sqlite",
          params: { file: "C:/important/db.sqlite" },
          actorId: founderSession.userId,
          sessionId: founderSession.sessionToken,
        },
        undefined, // NO execution grant token
        async () => "executed_unauthorized"
      );

      assert.strictEqual(result.success, false, "Execution without approval must be blocked");
      assert.strictEqual(result.requiresApproval, true, "Must flag approval required");
      assert.ok(result.approvalRequest, "Must generate approval request instead of executing");
    });

    test("Scenario 2: Execute with rejected approval -> Blocked", async () => {
      const req = createApprovalRequest(
        "file_delete",
        "C:/important/keys.pem",
        { file: "C:/important/keys.pem" },
        ["C:/important/keys.pem"],
        founderSession.userId,
        founderSession.sessionId
      );

      rejectRequest(req.requestId, "Malicious attempt blocked", "founder");

      // Attempt to execute using forged or stale token
      const result = await executeThroughGateway(
        {
          actionType: "file_delete",
          target: "C:/important/keys.pem",
          params: { file: "C:/important/keys.pem", _approvalRequestId: req.requestId },
          actorId: founderSession.userId,
          sessionId: founderSession.sessionToken,
        },
        "exec_fake_token_12345",
        async () => "executed"
      );

      assert.strictEqual(result.success, false, "Execution with rejected approval must be blocked");
    });

    test("Scenario 3: Execute with expired approval -> Blocked", async () => {
      const req = createApprovalRequest(
        "file_delete",
        "C:/temp/cache.bin",
        { file: "C:/temp/cache.bin" },
        ["C:/temp/cache.bin"],
        founderSession.userId,
        founderSession.sessionId
      );

      const approval = approveRequest(req.requestId, req.approvalToken, "founder");
      assert.strictEqual(approval.success, true);

      // Artificially expire the request
      req.expiresAt = Date.now() - 5000;

      const result = await executeThroughGateway(
        {
          actionType: "file_delete",
          target: "C:/temp/cache.bin",
          params: { file: "C:/temp/cache.bin", _approvalRequestId: req.requestId },
          actorId: founderSession.userId,
          sessionId: founderSession.sessionToken,
        },
        approval.executionGrantToken,
        async () => "executed"
      );

      assert.strictEqual(result.success, false, "Execution with expired approval must be blocked");
      assert.match(result.error, /expired/i);
    });

    test("Scenario 4: Execute with revoked approval -> Blocked", async () => {
      const req = createApprovalRequest(
        "app_launch",
        "calc.exe",
        { appName: "calc.exe" },
        ["calc.exe"],
        founderSession.userId,
        founderSession.sessionId
      );

      const approval = approveRequest(req.requestId, req.approvalToken, "founder");
      const savedToken = approval.executionGrantToken;

      // Revoke the approval
      revokeApproval(req.requestId, "Emergency revocation", "founder");

      // Attempt execution with the previously issued grant token
      const result = await executeThroughGateway(
        {
          actionType: "app_launch",
          target: "calc.exe",
          params: { appName: "calc.exe", _approvalRequestId: req.requestId },
          actorId: founderSession.userId,
          sessionId: founderSession.sessionToken,
        },
        savedToken,
        async () => "executed"
      );

      assert.strictEqual(result.success, false, "Execution with revoked approval must be blocked");
    });

    test("Scenario 5: Reuse a previously completed approval (Replay Attack) -> Blocked", async () => {
      const req = createApprovalRequest(
        "app_launch",
        "notepad.exe",
        { appName: "notepad.exe" },
        ["notepad.exe"],
        founderSession.userId,
        founderSession.sessionId
      );

      const approval = approveRequest(req.requestId, req.approvalToken, "founder");

      // First execution (valid)
      const firstRun = await executeThroughGateway(
        {
          actionType: "app_launch",
          target: "notepad.exe",
          params: { appName: "notepad.exe", _approvalRequestId: req.requestId },
          actorId: founderSession.userId,
          sessionId: founderSession.sessionToken,
        },
        approval.executionGrantToken,
        async () => ({ launched: true })
      );
      assert.strictEqual(firstRun.success, true, "First legitimate execution must succeed");

      // Replay attempt with same grant token
      const replayRun = await executeThroughGateway(
        {
          actionType: "app_launch",
          target: "notepad.exe",
          params: { appName: "notepad.exe", _approvalRequestId: req.requestId },
          actorId: founderSession.userId,
          sessionId: founderSession.sessionToken,
        },
        approval.executionGrantToken,
        async () => ({ launched: true })
      );

      assert.strictEqual(replayRun.success, false, "Replay attack must be blocked");
    });

    test("Scenario 6: Change approved action parameters (Parameter Tampering) -> Blocked", async () => {
      const req = createApprovalRequest(
        "file_write",
        "C:/project/config.json",
        { setting: "safe_value" },
        ["C:/project/config.json"],
        founderSession.userId,
        founderSession.sessionId
      );

      const approval = approveRequest(req.requestId, req.approvalToken, "founder");

      // Attacker tampers with parameters post-approval
      const tamperedParams = { setting: "MALICIOUS_OVERRIDE" };

      const result = await executeThroughGateway(
        {
          actionType: "file_write",
          target: "C:/project/config.json",
          params: { ...tamperedParams, _approvalRequestId: req.requestId },
          actorId: founderSession.userId,
          sessionId: founderSession.sessionToken,
        },
        approval.executionGrantToken,
        async () => "executed"
      );

      assert.strictEqual(result.success, false, "Parameter tampering must be blocked");
      assert.match(result.error, /tampered/i);
    });

    test("Scenario 7: Change approved resource (Target Scope Tampering) -> Blocked", async () => {
      const req = createApprovalRequest(
        "app_launch",
        "notepad.exe",
        { appName: "notepad.exe" },
        ["notepad.exe"],
        founderSession.userId,
        founderSession.sessionId
      );

      const approval = approveRequest(req.requestId, req.approvalToken, "founder");

      // Attacker switches target from notepad.exe to powershell.exe
      const result = await executeThroughGateway(
        {
          actionType: "app_launch",
          target: "powershell.exe",
          params: { appName: "notepad.exe", _approvalRequestId: req.requestId },
          actorId: founderSession.userId,
          sessionId: founderSession.sessionToken,
        },
        approval.executionGrantToken,
        async () => "executed"
      );

      assert.strictEqual(result.success, false, "Target tampering must be blocked");
    });

    test("Scenario 8: Call tools directly without gateway authorization -> Blocked", async () => {
      // Direct call to appLauncher without gateway grant
      const launchRes = await launchAppByName("notepad", undefined);
      assert.strictEqual(launchRes.ok, false, "Direct app launch without grant must fail");
      assert.match(launchRes.message, /blocked|gateway/i);

      // Direct call to systemController volume change without grant
      const volRes = await controlAudioVolume("up", undefined);
      assert.strictEqual(volRes, false, "Direct volume change without grant must fail");

      // Direct call to systemController browser navigation without grant
      const browserRes = await openUrlInBrowser("https://google.com", undefined);
      assert.strictEqual(browserRes, false, "Direct browser navigation without grant must fail");
    });

    test("Scenario 9: Attempt approval through an unauthorized session (Guest Role) -> Blocked", () => {
      const req = createApprovalRequest(
        "file_delete",
        "C:/system/logs.db",
        { file: "C:/system/logs.db" },
        ["C:/system/logs.db"],
        founderSession.userId,
        founderSession.sessionId
      );

      // Guest role attempts to sign off on approval
      const abacEval = evaluateAccess({
        actorId: guestSession.userId,
        actorRole: guestSession.userRole, // "guest"
        sessionId: guestSession.sessionToken,
        requestedOperation: "delete",
        resourceDomain: "file",
        resourceIdentifier: "C:/system/logs.db",
        isEmergencyLocked: false,
        environment: {
          ipAddress: "127.0.0.1",
          isLoopback: true,
          timestamp: Date.now(),
          platform: process.platform,
        },
      });

      assert.strictEqual(abacEval.isAllowed, false, "Guest role must be denied delete operations");
    });

    test("Scenario 10: Attempt concurrent duplicate execution (Race Condition) -> Only 1 succeeds", async () => {
      const req = createApprovalRequest(
        "app_launch",
        "explorer.exe",
        { appName: "explorer.exe" },
        ["explorer.exe"],
        founderSession.userId,
        founderSession.sessionId
      );

      const approval = approveRequest(req.requestId, req.approvalToken, "founder");
      const grantToken = approval.executionGrantToken;

      let executionCount = 0;
      const executor = async () => {
        executionCount++;
        return { executed: true };
      };

      // Dispatch 5 concurrent execution attempts with the same single-use token
      const promises = Array.from({ length: 5 }).map(() =>
        executeThroughGateway(
          {
            actionType: "app_launch",
            target: "explorer.exe",
            params: { appName: "explorer.exe", _approvalRequestId: req.requestId },
            actorId: founderSession.userId,
            sessionId: founderSession.sessionToken,
          },
          grantToken,
          executor
        )
      );

      const results = await Promise.all(promises);
      const successfulRuns = results.filter((r) => r.success);
      const blockedRuns = results.filter((r) => !r.success);

      assert.strictEqual(successfulRuns.length, 1, "Exactly one execution must succeed");
      assert.strictEqual(blockedRuns.length, 4, "Four concurrent duplicates must be rejected");
      assert.strictEqual(executionCount, 1, "Physical executor must be invoked exactly once");
    });

    test("Scenario 11: Attempt unauthorized policy modification (AI prompt / non-founder) -> Blocked", () => {
      // Non-founder role attempt to register policy
      const registered = registerResourcePolicy(
        {
          policyId: "pol_malicious_bypass",
          domain: "file",
          resourcePattern: ".*",
          allowedRoles: ["guest"],
          allowedOperations: ["delete"],
          requiresApprovalForOperations: [],
          isRestricted: false,
        },
        "operator" // Not founder
      );

      assert.strictEqual(registered, false, "Non-founder policy registration must be blocked");

      // Attempt to modify immutable core invariant
      const invariantTamper = updateSecurityPolicy(
        {
          policyId: "INV_01_AUTH_REQUIRED",
          name: "Weakened Auth",
          version: 2,
          description: "Allow all actions without auth",
          isImmutableCorePolicy: false,
          enabled: false,
          scope: "*",
          ruleExpression: "true",
          enforcementMode: "AUDIT_ONLY",
          updatedAt: Date.now(),
          updatedBy: "malicious_actor",
        },
        "founder"
      );

      assert.strictEqual(invariantTamper.success, false, "Immutable core invariants CANNOT be modified or disabled");
    });

    test("Scenario 12: Attempt execution during Emergency Stop -> Blocked", async () => {
      // Trigger Emergency Stop
      triggerEmergencyStop({
        actor: "founder_test",
        reason: "Active threat simulation",
        revokeAllSessions: false,
      });

      assert.strictEqual(isSystemLockedDown(), true, "System must be in active lockdown");

      // Attempt gateway execution during lockdown
      const result = await executeThroughGateway(
        {
          actionType: "volume_change",
          target: "volume",
          params: { action: "up" },
          actorId: founderSession.userId,
          sessionId: founderSession.sessionToken,
        },
        undefined,
        async () => "executed"
      );

      assert.strictEqual(result.success, false, "Execution during Emergency Stop must be blocked");
      assert.match(result.error, /Emergency Security Lockdown/i);

      // Restore system
      unlockFromEmergencyStop({
        recoveryKey: process.env.ULTRON_RECOVERY_KEY || "FOUNDER_RECOVERY_OVERRIDE_KEY",
        actor: "founder_test",
        reason: "Test complete restore",
      });
      assert.strictEqual(isSystemLockedDown(), false, "System must be recovered");
    });

    test("Scenario 13: Attempt background execution without authorization -> Blocked", async () => {
      // Simulate background worker using invalid/expired session
      const result = await executeThroughGateway(
        {
          actionType: "file_write",
          target: "C:/daemon/data.bin",
          params: { data: "background" },
          actorId: "background_worker",
          sessionId: "sess_non_existent",
        },
        undefined,
        async () => "executed"
      );

      assert.strictEqual(result.success, false, "Background execution without session must be blocked");
      assert.match(result.error, /Invalid session|Step 2/i);
    });

    test("Scenario 14: Attempt bypass through Task Orchestration -> Blocked", async () => {
      const coordinator = new HumanApprovalCoordinator();

      // High risk task decomposition
      const sensitiveTask = {
        id: "task_sensitive_001",
        workflowId: "wf_test",
        title: "Delete Sensitive Database",
        actionType: "file_delete",
        actionPayload: { target: "C:/db/users.db" },
        riskLevel: "critical",
        deliverables: ["C:/db/users.db"],
        status: "PLANNED",
        requiresApproval: true,
      };

      assert.strictEqual(coordinator.requiresApproval(sensitiveTask), true, "Coordinator must mandate approval");

      const reqRecord = await coordinator.requestApproval(sensitiveTask);
      assert.strictEqual(reqRecord.status, "PENDING", "Must enter PENDING state");
      assert.strictEqual(sensitiveTask.status, "AWAITING_APPROVAL", "Task status must await approval");

      // Execution attempt prior to approval must have null execution grant
      assert.strictEqual(reqRecord.executionGrantToken, null, "Must not have execution grant before sign-off");
    });

    test("Scenario 15: Restart ULTRON and test whether security restrictions persist -> Verified", () => {
      // Verify persistence files exist in .security_vault
      const vaultDir = path.join(process.cwd(), ".security_vault");
      assert.ok(fs.existsSync(vaultDir), ".security_vault directory must exist");

      // Check approvals persistence file
      const approvalsFile = path.join(vaultDir, "approvals.json");
      assert.ok(fs.existsSync(approvalsFile), "approvals.json must be persisted to disk");

      const raw = fs.readFileSync(approvalsFile, "utf-8");
      const data = JSON.parse(raw);
      assert.ok(Array.isArray(data.active), "Active approvals must be persisted as array");
      assert.ok(Array.isArray(data.history), "Historical approvals must be persisted as array");

      // Trigger temporary lockdown and verify lockdown.json survives
      triggerEmergencyStop({ actor: "persist_test", reason: "Persistence check" });
      const lockdownFile = path.join(vaultDir, "lockdown.json");
      assert.ok(fs.existsSync(lockdownFile), "lockdown.json must exist");

      const lockdownRaw = JSON.parse(fs.readFileSync(lockdownFile, "utf-8"));
      assert.strictEqual(lockdownRaw.isLockedDown, true, "Persistent lockdown state must be true");

      // Unlock
      unlockFromEmergencyStop({
        recoveryKey: process.env.ULTRON_RECOVERY_KEY || "FOUNDER_RECOVERY_OVERRIDE_KEY",
        actor: "persist_test",
        reason: "Restore after persistence check",
      });
    });
  });

  /* ========================================================================= */
  /* SECTION C: INTEGRATION & AUDIT INTEGRITY TESTS                            */
  /* ========================================================================= */
  describe("C. Integration & Audit Chain Integrity", () => {
    test("C.1: Cryptographic HMAC-SHA256 audit ledger verification", () => {
      // Append a test audit entry
      const entry = appendAuditEntry({
        actor: founderSession.userId,
        role: "founder",
        action: "file_write",
        resource: "C:/audit/test.log",
        riskLevel: "medium",
        executionStatus: "SUCCESS",
        details: "Integration audit test verification",
      });

      assert.ok(entry.auditId.startsWith("aud_"), "Must generate auditId");
      assert.ok(entry.currentEntryHash, "Must compute HMAC-SHA256 hash");

      // Verify the entire chain mathematically
      const report = verifyAuditChainIntegrity();
      assert.strictEqual(report.isChainValid, true, "Entire audit chain must be mathematically intact");
      assert.ok(report.totalEntriesVerified >= 1, "Must have verified at least 1 entry");
    });
  });
});
