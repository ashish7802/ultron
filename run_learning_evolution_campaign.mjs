/**
 * @file run_learning_evolution_campaign.mjs
 * @description Master Campaign Runner for ULTRON Learning & Evolution Engine (Blueprint Section 8).
 * Executes both the Core Functional Suite and the Independent Final Verification Batch.
 */

import { execSync } from "child_process";

const SUITES = [
  {
    name: "Phase 1 - 6 Core Functional Suite (Modules 01 - 10 + Capabilities)",
    file: "tests_learning_evolution_engine.test.mjs",
  },
  {
    name: "Independent Final Verification Batch (Verifications A - F)",
    file: "tests_learning_evolution_verification.test.mjs",
  },
];

console.log("================================================================================");
console.log("          ULTRON LEARNING & EVOLUTION ENGINE — VERIFICATION CAMPAIGN            ");
console.log("               Master Feature Blueprint V1.0, Pages 71-79                       ");
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
console.log("                      FINAL CAMPAIGN SUMMARY MATRIX                             ");
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
console.log(`Campaign Verdict:     ${totalFailed === 0 ? "VERIFIED (100% PASS RATE)" : "FAILURES DETECTED"}`);
console.log("================================================================================\n");

if (totalFailed > 0) {
  process.exit(1);
}
