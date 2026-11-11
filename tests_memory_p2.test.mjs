/**
 * @file tests_memory_p2.test.mjs
 * @description Comprehensive Test Suite for Phase P2: Twelve Memory Types and Specialized Handlers.
 *
 * Verifies:
 * 1. Secret Exclusion Guard rejects API keys and credentials across all tiers.
 * 2. All 12 Memory Tiers store with exact tier classification and assigned decay rates.
 * 3. Decision Memory populates canonical `ultron_decisions` table.
 * 4. Error & Solution Memory populates canonical `ultron_error_solutions` table.
 * 5. Relational Memory automatically creates Knowledge Graph nodes and edges.
 * 6. Personal Memory enforces zero-decay ($\lambda = 0.000$) and high importance.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Test-isolated database path
const TEST_DB_PATH = path.join(process.cwd(), "ultron_engine", "test_memory_p2.db");

function cleanupTestDb() {
  for (const ext of ["", "-wal", "-shm"]) {
    const f = `${TEST_DB_PATH}${ext}`;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

test("P2 Specialized: Secret Exclusion Guard strictly blocks API keys and credentials", async () => {
  const { validateMemoryPayload } = await import("./lib/memory/validators.ts");

  // Simulated AWS Key in content
  const awsPayload = {
    tier: "semantic",
    semanticKey: "aws_config",
    content: "Connect to S3 using AKIAIOSFODNN7EXAMPLE for asset storage",
    conceptDomain: "architecture",
    factStatement: "S3 configuration",
    relatedConcepts: ["aws", "s3"],
  };

  const val1 = validateMemoryPayload(awsPayload);
  assert.equal(val1.isValid, false, "Must reject payload containing AWS Access Key");
  assert.match(val1.errors[0], /prohibited secrets/i);

  // Simulated OpenAI API key
  const openaiPayload = {
    tier: "personal",
    semanticKey: "user_secret",
    content: "My OpenAI secret token is sk-1234567890abcdef1234567890abcdef",
    founderAttribute: "custom_value",
    attributeValue: "secret",
    isImmutable: false,
    userExplicitlyDeclared: true,
  };

  const val2 = validateMemoryPayload(openaiPayload);
  assert.equal(val2.isValid, false, "Must reject payload containing sk- API Key");

  // Simulated unlabelled JWT token
  const jwtPayload = {
    tier: "semantic",
    semanticKey: "user_jwt",
    content: "Authorization token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    conceptDomain: "auth",
    factStatement: "JWT session",
    relatedConcepts: ["jwt", "token"],
  };
  const val3 = validateMemoryPayload(jwtPayload);
  assert.equal(val3.isValid, false, "Must reject payload containing unlabelled JWT");

  // Simulated database connection string with password
  const dbUriPayload = {
    tier: "project",
    semanticKey: "db_uri",
    content: "Primary DB is postgres://admin:SuperSecretPass123@localhost:5432/ultron_prod",
    projectName: "Ultron",
    projectPhase: "P2",
    architectureDecisions: [],
    activeMilestones: [],
    keyDependencies: [],
  };
  const val4 = validateMemoryPayload(dbUriPayload);
  assert.equal(val4.isValid, false, "Must reject payload containing DB connection string with credentials");
});

test("P2 Specialized: Ingest and verify all 12 memory tiers", async () => {
  cleanupTestDb();
  const { SqliteMemoryAdapter } = await import("./lib/memory/sqliteAdapter.ts");
  const { MemoryDAO } = await import("./lib/memory/dao.ts");
  const { SpecializedMemoryService } = await import("./lib/memory/tierHandlers.ts");

  const adapter = new SqliteMemoryAdapter(TEST_DB_PATH);
  const dao = new MemoryDAO(adapter);
  const service = new SpecializedMemoryService(dao);

  // 1. Working Memory
  const m1 = await service.storeWorking({
    tier: "working",
    semanticKey: "working_active_turn",
    content: "User asked to refactor the memory DAO into 12 types",
    activeSessionId: "sess_001",
    goalStack: ["Implement Phase P2", "Run test suite"],
    unresolvedReferences: { "it": "MemoryDAO" },
    turnCount: 4,
  });
  assert.equal(m1.tier, "working");
  assert.equal(m1.decayRate, 0.500);

  // 2. Episodic Memory
  const m2 = await service.storeEpisodic({
    tier: "episodic",
    semanticKey: "meeting_phase_p1",
    content: "Completed Phase P1 review with Ashish. Approved SQLite 3 embedded architecture.",
    episodeTitle: "Architecture Review P1",
    participants: ["Ashish", "ULTRON"],
    dialogueTurnIds: ["turn_1", "turn_2"],
    keyOutcomes: ["P1 approved", "Proceed to P2"],
    sessionStartedAt: Date.now() - 3600000,
    sessionEndedAt: Date.now(),
  });
  assert.equal(m2.tier, "episodic");
  assert.equal(m2.decayRate, 0.050);

  // 3. Semantic Memory
  const m3 = await service.storeSemantic({
    tier: "semantic",
    semanticKey: "sqlite_wal_pragmas",
    content: "SQLite Write-Ahead Logging allows concurrent readers and writers without lock contention.",
    conceptDomain: "software_engineering",
    factStatement: "WAL mode allows concurrent readers and writers",
    relatedConcepts: ["sqlite", "wal", "concurrency"],
  });
  assert.equal(m3.tier, "semantic");
  assert.equal(m3.decayRate, 0.005);

  // 4. Procedural Memory
  const m4 = await service.storeProcedural({
    tier: "procedural",
    semanticKey: "electron_build_steps",
    content: "Steps to package Windows standalone installer using electron-builder",
    procedureName: "Package Electron Installer",
    triggerIntent: "BUILD_DESKTOP",
    prerequisites: ["npm run build:next"],
    executionSteps: [
      { stepNumber: 1, actionType: "shell_command", target: "npm run build:electron", expectedOutcome: "release/ created" }
    ],
    successRate: 1.0,
    executionCount: 5,
  });
  assert.equal(m4.tier, "procedural");
  assert.equal(m4.decayRate, 0.010);

  // 5. Personal Memory (Permanent zero-decay)
  const m5 = await service.storePersonal({
    tier: "personal",
    semanticKey: "user_name",
    content: "Founder's name is Ashish",
    founderAttribute: "name",
    attributeValue: "Ashish",
    isImmutable: true,
    userExplicitlyDeclared: true,
  });
  assert.equal(m5.tier, "personal");
  assert.equal(m5.decayRate, 0.000);
  assert.equal(m5.importance, 5);

  // 6. Project Memory
  const m6 = await service.storeProject({
    tier: "project",
    semanticKey: "ultron_architecture_rules",
    content: "ULTRON follows local-first desktop principles on Windows 11 with 8GB RAM budget.",
    projectName: "ULTRON",
    activeTechStack: ["Next.js", "Electron", "SQLite", "Ollama"],
    sprintMilestones: ["Phase P1", "Phase P2"],
    architecturalConstraints: ["<120MB RAM for memory", "Zero paid APIs"],
  });
  assert.equal(m6.tier, "project");

  // 7. Decision Memory (ADR)
  const m7 = await service.storeDecision({
    tier: "decision",
    semanticKey: "adr_001_sqlite_default",
    content: "ADR-001: Selected embedded SQLite 3 as default local memory database.",
    decisionTitle: "ADR-001: Embedded SQLite 3 Default",
    problemContext: "Running external PostgreSQL on 8GB RAM laptop causes RAM exhaustion.",
    decisionMade: "Adopt SQLite 3 with FTS5 and sqlite-vec in-process, with PostgreSQL adapter support.",
    alternativesConsidered: [
      { alternative: "PostgreSQL", rejectionReason: "150MB daemon overhead and setup complexity" }
    ],
    tradeoffsAccepted: "Single-writer SQLite model accepted because application is single-user desktop.",
    decisionStatus: "accepted",
  });
  assert.equal(m7.tier, "decision");
  assert.equal(m7.decayRate, 0.000);

  // 8. Error & Solution Memory
  const m8 = await service.storeErrorSolution({
    tier: "error_solution",
    semanticKey: "sqlite_fk_ordering_fix",
    content: "Foreign key constraint failure on superseding memory records.",
    errorSignature: "ERR_SQLITE_ERROR: FOREIGN KEY constraint failed",
    rootCause: "Parent record updated with child superseded_by before child row was inserted.",
    verifiedSolution: "Insert child record first, then update parent record with child ID reference.",
    preventionRule: "Always execute parent-child inserts before foreign key link updates.",
    reproductionEnvironment: "Node.js 26 node:sqlite with foreign_keys = ON",
  });
  assert.equal(m8.tier, "error_solution");

  // 9. Research Memory
  const m9 = await service.storeResearch({
    tier: "research",
    semanticKey: "research_quantum_decoherence",
    content: "Research synthesis on quantum decoherence mitigation techniques in 2026.",
    searchQuery: "quantum decoherence mitigation 2026",
    synthesizedSummary: "Topological error correction shows 4x coherence extension.",
    findings: ["Finding 1: Surface code thresholds improved."],
    sources: [
      { title: "Nature Quantum", url: "https://nature.com/example", domain: "nature.com", credibilityScore: 0.98 }
    ],
    elapsedMs: 1420,
  });
  assert.equal(m9.tier, "research");

  // 10. Temporal Memory
  const m10 = await service.storeTemporal({
    tier: "temporal",
    semanticKey: "sprint_demo_milestone",
    content: "ULTRON Memory Architecture live demonstration scheduled for Friday.",
    eventTitle: "Sprint Demonstration",
    eventTimestamp: Date.now() + 86400000 * 3,
    deadlineTimestamp: Date.now() + 86400000 * 3,
    isCompleted: false,
  });
  assert.equal(m10.tier, "temporal");

  // 11. Relational Memory (Knowledge Graph)
  const m11 = await service.storeRelational({
    tier: "relational",
    semanticKey: "rel_ultron_uses_sqlite",
    content: "ULTRON subsystem relies on SQLite 3 for local persistent knowledge.",
    sourceEntityName: "ULTRON",
    sourceEntityType: "application",
    targetEntityName: "SQLite",
    targetEntityType: "database",
    relationType: "uses",
    edgeWeight: 1.0,
  });
  assert.equal(m11.tier, "relational");

  // 12. Meta-Memory
  const m12 = await service.storeMeta({
    tier: "meta",
    semanticKey: "meta_diagnostic_fts_coverage",
    content: "Meta-Memory health diagnostic: FTS5 indexing coverage is 100%.",
    metricCategory: "integrity_diagnostic",
    topicArea: "Full-Text Indexing",
    confidenceAssessment: "high_certainty",
  });
  assert.equal(m12.tier, "meta");

  // Verify all 12 records exist in database
  const stats = await dao.getStats();
  assert.equal(stats.totalRecords, 12, "All 12 specialized memory records must exist in database");
  for (const tier of [
    "working", "episodic", "semantic", "procedural", "personal", "project",
    "decision", "error_solution", "research", "temporal", "relational", "meta"
  ]) {
    assert.equal(stats.byTier[tier], 1, `Expected exactly 1 record for tier '${tier}'`);
  }

  // Verify specialized tables populated
  const db = new DatabaseSync(TEST_DB_PATH);
  const decisionRow = db.prepare("SELECT * FROM ultron_decisions WHERE memory_id = ?").get(m7.id);
  assert.ok(decisionRow, "Specialized ultron_decisions row must be created");
  assert.match(decisionRow.title, /ADR-001/);

  const errorRow = db.prepare("SELECT * FROM ultron_error_solutions WHERE memory_id = ?").get(m8.id);
  assert.ok(errorRow, "Specialized ultron_error_solutions row must be created");
  assert.match(errorRow.error_signature, /FOREIGN KEY/);

  const nodeCount = db.prepare("SELECT count(*) as count FROM ultron_entity_nodes").get().count;
  assert.ok(nodeCount >= 2, "Knowledge Graph must have created source and target entity nodes");

  const edgeCount = db.prepare("SELECT count(*) as count FROM ultron_entity_edges").get().count;
  assert.ok(edgeCount >= 1, "Knowledge Graph must have created directed relation edge");

  // Verify Specialized Query Methods
  const decisions = await service.findDecisionsByStatus("accepted");
  assert.equal(decisions.length, 1, "Must retrieve exactly 1 accepted decision");
  assert.match(decisions[0].title, /ADR-001/);

  const solutions = await service.findSolutionsForErrorPattern("FOREIGN KEY");
  assert.equal(solutions.length, 1, "Must retrieve matching error solution for FOREIGN KEY");
  assert.match(solutions[0].verified_solution, /child record first/i);

  const neighbors = await service.getEntityNeighbors("ULTRON");
  assert.equal(neighbors.outgoing.length, 1, "ULTRON entity must have 1 outgoing relation");
  assert.equal(neighbors.outgoing[0].target_name, "SQLite");
  assert.equal(neighbors.outgoing[0].relation, "uses");

  db.close();
  adapter.close();
  cleanupTestDb();
});
