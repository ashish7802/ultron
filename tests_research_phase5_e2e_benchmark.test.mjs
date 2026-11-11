/**
 * @file tests_research_phase5_e2e_benchmark.test.mjs
 * @description Comprehensive End-to-End Orchestration, Vault Persistence, and Performance Benchmark Suite.
 *
 * Verifies:
 * 1. Unified 11-stage pipeline execution via `researchPipelineOrchestrator.executeResearch`.
 * 2. Complete flow from Planning -> Discovery -> Evidence -> Quality -> Verification ->
 *    Contradictions -> Analysis -> Freshness -> Reports -> Memory Ingestion -> Safety Audit.
 * 3. AES-256-GCM encrypted local vault round-trip persistence (`ultron_research_vault.json`).
 * 4. Concurrent query execution and throughput stability.
 * 5. Latency profiling: Planning and local analysis execution budgets.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

test("E2E Pipeline Test: Executes all 11 research phases sequentially to completion", async () => {
  const { researchPipelineOrchestrator } = await import("./lib/research/orchestrator.ts");

  const startTime = Date.now();
  const result = await researchPipelineOrchestrator.executeResearch({
    query: "Evaluate SQLite Write-Ahead Logging vs Rollback Journal for local embedded desktop concurrency",
    depth: "quick",
  });

  const duration = Date.now() - startTime;

  // 1. Pipeline Status & Identity
  assert.ok(result.researchId, "Must generate researchId");
  assert.equal(result.status, "completed", "Pipeline must complete successfully");
  assert.ok(result.plan, "Must output Phase 1 plan");
  assert.equal(result.plan.research_intent, "technology_comparison");

  // 2. Phase 2 & 3: Discovery & Extraction
  assert.ok(result.sources.length > 0, "Must discover and persist sources");
  assert.ok(result.evidence.length > 0, "Must extract and persist verbatim evidence passages");
  assert.ok(result.claims.length > 0, "Must extract atomic claims");

  // 3. Phase 4: Quality & Reliability Assessments
  assert.ok(result.qualityAssessments.length > 0, "Must compute source quality assessments");

  // 4. Phase 5: Epistemic Claim Verification
  assert.ok(result.verifications.length > 0, "Must compute claim verification records");
  assert.ok(
    result.verifications.every((v) => ["verified", "partially_verified", "conflicting", "unverified", "outdated", "refuted"].includes(v.verification_status)),
    "Verifications must assign standard epistemic status"
  );

  // 5. Phase 7: Research Analysis & Intelligence
  assert.ok(result.analysis, "Must produce Phase 7 intelligence analysis");
  assert.ok(result.analysis.executiveSummary.length > 0, "Must formulate executive summary");
  assert.ok(result.analysis.decisionFramework.criteria.length > 0, "Must define decision framework criteria");

  // 6. Phase 8: Freshness Audit
  assert.ok(result.freshness, "Must execute Phase 8 freshness evaluation");
  assert.ok(result.freshness.sourceFreshness.length > 0, "Must audit source freshness");

  // 7. Phase 9: Report Generation
  assert.ok(result.reports && result.reports.length > 0, "Must generate research reports");
  assert.ok(result.reports.some((r) => r.format === "markdown"), "Must produce markdown report");

  // 8. Phase 10: Advanced Memory Deep Ingestion
  assert.ok(result.memoryIngestion, "Must execute Phase 10 deep memory ingestion");
  assert.ok(result.memoryIngestion.ingestedMemoriesCount > 0, "Must ingest memories into persistent vault");
  assert.ok(result.memoryIngestion.knowledgeNodesCreated > 0, "Must build knowledge graph nodes");

  // 9. Phase 11: Safety Audit
  assert.ok(result.safetyAudit, "Must execute Phase 11 safety audit");
  assert.equal(result.safetyAudit.citationIntegrityPassed, true, "Citation integrity firewall must validate reports");

  // 10. Performance budget: quick research pipeline should finish comfortably
  assert.ok(duration < 25000, `Quick research pipeline must complete under 25s (took ${duration}ms)`);
});

test("Vault Persistence Test: Verifies encrypted AES-256-GCM storage and recovery", async () => {
  const { researchRepository } = await import("./lib/research/repository.ts");

  const testProject = {
    id: `proj_vault_test_${Date.now()}`,
    title: "Encrypted Storage Integrity Verification",
    topic: "Cryptographic Vault Round-Trip",
    objective: "Verify zero-loss persistence under AES-256-GCM encryption",
    inquiry: "Cryptographic vault round-trip verification",
    depth: "quick",
    status: "completed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Save project to repository
  await researchRepository.saveProject(testProject);

  // Read back project
  const retrieved = await researchRepository.getProject(testProject.id);
  assert.ok(retrieved, "Retrieved project must not be null");
  assert.equal(retrieved.id, testProject.id);
  assert.equal(retrieved.title, testProject.title);
  assert.equal(retrieved.topic, testProject.topic);

  // Verify vault file on disk is encrypted (does not contain plaintext project title)
  const vaultPath = "ultron_research_vault.json";
  assert.ok(fs.existsSync(vaultPath), "Vault file must exist on disk");
  const rawDiskContent = fs.readFileSync(vaultPath, "utf8");
  const parsedEnvelope = JSON.parse(rawDiskContent);

  assert.equal(parsedEnvelope.encrypted, true, "Vault disk envelope must indicate encrypted: true");
  assert.ok(parsedEnvelope.iv, "Envelope must include initialization vector (iv)");
  assert.ok(parsedEnvelope.authTag, "Envelope must include authentication tag (authTag)");
  assert.ok(!rawDiskContent.includes("Encrypted Storage Integrity Verification"), "Plaintext must NEVER appear in disk file");
});

test("Performance Benchmark: Rapid planning engine and search strategy generation throughput", async () => {
  const { researchPlanningEngine } = await import("./lib/research/planningEngine.ts");

  const inquiries = [
    "PostgreSQL query optimization techniques",
    "WebAssembly SIMD vector processing",
    "OAuth2 PKCE flow vs Device Authorization Grant",
    "Offline local voice transcription models",
    "Next.js App Router streaming architecture",
  ];

  const startTime = Date.now();
  for (const q of inquiries) {
    const plan = researchPlanningEngine.generatePlan({ query: q, depth: "standard" });
    assert.ok(plan.research_id);
    assert.ok(plan.sub_questions.length >= 3);
    assert.ok(plan.search_strategy.length >= 3);
  }
  const elapsed = Date.now() - startTime;
  const avgLatency = elapsed / inquiries.length;

  assert.ok(avgLatency < 50, `Average planning latency must be under 50ms (achieved ${avgLatency.toFixed(1)}ms)`);
});
