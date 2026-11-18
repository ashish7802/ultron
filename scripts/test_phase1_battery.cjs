/**
 * @file scripts/test_phase1_battery.cjs
 * Comprehensive Integration and Verification Battery for ULTRON Phase 1 Remediation.
 * Tests F-02, F-03, F-04, and F-15 invariants and contracts.
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

async function runBattery() {
  console.log("==================================================================");
  console.log("   ULTRON PHASE 1 REMEDIATION INTEGRATION VERIFICATION BATTERY   ");
  console.log("==================================================================");
  console.log("Testing defects: F-02, F-03, F-04, F-15\n");

  let passed = 0;
  let total = 0;

  function recordTest(name, condition, details = "") {
    total++;
    if (condition) {
      passed++;
      console.log(`  [PASS] Test ${total}: ${name}`);
      if (details) console.log(`         Details: ${details}`);
    } else {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      if (details) console.error(`         Failure details: ${details}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. F-04 Verification: Permission Gateway physical execution outcome inspection
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- [Suite 1: F-04 Permission Gateway Execution Invariants] ---");
  const { planAction, approveActionPlan, executeApprovedAction } = require("../lib/permissionGateway.ts");

  // Subtest 1.1: Executor resolves with success: false -> Must return success: false and mark plan 'failed'
  {
    const plan = planAction("file_write", "test_f04_fail.txt", { path: "test_f04_fail.txt" });
    const approval = approveActionPlan(plan.planId, plan.approvalToken);
    assert(approval.success, "Approval should succeed with valid token");

    const execOutcome = await executeApprovedAction(plan.planId, approval.executionGrantToken, async () => {
      return { success: false, error: "Disk write permission denied" };
    });

    recordTest(
      "F-04: Resolved Promise returning { success: false } is recognized as execution failure",
      execOutcome.success === false && execOutcome.error.includes("Disk write permission denied"),
      `Outcome success=${execOutcome.success}, error="${execOutcome.error}"`
    );

    // Verify plan is marked 'failed'
    recordTest(
      "F-04: Plan status becomes 'failed' in audit log and state",
      plan.status === "failed",
      `Plan status is: "${plan.status}"`
    );
  }

  // Subtest 1.2: Executor throws an exception -> Must mark plan 'failed'
  {
    const plan = planAction("shell_exec", "broken_cmd", { command: "broken_cmd" });
    const approval = approveActionPlan(plan.planId, plan.approvalToken);
    const execOutcome = await executeApprovedAction(plan.planId, approval.executionGrantToken, async () => {
      throw new Error("Physical process crash");
    });

    recordTest(
      "F-04: Thrown exception marks plan failed and returns success: false",
      execOutcome.success === false && execOutcome.error.includes("Physical process crash") && plan.status === "failed",
      `Plan status="${plan.status}", error="${execOutcome.error}"`
    );
  }

  // Subtest 1.3: Non-zero exit code inspection -> Must mark plan 'failed'
  {
    const plan = planAction("shell_exec", "exit_1", { command: "false" });
    const approval = approveActionPlan(plan.planId, plan.approvalToken);
    const execOutcome = await executeApprovedAction(plan.planId, approval.executionGrantToken, async () => {
      return { exitCode: 1, stderr: "Process exited with code 1" };
    });

    recordTest(
      "F-04: Non-zero exitCode is caught by gateway and marked failed",
      execOutcome.success === false && plan.status === "failed",
      `Plan status="${plan.status}", outcome success=${execOutcome.success}`
    );
  }

  // Subtest 1.4: Successful execution passes and marks plan 'executed'
  {
    const plan = planAction("shell_exec", "success_cmd", { command: "echo hi" });
    const approval = approveActionPlan(plan.planId, plan.approvalToken);
    const execOutcome = await executeApprovedAction(plan.planId, approval.executionGrantToken, async () => {
      return { success: true, verified: true, output: "hi" };
    });

    recordTest(
      "F-04: Genuine physical success marks plan 'executed'",
      execOutcome.success === true && plan.status === "executed",
      `Plan status="${plan.status}", outcome success=${execOutcome.success}`
    );
  }

  // Subtest 1.5: Replay / token reuse prevention
  {
    const plan = planAction("shell_exec", "single_use_test", { command: "date" });
    const token = plan.approvalToken;
    const approval1 = approveActionPlan(plan.planId, token);
    const approval2 = approveActionPlan(plan.planId, token);

    recordTest(
      "F-04/Security Invariant: Approval token is invalidated upon first use (replay prevented)",
      approval1.success === true && approval2.success === false,
      `First approval=${approval1.success}, second approval=${approval2.success}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. F-15 Verification: Application Launch Approval Bypass Remediation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- [Suite 2: F-15 Application Launch Approval Invariants] ---");
  const { defaultComputerToolRegistry } = require("../lib/computer/toolRegistry.ts");

  {
    // Calling launch_application without planId / grantToken must return requiresPlan / permissionPlan
    const launchAttempt = await defaultComputerToolRegistry.executeTool("launch_application", {
      appName: "notepad",
    });

    recordTest(
      "F-15: launch_application requires user approval plan before execution",
      launchAttempt.success === false &&
      Boolean(launchAttempt.permissionPlan) &&
      launchAttempt.permissionPlan.actionType === "app_launch",
      `Generated plan ID: ${launchAttempt.permissionPlan?.planId}, riskLevel: ${launchAttempt.permissionPlan?.riskLevel}`
    );

    recordTest(
      "F-15: launch_application is registered with high risk level",
      launchAttempt.permissionPlan?.riskLevel === "high",
      `Risk level: ${launchAttempt.permissionPlan?.riskLevel}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. F-03 Verification: File Overwrite Approval Bypass Remediation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- [Suite 3: F-03 File Overwrite Approval Bypass Invariants] ---");
  const testFilePath = path.resolve("./test_f03_overwrite_temp.txt");
  fs.writeFileSync(testFilePath, "Initial content prior to test.", "utf-8");

  try {
    // Attempt 1: Calling toolRegistry write_file on existing file with overwrite: true without approval
    const overwriteAttempt = await defaultComputerToolRegistry.executeTool("write_file", {
      path: testFilePath,
      content: "Overwritten content without approval",
      overwrite: true,
    });

    recordTest(
      "F-03: Overwriting existing file requires approval plan and is gated",
      overwriteAttempt.success === false &&
      Boolean(overwriteAttempt.permissionPlan) &&
      overwriteAttempt.permissionPlan.actionType === "file_write",
      `Plan generated: ${overwriteAttempt.permissionPlan?.planId}, summary: ${overwriteAttempt.permissionPlan?.summary}`
    );

    // Verify file content was NOT overwritten
    const contentAfterBlocked = fs.readFileSync(testFilePath, "utf-8");
    recordTest(
      "F-03: Existing file on disk remains completely untouched when write is blocked",
      contentAfterBlocked === "Initial content prior to test.",
      `Current file content: "${contentAfterBlocked}"`
    );

    // Attempt 2: Direct call through FileSystemIntelligence without approval_granted
    const { defaultFileSystemIntelligence } = require("../lib/computer/fileSystemIntelligence.ts");
    const directOverwrite = await defaultFileSystemIntelligence.writeFile(
      testFilePath,
      "Direct overwrite without approval",
      true,
      false // approvalGranted = false
    );

    recordTest(
      "F-03: Direct Python driver blocks overwrite when approvalGranted is false",
      directOverwrite.success === false &&
      (directOverwrite.requiresApproval === true || directOverwrite.error?.includes("Explicit approval grant is required")),
      `Driver returned: success=${directOverwrite.success}, error="${directOverwrite.error}"`
    );

    // Attempt 3: Authorized overwrite with cryptographic execution grant
    const { generateSubprocessExecutionGrant } = require("../lib/permissionGateway.ts");
    const grant = generateSubprocessExecutionGrant("plan_battery", "write_file", testFilePath).token;
    const authorizedOverwrite = await defaultFileSystemIntelligence.writeFile(
      testFilePath,
      "Legitimate authorized overwrite content",
      true,
      true, // approvalGranted = true
      grant
    );

    const contentAfterAuth = fs.readFileSync(testFilePath, "utf-8");
    recordTest(
      "F-03: Authorized overwrite with cryptographic execution grant succeeds and creates backup",
      authorizedOverwrite.success === true &&
      contentAfterAuth === "Legitimate authorized overwrite content" &&
      Boolean(authorizedOverwrite.backupPath),
      `Success=${authorizedOverwrite.success}, backupPath=${authorizedOverwrite.backupPath}`
    );
  } finally {
    if (fs.existsSync(testFilePath)) {
      try { fs.unlinkSync(testFilePath); } catch {}
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. F-02 Verification: Permission Dispatch Contract & UltronChat Alignment
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- [Suite 4: F-02 Permission Contract & UltronChat Alignment] ---");
  // Test approval payload contract verification
  {
    const plan = planAction("browser_open", "https://example.com", { targetUrl: "https://example.com" });

    // Validate that approvalToken is generated and attached
    recordTest(
      "F-02: Permission plan contains approvalToken required for frontend contract",
      typeof plan.approvalToken === "string" && plan.approvalToken.length > 0,
      `Plan token length: ${plan.approvalToken.length}`
    );

    // Test rejection contract
    const { cancelActionPlan } = require("../lib/permissionGateway.ts");
    const cancelled = cancelActionPlan(plan.planId, "User cancelled in chat UI");
    recordTest(
      "F-02: Action plan cancellation successfully invalidates plan and revokes tokens",
      cancelled === true && plan.status === "rejected" && plan.approvalToken === "",
      `Cancelled: ${cancelled}, status: ${plan.status}`
    );

    // Test single-use approval contract
    const plan2 = planAction("volume_change", "up", { volumeAction: "up" });
    const appRes = approveActionPlan(plan2.planId, plan2.approvalToken);
    recordTest(
      "F-02: Approval returns executionGrantToken and clears approvalToken",
      appRes.success === true && Boolean(appRes.executionGrantToken) && plan2.approvalToken === "",
      `Grant token exists: ${Boolean(appRes.executionGrantToken)}`
    );
  }

  console.log("\n==================================================================");
  console.log(`BATTERY RESULTS: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runBattery().catch((err) => {
  console.error("FATAL ERROR IN BATTERY:", err);
  process.exit(1);
});
