/**
 * @file run_research_verification_campaign.mjs
 * @description Consolidated Test Campaign Runner for ULTRON Research Engine (Modules 01 - 12).
 * Runs each test suite in sequence, capturing pass/fail rates, latencies, and output.
 */

import { execSync } from "child_process";

// Enforce consistent master key for all verification processes to guarantee encryption interoperability
process.env.ULTRON_MASTER_KEY = "ultron_module12_deterministic_test_master_key_2026";

const SUITES = [
  { name: "Phase 1: Foundation (Modules 01, 02, 03)", file: "tests_research_phase1_foundation.test.mjs" },
  { name: "Phase 2: Verification (Modules 04, 05, 06)", file: "tests_research_phase2_verification.test.mjs" },
  { name: "Phase 3: Intelligence (Modules 07, 08, 09)", file: "tests_research_phase3_intelligence.test.mjs" },
  { name: "Phase 4: Memory & Safety (Modules 10, 11)", file: "tests_research_phase4_memory_safety.test.mjs" },
  { name: "Adversarial Red-Team Security Probes", file: "tests_research_redteam_security.test.mjs" },
  { name: "Phase 5: E2E Pipeline & Performance", file: "tests_research_phase5_e2e_benchmark.test.mjs" },
];

console.log("================================================================================");
console.log("       ULTRON RESEARCH & VERIFICATION ENGINE - MODULE 12 TEST CAMPAIGN         ");
console.log("================================================================================\n");

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
const results = [];
const overallStart = Date.now();

for (const suite of SUITES) {
  process.stdout.write(`Executing: ${suite.name} ... `);
  const suiteStart = Date.now();
  try {
    const output = execSync(`node --max-old-space-size=4096 --test ${suite.file}`, {
      encoding: "utf8",
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const suiteDuration = Date.now() - suiteStart;

    // Parse pass/fail counts from node:test TAP output
    const passMatch = output.match(/ℹ pass (\d+)/);
    const failMatch = output.match(/ℹ fail (\d+)/);
    const testsMatch = output.match(/ℹ tests (\d+)/);

    const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
    const count = testsMatch ? parseInt(testsMatch[1], 10) : passed + failed;

    totalTests += count;
    totalPassed += passed;
    totalFailed += failed;

    console.log(`PASSED (${passed}/${count} in ${(suiteDuration / 1000).toFixed(2)}s)`);
    results.push({ ...suite, status: "PASS", passed, failed, count, duration: suiteDuration });
  } catch (err) {
    const suiteDuration = Date.now() - suiteStart;
    const stdout = err.stdout ? err.stdout.toString() : "";
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.log(`FAILED in ${(suiteDuration / 1000).toFixed(2)}s`);
    console.error(stdout);
    console.error(stderr);
    results.push({ ...suite, status: "FAIL", passed: 0, failed: 1, count: 1, duration: suiteDuration });
    totalFailed++;
  }
}

const totalDuration = Date.now() - overallStart;

console.log("\n================================================================================");
console.log("                       FINAL CAMPAIGN SUMMARY MATRIX                           ");
console.log("================================================================================");
console.table(
  results.map((r) => ({
    Suite: r.name,
    Status: r.status,
    Passed: `${r.passed}/${r.count}`,
    "Duration (s)": (r.duration / 1000).toFixed(2),
  }))
);

console.log(`Total Tests Executed: ${totalTests}`);
console.log(`Total Passed:         ${totalPassed}`);
console.log(`Total Failed:         ${totalFailed}`);
console.log(`Overall Duration:     ${(totalDuration / 1000).toFixed(2)}s`);
console.log(`Campaign Verdict:     ${totalFailed === 0 ? "SUCCESS (100% PASS RATE)" : "FAILURES DETECTED"}`);
console.log("================================================================================\n");

if (totalFailed > 0) {
  process.exit(1);
}
