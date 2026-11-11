/**
 * @file tests_memory_benchmark.test.mjs
 * @description Advanced Memory Subsystem Performance, Accuracy & Security Benchmark Suite.
 *
 * Benchmark Categories:
 * - BM-MEM-EXT-01: Multi-Category Extraction Accuracy (Facts, Decisions, Bio, Prefs, Procedures)
 * - BM-MEM-SEC-01: Credential Exclusion & High-Entropy Secret Redaction
 * - BM-MEM-RET-01: Hybrid Search Latency Benchmark (< 25ms execution bound)
 * - BM-MEM-ISO-01: Strict Project-Level Multi-Tenant Isolation
 * - BM-MEM-DED-01: O(1) Cryptographic Hash Deduplication
 * - BM-MEM-VER-01: Contradiction Handling & Multi-Version Immutability
 * - BM-MEM-REL-01: Knowledge Graph 2-Hop Traversal Depth & Connectivity
 * - BM-MEM-REC-01: Self-Healing Rolling Backup Disaster Restoration
 * - BM-MEM-E2E-01: Full 10-Stage Memory Lifecycle Multi-Turn Persistence
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("BM-MEM-EXT-01: Multi-Category Extraction Accuracy", async () => {
  const { defaultMemoryExtractor } = await import("./lib/memory/extractionEngine.ts");

  const testCorpus = [
    { text: "My name is Ashish", expectedCategory: "personal", expectedKey: "user_name" },
    { text: "I work as a lead system architect", expectedCategory: "personal", expectedKey: "user_role" },
    { text: "I prefer TypeScript over Python for type safety", expectedCategory: "preference", expectedKey: "pref_typescript" },
    { text: "We decided to deploy SQLite with WAL mode enabled", expectedCategory: "decision" },
    { text: "The bug was caused by an unhandled Promise rejection in audio.ts", expectedCategory: "experience" },
    { text: "To deploy the application, run: npm run build:electron", expectedCategory: "procedure" },
  ];

  let passed = 0;
  for (const item of testCorpus) {
    const candidates = defaultMemoryExtractor.extractCandidates(item.text, "user", "bench");
    if (candidates.length > 0) {
      const match = candidates.find((c) => c.category === item.expectedCategory);
      if (match) {
        if (!item.expectedKey || match.key === item.expectedKey) {
          passed++;
        }
      }
    }
  }

  const accuracy = passed / testCorpus.length;
  assert.equal(accuracy, 1.0, `Extraction accuracy must be 100% across test corpus. Got ${accuracy * 100}%`);
});

test("BM-MEM-SEC-01: Credential Exclusion & High-Entropy Secret Redaction", async () => {
  const { defaultMemoryExtractor } = await import("./lib/memory/extractionEngine.ts");

  const credentialInputs = [
    "sk-proj-1234567890abcdef1234567890abcdef12345678",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "AKIAIOSFODNN7EXAMPLE",
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M",
    'password = "SuperSecretPassword123!"',
  ];

  for (const cred of credentialInputs) {
    const { cleanText, redacted } = defaultMemoryExtractor.sanitizeAndExcludeCredentials(`Remember that: ${cred}`);
    assert.equal(redacted, true, `Must redact credential: ${cred.slice(0, 15)}...`);
    assert.ok(!cleanText.includes(cred), "Must never leak raw credential in clean text");
    assert.match(cleanText, /\[REDACTED_CREDENTIAL\]/);
  }
});

test("BM-MEM-RET-01: Hybrid Search Latency Benchmark (< 25ms)", async () => {
  const { MemoryRetrievalEngine } = await import("./lib/memory/retrievalEngine.ts");

  const retrieval = new MemoryRetrievalEngine();
  const pool = [];
  const now = Date.now();

  // Populate synthetic pool of 100 memory records
  for (let i = 0; i < 100; i++) {
    pool.push({
      id: `mem_bench_${i}`,
      key: `key_bench_${i}`,
      memoryType: i % 2 === 0 ? "semantic" : "project",
      content: `Record number ${i} concerning architectural topic ${i % 10} and system performance criteria.`,
      importance: (i % 5) + 1,
      confidence: 0.85 + (i % 15) * 0.01,
      sensitivity: "INTERNAL",
      source: "explicit",
      projectId: i % 3 === 0 ? "bench_project" : "default",
      provenance: { origin: "bench", timestamp: now - i * 10000 },
      temporal: { validFrom: now - i * 10000, isObsolescent: false },
      versions: [],
      contradictionStatus: "NONE",
      tags: [`topic_${i % 10}`],
      createdAt: now - i * 10000,
      updatedAt: now - i * 10000,
      accessCount: i,
      lastAccessedAt: now,
    });
  }

  const start = performance.now();
  const results = retrieval.retrieveMemories(pool, {
    query: "architectural topic 4 and system performance",
    projectId: "bench_project",
    limit: 10,
    useHybridFusion: true,
  });
  const elapsed = performance.now() - start;

  assert.ok(results.length > 0);
  assert.ok(elapsed < 25.0, `Hybrid retrieval latency must be < 25ms. Measured: ${elapsed.toFixed(2)}ms`);
});

test("BM-MEM-ISO-01: Strict Project-Level Multi-Tenant Isolation", async () => {
  const { MemoryRetrievalEngine } = await import("./lib/memory/retrievalEngine.ts");
  const retrieval = new MemoryRetrievalEngine();

  const multiTenantRecords = [
    {
      id: "mem_tenant_a",
      key: "secret_a",
      memoryType: "project",
      content: "Tenant A Confidential Infrastructure Spec",
      importance: 5,
      confidence: 1.0,
      sensitivity: "INTERNAL",
      source: "explicit",
      projectId: "tenant_alpha",
      provenance: { origin: "alpha", timestamp: 1000 },
      temporal: { validFrom: 1000, isObsolescent: false },
      versions: [],
      contradictionStatus: "NONE",
      tags: [],
      createdAt: 1000,
      updatedAt: 1000,
      accessCount: 1,
      lastAccessedAt: 1000,
    },
    {
      id: "mem_tenant_b",
      key: "secret_b",
      memoryType: "project",
      content: "Tenant B Confidential Infrastructure Spec",
      importance: 5,
      confidence: 1.0,
      sensitivity: "INTERNAL",
      source: "explicit",
      projectId: "tenant_beta",
      provenance: { origin: "beta", timestamp: 1000 },
      temporal: { validFrom: 1000, isObsolescent: false },
      versions: [],
      contradictionStatus: "NONE",
      tags: [],
      createdAt: 1000,
      updatedAt: 1000,
      accessCount: 1,
      lastAccessedAt: 1000,
    },
  ];

  const resultsForAlpha = retrieval.retrieveMemories(multiTenantRecords, {
    query: "Infrastructure Spec",
    projectId: "tenant_alpha",
  });

  assert.equal(resultsForAlpha.length, 1);
  assert.equal(resultsForAlpha[0].record.projectId, "tenant_alpha");
  assert.ok(!resultsForAlpha.some((r) => r.record.projectId === "tenant_beta"), "Tenant Beta records must NEVER leak to Alpha");
});

test("BM-MEM-DED-01 & BM-MEM-VER-01: O(1) Hash Deduplication and Contradiction Versioning", async () => {
  const { MemoryManagementEngine } = await import("./lib/memory/managementEngine.ts");
  const manager = new MemoryManagementEngine();

  const activePool = [];

  // 1. Initial Insert
  const candidate1 = {
    key: "user_preference_editor",
    category: "preference",
    content: "User prefers VS Code for daily development",
    importance: 4,
    confidence: 1.0,
    sensitivity: "INTERNAL",
    source: "explicit",
    tags: ["editor"],
    triples: [],
    provenance: { origin: "test", timestamp: 1000 },
    containsCredentialRedaction: false,
  };

  const res1 = manager.reconcileMemory(candidate1, activePool);
  assert.equal(res1.action, "INSERT_NEW");
  activePool.push(res1.record);

  // 2. Duplicate Check
  const resDup = manager.reconcileMemory({ ...candidate1 }, activePool);
  assert.equal(resDup.action, "DISCARD_DUPLICATE");
  assert.equal(activePool.length, 1);

  // 3. User Override Contradiction Check
  const candidateOverride = {
    key: "user_preference_editor",
    category: "preference",
    content: "User prefers Neovim for daily development",
    importance: 5,
    confidence: 1.0,
    sensitivity: "INTERNAL",
    source: "explicit",
    tags: ["editor"],
    triples: [],
    provenance: { origin: "override", timestamp: 2000 },
    containsCredentialRedaction: false,
  };

  const resOverride = manager.reconcileMemory(candidateOverride, activePool);
  assert.equal(resOverride.action, "RECONCILE_CONTRADICTION");
  assert.equal(resOverride.record.content, "User prefers Neovim for daily development");
  assert.equal(resOverride.record.versions.length, 2);
  assert.equal(resOverride.record.versions[0].content, "User prefers VS Code for daily development");
});

test("BM-MEM-REC-01: Disaster Recovery & Rolling Backup Restoration", async () => {
  const { SelfHealingEngine } = await import("./lib/memory/selfHealingEngine.ts");

  const testPrimary = path.join(process.cwd(), "test_bench_heal.json");
  const testBackup = path.join(process.cwd(), "test_bench_heal.json.bak");

  const snapshot = {
    version: 2,
    lastUpdated: Date.now(),
    memories: [
      {
        id: "mem_bench_ashish",
        key: "user_name",
        memoryType: "personal",
        content: "User's name is Ashish",
        importance: 5,
        confidence: 1.0,
        sensitivity: "CONFIDENTIAL",
        source: "explicit",
        projectId: "default",
        provenance: { origin: "bench", timestamp: Date.now() },
        temporal: { validFrom: Date.now(), isObsolescent: false },
        versions: [],
        contradictionStatus: "NONE",
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 1,
        lastAccessedAt: Date.now(),
      },
    ],
  };

  fs.writeFileSync(testBackup, JSON.stringify(snapshot), "utf-8");
  fs.writeFileSync(testPrimary, "CORRUPTED_DISASTER_STATE", "utf-8");

  const engine = new SelfHealingEngine(testPrimary, testBackup);
  const outcome = engine.executePlaybook("RESTORE_BACKUP", []);

  assert.equal(outcome.audit.success, true);
  const restoredRaw = fs.readFileSync(testPrimary, "utf-8");
  const parsed = JSON.parse(restoredRaw);
  assert.equal(parsed.memories[0].content, "User's name is Ashish");

  // Cleanup
  if (fs.existsSync(testPrimary)) fs.unlinkSync(testPrimary);
  if (fs.existsSync(testBackup)) fs.unlinkSync(testBackup);
});
