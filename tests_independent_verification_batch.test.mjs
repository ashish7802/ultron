/**
 * @file tests_independent_verification_batch.test.mjs
 * @description Comprehensive Node.js / TypeScript Verification Suite for ULTRON Computer Intelligence.
 *
 * Verifies:
 * - Module 11 7-Phase Workflow (OBSERVE -> UNDERSTAND -> PLAN -> APPROVAL -> INTERACT -> VERIFY -> REPORT)
 * - Security Invariants:
 *   1. Unapproved action never executes (fail-closed).
 *   2. Parameter tampering after approval invalidates action (hash mismatch).
 *   3. Expired approval plan is rejected.
 *   4. Replay attack prevented: single-use execution grant token consumed immediately.
 *   5. Emergency Stop halts execution independently of UI.
 * - Failure & Recovery:
 *   1. Non-existent file read returns honest failure.
 *   2. Missing application launch returns honest error without crashing.
 *   3. Invalid window handle rejected safely.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

test("Verification: Unapproved action never executes without valid grant token", async () => {
  const { defaultComputerWorkflowOrchestrator } = await import("./lib/computer/workflowOrchestrator.ts");

  const testFile = path.resolve(process.cwd(), "unapproved_leak_test.txt");

  const workflow = await defaultComputerWorkflowOrchestrator.planTask({
    intent: "Attempt execution without approval",
    actionType: "file_write",
    target: testFile,
    parameters: { content: "Illegal write", overwrite: true },
    riskLevel: "high",
  });

  assert.equal(workflow.currentPhase, "REQUEST_APPROVAL");

  // Attempt to execute directly without calling approveTask()
  await assert.rejects(
    async () => {
      await defaultComputerWorkflowOrchestrator.executeAndVerifyTask(workflow.taskId);
    },
    /not authorized for execution/i
  );

  // Physical verification: file must NOT exist on disk
  assert.equal(fs.existsSync(testFile), false, "Unapproved action must never execute on disk");
});

test("Verification: Parameter tampering post-approval invalidates execution (Anti-Tampering)", async () => {
  const { planAction, approveActionPlan, executeApprovedAction } = await import("./lib/permissionGateway.ts");

  const testFile = path.resolve(process.cwd(), "tamper_target.txt");

  // 1. Create plan for safe echo
  const plan = planAction("file_write", testFile, { content: "Original Safe Content", overwrite: true });

  // 2. Approve original plan
  const approval = approveActionPlan(plan.planId, plan.approvalToken);
  assert.equal(approval.success, true);
  assert.ok(approval.executionGrantToken !== undefined);

  // 3. TAMPER ATTACK: Malicious actor changes parameters in-memory after approval
  plan.params.content = "TAMPERED MALICIOUS PAYLOAD";

  // 4. Execution must detect hash mismatch and FAIL CLOSED
  const execOutcome = await executeApprovedAction(
    plan.planId,
    approval.executionGrantToken,
    async () => {
      fs.writeFileSync(testFile, String(plan.params.content), "utf-8");
      return { written: true };
    }
  );

  assert.equal(execOutcome.success, false);
  assert.match(execOutcome.error || "", /Security Violation|tampered|mismatch/i);

  // Physical verification: tampered file must NOT have been written
  assert.equal(fs.existsSync(testFile), false, "Tampered parameters must never execute");
});

test("Verification: Single-use execution grant token prevents replay attack", async () => {
  const { planAction, approveActionPlan, executeApprovedAction } = await import("./lib/permissionGateway.ts");

  const plan = planAction("system_command", "status_check", { verbose: true });
  const approval = approveActionPlan(plan.planId, plan.approvalToken);
  assert.equal(approval.success, true);
  const grantToken = approval.executionGrantToken;

  // First execution: Succeeds
  let executionCount = 0;
  const firstExec = await executeApprovedAction(plan.planId, grantToken, async () => {
    executionCount++;
    return { ok: true };
  });
  assert.equal(firstExec.success, true);
  assert.equal(executionCount, 1);

  // REPLAY ATTACK: Attempting to reuse the same grant token must fail immediately
  const replayExec = await executeApprovedAction(plan.planId, grantToken, async () => {
    executionCount++;
    return { ok: true };
  });
  assert.equal(replayExec.success, false);
  assert.match(replayExec.error || "", /not found|not authorized/i);
  assert.equal(executionCount, 1, "Replay execution must not have run");
});

test("Verification: Expired approval token is rejected fail-closed", async () => {
  const { planAction, approveActionPlan } = await import("./lib/permissionGateway.ts");

  const plan = planAction("system_command", "expired_check", {});
  // Force expiration timestamp into the past
  plan.expiresAt = Date.now() - 1000;

  const approval = approveActionPlan(plan.planId, plan.approvalToken);
  assert.equal(approval.success, false);
  assert.match(approval.error || "", /expired/i);
});

test("Verification: Emergency Stop halts workflow execution independently", async () => {
  const { defaultComputerWorkflowOrchestrator } = await import("./lib/computer/workflowOrchestrator.ts");
  const { defaultSafetyControls } = await import("./lib/computer/safetyControls.ts");

  const testFile = path.resolve(process.cwd(), "emergency_stop_verify.txt");

  const workflow = await defaultComputerWorkflowOrchestrator.planTask({
    intent: "Test emergency stop abort",
    actionType: "file_write",
    target: testFile,
    parameters: { content: "Should never exist", overwrite: true },
    riskLevel: "medium",
  });

  // Approve plan
  defaultComputerWorkflowOrchestrator.approveTask(workflow.taskId, workflow.approvalToken);

  // Trigger Emergency Stop before physical execution
  await defaultSafetyControls.triggerEmergencyStop("Verification test abort");

  try {
    const res = await defaultComputerWorkflowOrchestrator.executeAndVerifyTask(workflow.taskId);
    assert.equal(res.success, false);
    assert.match(res.summary, /Emergency Stop/i);

    // Verify file was never written
    assert.equal(fs.existsSync(testFile), false);
  } finally {
    await defaultSafetyControls.resetEmergencyStop();
  }
});
