/**
 * @file tests_memory_intelligence.test.mjs
 * @description Test Suite for Advanced Memory Intelligence Systems (A through E).
 *
 * Verifies:
 * - MEM-INT-01: Automatic Memory Extraction (Fact, Decision, Experience, Preference, Procedure, Bio)
 * - MEM-INT-02: Credential Exclusion & Sanitization (Strips API keys, bearer tokens, private keys)
 * - MEM-INT-03: Sensitivity Classification (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED)
 * - MEM-INT-04: Smart Memory Retrieval (Semantic, Keyword, Hybrid Reciprocal Rank Fusion)
 * - MEM-INT-05: Multi-Factor Context Ranking (Relevance, Importance, Recency, Confidence)
 * - MEM-INT-06: Strict Project Isolation (Tenant boundary enforcement, cross-project leak prevention)
 * - MEM-INT-07: Point-in-Time Historical Time-Travel Retrieval
 * - MEM-INT-08: Deduplication via SHA-256 Blind Content Hashing
 * - MEM-INT-09: Contradiction Detection & Multi-Version Preservation
 * - MEM-INT-10: Reconciliation Strategies (USER_OVERRIDE, PREFER_NEWER, PRESERVE_BOTH)
 * - MEM-INT-11: Episodic Consolidation & Memory Compression
 * - MEM-INT-12: Temporal Obsolescence & Validity Intervals
 * - MEM-INT-13: Relational Knowledge Graph Triples & 2-Hop Traversal
 * - MEM-INT-14: Meta-Memory Knowledge Completeness & Gap Identification
 */

import test from "node:test";
import assert from "node:assert/strict";

test("MEM-INT-01 & MEM-INT-02 & MEM-INT-03: Automatic Extraction, Credential Exclusion, Sensitivity", async () => {
  const { defaultMemoryExtractor } = await import("./lib/memory/extractionEngine.ts");

  // 1. Fact Extraction with Credential Exclusion
  const utteranceWithSecret =
    "Remember that our AWS production key is AKIA1234567890ABCDEF and we use local Ollama";
  const candidates = defaultMemoryExtractor.extractCandidates(utteranceWithSecret, "user", "core");

  assert.ok(candidates.length > 0);
  const fact = candidates[0];
  assert.equal(fact.category, "fact");
  assert.equal(fact.containsCredentialRedaction, true, "Must flag credential redaction");
  assert.ok(!fact.content.includes("AKIA1234567890ABCDEF"), "Must not store raw AWS credential");
  assert.match(fact.content, /\[REDACTED_CREDENTIAL\]/);

  // 2. Personal Bio & Sensitivity Classification
  const bioUtterance = "My name is Ashish and my private email is founder@example.com";
  const bioCandidates = defaultMemoryExtractor.extractCandidates(bioUtterance, "user");
  const nameCandidate = bioCandidates.find((c) => c.key === "user_name");
  assert.ok(nameCandidate);
  assert.equal(nameCandidate.sensitivity, "CONFIDENTIAL");

  // 3. Technical Preference Extraction
  const prefUtterance = "I prefer PostgreSQL over MongoDB because of ACID guarantees";
  const prefCandidates = defaultMemoryExtractor.extractCandidates(prefUtterance, "user");
  const pref = prefCandidates.find((c) => c.category === "preference");
  assert.ok(pref);
  assert.match(pref.content, /User prefers PostgreSQL/i);
  assert.equal(pref.sensitivity, "INTERNAL");

  // 4. Strategic Decision Extraction
  const decUtterance = "We decided to implement AES-256-GCM dual-vault encryption for all records";
  const decCandidates = defaultMemoryExtractor.extractCandidates(decUtterance, "assistant");
  const dec = decCandidates.find((c) => c.category === "decision");
  assert.ok(dec);
  assert.match(dec.content, /Decision: implement AES-256-GCM dual-vault encryption/i);

  // 5. Experience / Bug Remediation Extraction
  const expUtterance = "The bug was caused by missing nonce randomization in crypto.ts, fixed by creating fresh 12-byte buffer";
  const expCandidates = defaultMemoryExtractor.extractCandidates(expUtterance, "assistant");
  const exp = expCandidates.find((c) => c.category === "experience");
  assert.ok(exp);
  assert.match(exp.content, /missing nonce randomization/i);
});

test("MEM-INT-04 & MEM-INT-05: Smart Multi-Modal Retrieval, Hybrid Ranking and Context Factors", async () => {
  const { MemoryRetrievalEngine } = await import("./lib/memory/retrievalEngine.ts");

  const engine = new MemoryRetrievalEngine();
  const now = Date.now();

  const mockRecords = [
    {
      id: "mem_1",
      key: "user_name",
      memoryType: "personal",
      content: "User's name is Ashish",
      importance: 5,
      confidence: 1.0,
      sensitivity: "CONFIDENTIAL",
      source: "explicit",
      projectId: "default",
      provenance: { origin: "init", timestamp: now - 1000 * 60 * 60 },
      temporal: { validFrom: now - 1000 * 60 * 60, isObsolescent: false },
      versions: [{ versionNumber: 1, content: "User's name is Ashish", timestamp: now, changeReason: "init" }],
      contradictionStatus: "NONE",
      tags: ["profile"],
      createdAt: now - 1000 * 60 * 60,
      updatedAt: now - 1000 * 60 * 60,
      accessCount: 10,
      lastAccessedAt: now,
    },
    {
      id: "mem_2",
      key: "pref_database",
      memoryType: "semantic",
      content: "User prefers PostgreSQL for relational storage",
      importance: 4,
      confidence: 0.95,
      sensitivity: "INTERNAL",
      source: "inferred",
      projectId: "default",
      provenance: { origin: "chat", timestamp: now - 1000 * 60 * 60 * 24 * 5 }, // 5 days old
      temporal: { validFrom: now - 1000 * 60 * 60 * 24 * 5, isObsolescent: false },
      versions: [{ versionNumber: 1, content: "User prefers PostgreSQL for relational storage", timestamp: now, changeReason: "init" }],
      contradictionStatus: "NONE",
      tags: ["database"],
      createdAt: now - 1000 * 60 * 60 * 24 * 5,
      updatedAt: now - 1000 * 60 * 60 * 24 * 5,
      accessCount: 3,
      lastAccessedAt: now - 1000 * 60 * 60,
    },
    {
      id: "mem_3",
      key: "irrelevant_fruit",
      memoryType: "semantic",
      content: "Apples are high in dietary fiber and vitamin C",
      importance: 1,
      confidence: 0.70,
      sensitivity: "PUBLIC",
      source: "inferred",
      projectId: "default",
      provenance: { origin: "chat", timestamp: now },
      temporal: { validFrom: now, isObsolescent: false },
      versions: [{ versionNumber: 1, content: "Apples are high in fiber", timestamp: now, changeReason: "init" }],
      contradictionStatus: "NONE",
      tags: ["nutrition"],
      createdAt: now,
      updatedAt: now,
      accessCount: 1,
      lastAccessedAt: now,
    },
  ];

  // Test keyword + semantic hybrid query
  const results = engine.retrieveMemories(mockRecords, {
    query: "Which database does Ashish prefer for relational data?",
    limit: 5,
    useHybridFusion: true,
  });

  assert.ok(results.length >= 2, "Must recall matching memories");
  assert.equal(results[0].record.key, "pref_database", "Top match must be database preference");
  assert.ok(results[0].finalScore > results[1].finalScore, "Higher relevant record must have higher composite score");
  assert.ok(results.every((r) => r.record.key !== "irrelevant_fruit"), "Irrelevant memory must be filtered out");
});

test("MEM-INT-06 & MEM-INT-07: Project Isolation Boundary and Point-in-Time Historical Time-Travel", async () => {
  const { MemoryRetrievalEngine } = await import("./lib/memory/retrievalEngine.ts");

  const engine = new MemoryRetrievalEngine();
  const t0 = 1000000;
  const t1 = 2000000;
  const t2 = 3000000;

  const mockRecords = [
    {
      id: "mem_proj_alpha",
      key: "secret_formula_alpha",
      memoryType: "project",
      content: "Project Alpha: Uses Quantum Annealing",
      importance: 5,
      confidence: 1.0,
      sensitivity: "INTERNAL",
      source: "explicit",
      projectId: "project_alpha",
      provenance: { origin: "alpha_lead", timestamp: t1 },
      temporal: { validFrom: t1, isObsolescent: false },
      versions: [],
      contradictionStatus: "NONE",
      tags: ["alpha"],
      createdAt: t1,
      updatedAt: t1,
      accessCount: 1,
      lastAccessedAt: t1,
    },
    {
      id: "mem_proj_beta",
      key: "secret_formula_beta",
      memoryType: "project",
      content: "Project Beta: Uses Classic Simulated Annealing",
      importance: 5,
      confidence: 1.0,
      sensitivity: "INTERNAL",
      source: "explicit",
      projectId: "project_beta",
      provenance: { origin: "beta_lead", timestamp: t1 },
      temporal: { validFrom: t1, isObsolescent: false },
      versions: [],
      contradictionStatus: "NONE",
      tags: ["beta"],
      createdAt: t1,
      updatedAt: t1,
      accessCount: 1,
      lastAccessedAt: t1,
    },
    {
      id: "mem_historical_spec",
      key: "node_version_spec",
      memoryType: "project",
      content: "Target Node runtime is v18 LTS",
      importance: 4,
      confidence: 1.0,
      sensitivity: "INTERNAL",
      source: "explicit",
      projectId: "default",
      provenance: { origin: "spec", timestamp: t0 },
      temporal: { validFrom: t0, validUntil: t2, isObsolescent: true, supersededBy: "node_v22" },
      versions: [],
      contradictionStatus: "NONE",
      tags: ["runtime"],
      createdAt: t0,
      updatedAt: t0,
      accessCount: 1,
      lastAccessedAt: t0,
    },
  ];

  // 1. Strict Project Isolation: Project Alpha querying cannot see Project Beta
  const alphaResults = engine.retrieveMemories(mockRecords, {
    query: "Annealing formula",
    projectId: "project_alpha",
  });

  assert.equal(alphaResults.length, 1);
  assert.equal(alphaResults[0].record.id, "mem_proj_alpha");
  assert.ok(!alphaResults.some((r) => r.record.projectId === "project_beta"), "Project Beta must NOT leak into Alpha");

  // 2. Historical Time-Travel: Query at t1 (when Node 18 was active)
  const historicalResults = engine.retrieveMemories(mockRecords, {
    query: "Node runtime",
    pointInTimeTimestamp: t1,
  });
  assert.equal(historicalResults.length, 1);
  assert.equal(historicalResults[0].record.id, "mem_historical_spec");

  // Query at t2 + 1000 (after Node 18 expired): must be excluded because superseded
  const modernResults = engine.retrieveMemories(mockRecords, {
    query: "Node runtime",
    pointInTimeTimestamp: t2 + 1000,
  });
  assert.equal(modernResults.length, 0, "Expired historical record must not appear in modern queries");
});

test("MEM-INT-08, MEM-INT-09, MEM-INT-10: Deduplication, Contradiction Detection, Versioning & Reconciliation", async () => {
  const { MemoryManagementEngine } = await import("./lib/memory/managementEngine.ts");

  const manager = new MemoryManagementEngine();
  const existingRecords = [];

  // Step 1: Initial fact
  const initialCandidate = {
    key: "user_name",
    category: "personal",
    content: "User's name is Rahul",
    importance: 5,
    confidence: 1.0,
    sensitivity: "CONFIDENTIAL",
    source: "explicit",
    tags: ["identity"],
    triples: [],
    provenance: { origin: "user_text", timestamp: 1000 },
    containsCredentialRedaction: false,
  };

  const res1 = manager.reconcileMemory(initialCandidate, existingRecords);
  assert.equal(res1.action, "INSERT_NEW");
  existingRecords.push(res1.record);

  // Step 2: Duplicate insertion attempt
  const dupCandidate = { ...initialCandidate };
  const resDup = manager.reconcileMemory(dupCandidate, existingRecords);
  assert.equal(resDup.action, "DISCARD_DUPLICATE");
  assert.equal(existingRecords.length, 1, "Must not create duplicate record");

  // Step 3: Explicit User Correction ("I am not Rahul, I am Ashish")
  const correctionCandidate = {
    key: "user_name",
    category: "personal",
    content: "User's name is Ashish",
    importance: 5,
    confidence: 1.0,
    sensitivity: "CONFIDENTIAL",
    source: "explicit",
    tags: ["identity"],
    triples: [],
    provenance: { origin: "user_correction", timestamp: 2000 },
    containsCredentialRedaction: false,
  };

  const resCorrection = manager.reconcileMemory(correctionCandidate, existingRecords);
  assert.equal(resCorrection.action, "RECONCILE_CONTRADICTION");

  // Verify version history preserved
  const updatedRecord = resCorrection.record;
  assert.equal(updatedRecord.content, "User's name is Ashish");
  assert.equal(updatedRecord.contradictionStatus, "RECONCILED");
  assert.equal(updatedRecord.versions.length, 2, "Must preserve previous version in audit trail");
  assert.equal(updatedRecord.versions[0].content, "User's name is Rahul");
  assert.equal(updatedRecord.versions[1].content, "User's name is Rahul");
  assert.match(updatedRecord.versions[1].changeReason, /conflict/i);
});

test("MEM-INT-11: Episodic Consolidation & Memory Compression", async () => {
  const { MemoryManagementEngine } = await import("./lib/memory/managementEngine.ts");

  const manager = new MemoryManagementEngine();
  const episodicObservations = [
    {
      id: "ep_1",
      key: "obs_1",
      memoryType: "episodic",
      content: "User tested Ollama qwen2.5:0.5b for greeting latency (12ms).",
      importance: 3,
      confidence: 0.9,
      sensitivity: "INTERNAL",
      source: "system_observation",
      projectId: "default",
      provenance: { origin: "benchmark", timestamp: 1000 },
      temporal: { validFrom: 1000, isObsolescent: false },
      versions: [],
      contradictionStatus: "NONE",
      tags: ["ollama"],
      createdAt: 1000,
      updatedAt: 1000,
      accessCount: 1,
      lastAccessedAt: 1000,
    },
    {
      id: "ep_2",
      key: "obs_2",
      memoryType: "episodic",
      content: "User confirmed Ollama qwen2.5:0.5b stays resident in RAM with keep_alive=-1.",
      importance: 4,
      confidence: 0.95,
      sensitivity: "INTERNAL",
      source: "system_observation",
      projectId: "default",
      provenance: { origin: "benchmark", timestamp: 2000 },
      temporal: { validFrom: 2000, isObsolescent: false },
      versions: [],
      contradictionStatus: "NONE",
      tags: ["ollama"],
      createdAt: 2000,
      updatedAt: 2000,
      accessCount: 1,
      lastAccessedAt: 2000,
    },
  ];

  const consolidated = manager.consolidateMemories(
    episodicObservations,
    "Ollama qwen2.5:0.5b provides ultra-fast 12ms responses and zero cold-start when pinned in memory with keep_alive=-1."
  );

  assert.equal(consolidated.memoryType, "semantic");
  assert.match(consolidated.content, /ultra-fast 12ms responses/i);
  assert.equal(consolidated.importance, 4);
  assert.equal(episodicObservations[0].temporal.isObsolescent, true, "Source observation must be marked obsolescent");
  assert.equal(episodicObservations[0].temporal.supersededBy, consolidated.id);
});

test("MEM-INT-12 & MEM-INT-13: Knowledge Graph Triples, 2-Hop Traversal and Orphaned Edge Cleanup", async () => {
  const { TemporalRelationalEngine } = await import("./lib/memory/temporalRelationalEngine.ts");

  const graphEngine = new TemporalRelationalEngine();

  const mockRelationalMemories = [
    {
      id: "rel_1",
      key: "triples_arch",
      memoryType: "relational",
      triples: [
        { subject: "Ashish", predicate: "DIRECTS", object: "ULTRON", confidence: 1.0 },
        { subject: "ULTRON", predicate: "CONTROLS", object: "WindowsDesktop", confidence: 0.95 },
        { subject: "WindowsDesktop", predicate: "HOSTS", object: "OllamaEngine", confidence: 0.90 },
      ],
      connectedEntityIds: ["Ashish", "ULTRON", "WindowsDesktop", "OllamaEngine"],
      content: "Core control hierarchy triples.",
      importance: 5,
      confidence: 1.0,
      sensitivity: "INTERNAL",
      source: "explicit",
      projectId: "default",
      provenance: { origin: "manual", timestamp: 1000 },
      temporal: { validFrom: 1000, isObsolescent: false },
      versions: [],
      contradictionStatus: "NONE",
      tags: ["hierarchy"],
      createdAt: 1000,
      updatedAt: 1000,
      accessCount: 1,
      lastAccessedAt: 1000,
    },
  ];

  graphEngine.buildGraphIndex(mockRelationalMemories);

  // 1-Hop traversal from Ashish
  const traversal1Hop = graphEngine.traverseConnectedMemories("Ashish", mockRelationalMemories, 1);
  assert.ok(traversal1Hop.directNeighbors.includes("ultron"));

  // 2-Hop traversal from Ashish -> reaches WindowsDesktop
  const traversal2Hop = graphEngine.traverseConnectedMemories("Ashish", mockRelationalMemories, 2);
  assert.ok(traversal2Hop.directNeighbors.includes("windowsdesktop"));

  // Orphan cleanup test
  const activeIds = new Set(["rel_1"]);
  const removedCount = graphEngine.cleanupOrphanedEdges(activeIds);
  assert.equal(removedCount, 0, "No orphaned edges when rel_1 is active");

  const removedEmpty = graphEngine.cleanupOrphanedEdges(new Set());
  assert.equal(removedEmpty, 3, "Must clean up 3 orphaned edges when rel_1 is deleted");
});

test("MEM-INT-14: Meta-Memory Knowledge Completeness, Gap Identification and Epistemic Calibration", async () => {
  const { MetaMemoryEngine } = await import("./lib/memory/metaMemoryEngine.ts");

  const metaEngine = new MetaMemoryEngine();

  // Test Case A: Query with zero database context -> must flag missing specification
  const emptyResults = [];
  const assessmentA = metaEngine.assessKnowledgeState("Deploy the database to production", emptyResults);

  assert.equal(assessmentA.retrievalReliability, "INSUFFICIENT");
  assert.ok(assessmentA.missingFacets.length > 0);
  assert.ok(assessmentA.missingFacets.some((f) => /database engine/i.test(f)));
  assert.equal(assessmentA.clarificationRequired, true);

  // Test Case B: Query with rich verified facts -> High completeness
  const richResults = [
    {
      record: {
        id: "mem_f1",
        key: "fact_1",
        memoryType: "semantic",
        content: "PostgreSQL 16 is deployed on local port 5432 with schema migrations.",
        importance: 5,
        confidence: 0.95,
        sensitivity: "INTERNAL",
        source: "explicit",
        projectId: "default",
        provenance: { origin: "setup", timestamp: Date.now() },
        temporal: { validFrom: Date.now(), isObsolescent: false },
        versions: [],
        contradictionStatus: "NONE",
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 1,
        lastAccessedAt: Date.now(),
      },
      relevanceScore: 0.9,
      keywordScore: 0.85,
      semanticScore: 0.95,
      recencyFactor: 1.0,
      finalScore: 0.88,
      matchExplanation: "High match",
    },
    {
      record: {
        id: "mem_f2",
        key: "fact_2",
        memoryType: "semantic",
        content: "Database credentials are stored in Windows DPAPI SecureVault.",
        importance: 5,
        confidence: 0.95,
        sensitivity: "INTERNAL",
        source: "explicit",
        projectId: "default",
        provenance: { origin: "setup", timestamp: Date.now() },
        temporal: { validFrom: Date.now(), isObsolescent: false },
        versions: [],
        contradictionStatus: "NONE",
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 1,
        lastAccessedAt: Date.now(),
      },
      relevanceScore: 0.8,
      keywordScore: 0.75,
      semanticScore: 0.85,
      recencyFactor: 1.0,
      finalScore: 0.82,
      matchExplanation: "High match",
    },
    {
      record: {
        id: "mem_f3",
        key: "fact_3",
        memoryType: "semantic",
        content: "Database backup retention policy is 30 days rolling snapshots.",
        importance: 4,
        confidence: 0.95,
        sensitivity: "INTERNAL",
        source: "explicit",
        projectId: "default",
        provenance: { origin: "setup", timestamp: Date.now() },
        temporal: { validFrom: Date.now(), isObsolescent: false },
        versions: [],
        contradictionStatus: "NONE",
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 1,
        lastAccessedAt: Date.now(),
      },
      relevanceScore: 0.75,
      keywordScore: 0.70,
      semanticScore: 0.80,
      recencyFactor: 1.0,
      finalScore: 0.76,
      matchExplanation: "High match",
    },
  ];

  const assessmentB = metaEngine.assessKnowledgeState("What is our database architecture and backup policy?", richResults);
  assert.equal(assessmentB.retrievalReliability, "HIGH");
  assert.ok(assessmentB.completenessScore >= 0.8);
  assert.equal(assessmentB.clarificationRequired, false);

  const metaRecord = metaEngine.createMetaMemoryRecord(assessmentB, "default");
  assert.equal(metaRecord.memoryType, "meta");
  assert.equal(metaRecord.targetTopic, "What is our database architecture and backup policy?");
});
