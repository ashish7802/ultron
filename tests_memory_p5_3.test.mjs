/**
 * @file tests_memory_p5_3.test.mjs
 * @description Comprehensive Test Suite for Phase P5.3: Authority & Reconciliation Engine.
 *
 * Subsystem:
 * Memory Versioning, Contradiction Detection & Reconciliation (Phase P5.3 Certification).
 *
 * Test Scenarios:
 * 1. 3D Authority Tensor: Calculates composite scores across sources, tiers, and confidences.
 * 2. Scenario 1: Founder explicit correction auto-supersedes parent memory atomically.
 * 3. Scenario 2: Founder preference shift auto-supersedes old preference.
 * 4. Scenario 3: Temporal evolution auto-supersedes outdated schedule.
 * 5. Scenario 4: Inferred dialogue cannot silently override direct founder memory.
 * 6. Scenario 5: Core architectural collision routes to founder confirmation.
 * 7. Scenario 6: Experimental architecture exploration enables contextual coexistence.
 * 8. Scenario 7: Procedural / security directive conflict triggers founder confirmation.
 * 9. Scenario 8: Verified tool diagnostics supersede stale agent memory.
 * 10. Scenario 9: Founder polarity reversal auto-supersedes setting.
 * 11. Scenario 10: Unauthorized agent polarity inversion is strictly rejected.
 * 12. Scenario 11: Low extraction confidence (< 0.40) on contradiction is rejected.
 * 13. Scenario 12: Complementary knowledge refinement retains both records.
 * 14. Scenario 13: Confirmation lifecycle - Founder approval executes supersession.
 * 15. Scenario 14: Confirmation lifecycle - Founder rejection preserves existing record.
 * 16. Scenario 15: Confirmation lifecycle - Founder deferral marks request deferred.
 * 17. Scenario 16: Entity graph and revision lineage preserved across supersession.
 * 18. Scenario 17: AsyncMemoryQueue integration with MemoryReconciler.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SqliteMemoryAdapter } from "./lib/memory/sqliteAdapter.ts";
import { GLOBAL_PROJECT_ID } from "./lib/memory/schema.ts";
import { MemoryReconciler } from "./lib/memory/reconciler.ts";
import { ContradictionDetector } from "./lib/memory/contradictionDetector.ts";
import { AsyncMemoryQueue } from "./lib/memory/asyncQueue.ts";
import { MemoryDAO } from "./lib/memory/dao.ts";

const TEST_DIR = path.join(process.cwd(), "ultron_engine", "test_scratch_p5_3");

function getTestDbPath(testId) {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  return path.join(TEST_DIR, `reconciler_test_${testId}_${Date.now()}.db`);
}

function cleanupDb(dbPath) {
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
    if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
  } catch {
    /* ignore */
  }
}

test("P5.3 Test 1: 3D Authority Tensor correctly calculates composite scores", () => {
  const reconciler = new MemoryReconciler();

  // Founder direct with decision tier (1.0 * 1.2 * 1.0 = 1.0 clamped)
  const founderScore = reconciler.calculateEffectiveAuthority("user_direct", "decision", 1.0);
  assert.equal(founderScore, 1.0);

  // Inferred dialogue on decision tier (0.3 * 1.2 * 1.0 = 0.36)
  const inferredDecisionScore = reconciler.calculateEffectiveAuthority("inferred_dialogue", "decision", 1.0);
  assert.equal(inferredDecisionScore, 0.36);

  // Agent on personal tier with 0.8 confidence (0.5 * 1.0 * 0.8 = 0.40)
  const agentScore = reconciler.calculateEffectiveAuthority("agent", "personal", 0.8);
  assert.equal(agentScore, 0.40);

  // Verified tool on error_solution (0.85 * 0.9 * 1.0 = 0.765)
  const toolScore = reconciler.calculateEffectiveAuthority("verified_tool", "error_solution", 1.0);
  assert.equal(toolScore, 0.765);
});

test("P5.3 Test 2: Founder explicit correction auto-supersedes parent memory atomically", async () => {
  const dbPath = getTestDbPath("t2");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  const initial = adapter.storeMemory({
    semanticKey: "user_name",
    tier: "personal",
    content: "User name is Rahul",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "user_name",
    tier: "personal",
    content: "I am not Rahul, my name is Ashish",
    source: "user_direct",
    isExplicitCorrection: true,
  });

  assert.equal(decision.policy, "AUTO_SUPERSEDE");
  assert.equal(decision.resultingStatus, "active");

  const parent = adapter.getMemoryById(initial.id);
  assert.equal(parent.status, "superseded");
  assert.ok(parent.supersededBy);

  const child = adapter.getMemoryById(parent.supersededBy);
  assert.equal(child.content, "I am not Rahul, my name is Ashish");
  assert.equal(child.version, 2);

  const revisions = adapter.getRevisionHistory(child.id);
  assert.equal(revisions.length, 2);
  assert.equal(revisions[0].id, initial.id);
  assert.equal(revisions[1].id, child.id);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 3: Founder preference shift auto-supersedes old preference", async () => {
  const dbPath = getTestDbPath("t3");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "ui_theme",
    tier: "personal",
    content: "User prefers dark mode.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "ui_theme",
    tier: "personal",
    content: "Mujhe dark mode pasand nahi hai, light mode pasand hai.",
    source: "user_direct",
  });

  assert.equal(decision.policy, "AUTO_SUPERSEDE");
  assert.equal(decision.resultingStatus, "active");

  const active = adapter.getMemoryByKey("ui_theme");
  assert.equal(active.version, 2);
  assert.match(active.content, /light mode/);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 4: Temporal evolution auto-supersedes outdated schedule", async () => {
  const dbPath = getTestDbPath("t4");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "v2_release",
    tier: "temporal",
    content: "V2 release deadline is Friday.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "v2_release",
    tier: "temporal",
    content: "The V2 release deadline has been extended to Monday.",
    source: "user_direct",
  });

  assert.equal(decision.policy, "AUTO_SUPERSEDE");
  assert.equal(decision.resultingStatus, "active");

  const latest = adapter.getMemoryByKey("v2_release");
  assert.match(latest.content, /Monday/);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 5: Inferred dialogue cannot silently override direct founder memory", async () => {
  const dbPath = getTestDbPath("t5");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  const initial = adapter.storeMemory({
    semanticKey: "db_tech",
    tier: "decision",
    content: "ULTRON uses SQLite for local canonical storage.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "db_tech",
    tier: "decision",
    content: "ULTRON should use DuckDB as the primary database.",
    source: "inferred_dialogue",
  });

  assert.equal(decision.policy, "REJECT_CANDIDATE");
  assert.equal(decision.resultingStatus, "rejected");
  assert.match(decision.reason, /Authority mismatch|cannot override/);

  // Existing memory must remain active and unchanged
  const active = adapter.getMemoryById(initial.id);
  assert.equal(active.status, "active");
  assert.equal(active.version, 1);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 6: Core architectural collision routes to founder confirmation", async () => {
  const dbPath = getTestDbPath("t6");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  const initial = adapter.storeMemory({
    semanticKey: "backend_framework",
    tier: "decision",
    content: "ULTRON backend is built on Next.js.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "backend_framework",
    tier: "decision",
    content: "ULTRON backend is built on FastAPI Python.",
    source: "user_direct",
  });

  assert.equal(decision.policy, "FOUNDER_CONFIRMATION");
  assert.equal(decision.requiresFounderPrompt, true);
  assert.ok(decision.confirmationId);

  // Confirmation record must be persisted in ultron_memory_confirmations
  const conf = adapter.getConfirmation(decision.confirmationId);
  assert.ok(conf);
  assert.equal(conf.status, "pending");
  assert.equal(conf.existingMemoryId, initial.id);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 7: Experimental architecture exploration enables contextual coexistence", async () => {
  const dbPath = getTestDbPath("t7");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "db_engine",
    tier: "decision",
    content: "ULTRON uses SQLite.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "db_engine",
    tier: "decision",
    content: "We are experimenting with DuckDB for analytics POC.",
    source: "user_direct",
    isExperimental: true,
  });

  assert.equal(decision.policy, "CONTEXTUAL_COEXISTENCE");
  assert.equal(decision.resultingStatus, "active");

  // Both memories should exist
  const canonical = adapter.getMemoryByKey("db_engine");
  assert.equal(canonical.status, "active");

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 8: Procedural / security directive conflict triggers founder confirmation", async () => {
  const dbPath = getTestDbPath("t8");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "delete_guard",
    tier: "procedural",
    content: "Always request founder confirmation before deleting files.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "delete_guard",
    tier: "procedural",
    content: "Delete files immediately without asking for confirmation.",
    source: "project_owner",
  });

  assert.equal(decision.policy, "FOUNDER_CONFIRMATION");
  assert.equal(decision.requiresFounderPrompt, true);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 9: Verified tool diagnostics supersede stale agent memory", async () => {
  const dbPath = getTestDbPath("t9");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "err_404_cause",
    tier: "error_solution",
    content: "Error is caused by network timeout.",
    source: "agent",
    confidence: 0.5,
  });

  const decision = await reconciler.reconcile({
    semanticKey: "err_404_cause",
    tier: "error_solution",
    content: "Error is caused by missing foreign key constraint.",
    source: "verified_tool",
    confidence: 0.95,
  });

  assert.equal(decision.policy, "AUTO_SUPERSEDE");
  assert.equal(decision.resultingStatus, "active");

  const updated = adapter.getMemoryByKey("err_404_cause");
  assert.match(updated.content, /missing foreign key/);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 10: Founder polarity reversal auto-supersedes setting", async () => {
  const dbPath = getTestDbPath("t10");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "telemetry_flag",
    tier: "meta",
    content: "Enable background telemetry reporting.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "telemetry_flag",
    tier: "meta",
    content: "Never enable background telemetry reporting, bilkul mat karna.",
    source: "user_direct",
  });

  assert.equal(decision.policy, "AUTO_SUPERSEDE");
  const updated = adapter.getMemoryByKey("telemetry_flag");
  assert.match(updated.content, /Never enable/);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 11: Unauthorized agent polarity inversion is strictly rejected", async () => {
  const dbPath = getTestDbPath("t11");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "audit_ledger",
    tier: "meta",
    content: "Keep audit ledger active.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "audit_ledger",
    tier: "meta",
    content: "Do not keep audit ledger active.",
    source: "agent",
  });

  assert.equal(decision.policy, "REJECT_CANDIDATE");
  assert.equal(decision.resultingStatus, "rejected");

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 12: Low extraction confidence (< 0.40) on contradiction is rejected", async () => {
  const dbPath = getTestDbPath("t12");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "project_name",
    tier: "project",
    content: "Project is ULTRON Cybernetic AI.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "project_name",
    tier: "project",
    content: "Project is Skynet Automation.",
    source: "inferred_dialogue",
    confidence: 0.30,
  });

  assert.equal(decision.policy, "REJECT_CANDIDATE");
  assert.match(decision.reason, /below minimum threshold/);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 13: Complementary knowledge refinement retains both records", async () => {
  const dbPath = getTestDbPath("t13");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "founder_role",
    tier: "personal",
    content: "Ashish is the founder.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "founder_role_architecture",
    tier: "personal",
    content: "Ashish is also the lead systems architect.",
    source: "user_direct",
  });

  assert.equal(decision.policy, "RETAIN_BOTH");

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 14: Confirmation lifecycle - Founder approval executes supersession", async () => {
  const dbPath = getTestDbPath("t14");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  const initial = adapter.storeMemory({
    semanticKey: "web_framework",
    tier: "decision",
    content: "Frontend uses React Next.js.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "web_framework",
    tier: "decision",
    content: "Frontend uses SvelteKit.",
    source: "user_direct",
  });

  assert.equal(decision.policy, "FOUNDER_CONFIRMATION");
  const confId = decision.confirmationId;

  // Founder resolves via approval
  const resolved = await reconciler.resolveConfirmation(confId, "approve", "founder");
  assert.ok(resolved);
  assert.equal(resolved.status, "approved");

  // Verify memory supersession executed
  const parent = adapter.getMemoryById(initial.id);
  assert.equal(parent.status, "superseded");

  const latest = adapter.getMemoryByKey("web_framework");
  assert.equal(latest.content, "Frontend uses SvelteKit.");
  assert.equal(latest.version, 2);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 15: Confirmation lifecycle - Founder rejection preserves existing record", async () => {
  const dbPath = getTestDbPath("t15");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  const initial = adapter.storeMemory({
    semanticKey: "api_style",
    tier: "decision",
    content: "API uses REST routes.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "api_style",
    tier: "decision",
    content: "API uses GraphQL schema.",
    source: "user_direct",
  });

  const confId = decision.confirmationId;

  // Founder rejects the confirmation
  const resolved = await reconciler.resolveConfirmation(confId, "reject", "founder");
  assert.equal(resolved.status, "rejected");

  // Initial memory must remain active and version 1
  const active = adapter.getMemoryById(initial.id);
  assert.equal(active.status, "active");
  assert.equal(active.version, 1);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 16: Confirmation lifecycle - Founder deferral marks request deferred", async () => {
  const dbPath = getTestDbPath("t16");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  adapter.storeMemory({
    semanticKey: "css_lib",
    tier: "project",
    content: "Project uses Tailwind CSS.",
    source: "user_direct",
  });

  const decision = await reconciler.reconcile({
    semanticKey: "css_lib",
    tier: "project",
    content: "Project uses vanilla CSS modules.",
    source: "user_direct",
  });

  const confId = decision.confirmationId;
  const resolved = await reconciler.resolveConfirmation(confId, "defer", "founder");
  assert.equal(resolved.status, "deferred");

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 17: Entity graph and revision lineage preserved across supersession", async () => {
  const dbPath = getTestDbPath("t17");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const reconciler = new MemoryReconciler(adapter);

  const mem1 = adapter.storeMemory({
    semanticKey: "node_engine",
    tier: "decision",
    content: "Engine uses Node.js v20.",
    source: "user_direct",
  });

  await reconciler.reconcile({
    semanticKey: "node_engine",
    tier: "decision",
    content: "Engine updated to Node.js v22.",
    source: "user_direct",
    isExplicitCorrection: true,
  });

  const mem2 = adapter.getMemoryByKey("node_engine");
  assert.equal(mem2.version, 2);

  await reconciler.reconcile({
    semanticKey: "node_engine",
    tier: "decision",
    content: "Engine updated to Node.js v24.",
    source: "user_direct",
    isExplicitCorrection: true,
  });

  const mem3 = adapter.getMemoryByKey("node_engine");
  assert.equal(mem3.version, 3);

  // Validate complete lineage
  const history = adapter.getRevisionHistory(mem3.id);
  assert.equal(history.length, 3);
  assert.equal(history[0].version, 1);
  assert.equal(history[1].version, 2);
  assert.equal(history[2].version, 3);

  // Validate integrity report
  const report = adapter.validateRevisionIntegrity();
  assert.equal(report.valid, true);
  assert.equal(report.cycleCount, 0);
  assert.equal(report.crossProjectCount, 0);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.3 Test 18: AsyncMemoryQueue integration with MemoryReconciler", async () => {
  const dbPath = getTestDbPath("t18");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const dao = new MemoryDAO(adapter);
  const reconciler = new MemoryReconciler(adapter);
  const queue = new AsyncMemoryQueue({ dao, reconciler });

  // Store initial memory
  adapter.storeMemory({
    semanticKey: "user_name",
    tier: "personal",
    content: "User name is Rahul",
    source: "user_direct",
  });

  // Enqueue turn with explicit correction
  const results = await queue.processTask({
    utterance: "Mera naam Rahul nahi Ashish hai.",
    turnId: "turn_1",
  });

  // Verify that the memory was superseded
  const activeName = adapter.getMemoryByKey("user_name");
  assert.ok(activeName);
  assert.equal(activeName.version, 2);
  assert.match(activeName.content, /Ashish/);

  adapter.close();
  cleanupDb(dbPath);
});
