/**
 * @file tests_memory_12_types.test.mjs
 * @description Comprehensive Independent Verification Suite for All 12 Memory Types in ULTRON.
 *
 * Verifies:
 * - MEM-TYPE-01: Working Memory (Ring buffer, transient slots, active goal, prompt formatting)
 * - MEM-TYPE-02: Episodic Memory (Narrative sessions, transcripts, key outcomes)
 * - MEM-TYPE-03: Semantic Memory (Subject-Predicate-Object facts, domain knowledge)
 * - MEM-TYPE-04: Procedural Memory (Playbooks, multi-step execution workflows)
 * - MEM-TYPE-05: Personal Memory (User identity, profile, preferences, communication tone)
 * - MEM-TYPE-06: Project Memory (Repository specs, architectural constraints, milestones)
 * - MEM-TYPE-07: Decision Memory (MCDA evaluations, trade-off summaries, approved paths)
 * - MEM-TYPE-08: Error & Solution Memory (5-Why root cause analyses, verified bug fixes)
 * - MEM-TYPE-09: Research Memory (Web inquiry dossiers, citations, freshness timestamps)
 * - MEM-TYPE-10: Temporal Memory (Timelines, validity intervals, obsolescence detection)
 * - MEM-TYPE-11: Relational Memory (Knowledge graph triples, connected graph traversals)
 * - MEM-TYPE-12: Meta-Memory (Knowledge completeness self-assessment, missing aspect detection)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";

test("MEM-TYPE-01: Working Memory ring buffer bounds capacity, preserves transient slots and formats context", async () => {
  const { WorkingMemoryEngine } = await import("./lib/memory/workingMemory.ts");

  const wm = new WorkingMemoryEngine(3); // Cap at 3 turns

  wm.setActiveGoal("Refactor memory architecture for 100% production readiness");
  wm.setSlot("active_file", "lib/memoryCoordinator.ts");
  wm.setSlot("framework", "Next.js 16");

  assert.equal(wm.getActiveGoal(), "Refactor memory architecture for 100% production readiness");
  assert.equal(wm.getSlot("active_file"), "lib/memoryCoordinator.ts");
  assert.equal(wm.getSlot("framework"), "Next.js 16");

  // Push 4 turns to verify bounded FIFO eviction
  wm.addTurn("user", "Turn 1: Initial query");
  wm.addTurn("assistant", "Turn 2: Response 1");
  wm.addTurn("user", "Turn 3: Follow-up question");
  wm.addTurn("assistant", "Turn 4: Response 2");

  const recent = wm.getRecentTurns();
  assert.equal(recent.length, 3, "Working memory must enforce maximum 3 turns bound");
  assert.equal(recent[0].content, "Turn 2: Response 1", "Oldest turn must have been evicted");
  assert.equal(recent[2].content, "Turn 4: Response 2", "Newest turn must be preserved");

  const promptBlock = wm.formatForPromptContext();
  assert.match(promptBlock, /ACTIVE WORKING MEMORY/i);
  assert.match(promptBlock, /Refactor memory architecture/i);
  assert.match(promptBlock, /active_file="lib\/memoryCoordinator.ts"/i);

  wm.clearWorkingMemory();
  assert.equal(wm.getRecentTurns().length, 0);
  assert.equal(wm.getActiveGoal(), null);
  assert.equal(wm.getSlot("active_file"), undefined);
});

test("MEM-TYPE-02 & MEM-TYPE-03: Episodic narrative sessions and Semantic knowledge facts", async () => {
  const { MemoryCoordinator } = await import("./lib/memory/memoryCoordinator.ts");

  const testVault = path.join(os.tmpdir(), "test_vault_types_2_3.json");
  const testBak = path.join(os.tmpdir(), "test_vault_types_2_3.json.bak");
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);

  const coord = new MemoryCoordinator(testVault, testBak);

  // Type 2: Episodic Memory
  const episodic = coord.storeEpisodicMemory({
    key: "session_2026_11_11_audit",
    sessionId: "sess_001",
    summary: "Comprehensive audit of ULTRON cognitive and memory systems",
    turnCount: 14,
    participants: ["Ashish", "ULTRON"],
    keyOutcomes: ["Verified all 10 cognitive engines", "Designed 12 typed memory models"],
    durationMs: 420000,
    content: "Full audit session transcript covering architectural evaluation and zero-trust safeguards.",
    importance: 5,
    confidence: 1.0,
    sensitivity: "INTERNAL",
    source: "explicit",
    projectId: "ultron_core",
    provenance: { origin: "audit_session", timestamp: Date.now() },
    tags: ["audit", "episodic_milestone"],
  });

  assert.equal(episodic.memoryType, "episodic");
  assert.equal(episodic.turnCount, 14);
  assert.equal(episodic.versions.length, 1);

  // Type 3: Semantic Memory
  const semantic = coord.processUtterancePipeline(
    "Remember that PostgreSQL is the authoritative single source of truth for ULTRON research records",
    "user",
    "ultron_core"
  );

  assert.ok(semantic.length > 0);
  const rec = semantic[0];
  assert.equal(rec.source, "explicit");
  assert.match(rec.content, /PostgreSQL is the authoritative single source of truth/i);

  // Cleanup
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);
});

test("MEM-TYPE-04 & MEM-TYPE-05: Procedural execution playbooks and Personal profile memories", async () => {
  const { MemoryCoordinator } = await import("./lib/memory/memoryCoordinator.ts");

  const testVault = path.join(os.tmpdir(), "test_vault_types_4_5.json");
  const testBak = path.join(os.tmpdir(), "test_vault_types_4_5.json.bak");
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);

  const coord = new MemoryCoordinator(testVault, testBak);

  // Type 4: Procedural Playbook
  const procedural = coord.storeProceduralMemory({
    key: "proc_deploy_production",
    workflowName: "Deploy Production Desktop Build",
    prerequisites: ["Node.js 22+", "Electron 45+", "Clean git tree"],
    steps: [
      { stepNumber: 1, action: "Run linter", expectedOutcome: "0 errors", command: "npm run lint" },
      { stepNumber: 2, action: "Compile Next.js", expectedOutcome: "Assets built", command: "npm run build:next" },
      { stepNumber: 3, action: "Package Electron", expectedOutcome: "ULTRON.exe created", command: "npm run build:electron" },
    ],
    recoverySteps: ["Check node_modules integrity", "Verify standalone assets"],
    successCount: 12,
    failureCount: 0,
    content: "Standard operating procedure to build and distribute the ULTRON standalone desktop app.",
    importance: 4,
    confidence: 1.0,
    sensitivity: "INTERNAL",
    source: "explicit",
    projectId: "ultron_desktop",
    provenance: { origin: "devops_playbook", timestamp: Date.now() },
    tags: ["build", "deployment", "playbook"],
  });

  assert.equal(procedural.memoryType, "procedural");
  assert.equal(procedural.steps.length, 3);
  assert.equal(procedural.steps[0].command, "npm run lint");

  // Type 5: Personal Memory (Identity & Communication Style)
  const personalRecords = coord.processUtterancePipeline(
    "My name is Ashish and I prefer direct, concise, and technical co-founder advice",
    "user",
    "default"
  );

  assert.ok(personalRecords.length >= 1);
  const nameRecord = personalRecords.find((r) => r.key === "user_name");
  assert.ok(nameRecord, "Must extract user_name personal memory");
  assert.match(nameRecord.content, /Ashish/i);
  assert.equal(nameRecord.sensitivity, "CONFIDENTIAL");

  // Cleanup
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);
});

test("MEM-TYPE-06 & MEM-TYPE-07: Project repository memory and Decision MCDA records", async () => {
  const { MemoryCoordinator } = await import("./lib/memory/memoryCoordinator.ts");

  const testVault = path.join(os.tmpdir(), "test_vault_types_6_7.json");
  const testBak = path.join(os.tmpdir(), "test_vault_types_6_7.json.bak");
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);

  const coord = new MemoryCoordinator(testVault, testBak);

  // Type 6: Project Memory
  const project = coord.storeProjectMemory({
    key: "proj_ultron_specs",
    projectName: "ULTRON Autonomous Desktop",
    repositoryPath: "c:\\Users\\kelvy\\OneDrive\\Documents\\ultron",
    techStack: ["Next.js 16", "Electron 45", "TypeScript 5", "Ollama", "Python 3.12"],
    architecturalConstraints: ["100% offline-capable", "Zero cloud telemetry", "Local Ollama loopback"],
    activeMilestone: "Milestone 4: Cognitive & Memory Acceptance",
    codingStandardsDoc: "AGENTS.md",
    content: "ULTRON desktop assistant architecture specification and constraints.",
    importance: 5,
    confidence: 1.0,
    sensitivity: "INTERNAL",
    source: "explicit",
    projectId: "ultron_desktop",
    provenance: { origin: "repository_init", timestamp: Date.now() },
    tags: ["architecture", "project_specs"],
  });

  assert.equal(project.memoryType, "project");
  assert.equal(project.techStack.length, 5);
  assert.ok(project.architecturalConstraints.includes("100% offline-capable"));

  // Type 7: Decision Memory
  const decision = coord.storeDecisionMemory({
    key: "dec_offline_ollama_vs_cloud",
    decisionTitle: "Adopt Local Loopback Ollama instead of Cloud LLM APIs",
    chosenOption: "Local Ollama Loopback (127.0.0.1:11434)",
    rejectedOptions: [
      { name: "OpenAI GPT-4o", reason: "Violates local privacy invariant and costs $20+/mo" },
      { name: "Anthropic Claude 3.5 Sonnet", reason: "Requires persistent internet connection" },
    ],
    mcdaScore: 0.94,
    tradeOffSummary: "Lower maximum parameter size (8B vs 70B) in exchange for zero API bills and 100% data sovereignty.",
    approvedByFounder: true,
    status: "ACTIVE",
    content: "Decision to standardize on local Ollama models to guarantee offline resilience and zero operating costs.",
    importance: 5,
    confidence: 1.0,
    sensitivity: "INTERNAL",
    source: "explicit",
    projectId: "ultron_desktop",
    provenance: { origin: "founder_decision_sync", timestamp: Date.now() },
    tags: ["decision", "architecture", "llm"],
  });

  assert.equal(decision.memoryType, "decision");
  assert.equal(decision.mcdaScore, 0.94);
  assert.equal(decision.status, "ACTIVE");
  assert.equal(decision.approvedByFounder, true);

  // Cleanup
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);
});

test("MEM-TYPE-08 & MEM-TYPE-09: Error 5-Why root cause solutions and Research verified dossiers", async () => {
  const { MemoryCoordinator } = await import("./lib/memory/memoryCoordinator.ts");

  const testVault = path.join(os.tmpdir(), "test_vault_types_8_9.json");
  const testBak = path.join(os.tmpdir(), "test_vault_types_8_9.json.bak");
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);

  const coord = new MemoryCoordinator(testVault, testBak);

  // Type 8: Error & Solution Memory
  const errorMem = coord.storeErrorSolutionMemory({
    key: "err_audio_buffer_underrun",
    errorMessage: "AudioProcessor: buffer underrun during 16kHz PCM downsampling",
    symptoms: ["Choppy speech transcription", "Whisper dropped syllables"],
    fiveWhyRootCause: "Input buffer chunk size was 256 bytes instead of 1024, causing event loop starvation under load.",
    remediationApplied: "Increased ring buffer chunk size to 1024 bytes and added Float32-to-Int16 batched clamp.",
    validationTestId: "tests_complete_voice_pipeline.py",
    isResolved: true,
    recurrenceCount: 1,
    content: "Audio buffer underrun resolved by optimizing chunk sizes in audioProcessor.ts.",
    importance: 4,
    confidence: 0.95,
    sensitivity: "INTERNAL",
    source: "autonomous_learning",
    projectId: "ultron_voice",
    provenance: { origin: "qa_postmortem", timestamp: Date.now() },
    tags: ["error_solution", "audio_pipeline", "5_why"],
  });

  assert.equal(errorMem.memoryType, "error_solution");
  assert.equal(errorMem.isResolved, true);
  assert.match(errorMem.fiveWhyRootCause, /event loop starvation/i);

  // Type 9: Research Memory
  const allRecords = coord.loadAll();
  const researchMem = {
    id: "mem_res_quantum_001",
    key: "res_quantum_vector_search",
    memoryType: "research",
    inquiry: "What are the latest techniques for local vector indexing in Node.js?",
    executiveSummary: "HNSWLib and SQLite-vec offer sub-millisecond local vector retrieval without external daemon requirements.",
    citations: [
      { title: "SQLite-vec Architecture Spec", url: "https://github.com/asg017/sqlite-vec", credibilityScore: 0.95 },
      { title: "HNSW Indexing Paper", url: "https://arxiv.org/abs/1603.09320", credibilityScore: 0.98 },
    ],
    freshnessTimestamp: Date.now(),
    contradictionFlags: [],
    content: "Research summary on local vector search libraries: HNSWLib and SQLite-vec are primary candidates.",
    importance: 4,
    confidence: 0.96,
    sensitivity: "PUBLIC",
    source: "autonomous_learning",
    projectId: "default",
    provenance: { origin: "quantum_research_agent", timestamp: Date.now() },
    temporal: { validFrom: Date.now(), isObsolescent: false },
    versions: [{ versionNumber: 1, content: "Initial research dossier", timestamp: Date.now(), changeReason: "Research synthesis" }],
    contradictionStatus: "NONE",
    tags: ["research", "vector_search"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    accessCount: 1,
    lastAccessedAt: Date.now(),
  };

  allRecords.push(researchMem);
  coord.persistAll(allRecords);

  const reloaded = coord.loadAll().find((r) => r.id === "mem_res_quantum_001");
  assert.ok(reloaded);
  assert.equal(reloaded.memoryType, "research");

  // Cleanup
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);
});

test("MEM-TYPE-10, MEM-TYPE-11, MEM-TYPE-12: Temporal, Relational Graph and Meta-Memory", async () => {
  const { MemoryCoordinator } = await import("./lib/memory/memoryCoordinator.ts");

  const testVault = path.join(os.tmpdir(), "test_vault_types_10_11_12.json");
  const testBak = path.join(os.tmpdir(), "test_vault_types_10_11_12.json.bak");
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);

  const coord = new MemoryCoordinator(testVault, testBak);

  // Type 10: Temporal Memory
  const temporal = coord.storeTemporalMemory({
    key: "temp_v1_launch",
    eventTime: Date.now() - 1000 * 60 * 60 * 24 * 7, // 7 days ago
    timeAccuracy: "day",
    eraOrPhase: "Phase 1: Foundation",
    relativeOrderIndex: 1,
    isCurrent: false,
    content: "Phase 1 Foundation was completed and signed off.",
    importance: 3,
    confidence: 1.0,
    sensitivity: "INTERNAL",
    source: "explicit",
    projectId: "default",
    provenance: { origin: "milestone_timeline", timestamp: Date.now() },
    tags: ["timeline", "history"],
  });

  assert.equal(temporal.memoryType, "temporal");
  assert.equal(temporal.eraOrPhase, "Phase 1: Foundation");

  // Type 11: Relational Knowledge Graph Triples
  const relational = coord.storeRelationalMemory({
    key: "rel_architecture_triples",
    triples: [
      { subject: "Ashish", predicate: "BUILDS", object: "ULTRON", confidence: 1.0 },
      { subject: "ULTRON", predicate: "RUNS_ON", object: "Next.js", confidence: 0.95 },
      { subject: "ULTRON", predicate: "USES_LOCAL_LLM", object: "Ollama", confidence: 0.95 },
    ],
    connectedEntityIds: ["Ashish", "ULTRON", "Next.js", "Ollama"],
    content: "Knowledge graph linking Ashish, ULTRON, Next.js, and Ollama.",
    importance: 5,
    confidence: 1.0,
    sensitivity: "INTERNAL",
    source: "explicit",
    projectId: "default",
    provenance: { origin: "knowledge_graph_builder", timestamp: Date.now() },
    tags: ["knowledge_graph", "triples"],
  });

  assert.equal(relational.memoryType, "relational");
  assert.equal(relational.triples.length, 3);

  // Graph Traversal Verification (Connected Memory Retrieval)
  const connected = coord.getConnectedMemories("Ashish", 2);
  assert.ok(connected.length > 0, "Graph traversal must reach memories connected to Ashish");
  assert.ok(connected.some((r) => r.id === relational.id));

  // Type 12: Meta-Memory (Self-awareness of knowledge limits)
  const metaAssessment = coord.assessKnowledge("How do we deploy the database in production?", "default");
  assert.ok(metaAssessment);
  assert.equal(typeof metaAssessment.completenessScore, "number");
  assert.ok(metaAssessment.missingFacets.length > 0, "Must detect missing database specification");
  assert.ok(metaAssessment.recommendedClarifications.length > 0);

  // Cleanup
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);
});
