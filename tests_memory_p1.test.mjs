/**
 * @file tests_memory_p1.test.mjs
 * @description Test Suite for ULTRON Advanced Memory System — Phase P1 Foundation.
 *
 * Verifies:
 * 1. Embedded SQLite Schema Initialization & Table Integrity (all 8 tables + FTS5).
 * 2. Deterministic Blind-Index Deduplication (HMAC-SHA256).
 * 3. FTS5 BM25 Keyword Search & Automatic Trigger Synchronization.
 * 4. Immutable Versioning & Supersession Chains.
 * 5. Lossless Legacy Data Migration (Vault JSON + Legacy SQLite).
 * 6. Project Boundary Isolation (Global vs Isolated Project).
 * 7. Cryptographic Tamper-Evident Audit Ledger.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Test-isolated database path
const TEST_DB_PATH = path.join(process.cwd(), "ultron_engine", "test_memory_p1.db");

// Cleanup helper
function cleanupTestDb() {
  for (const ext of ["", "-wal", "-shm"]) {
    const f = `${TEST_DB_PATH}${ext}`;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

test("P1 Foundation: Schema establishes all canonical tables and FTS5 triggers", async () => {
  cleanupTestDb();
  const { SqliteMemoryAdapter } = await import("./lib/memory/sqliteAdapter.ts");
  const adapter = new SqliteMemoryAdapter(TEST_DB_PATH);

  const db = new DatabaseSync(TEST_DB_PATH);
  const tablesStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableNames = (tablesStmt.all()).map((r) => r.name);

  const expectedTables = [
    "ultron_decisions",
    "ultron_entity_edges",
    "ultron_entity_nodes",
    "ultron_error_solutions",
    "ultron_memories",
    "ultron_memories_fts",
    "ultron_memory_audit_ledger",
    "ultron_memory_vectors",
    "ultron_projects",
  ];

  for (const expected of expectedTables) {
    assert.ok(
      tableNames.includes(expected),
      `Expected table '${expected}' to be created in database. Found: ${tableNames.join(", ")}`
    );
  }

  // Check global workspace project exists
  const globalProj = db.prepare("SELECT slug, name FROM ultron_projects WHERE id = '00000000-0000-0000-0000-000000000000'").get();
  assert.ok(globalProj, "Global workspace project must be seeded on startup");
  assert.equal(globalProj.slug, "global");

  db.close();
  adapter.close();
  cleanupTestDb();
});

test("P1 Foundation: Store, blind-index deduplication and access count increment", async () => {
  cleanupTestDb();
  const { SqliteMemoryAdapter } = await import("./lib/memory/sqliteAdapter.ts");
  const adapter = new SqliteMemoryAdapter(TEST_DB_PATH);

  // 1. Store first memory
  const mem1 = adapter.storeMemory({
    tier: "personal",
    semanticKey: "user_name",
    content: "User's name is Ashish",
    importance: 5,
    confidence: 1.0,
    sensitivity: "internal",
    source: "explicit_user",
  });

  assert.ok(mem1.id.startsWith("mem_"), "Memory ID should start with mem_");
  assert.equal(mem1.tier, "personal");
  assert.equal(mem1.accessCount, 0);
  assert.ok(mem1.contentHash && mem1.contentHash.length === 64, "Blind index hash must be 64-char hex");

  // 2. Ingest duplicate memory with whitespace difference
  const dup = adapter.storeMemory({
    tier: "personal",
    semanticKey: "user_name_alias",
    content: "  User's   name is  Ashish  ",
    importance: 5,
    confidence: 1.0,
  });

  // Should return the existing record with incremented accessCount
  assert.equal(dup.id, mem1.id, "Duplicate content must return the existing record ID");
  assert.equal(dup.accessCount, 1, "Access count must increment on duplicate ingestion");

  adapter.close();
  cleanupTestDb();
});

test("P1 Foundation: FTS5 BM25 search retrieves records with Porter stemming", async () => {
  cleanupTestDb();
  const { SqliteMemoryAdapter } = await import("./lib/memory/sqliteAdapter.ts");
  const adapter = new SqliteMemoryAdapter(TEST_DB_PATH);

  adapter.storeMemory({
    tier: "semantic",
    semanticKey: "react_hooks_rule",
    content: "React 19 hooks must execute unconditionally at the top level of function components.",
    importance: 4,
    confidence: 1.0,
  });

  adapter.storeMemory({
    tier: "procedural",
    semanticKey: "build_electron_recipe",
    content: "To package the Windows standalone installer, run npm run build:electron in PowerShell.",
    importance: 5,
    confidence: 1.0,
  });

  adapter.storeMemory({
    tier: "personal",
    semanticKey: "user_preference",
    content: "Founder prefers TypeScript over JavaScript for all backend microservices.",
    importance: 5,
    confidence: 1.0,
  });

  // Search stem: "components" should match "component" / "components"
  const search1 = adapter.searchFTS("component");
  assert.ok(search1.length >= 1, "FTS5 should match 'component' via Porter stemming");
  assert.equal(search1[0].semanticKey, "react_hooks_rule");

  // Search keyword: "electron"
  const search2 = adapter.searchFTS("electron installer");
  assert.ok(search2.length >= 1, "FTS5 should match 'electron installer'");
  assert.equal(search2[0].semanticKey, "build_electron_recipe");

  // Search keyword: "TypeScript"
  const search3 = adapter.searchFTS("typescript");
  assert.ok(search3.length >= 1, "FTS5 should match 'typescript'");
  assert.equal(search3[0].semanticKey, "user_preference");

  adapter.close();
  cleanupTestDb();
});

test("P1 Foundation: Immutable versioning and supersession chain", async () => {
  cleanupTestDb();
  const { SqliteMemoryAdapter } = await import("./lib/memory/sqliteAdapter.ts");
  const adapter = new SqliteMemoryAdapter(TEST_DB_PATH);

  // Initial belief
  const v1 = adapter.storeMemory({
    tier: "decision",
    semanticKey: "primary_database",
    content: "Decided to evaluate PostgreSQL as primary database.",
    importance: 4,
    confidence: 0.8,
  });

  assert.equal(v1.version, 1);
  assert.equal(v1.status, "active");

  // Supersede with updated architecture decision
  const v2 = adapter.supersedeMemory(
    v1.id,
    "Decided on embedded SQLite 3 as local default with PostgreSQL adapter.",
    "Hardware constraint: 8GB RAM performance optimization"
  );

  assert.equal(v2.version, 2, "Revised record must have version 2");
  assert.equal(v2.status, "active", "Revised record must be active");
  assert.notEqual(v2.id, v1.id, "Revised record must receive a fresh ID");

  // Verify old record is marked superseded
  const oldCheck = adapter.getMemoryById(v1.id);
  assert.ok(oldCheck);
  assert.equal(oldCheck.status, "superseded", "Old record status must be 'superseded'");
  assert.equal(oldCheck.supersededBy, v2.id, "Old record superseded_by must point to v2 ID");

  // Verify default search excludes superseded records
  const searchActive = adapter.searchFTS("database", { includeSuperseded: false });
  assert.equal(searchActive.length, 1);
  assert.equal(searchActive[0].id, v2.id, "Search must return active v2 record only");

  adapter.close();
  cleanupTestDb();
});

test("P1 Foundation: Project isolation boundaries", async () => {
  cleanupTestDb();
  const { SqliteMemoryAdapter } = await import("./lib/memory/sqliteAdapter.ts");
  const adapter = new SqliteMemoryAdapter(TEST_DB_PATH);

  const db = new DatabaseSync(TEST_DB_PATH);
  // Create a separate project
  db.prepare("INSERT INTO ultron_projects (id, slug, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    "project-alpha-uuid",
    "project-alpha",
    "Project Alpha",
    "Isolated project",
    Date.now(),
    Date.now()
  );
  db.close();

  // Store memory in Project Alpha
  adapter.storeMemory({
    projectId: "project-alpha-uuid",
    tier: "project",
    semanticKey: "alpha_secret_spec",
    content: "Project Alpha confidential algorithm architecture details.",
    importance: 5,
    confidence: 1.0,
  });

  // Store memory in Global Workspace
  adapter.storeMemory({
    projectId: "00000000-0000-0000-0000-000000000000",
    tier: "personal",
    semanticKey: "founder_identity",
    content: "Founder identity Ashish applies across all projects.",
    importance: 5,
    confidence: 1.0,
  });

  // Query scoped to Global Workspace only: Project Alpha memory must NOT leak
  const globalResults = adapter.searchFTS("algorithm", { projectId: "00000000-0000-0000-0000-000000000000" });
  assert.equal(globalResults.length, 0, "Project Alpha memory must not appear in global queries");

  // Query scoped to Project Alpha: Should find both Project Alpha memory AND global personal memory
  const alphaResults = adapter.searchFTS("Ashish", { projectId: "project-alpha-uuid" });
  assert.ok(alphaResults.length >= 1, "Global workspace memories should be accessible within project contexts");

  adapter.close();
  cleanupTestDb();
});

test("P1 Foundation: Lossless legacy data migration", async () => {
  cleanupTestDb();
  const { SqliteMemoryAdapter } = await import("./lib/memory/sqliteAdapter.ts");
  const { migrateLegacyMemories } = await import("./lib/memory/migrateLegacy.ts");

  const adapter = new SqliteMemoryAdapter(TEST_DB_PATH);

  // Run migration on real default db path vs test adapter
  const summary = migrateLegacyMemories(adapter);

  assert.ok(typeof summary.totalMigrated === "number", "Total migrated count must be returned");
  assert.ok(summary.errors.length === 0, `Migration must complete with zero errors: ${summary.errors.join("; ")}`);
  assert.ok(summary.totalMigrated > 0 || summary.alreadyMigrated, "Must migrate records or recognize prior migration");

  // Verify that Ashish's identity exists in canonical storage after migration
  const ashishMem = adapter.getMemoryByKey("user_name");
  assert.ok(ashishMem, "Ashish's user_name memory must exist in canonical storage after migration");
  assert.match(ashishMem.content, /Ashish/i, "Migrated memory content must contain Ashish");
  assert.equal(ashishMem.tier, "personal", "user_name must be classified as 'personal' tier");

  adapter.close();
  cleanupTestDb();
});

test("P1 Foundation: Cryptographic tamper-evident audit ledger", async () => {
  cleanupTestDb();
  const { SqliteMemoryAdapter } = await import("./lib/memory/sqliteAdapter.ts");
  const adapter = new SqliteMemoryAdapter(TEST_DB_PATH);

  const mem = adapter.storeMemory({
    tier: "semantic",
    semanticKey: "audit_test",
    content: "Audited action verification payload",
  });

  adapter.deleteMemory(mem.id);

  const db = new DatabaseSync(TEST_DB_PATH);
  const ledgerRows = db.prepare("SELECT * FROM ultron_memory_audit_ledger WHERE memory_id = ? ORDER BY id ASC").all(mem.id);

  assert.equal(ledgerRows.length, 2, "Expected 2 audit entries (CREATE and DELETE)");
  assert.equal(ledgerRows[0].action, "CREATE");
  assert.equal(ledgerRows[1].action, "DELETE");
  assert.ok(ledgerRows[0].tamper_seal && ledgerRows[0].tamper_seal.length === 64, "Tamper seal must be HMAC-SHA256 hex");

  db.close();
  adapter.close();
  cleanupTestDb();
});
