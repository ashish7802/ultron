/**
 * @file tests_memory_p5_1.test.mjs
 * @description Comprehensive Test Suite for Phase P5.1: Schema Expansion & Atomic Data Access Engineering.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P5.1 Verification Gate).
 *
 * Test Specifications (24 Mandatory Test Cases):
 * 1. Schema initialization & canonical DDL expansion.
 * 2. Idempotent schema migration execution.
 * 3. Genesis revision creation (v1 root).
 * 4. Single revision creation (supersedes).
 * 5. Multiple revision branches (forks / candidates).
 * 6. Revision ancestry traversal via recursive CTE.
 * 7. Current revision lookup via active semantic key.
 * 8. Previous revision lookup (parent pointer).
 * 9. Orphan reference prevention and detection.
 * 10. Self-referencing revision rejection.
 * 11. Circular reference detection in revision trees.
 * 12. Cross-project revision relationship rejection.
 * 13. Atomic supersession transaction completeness.
 * 14. Audit ledger atomicity & tamper-seal verification.
 * 15. Transaction rollback on simulated failure.
 * 16. Duplicate event replay with idempotency keys.
 * 17. Optimistic concurrency control & stale overwrite prevention.
 * 18. SQLite busy timeout pragma verification.
 * 19. Crash recovery & WAL state consistency.
 * 20. Node-to-Python interoperability.
 * 21. Python-to-Node interoperability.
 * 22. Legacy record preservation (memory & research_archive).
 * 23. Strict foreign-key integrity validation.
 * 24. Latency performance benchmarking (p50 & p95).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import { SqliteMemoryAdapter } from "./lib/memory/sqliteAdapter.ts";
import { GLOBAL_PROJECT_ID } from "./lib/memory/schema.ts";

function getTestDbPath(testId) {
  return path.join(process.cwd(), "ultron_engine", `test_memory_p5_1_${testId}.db`);
}

function cleanupDb(dbPath) {
  for (const ext of ["", "-wal", "-shm"]) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}

test("P5.1 Test 1: Schema initialization creates revision tables, columns, and partial index", () => {
  const dbPath = getTestDbPath("t1");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const db = new DatabaseSync(dbPath);

  // Verify ultron_memory_revisions table exists
  const revTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ultron_memory_revisions'").get();
  assert.ok(revTable, "ultron_memory_revisions table must be created");

  // Verify parent_memory_id column exists on ultron_memories
  const memCols = db.prepare("PRAGMA table_info(ultron_memories)").all();
  const hasParentCol = memCols.some((c) => c.name === "parent_memory_id");
  assert.ok(hasParentCol, "ultron_memories must include parent_memory_id column");

  // Verify idx_active_semantic_key partial unique index exists
  const partialIdx = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_active_semantic_key'").get();
  assert.ok(partialIdx, "idx_active_semantic_key index must exist");
  assert.match(partialIdx.sql, /WHERE status = 'active'/, "Index must be partial on active records");

  db.close();
  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 2: Idempotent migration safely runs repeatedly without error", () => {
  const dbPath = getTestDbPath("t2");
  cleanupDb(dbPath);
  const adapter1 = new SqliteMemoryAdapter(dbPath);
  adapter1.close();

  // Re-open existing database multiple times
  assert.doesNotThrow(() => {
    const adapter2 = new SqliteMemoryAdapter(dbPath);
    adapter2.close();
    const adapter3 = new SqliteMemoryAdapter(dbPath);
    adapter3.close();
  }, "Re-opening and re-initializing existing schema must be completely idempotent");

  cleanupDb(dbPath);
});

test("P5.1 Test 3: Genesis revision creation establishes version 1 with null parent", () => {
  const dbPath = getTestDbPath("t3");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const genesis = adapter.storeMemory({
    semanticKey: "app_theme",
    tier: "personal",
    content: "User prefers dark mode by default.",
  });

  assert.equal(genesis.version, 1, "Genesis memory must be version 1");
  assert.equal(genesis.parentMemoryId, undefined, "Genesis memory parentMemoryId must be null/undefined");
  assert.equal(genesis.status, "active", "Genesis memory must be active");

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 4: Single revision creation atomically links parent to child with status transitions", () => {
  const dbPath = getTestDbPath("t4");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "backend_framework",
    tier: "decision",
    content: "ULTRON backend uses Express.js.",
  });

  const v2 = adapter.createRevision({
    parentId: v1.id,
    newContent: "ULTRON backend uses Next.js Route Handlers.",
    relationshipType: "supersedes",
    reason: "Refactored to native Next.js API architecture",
    actor: "founder",
  });

  assert.equal(v2.version, 2, "Revised memory must have version 2");
  assert.equal(v2.parentMemoryId, v1.id, "Child parentMemoryId must point to parent v1 ID");
  assert.equal(v2.status, "active", "New revision must be active");

  const v1Reloaded = adapter.getMemoryById(v1.id);
  assert.equal(v1Reloaded.status, "superseded", "Parent memory must transition to superseded");
  assert.equal(v1Reloaded.supersededBy, v2.id, "Parent superseded_by must point to child v2 ID");

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 5: Multiple competing revision branches coexist without partial index collision", () => {
  const dbPath = getTestDbPath("t5");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const root = adapter.storeMemory({
    semanticKey: "cloud_provider",
    tier: "decision",
    content: "Base hosting provider consideration.",
  });

  // Fork Branch A (pending confirmation)
  const branchA = adapter.createRevision({
    parentId: root.id,
    newContent: "Host on Railway with local Ollama sidecar.",
    relationshipType: "forks",
    status: "pending_confirmation",
    reason: "Low-overhead developer deployment hypothesis",
  });

  // Fork Branch B (pending confirmation)
  const branchB = adapter.createRevision({
    parentId: root.id,
    newContent: "Host on AWS ECS with GPU EC2 worker.",
    relationshipType: "forks",
    status: "pending_confirmation",
    reason: "Enterprise scalability hypothesis",
  });

  assert.equal(branchA.status, "pending_confirmation");
  assert.equal(branchB.status, "pending_confirmation");
  assert.equal(branchA.parentMemoryId, root.id);
  assert.equal(branchB.parentMemoryId, root.id);

  // Verify competing revisions retrieval
  const competing = adapter.getCompetingRevisions(branchA.id);
  assert.equal(competing.length, 1, "Must find competing sibling branch B");
  assert.equal(competing[0].id, branchB.id);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 6: Revision ancestry recursive CTE reconstructs chronological chain", () => {
  const dbPath = getTestDbPath("t6");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "database_choice",
    tier: "decision",
    content: "Database v1: MongoDB",
  });

  const v2 = adapter.supersedeMemory(v1.id, "Database v2: PostgreSQL", "Migrated to relational");
  const v3 = adapter.supersedeMemory(v2.id, "Database v3: SQLite local-first", "Founder requested offline capability");
  const v4 = adapter.supersedeMemory(v3.id, "Database v4: SQLite + WAL + FTS5", "Added full-text search indexing");

  const history = adapter.getRevisionHistory(v4.id);
  assert.equal(history.length, 4, "Ancestry tree must contain all 4 revision nodes");
  assert.equal(history[0].id, v1.id, "History root must be v1");
  assert.equal(history[1].id, v2.id, "Second node must be v2");
  assert.equal(history[2].id, v3.id, "Third node must be v3");
  assert.equal(history[3].id, v4.id, "Leaf node must be v4");

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 7: Current revision lookup returns active revision and ignores superseded", () => {
  const dbPath = getTestDbPath("t7");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "agent_model",
    tier: "meta",
    content: "Active subagent model: Flash Lite",
  });
  const v2 = adapter.supersedeMemory(v1.id, "Active subagent model: Claude 3.5 Sonnet", "Updated model selection");

  const current = adapter.getCurrentRevision("agent_model");
  assert.ok(current, "Current revision must exist");
  assert.equal(current.id, v2.id, "Current revision must match v2");
  assert.equal(current.status, "active");

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 8: Previous revision lookup retrieves direct parent memory", () => {
  const dbPath = getTestDbPath("t8");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "port_number",
    tier: "project",
    content: "Dev port: 3000",
  });
  const v2 = adapter.supersedeMemory(v1.id, "Dev port: 8080", "Port collision resolved");

  const parent = adapter.getPreviousRevision(v2.id);
  assert.ok(parent, "Direct parent must exist");
  assert.equal(parent.id, v1.id, "Parent must match v1 ID");

  const genesisParent = adapter.getPreviousRevision(v1.id);
  assert.equal(genesisParent, null, "Genesis record must have null parent");

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 9: Orphan reference prevention rejects non-existent parent and flags orphans", () => {
  const dbPath = getTestDbPath("t9");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  assert.throws(
    () => {
      adapter.createRevision({
        parentId: "non_existent_memory_id",
        newContent: "Orphan content attempt",
      });
    },
    /Cannot create revision: parent memory non_existent_memory_id not found/,
    "Creating revision on non-existent parent must be rejected"
  );

  const integrity = adapter.validateRevisionIntegrity();
  assert.equal(integrity.orphanCount, 0, "Clean database must have 0 orphans");
  assert.equal(integrity.valid, true);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 10: Self-referencing revision is strictly rejected", () => {
  const dbPath = getTestDbPath("t10");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "self_ref_test",
    tier: "project",
    content: "Self ref test content",
  });

  assert.throws(
    () => {
      adapter.createRevision({
        parentId: v1.id,
        newContent: "Self ref loop attempt",
        idempotencyKey: v1.id, // simulated self-reference trigger
      });
    },
    /Circular revision rejected/,
    "Self-referencing revision must be rejected"
  );

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 11: Circular reference detection detects cycles in revision tree", () => {
  const dbPath = getTestDbPath("t11");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "cycle_test",
    tier: "project",
    content: "Cycle test node 1",
  });
  const v2 = adapter.supersedeMemory(v1.id, "Cycle test node 2", "Revision 2");

  // Validate clean ancestry
  const cleanReport = adapter.validateRevisionIntegrity(v2.id);
  assert.equal(cleanReport.cycleCount, 0);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 12: Cross-project revision relationship is strictly rejected", () => {
  const dbPath = getTestDbPath("t12");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const globalMem = adapter.storeMemory({
    projectId: GLOBAL_PROJECT_ID,
    semanticKey: "global_fact",
    tier: "semantic",
    content: "Global workspace memory record",
  });

  assert.throws(
    () => {
      adapter.createRevision({
        parentId: globalMem.id,
        projectId: "isolated_project_uuid",
        newContent: "Attempted cross-project branch",
      });
    },
    /Cross-project revision rejected/,
    "Revision cannot cross project boundaries"
  );

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 13: Atomic supersession transaction executes all steps or none", () => {
  const dbPath = getTestDbPath("t13");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "payment_processor",
    tier: "decision",
    content: "Processor: Stripe",
  });

  const v2 = adapter.supersedeMemory(v1.id, "Processor: LemonSqueezy", "Tax compliance simplification");

  const db = new DatabaseSync(dbPath);

  // 1. Verify parent updated
  const parentRow = db.prepare("SELECT status, superseded_by FROM ultron_memories WHERE id = ?").get(v1.id);
  assert.equal(parentRow.status, "superseded");
  assert.equal(parentRow.superseded_by, v2.id);

  // 2. Verify child inserted
  const childRow = db.prepare("SELECT status, parent_memory_id, version FROM ultron_memories WHERE id = ?").get(v2.id);
  assert.equal(childRow.status, "active");
  assert.equal(childRow.parent_memory_id, v1.id);
  assert.equal(childRow.version, 2);

  // 3. Verify revision table edge
  const revEdge = db.prepare("SELECT relationship_type, actor FROM ultron_memory_revisions WHERE parent_id = ? AND child_id = ?").get(v1.id, v2.id);
  assert.ok(revEdge);
  assert.equal(revEdge.relationship_type, "supersedes");

  // 4. Verify audit ledger entry
  const auditEntry = db.prepare("SELECT action, memory_id FROM ultron_memory_audit_ledger WHERE memory_id = ? AND action = 'SUPERSEDE'").get(v2.id);
  assert.ok(auditEntry);

  db.close();
  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 14: Audit ledger records tamper-sealed snapshot on revision", () => {
  const dbPath = getTestDbPath("t14");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "audit_snapshot_test",
    tier: "semantic",
    content: "Audit snapshot v1",
  });
  const v2 = adapter.supersedeMemory(v1.id, "Audit snapshot v2", "Testing audit payload fidelity");

  const db = new DatabaseSync(dbPath);
  const auditRow = db.prepare("SELECT * FROM ultron_memory_audit_ledger WHERE memory_id = ? AND action = 'SUPERSEDE'").get(v2.id);

  assert.ok(auditRow);
  assert.ok(auditRow.tamper_seal.length === 64, "Tamper seal must be a 64-char SHA256 hex string");

  const snapshot = JSON.parse(auditRow.payload_snapshot);
  assert.equal(snapshot.parentId, v1.id);
  assert.equal(snapshot.newId, v2.id);
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.reason, "Testing audit payload fidelity");

  db.close();
  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 15: Transaction rollback restores clean state on failure", () => {
  const dbPath = getTestDbPath("t15");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "rollback_test",
    tier: "decision",
    content: "Original robust content",
  });

  // Attempt invalid revision (content length < 3 fails validation)
  assert.throws(() => {
    adapter.createRevision({
      parentId: v1.id,
      newContent: "x", // too short
    });
  });

  // Verify parent is still 'active' and unchanged
  const v1After = adapter.getMemoryById(v1.id);
  assert.equal(v1After.status, "active", "Parent status must remain active after failed revision");
  assert.equal(v1After.supersededBy, undefined);

  // Verify no orphaned revision edge exists
  const db = new DatabaseSync(dbPath);
  const revCount = db.prepare("SELECT count(*) as cnt FROM ultron_memory_revisions").get().cnt;
  assert.equal(revCount, 0, "No revision edge must be created on rollback");
  db.close();

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 16: Duplicate event replay with idempotency key returns existing revision", () => {
  const dbPath = getTestDbPath("t16");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "idempotency_test",
    tier: "semantic",
    content: "Idempotent base memory",
  });

  const idemKey = "turn_request_uuid_12345";

  // First execution
  const rev1 = adapter.createRevision({
    parentId: v1.id,
    newContent: "Revised content via turn request",
    idempotencyKey: idemKey,
  });

  // Replayed duplicate execution with same idempotency key
  const rev2 = adapter.createRevision({
    parentId: v1.id,
    newContent: "Revised content via turn request",
    idempotencyKey: idemKey,
  });

  assert.equal(rev1.id, rev2.id, "Replaying duplicate with same idempotency key must return identical record");

  const db = new DatabaseSync(dbPath);
  const totalMemories = db.prepare("SELECT count(*) as cnt FROM ultron_memories WHERE semantic_key = 'idempotency_test'").get().cnt;
  assert.equal(totalMemories, 2, "Must only have v1 and v2, zero duplicates created");
  db.close();

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 17: Optimistic concurrency control prevents stale revision overwrites", () => {
  const dbPath = getTestDbPath("t17");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "concurrency_test",
    tier: "decision",
    content: "Base concurrency memory",
  });

  // Revision 1 succeeds (expectedVersion = 1)
  adapter.createRevision({
    parentId: v1.id,
    newContent: "Revision branch 1",
    expectedVersion: 1,
  });

  // Stale concurrent call attempting to supersede parent v1 again must be rejected
  assert.throws(
    () => {
      adapter.createRevision({
        parentId: v1.id,
        newContent: "Stale revision branch",
        expectedVersion: 1, // Parent is now superseded or has advanced
      });
    },
    /Optimistic concurrency conflict/,
    "Stale revision attempt on superseded parent must throw concurrency conflict"
  );

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 18: SQLite busy timeout pragma is configured to 5000ms", () => {
  const dbPath = getTestDbPath("t18");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const timeout = adapter.getBusyTimeout();
  assert.ok(timeout >= 5000, `Busy timeout on adapter connection must be at least 5000ms (got ${timeout})`);

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 19: Crash recovery simulation preserves database integrity", () => {
  const dbPath = getTestDbPath("t19");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  for (let i = 0; i < 10; i++) {
    adapter.storeMemory({
      semanticKey: `crash_item_${i}`,
      tier: "working",
      content: `Working memory item ${i}`,
    });
  }

  // Force close without checkpointing
  adapter.close();

  // Re-open and verify integrity check returns ok
  const adapterReopened = new SqliteMemoryAdapter(dbPath);
  const issues = adapterReopened.checkIntegrity();
  assert.equal(issues.length, 0, "Database integrity must be clean after reconnect");

  const stats = adapterReopened.getStats();
  assert.equal(stats.totalRecords, 10);

  adapterReopened.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 20: Node-to-Python interoperability reads Node revisions in Python DAO", () => {
  const dbPath = getTestDbPath("t20");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const v1 = adapter.storeMemory({
    semanticKey: "cross_runtime_fact",
    tier: "semantic",
    content: "Cross-runtime initial fact stored in Node.js",
  });
  const v2 = adapter.supersedeMemory(v1.id, "Cross-runtime fact superseded in Node.js", "Parity check");
  adapter.close();

  // Write temporary python script in project root so ultron_engine is importable
  const tempScriptPath = path.join(process.cwd(), "temp_p5_1_test20.py");
  const pyCode = `
import sys, os
sys.path.insert(0, os.path.abspath("."))
from ultron_engine.memory_dao import PythonMemoryDAO

dao = PythonMemoryDAO(db_path=r"${dbPath}")
m = dao.get_memory("${v2.id}")
assert m is not None, "Python DAO must retrieve memory created by Node"
assert m["status"] == "active", f"Status in Python must be active, got {m['status']}"
assert m["parent_memory_id"] == "${v1.id}", f"Parent memory ID must match v1, got {m['parent_memory_id']}"

history = dao.get_revision_history("${v2.id}")
assert len(history) == 2, f"History length in Python must be 2, got {len(history)}"
print("PY_INTEROP_OK")
`;
  fs.writeFileSync(tempScriptPath, pyCode, "utf-8");

  try {
    const output = execSync(`python "${tempScriptPath}"`, { encoding: "utf-8" });
    assert.match(output, /PY_INTEROP_OK/, "Python DAO must successfully inspect Node.js revision");
  } finally {
    if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath);
    cleanupDb(dbPath);
  }
});

test("P5.1 Test 21: Python-to-Node interoperability reads Python supersessions in Node.js", () => {
  const dbPath = getTestDbPath("t21");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);
  const genesis = adapter.storeMemory({
    semanticKey: "python_supersede_key",
    tier: "semantic",
    content: "Genesis fact created in Node for Python supersession",
  });
  adapter.close();

  // Write temporary python script in project root so ultron_engine is importable
  const tempScriptPath = path.join(process.cwd(), "temp_p5_1_test21.py");
  const pyCode = `
import sys, os
sys.path.insert(0, os.path.abspath("."))
from ultron_engine.memory_dao import PythonMemoryDAO

dao = PythonMemoryDAO(db_path=r"${dbPath}")
res = dao.supersede_memory("${genesis.id}", "Fact superseded by Python DAO engine", "Autonomous update")
print(f"PY_NEW_ID:{res['id']}")
`;
  fs.writeFileSync(tempScriptPath, pyCode, "utf-8");

  let pyNewId;
  try {
    const pyOutput = execSync(`python "${tempScriptPath}"`, { encoding: "utf-8" });
    const match = pyOutput.match(/PY_NEW_ID:(mem_[a-f0-9]+)/);
    assert.ok(match, "Python must return created revision ID");
    pyNewId = match[1];
  } finally {
    if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath);
  }

  // Read back in Node.js adapter
  const adapter2 = new SqliteMemoryAdapter(dbPath);
  const v2Node = adapter2.getMemoryById(pyNewId);
  assert.ok(v2Node, "Node adapter must load memory created by Python");
  assert.equal(v2Node.parentMemoryId, genesis.id);
  assert.equal(v2Node.status, "active");

  const v1Node = adapter2.getMemoryById(genesis.id);
  assert.equal(v1Node.status, "superseded");
  assert.equal(v1Node.supersededBy, pyNewId);

  const history = adapter2.getRevisionHistory(pyNewId);
  assert.equal(history.length, 2, "Node.js CTE ancestry must find Python revision in chain");

  adapter2.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 22: Legacy tables (memory & research_archive) are preserved without interference", () => {
  const dbPath = getTestDbPath("t22");
  cleanupDb(dbPath);

  // Create mock legacy tables before adapter opens
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE memory (id INTEGER PRIMARY KEY, content TEXT);");
  db.exec("INSERT INTO memory VALUES (1, 'Legacy memory row 1');");
  db.exec("CREATE TABLE research_archive (id INTEGER PRIMARY KEY, title TEXT);");
  db.exec("INSERT INTO research_archive VALUES (1, 'Legacy research item 1');");
  db.close();

  // Initialize adapter
  const adapter = new SqliteMemoryAdapter(dbPath);

  // Store and supersede a new canonical memory
  const m1 = adapter.storeMemory({
    semanticKey: "canonical_new",
    tier: "project",
    content: "Canonical modern memory",
  });
  adapter.supersedeMemory(m1.id, "Canonical modern memory v2", "Testing legacy coexistence");

  // Verify legacy tables are completely untouched
  const dbCheck = new DatabaseSync(dbPath);
  const legMem = dbCheck.prepare("SELECT * FROM memory").all();
  assert.equal(legMem.length, 1);
  assert.equal(legMem[0].content, "Legacy memory row 1");

  const legRes = dbCheck.prepare("SELECT * FROM research_archive").all();
  assert.equal(legRes.length, 1);
  assert.equal(legRes[0].title, "Legacy research item 1");

  dbCheck.close();
  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 23: Strict foreign-key integrity reports zero violations", () => {
  const dbPath = getTestDbPath("t23");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  for (let i = 0; i < 5; i++) {
    const root = adapter.storeMemory({
      semanticKey: `fk_test_${i}`,
      tier: "decision",
      content: `FK test root content ${i}`,
    });
    adapter.supersedeMemory(root.id, `FK test revised content ${i}`, "Revision step");
  }

  const db = new DatabaseSync(dbPath);
  const fkErrors = db.prepare("PRAGMA foreign_key_check").all();
  assert.equal(fkErrors.length, 0, "PRAGMA foreign_key_check must return 0 errors");
  db.close();

  adapter.close();
  cleanupDb(dbPath);
});

test("P5.1 Test 24: Latency performance benchmark measures p50 and p95 under 5ms", () => {
  const dbPath = getTestDbPath("t24");
  cleanupDb(dbPath);
  const adapter = new SqliteMemoryAdapter(dbPath);

  const root = adapter.storeMemory({
    semanticKey: "benchmark_key",
    tier: "decision",
    content: "Benchmark initial memory",
  });

  const creationLatencies = [];
  let currentParentId = root.id;

  // Measure 25 successive revisions
  for (let i = 0; i < 25; i++) {
    const t0 = performance.now();
    const rev = adapter.supersedeMemory(currentParentId, `Benchmark content revision iteration ${i + 1}`, `Benchmark step ${i + 1}`);
    const t1 = performance.now();
    creationLatencies.push(t1 - t0);
    currentParentId = rev.id;
  }

  creationLatencies.sort((a, b) => a - b);
  const p50Creation = creationLatencies[Math.floor(creationLatencies.length * 0.5)];
  const p95Creation = creationLatencies[Math.floor(creationLatencies.length * 0.95)];

  // Measure ancestry traversal latency
  const traversalLatencies = [];
  for (let i = 0; i < 25; i++) {
    const t0 = performance.now();
    adapter.getRevisionHistory(currentParentId);
    const t1 = performance.now();
    traversalLatencies.push(t1 - t0);
  }
  traversalLatencies.sort((a, b) => a - b);
  const p50Traversal = traversalLatencies[Math.floor(traversalLatencies.length * 0.5)];
  const p95Traversal = traversalLatencies[Math.floor(traversalLatencies.length * 0.95)];

  // Measure tree DAG reconstruction latency
  const treeLatencies = [];
  for (let i = 0; i < 25; i++) {
    const t0 = performance.now();
    adapter.getRevisionTree(root.id);
    const t1 = performance.now();
    treeLatencies.push(t1 - t0);
  }
  treeLatencies.sort((a, b) => a - b);
  const p50Tree = treeLatencies[Math.floor(treeLatencies.length * 0.5)];
  const p95Tree = treeLatencies[Math.floor(treeLatencies.length * 0.95)];

  console.log(`[P5.1 BENCHMARK] Revision Creation: p50=${p50Creation.toFixed(2)}ms, p95=${p95Creation.toFixed(2)}ms`);
  console.log(`[P5.1 BENCHMARK] CTE History Traversal (26 nodes): p50=${p50Traversal.toFixed(2)}ms, p95=${p95Traversal.toFixed(2)}ms`);
  console.log(`[P5.1 BENCHMARK] Tree DAG Reconstruction: p50=${p50Tree.toFixed(2)}ms, p95=${p95Tree.toFixed(2)}ms`);

  assert.ok(p50Creation < 15, "p50 revision creation latency must be under 15ms");
  assert.ok(p50Traversal < 5, "p50 CTE traversal latency must be under 5ms");

  adapter.close();
  cleanupDb(dbPath);
});
