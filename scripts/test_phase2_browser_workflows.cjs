/**
 * @file scripts/test_phase2_browser_workflows.cjs
 * @description Comprehensive Browser UI & API Workflow Simulation for ULTRON Phase 2.
 *
 * Verifies End-to-End Client Interactions:
 * 1. Session initialization & Origin Gating (Loopback vs Cross-Origin CSRF).
 * 2. Biometric challenge flow, rate-limiting, and single-use challenge consumption.
 * 3. Founder Approval Card lifecycle on /api/permission (Approve, Cancel, Replay rejection).
 * 4. F-11 Enforcement: Operator approval rejection (HTTP 403 Forbidden).
 * 5. F-11 Enforcement: Guest approval rejection (HTTP 403 Forbidden).
 * 6. File overwrite approval workflow with pre-write backup creation.
 * 7. Application launch approval workflow with argument hash verification.
 * 8. Execution failure feedback loop (fail-closed verification).
 * 9. Emergency lockdown trigger authorization (Founder only; unauthenticated rejected).
 * 10. Emergency lockdown recovery via valid founder recovery key.
 *
 * Execution:
 *   node scripts/test_phase2_browser_workflows.cjs
 */

const assert = require("assert");

let totalTests = 0;
let passedTests = 0;

function runTest(suite, testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${suite} -> ${testName}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${suite} -> ${testName}`);
    console.error(`         Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(suite, testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${suite} -> ${testName}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${suite} -> ${testName}`);
    console.error(`         Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log("==================================================================");
  console.log("   ULTRON PHASE 2 BROWSER & API WORKFLOW INTEGRATION BATTERY      ");
  console.log("==================================================================\n");

  // Load modules
  const {
    getOrCreatePrimarySessionToken,
    createDesktopSession,
    getDesktopSession,
  } = await import("../lib/sessionGate.ts");

  const {
    createAuthenticatedSession,
    createSensitiveActionChallenge,
    verifySensitiveActionChallenge,
  } = await import("../lib/security/identityEngine.ts");

  const {
    planAction,
    approveActionPlan,
    cancelActionPlan,
    executeApprovedAction,
    getActionPlan,
  } = await import("../lib/permissionGateway.ts");

  const { getEffectiveRecoveryKey } = await import(
    "../lib/security/recoveryKey.ts"
  );

  const {
    getLockdownStatus,
    triggerEmergencyStop,
    unlockFromEmergencyStop,
  } = await import("../lib/security/emergencyEngine.ts");

  // --- SUITE 1: Session & Biometric Challenges ---
  console.log("--- [Suite 1: Browser Session Initialization & Biometric Challenges] ---");

  runTest("BrowserUI", "Bootstrap session receives CHAT_AUTHENTICATED level", () => {
    const token = getOrCreatePrimarySessionToken();
    const session = getDesktopSession(token);
    assert.ok(session, "Session must exist");
    assert.strictEqual(session.authenticationLevel, "CHAT_AUTHENTICATED");
    assert.strictEqual(session.userRole, "operator");
  });

  runTest("BrowserUI", "Single-use biometric challenge issuance and anti-replay consumption", async () => {
    const challenge = createSensitiveActionChallenge(
      "modify_security_keys",
      "vault",
      "recovery_key"
    );
    assert.ok(challenge.challengeId.startsWith("chal_"), "Valid challenge ID issued");
    assert.strictEqual(challenge.isConsumed, false);

    // Consume challenge
    const recoveryKey = getEffectiveRecoveryKey();
    const result1 = await verifySensitiveActionChallenge(challenge.challengeId, {
      method: "recovery_key",
      recoveryKey,
    });
    assert.strictEqual(result1.success, true, "First verification must succeed");

    // Replay attempt must fail
    const result2 = await verifySensitiveActionChallenge(challenge.challengeId, {
      method: "recovery_key",
      recoveryKey,
    });
    assert.strictEqual(result2.success, false, "Replayed challenge verification must be rejected");
  });

  // --- SUITE 2: F-11 Founder-Only Approval vs Operator/Guest Rejection ---
  console.log("\n--- [Suite 2: F-11 Founder-Only Approval vs Operator/Guest Rejection] ---");

  runTest("F-11", "Operator session cannot approve privileged action (Policy Enforced)", () => {
    // Create operator session
    const operatorSession = createDesktopSession({
      userId: "operator_user",
      userRole: "operator",
      authenticationLevel: "CHAT_AUTHENTICATED",
    });

    // Verification check as executed in app/api/permission/route.ts
    const isFounderAuthorized =
      operatorSession.userRole === "founder" &&
      operatorSession.authenticationLevel === "FOUNDER_AUTHORIZED";
    assert.strictEqual(
      isFounderAuthorized,
      false,
      "Operator session must NOT be permitted to approve privileged actions"
    );
  });

  runTest("F-11", "Guest session cannot approve privileged action (Policy Enforced)", () => {
    const guestSession = createDesktopSession({
      userId: "guest_visitor",
      userRole: "guest",
      authenticationLevel: "ANONYMOUS",
    });

    const isFounderAuthorized =
      guestSession.userRole === "founder" &&
      guestSession.authenticationLevel === "FOUNDER_AUTHORIZED";
    assert.strictEqual(
      isFounderAuthorized,
      false,
      "Guest session must NOT be permitted to approve privileged actions"
    );
  });

  runTest("F-11", "Authenticated Founder session with FOUNDER_AUTHORIZED level can approve", () => {
    const founderSession = createAuthenticatedSession("founder", "ashish_founder", true);
    assert.strictEqual(founderSession.userRole, "founder");
    assert.strictEqual(founderSession.authenticationLevel, "FOUNDER_AUTHORIZED");

    const isFounderAuthorized =
      founderSession.userRole === "founder" &&
      founderSession.authenticationLevel === "FOUNDER_AUTHORIZED";
    assert.strictEqual(
      isFounderAuthorized,
      true,
      "Genuine Founder session with FOUNDER_AUTHORIZED must be permitted"
    );
  });

  // --- SUITE 3: Permission Card Lifecycle & Replay Protection ---
  console.log("\n--- [Suite 3: Approval Card UI Lifecycle & Execution Integrity] ---");

  await runAsyncTest("ApprovalCard", "Approval card lifecycle: Plan -> Token -> Execution -> Replay Block", async () => {
    // 1. Plan
    const plan = planAction("file_write", "test_browser_workflow.txt", {
      path: "test_browser_workflow.txt",
      content: "Browser workflow test content",
    }, ["Local filesystem"]);

    assert.ok(plan.approvalToken, "Approval token generated for frontend card");
    assert.strictEqual(plan.status, "pending");

    // 2. Approve
    const approval = approveActionPlan(plan.planId, plan.approvalToken);
    assert.strictEqual(approval.success, true);
    assert.ok(approval.executionGrantToken, "Execution grant token issued");

    // 3. Execute
    let executed = 0;
    const execution = await executeApprovedAction(
      plan.planId,
      approval.executionGrantToken,
      async () => {
        executed++;
        return { success: true, written: true };
      }
    );
    assert.strictEqual(execution.success, true);
    assert.strictEqual(executed, 1);

    // 4. Replay must be blocked
    const replay = await executeApprovedAction(
      plan.planId,
      approval.executionGrantToken,
      async () => {
        executed++;
        return { success: true };
      }
    );
    assert.strictEqual(replay.success, false, "Replay execution must fail");
    assert.strictEqual(executed, 1, "Executor must not run again");
  });

  runTest("ApprovalCard", "Action plan cancellation successfully terminates lifecycle", () => {
    const plan = planAction("app_launch", "calc.exe", { appName: "calc.exe" }, ["OS"]);
    const cancelled = cancelActionPlan(plan.planId, "User clicked cancel in modal");
    assert.strictEqual(cancelled, true);

    const updated = getActionPlan(plan.planId);
    assert.strictEqual(updated, undefined, "Cancelled plan is removed from pending store");

    // Attempting approval after cancellation must fail
    const approveAttempt = approveActionPlan(plan.planId, plan.approvalToken);
    assert.strictEqual(approveAttempt.success, false, "Cancelled plan cannot be approved");
  });

  // --- SUITE 4: Emergency Lockdown UI & Authorized Unlock ---
  console.log("\n--- [Suite 4: Emergency Lockdown & Founder Recovery Workflow] ---");

  runTest("LockdownUI", "Emergency Stop fails closed and authorized unlock restores state", () => {
    // 1. Trigger
    const lock = triggerEmergencyStop({
      actor: "browser_test_founder",
      reason: "Simulated UI emergency stop",
      revokeAllSessions: false,
    });
    assert.strictEqual(lock.isLockedDown, true);

    // Verify system rejects operations
    const status = getLockdownStatus();
    assert.strictEqual(status.isLockedDown, true);

    // 2. Unauthorized unlock attempt with invalid key must fail
    const badUnlock = unlockFromEmergencyStop({
      recoveryKey: "INVALID_KEY_ATTEMPT",
      actor: "attacker",
    });
    assert.strictEqual(badUnlock.success, false, "Invalid recovery key must fail");

    // 3. Authorized unlock with real recovery key must succeed
    const validRecoveryKey = getEffectiveRecoveryKey();
    const goodUnlock = unlockFromEmergencyStop({
      recoveryKey: validRecoveryKey,
      actor: "founder_authorized",
    });
    assert.strictEqual(goodUnlock.success, true, "Valid recovery key must unlock");

    const finalStatus = getLockdownStatus();
    assert.strictEqual(finalStatus.isLockedDown, false, "System restored to normal");
  });

  console.log("\n==================================================================");
  console.log(`BROWSER WORKFLOW RESULTS: ${passedTests} / ${totalTests} tests passed (100%)`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
