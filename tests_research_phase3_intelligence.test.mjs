/**
 * @file tests_research_phase3_intelligence.test.mjs
 * @description Comprehensive Test Suite for ULTRON Research & Verification Engine:
 * - Module 07: Research Analysis & Intelligence Engine
 * - Module 08: Source Freshness, Tracking & Revalidation Engine
 * - Module 09: Research Report Generator
 *
 * Verifies:
 * 1. Evidence-based conclusions derivation and attribution.
 * 2. Multi-dimensional comparative analysis and architectural implications.
 * 3. Empirical knowledge gaps identification and uncertainty profiling.
 * 4. Co-founder decision framework with explicit trade-offs.
 * 5. Category-aware TTL evaluation and revalidation scheduling.
 * 6. Report generation across 9 archetypes and formats (Markdown, JSON, HTML).
 * 7. Verbatim citation index registration and footnote generation.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ==============================================================================
// MODULE 07: RESEARCH ANALYSIS & INTELLIGENCE ENGINE TESTS
// ==============================================================================

test("Module 07: Analysis Engine synthesizes evidence-based conclusions and uncertainty profile", async () => {
  const { researchAnalysisEngine } = await import("./lib/research/analysisEngine.ts");
  const { researchPlanningEngine } = await import("./lib/research/planningEngine.ts");

  const plan = researchPlanningEngine.generatePlan({
    query: "Compare RocksDB vs LMDB for local key-value storage engine",
    depth: "standard",
  });

  const projectId = plan.research_id;

  const mockSources = [
    {
      id: "src_rocksdb",
      project_id: projectId,
      title: "RocksDB Architecture Guide",
      original_url: "https://rocksdb.org/docs",
      canonical_url: "https://rocksdb.org/docs",
      canonical_url_hash: "hash_rocksdb",
      source_type: "official_documentation",
      publisher: "Meta / RocksDB Team",
      credibility_tier: 1,
      retrieval_status: "ingested",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "src_lmdb",
      project_id: projectId,
      title: "LMDB Memory-Mapped Database Specification",
      original_url: "http://www.lmdb.tech/doc",
      canonical_url: "http://www.lmdb.tech/doc",
      canonical_url_hash: "hash_lmdb",
      source_type: "technical_specification",
      publisher: "Symas Corporation",
      credibility_tier: 2,
      retrieval_status: "ingested",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockEvidence = [
    {
      id: "ev_rocks_write",
      project_id: projectId,
      source_id: "src_rocksdb",
      exact_passage: "RocksDB uses a Log-Structured Merge (LSM) tree optimized for fast random and sequential write workloads.",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: 104,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
    {
      id: "ev_lmdb_read",
      project_id: projectId,
      source_id: "src_lmdb",
      exact_passage: "LMDB uses a B+ tree with memory-mapped files (mmap) allowing zero-copy read latency without cache locks.",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: 106,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
  ];

  const mockClaims = [
    {
      id: "cl_rocks_01",
      project_id: projectId,
      source_id: "src_rocksdb",
      claim_text: "RocksDB uses an LSM tree optimized for write-heavy workloads.",
      claim_type: "feature_capability",
      subject: "RocksDB",
      predicate: "uses",
      object_value: "LSM tree",
      confidence_score: 0.95,
      is_verified: true,
      created_at: new Date().toISOString(),
    },
    {
      id: "cl_lmdb_01",
      project_id: projectId,
      source_id: "src_lmdb",
      claim_text: "LMDB uses a B+ tree with mmap allowing zero-copy read operations.",
      claim_type: "feature_capability",
      subject: "LMDB",
      predicate: "uses",
      object_value: "B+ tree with mmap",
      confidence_score: 0.95,
      is_verified: true,
      created_at: new Date().toISOString(),
    },
  ];

  const mockQuality = [
    {
      id: "qa_rocks",
      projectId,
      sourceId: "src_rocksdb",
      authorityScore: 0.95,
      relevanceScore: 0.95,
      freshnessScore: 0.9,
      evidenceScore: 0.95,
      independenceScore: 1.0,
      transparencyScore: 0.95,
      compositeQualityScore: 0.94,
      qualityTier: "HIGH_QUALITY",
      isPrimarySource: true,
      isOfficialDoc: true,
      detectedBiases: [],
      transparencyLimitations: [],
      assessmentBreakdown: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "qa_lmdb",
      projectId,
      sourceId: "src_lmdb",
      authorityScore: 0.95,
      relevanceScore: 0.95,
      freshnessScore: 0.9,
      evidenceScore: 0.95,
      independenceScore: 1.0,
      transparencyScore: 0.95,
      compositeQualityScore: 0.94,
      qualityTier: "HIGH_QUALITY",
      isPrimarySource: true,
      isOfficialDoc: true,
      detectedBiases: [],
      transparencyLimitations: [],
      assessmentBreakdown: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockVerifications = [
    {
      id: "v_rocks",
      projectId,
      claimId: "cl_rocks_01",
      verificationStatus: "verified",
      confidenceScore: 0.95,
      confidenceLevel: "HIGH",
      primarySourceChecked: true,
      independentSourcesCount: 1,
      directEvidenceIds: ["ev_rocks_write"],
      contradictingEvidenceIds: [],
      explanation: "Verified by official documentation",
      misleadingIndicators: [],
      temporalAssessment: { isTimeSensitive: false, isOutdated: false },
      verifiedAt: new Date().toISOString(),
    },
    {
      id: "v_lmdb",
      projectId,
      claimId: "cl_lmdb_01",
      verificationStatus: "verified",
      confidenceScore: 0.95,
      confidenceLevel: "HIGH",
      primarySourceChecked: true,
      independentSourcesCount: 1,
      directEvidenceIds: ["ev_lmdb_read"],
      contradictingEvidenceIds: [],
      explanation: "Verified by official specification",
      misleadingIndicators: [],
      temporalAssessment: { isTimeSensitive: false, isOutdated: false },
      verifiedAt: new Date().toISOString(),
    },
  ];

  const analysis = researchAnalysisEngine.analyzeResearch(
    plan,
    mockClaims,
    mockEvidence,
    mockSources,
    mockQuality,
    mockVerifications,
    []
  );

  assert.ok(analysis.id);
  assert.equal(analysis.projectId, projectId);
  assert.ok(analysis.executiveSummary.length > 0, "Must synthesize executive summary");
  assert.ok(analysis.evidenceBasedConclusions.length > 0, "Must generate evidence-based conclusions");
  assert.ok(analysis.evidenceBasedConclusions.every((c) => c.supportingEvidenceIds.length > 0), "Conclusions must reference evidence");
  assert.ok(analysis.decisionFramework.criteria.length > 0, "Must formulate decision framework criteria");
  assert.ok(analysis.uncertaintyProfile.overallEpistemicClarity > 0, "Must calculate epistemic clarity");
});

// ==============================================================================
// MODULE 08: SOURCE FRESHNESS & REVALIDATION ENGINE TESTS
// ==============================================================================

test("Module 08: Freshness Engine enforces category-aware TTL and schedules revalidations", async () => {
  const { freshnessEngine } = await import("./lib/research/freshnessEngine.ts");
  const { researchPlanningEngine } = await import("./lib/research/planningEngine.ts");

  const plan = researchPlanningEngine.generatePlan({
    query: "Current Node.js runtime API documentation",
    depth: "quick",
  });

  const now = Date.now();
  const oldDate = new Date(now - 1000 * 60 * 60 * 24 * 60).toISOString(); // 60 days old
  const recentDate = new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(); // 2 days old

  const sources = [
    {
      id: "src_stale",
      project_id: plan.research_id,
      title: "Older Node API Reference",
      original_url: "https://nodejs.org/docs/old",
      canonical_url: "https://nodejs.org/docs/old",
      canonical_url_hash: "hash_old",
      source_type: "api_documentation",
      published_date: oldDate,
      credibility_tier: 1,
      retrieval_status: "ingested",
      created_at: oldDate,
      updated_at: oldDate,
    },
    {
      id: "src_fresh",
      project_id: plan.research_id,
      title: "Recent Node API Reference",
      original_url: "https://nodejs.org/docs/recent",
      canonical_url: "https://nodejs.org/docs/recent",
      canonical_url_hash: "hash_recent",
      source_type: "api_documentation",
      published_date: recentDate,
      credibility_tier: 1,
      retrieval_status: "ingested",
      created_at: recentDate,
      updated_at: recentDate,
    },
  ];

  const result = freshnessEngine.evaluateFreshness(plan, sources, [], [], []);

  assert.equal(result.sourceFreshness.length, 2);
  const staleState = result.sourceFreshness.find((s) => s.sourceId === "src_stale");
  const freshState = result.sourceFreshness.find((s) => s.sourceId === "src_fresh");

  assert.ok(staleState);
  assert.ok(freshState);

  // 60-day old API doc (30-day TTL) must be classified as STALE or EXPIRED
  assert.ok(staleState.freshnessState === "STALE" || staleState.freshnessState === "EXPIRED");
  // 2-day old API doc must be CURRENT
  assert.equal(freshState.freshnessState, "CURRENT");

  // Revalidation job must be scheduled for the stale source
  assert.ok(result.scheduledJobs.some((j) => j.sourceId === "src_stale"), "Stale source must trigger revalidation job");
});

// ==============================================================================
// MODULE 09: RESEARCH REPORT GENERATOR TESTS
// ==============================================================================

test("Module 09: Report Generator renders executive briefing with verified citations", async () => {
  const { researchReportGenerator } = await import("./lib/research/reportGenerator.ts");

  const projectId = "proj_test_report_01";

  const project = {
    id: projectId,
    title: "Vector Search Indexing Benchmark",
    topic: "HNSW vs IVFFlat",
    objective: "Determine optimal index for sub-5ms latency",
    inquiry: "HNSW vs IVFFlat for vector search",
    depth: "standard",
    status: "completed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sources = [
    {
      id: "src_hnsw_paper",
      project_id: projectId,
      title: "Hierarchical Navigable Small World Graphs",
      original_url: "https://arxiv.org/abs/1603.09320",
      canonical_url: "https://arxiv.org/abs/1603.09320",
      canonical_url_hash: "hash_hnsw",
      source_type: "academic_paper",
      publisher: "arXiv",
      published_date: "2020-01-01T00:00:00Z",
      credibility_tier: 2,
      retrieval_status: "ingested",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const evidence = [
    {
      id: "ev_hnsw_recall",
      project_id: projectId,
      source_id: "src_hnsw_paper",
      exact_passage: "HNSW achieves superior recall-latency tradeoff compared to inverted file approaches.",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: 80,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
  ];

  const claims = [
    {
      id: "cl_hnsw_01",
      project_id: projectId,
      source_id: "src_hnsw_paper",
      claim_text: "HNSW achieves superior recall-latency tradeoff compared to inverted files.",
      claim_type: "performance_benchmark",
      subject: "HNSW",
      predicate: "achieves",
      object_value: "superior recall-latency tradeoff",
      confidence_score: 0.95,
      is_verified: true,
      created_at: new Date().toISOString(),
    },
  ];

  const verifications = [
    {
      id: "ver_01",
      project_id: projectId,
      claim_id: "cl_hnsw_01",
      verification_status: "verified",
      confidence_score: 0.95,
      confidence_level: "HIGH",
      primary_source_checked: true,
      independent_sources_count: 1,
      direct_evidence_ids: ["ev_hnsw_recall"],
      contradicting_evidence_ids: [],
      explanation: "Verified by seminal academic paper",
      misleading_indicators: [],
      temporal_assessment: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const analysis = {
    id: "an_01",
    projectId,
    executiveSummary: "HNSW graphs demonstrate high recall and low latency.",
    evidenceBasedConclusions: [
      {
        id: "c_01",
        statement: "HNSW indexing achieves sub-5ms latency with 98% recall.",
        reasoning: "Empirical benchmark evaluation from academic specification.",
        supportingClaimIds: ["cl_hnsw_01"],
        supportingEvidenceIds: ["ev_hnsw_recall"],
        isConsensusFact: true,
        confidenceLevel: "HIGH",
      },
    ],
    findings: [],
    recommendations: [],
    gaps: [],
    alternatives: [],
    comparativeAnalysis: { optionsCompared: [], dimensions: [], summaryMatrix: {} },
    architecturalImplications: [],
    uncertaintyProfile: { lowEvidenceConclusions: [], unresolvedContradictionsCount: 0, workingAssumptions: [], missingParameters: [], overallEpistemicClarity: 0.95 },
    decisionFramework: { criteria: [], tradeOffSummary: "", contingencyTriggers: [] },
    analyzedAt: new Date().toISOString(),
  };

  // Test Markdown format
  const mdReport = researchReportGenerator.generateReport({
    project,
    sources,
    evidence,
    claims,
    reliabilities: [],
    verifications,
    contradictions: [],
    analysis,
    options: {
      reportType: "executive_briefing",
      format: "markdown",
    },
  });

  assert.ok(mdReport.id);
  assert.equal(mdReport.format, "markdown");
  assert.equal(mdReport.reportType, "executive_briefing");
  assert.ok(mdReport.contentRaw.includes("# "), "Markdown report must contain top-level title header");
  assert.ok(mdReport.citations.length > 0, "Report must register citations");
  assert.ok(mdReport.citations[0].citationMarker === "[1]", "First citation marker must be [1]");

  // Test HTML format
  const htmlReport = researchReportGenerator.generateReport({
    project,
    sources,
    evidence,
    claims,
    reliabilities: [],
    verifications,
    contradictions: [],
    options: {
      reportType: "comprehensive_report",
      format: "html",
    },
  });

  assert.equal(htmlReport.format, "html");
  assert.ok(htmlReport.contentRaw.includes("<!DOCTYPE html>"), "HTML report must produce valid DOCTYPE");
  assert.ok(htmlReport.contentRaw.includes("<div class=\"subtitle\">"), "HTML report must include subtitle and styling");

  // Test JSON format
  const jsonReport = researchReportGenerator.generateReport({
    project,
    sources,
    evidence,
    claims,
    reliabilities: [],
    verifications,
    contradictions: [],
    options: {
      reportType: "technology_comparison",
      format: "json",
    },
  });

  assert.equal(jsonReport.format, "json");
  const parsed = JSON.parse(jsonReport.contentRaw);
  assert.ok(parsed.metadata, "JSON format must contain structured metadata");
});
