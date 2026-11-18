/**
 * @file scripts/test_phase1_1_adversarial.cjs
 * Comprehensive Adversarial Test Suite for Phase 1.1 Remediation:
 * Cryptographic Subprocess Grants (F-03) and Parameter Integrity (F-15).
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

async function runAdversarialBattery() {
  console.log("==================================================================");
  console.log("   ULTRON PHASE 1.1 ADVERSARIAL & CRYPTOGRAPHIC VERIFICATION     ");
  console.log("==================================================================");
  console.log("Testing invariants: Cryptographic Subprocess Grant (F-03) & Parameter Binding (F-15)\n");

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

  const {
    planAction,
    approveActionPlan,
    executeApprovedAction,
    generateSubprocessExecutionGrant,
  } = require("../lib/permissionGateway.ts");

  const { defaultComputerToolRegistry } = require("../lib/computer/toolRegistry.ts");
  const { defaultFileSystemIntelligence } = require("../lib/computer/fileSystemIntelligence.ts");
  const { defaultPythonBridge } = require("../lib/computer/pythonBridge.ts");

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: F-03 Cryptographic Subprocess Overwrite Authorization
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("--- [Suite 1: F-03 Cryptographic Subprocess Grant Invariants] ---");
  const tempDir = path.resolve("./temp_phase1_1_test");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const testFileA = path.join(tempDir, "file_a.txt");
  const testFileB = path.join(tempDir, "file_b.txt");
  fs.writeFileSync(testFileA, "INITIAL_A", "utf-8");
  fs.writeFileSync(testFileB, "INITIAL_B", "utf-8");

  try {
    // 1.1: Overwrite existing file without any grant -> Must be blocked
    const res1 = await defaultFileSystemIntelligence.writeFile(testFileA, "OVERWRITE_NO_GRANT", true, false);
    recordTest(
      "F-03.1: Overwriting existing file without a grant is rejected fail-closed",
      res1.success === false && (res1.blocked === true || res1.requiresApproval === true),
      `Error: "${res1.error}"`
    );
    assert.strictEqual(fs.readFileSync(testFileA, "utf-8"), "INITIAL_A", "Disk file must not change");

    // 1.2: Overwrite existing file with approvalGranted: true but NO grant -> Must be blocked!
    const res2 = await defaultFileSystemIntelligence.writeFile(testFileA, "OVERWRITE_BOOLEAN_ONLY", true, true);
    recordTest(
      "F-03.2: Overwriting with approvalGranted: true but NO cryptographic grant is REJECTED",
      res2.success === false && res2.error.includes("File overwrite authorization failure: Missing cryptographic execution grant token"),
      `Error: "${res2.error}"`
    );
    assert.strictEqual(fs.readFileSync(testFileA, "utf-8"), "INITIAL_A", "Disk file must not change");

    // 1.3: Direct Python bridge call with spoofed approvalGranted: true -> Must be blocked!
    const res3 = await defaultPythonBridge.execute("write_file", {
      path: testFileA,
      content: "BRIDGE_SPOOF",
      overwrite: true,
      approvalGranted: true, // Spoofed Boolean
    });
    recordTest(
      "F-03.3: Direct Python bridge invocation with spoofed Boolean is REJECTED",
      res3.success === false && String(res3.error).includes("Missing cryptographic execution grant token"),
      `Bridge error: "${res3.error}"`
    );
    assert.strictEqual(fs.readFileSync(testFileA, "utf-8"), "INITIAL_A", "Disk file must not change");

    // 1.4: Grant with forged cryptographic signature -> Must be rejected
    const forgedGrant = "fake_plan|write_file|" + testFileA.toLowerCase() + "|" + (Date.now() + 60000) + "|nonce123|0000000000000000000000000000000000000000000000000000000000000000";
    const res4 = await defaultFileSystemIntelligence.writeFile(testFileA, "FORGED_SIG", true, true, forgedGrant);
    recordTest(
      "F-03.4: Grant with forged HMAC signature is REJECTED",
      res4.success === false && res4.error.includes("Cryptographic signature verification failed"),
      `Error: "${res4.error}"`
    );
    assert.strictEqual(fs.readFileSync(testFileA, "utf-8"), "INITIAL_A", "Disk file must not change");

    // 1.5: Valid grant bound to File A presented to overwrite File B -> Must be rejected (path mismatch)
    const validGrantA = generateSubprocessExecutionGrant("plan_test_a", "write_file", testFileA).token;
    const res5 = await defaultFileSystemIntelligence.writeFile(testFileB, "PATH_MISMATCH", true, true, validGrantA);
    recordTest(
      "F-03.5: Valid grant presented for mismatched file path is REJECTED",
      res5.success === false && res5.error.includes("Target path mismatch"),
      `Error: "${res5.error}"`
    );
    assert.strictEqual(fs.readFileSync(testFileB, "utf-8"), "INITIAL_B", "File B must not change");

    // 1.6: Grant that has expired -> Must be rejected
    const expiredGrant = generateSubprocessExecutionGrant("plan_test_exp", "write_file", testFileA, -5000).token;
    const res6 = await defaultFileSystemIntelligence.writeFile(testFileA, "EXPIRED", true, true, expiredGrant);
    recordTest(
      "F-03.6: Expired grant token is REJECTED fail-closed",
      res6.success === false && res6.error.includes("expired"),
      `Error: "${res6.error}"`
    );
    assert.strictEqual(fs.readFileSync(testFileA, "utf-8"), "INITIAL_A", "Disk file must not change");

    // 1.7: Valid grant for File A succeeds and creates backup
    const validGrantFresh = generateSubprocessExecutionGrant("plan_test_fresh", "write_file", testFileA, 30000).token;
    const res7 = await defaultFileSystemIntelligence.writeFile(testFileA, "VALID_AUTH_CONTENT", true, true, validGrantFresh);
    recordTest(
      "F-03.7: Valid cryptographic grant succeeds and writes to disk",
      res7.success === true && fs.readFileSync(testFileA, "utf-8") === "VALID_AUTH_CONTENT",
      `Success=${res7.success}, backupPath=${res7.backupPath}`
    );

    // 1.8: Replaying the consumed grant on File A -> Must be rejected (single-use)
    const res8 = await defaultFileSystemIntelligence.writeFile(testFileA, "REPLAY_ATTACK", true, true, validGrantFresh);
    recordTest(
      "F-03.8: Replaying consumed grant token is REJECTED (anti-replay invariant)",
      res8.success === false && res8.error.includes("already been consumed"),
      `Error: "${res8.error}"`
    );
    assert.strictEqual(fs.readFileSync(testFileA, "utf-8"), "VALID_AUTH_CONTENT", "File must remain at valid content");

    // 1.9: Normal new file creation (does not exist) works seamlessly without grant
    const newFile = path.join(tempDir, "brand_new_file.txt");
    const res9 = await defaultFileSystemIntelligence.writeFile(newFile, "NEW_FILE_CONTENT", false, false);
    recordTest(
      "F-03.9: Normal new-file creation succeeds without requiring overwrite grant",
      res9.success === true && fs.readFileSync(newFile, "utf-8") === "NEW_FILE_CONTENT",
      `Success=${res9.success}`
    );

    // 1.10: End-to-end ToolRegistry approval and overwrite execution
    const plan = planAction("file_write", testFileA, { path: testFileA, content: "E2E_APPROVED", overwrite: true });
    const approval = approveActionPlan(plan.planId, plan.approvalToken);
    const e2eRes = await defaultComputerToolRegistry.executeTool(
      "write_file",
      { path: testFileA, content: "E2E_APPROVED", overwrite: true },
      { planId: plan.planId, executionGrantToken: approval.executionGrantToken }
    );
    recordTest(
      "F-03.10: End-to-end ToolRegistry approval issuance and execution succeeds with backup",
      e2eRes.success === true && fs.readFileSync(testFileA, "utf-8") === "E2E_APPROVED",
      `Tool outcome verified=${e2eRes.verified}`
    );
  } finally {
    // Clean up temporary test files
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: F-15 Runtime Parameter Integrity & Binding
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- [Suite 2: F-15 Runtime Parameter Binding Invariants] ---");

  // 2.1: Approve notepad launch, then attempt to execute calc with same planId & grantToken -> Must be rejected!
  {
    const plan = planAction("app_launch", "notepad", { appName: "notepad" });
    const approval = approveActionPlan(plan.planId, plan.approvalToken);

    // Caller attempts to substitute appName with 'calc'
    const tamperedRes = await defaultComputerToolRegistry.executeTool(
      "launch_application",
      { appName: "calc" }, // Tampered target
      { planId: plan.planId, executionGrantToken: approval.executionGrantToken }
    );

    recordTest(
      "F-15.1: Tampering with executable target (notepad -> calc) is REJECTED by gateway",
      tamperedRes.success === false && tamperedRes.error.includes("Runtime invocation parameters do not match approved ActionPlan"),
      `Error: "${tamperedRes.error}"`
    );
  }

  // 2.2: Approve launch with args ['--safe'], then attempt to execute with ['--malicious'] -> Must be rejected!
  {
    const plan = planAction("app_launch", "notepad", { appName: "notepad", args: ["--safe"] });
    const approval = approveActionPlan(plan.planId, plan.approvalToken);

    // Caller attempts to modify command line arguments
    const tamperedArgsRes = await defaultComputerToolRegistry.executeTool(
      "launch_application",
      { appName: "notepad", args: ["--malicious"] }, // Tampered arguments
      { planId: plan.planId, executionGrantToken: approval.executionGrantToken }
    );

    recordTest(
      "F-15.2: Modifying arguments post-approval is REJECTED by gateway",
      tamperedArgsRes.success === false && tamperedArgsRes.error.includes("Runtime invocation parameters do not match approved ActionPlan"),
      `Error: "${tamperedArgsRes.error}"`
    );
  }

  // 2.3: Replaying consumed execution grant token for launch -> Must be rejected!
  {
    const plan = planAction("app_launch", "notepad", { appName: "notepad" });
    const approval = approveActionPlan(plan.planId, plan.approvalToken);

    // First execution attempt (simulated failure or success)
    await executeApprovedAction(plan.planId, approval.executionGrantToken, async () => ({ success: true }), { appName: "notepad" });

    // Replay attempt with same grant token
    const replayRes = await defaultComputerToolRegistry.executeTool(
      "launch_application",
      { appName: "notepad" },
      { planId: plan.planId, executionGrantToken: approval.executionGrantToken }
    );

    recordTest(
      "F-15.3: Replaying consumed execution grant token is REJECTED fail-closed",
      replayRes.success === false && replayRes.error.includes("Action plan not found"),
      `Error: "${replayRes.error}"`
    );
  }

  // 2.4: Attempt launch without approval -> Must be gated with plan
  {
    const unapprovedRes = await defaultComputerToolRegistry.executeTool("launch_application", { appName: "notepad" });
    recordTest(
      "F-15.4: Unapproved launch attempt returns requiresPlan and does NOT spawn process",
      unapprovedRes.success === false && Boolean(unapprovedRes.permissionPlan),
      `Permission plan generated: ${unapprovedRes.permissionPlan?.planId}`
    );
  }

  console.log("\n==================================================================");
  console.log(`PHASE 1.1 RESULTS: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runAdversarialBattery().catch((err) => {
  console.error("FATAL ERROR IN BATTERY:", err);
  process.exit(1);
});
