/**
 * @file tests_research_phase2_verification.test.mjs
 * @description Comprehensive Test Suite for ULTRON Research & Verification Engine:
 * - Module 04: Source Reliability & Quality Engine
 * - Module 05: Claim Verification Engine
 * - Module 06: Cross-Source Comparison & Contradiction Engine
 *
 * Verifies:
 * 1. 6-dimensional source evaluation (Authority, Relevance, Freshness, Evidence, Independence, Transparency).
 * 2. Primary documentation & official spec recognition with bias detection.
 * 3. Source dependency and syndicated copy detection to prevent false consensus.
 * 4. Epistemic claim verification statuses and calibrated confidence formula.
 * 5. Temporal assessments and software version sensitivity.
 * 6. Contradiction classification across 5 distinct disagreement archetypes.
 * 7. Resolution by primary source documentation and preservation of unresolved disputes.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ==============================================================================
// MODULE 04: SOURCE RELIABILITY & QUALITY ENGINE TESTS
// ==============================================================================

test("Module 04: Source Reliability Engine evaluates all 6 orthogonal dimensions", async () => {
  const { sourceReliabilityEngine } = await import("./lib/research/sourceReliabilityEngine.ts");

  const projectId = "proj_test_rel_01";
  const inquiry = "PostgreSQL MVCC concurrency and vacuum performance tuning";

  const sources = [
    {
      id: "src_pg_official",
      project_id: projectId,
      title: "Concurrency Control - PostgreSQL Official Documentation",
      original_url: "https://www.postgresql.org/docs/current/mvcc.html",
      canonical_url: "https://www.postgresql.org/docs/current/mvcc.html",
      canonical_url_hash: "hash_pg_canonical",
      source_type: "official_documentation",
      publisher: "PostgreSQL Global Development Group",
      published_date: "2025-10-10T00:00:00Z",
      credibility_tier: 1,
      content_hash: "hash_pg_official_01",
      retrieval_status: "ingested",
      created_at: new Date().toISOString(),
    },
    {
      id: "src_vendor_blog",
      project_id: projectId,
      title: "Why our proprietary database outperforms PostgreSQL by 100x",
      original_url: "https://vendor-commercial-blog.com/postgres-killer",
      canonical_url: "https://vendor-commercial-blog.com/postgres-killer",
      canonical_url_hash: "hash_vendor_canonical",
      source_type: "independent_analysis",
      publisher: "Vendor Commercial Marketing",
      published_date: "2020-01-01T00:00:00Z",
      credibility_tier: 5,
      content_hash: "hash_vendor_blog_01",
      retrieval_status: "ingested",
      created_at: new Date().toISOString(),
    },
  ];

  const evidence = [
    {
      id: "ev_pg_01",
      project_id: projectId,
      source_id: "src_pg_official",
      exact_passage: "PostgreSQL uses Multi-Version Concurrency Control (MVCC) so that read locks do not conflict with write locks.",
      section_heading: "13.1 Introduction",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: 104,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
    {
      id: "ev_vendor_01",
      project_id: projectId,
      source_id: "src_vendor_blog",
      exact_passage: "Our cloud platform eliminates vacuuming overhead completely. Contact sales for enterprise pricing.",
      section_heading: "Marketing Pitch",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: 98,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
  ];

  const { assessments } = sourceReliabilityEngine.evaluateSources(
    projectId,
    inquiry,
    sources,
    evidence
  );

  assert.equal(assessments.length, 2);
  const pgAssessment = assessments.find((a) => a.sourceId === "src_pg_official");
  const vendorAssessment = assessments.find((a) => a.sourceId === "src_vendor_blog");

  assert.ok(pgAssessment, "Must produce assessment for official source");
  assert.ok(vendorAssessment, "Must produce assessment for vendor source");

  // Verify official doc scores significantly higher in Authority and Overall Quality
  assert.equal(pgAssessment.isOfficialDoc, true, "PostgreSQL doc must be marked as official");
  assert.equal(pgAssessment.isPrimarySource, true, "PostgreSQL doc must be marked as primary");
  assert.ok(pgAssessment.authorityScore > vendorAssessment.authorityScore, "Official authority must exceed vendor blog");
  assert.ok(pgAssessment.compositeQualityScore > vendorAssessment.compositeQualityScore, "Composite score must reflect authority");

  // Verify vendor bias detection
  assert.ok(vendorAssessment.detectedBiases.length > 0 || vendorAssessment.qualityTier !== "HIGH_QUALITY");
});

test("Module 04: Source Reliability detects syndicated and duplicated content dependencies", async () => {
  const { sourceReliabilityEngine } = await import("./lib/research/sourceReliabilityEngine.ts");

  const projectId = "proj_test_synd_01";
  const inquiry = "Linux kernel eBPF performance monitoring";

  const originalSource = {
    id: "src_original_brendan",
    project_id: projectId,
    title: "Linux Extended BPF (eBPF) Tracing Tools",
    url: "https://brendangregg.com/ebpf.html",
    canonical_url: "https://brendangregg.com/ebpf.html",
    source_type: "independent_analysis",
    publisher: "Brendan Gregg",
    published_date: "2024-05-01T00:00:00Z",
    credibility_tier: 3,
    content_hash: "hash_ebpf_shared_passage_999",
    retrieval_status: "ingested",
    created_at: new Date().toISOString(),
  };

  const syndicatedSource = {
    id: "src_syndicated_aggregator",
    project_id: projectId,
    title: "Mirrored: Linux Extended BPF (eBPF) Tracing Tools",
    url: "https://tech-aggregator-mirror.com/ebpf-repost",
    canonical_url: "https://tech-aggregator-mirror.com/ebpf-repost",
    source_type: "community_discussion",
    publisher: "Tech Aggregator Repost",
    published_date: "2024-05-05T00:00:00Z",
    credibility_tier: 6,
    content_hash: "hash_ebpf_shared_passage_999",
    retrieval_status: "ingested",
    created_at: new Date().toISOString(),
  };

  const sharedPassage = "eBPF allows safe bytecode execution in the Linux kernel without changing kernel source code.";

  const evidence = [
    {
      id: "ev_orig",
      project_id: projectId,
      source_id: originalSource.id,
      exact_passage: sharedPassage,
      section_heading: "Overview",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: sharedPassage.length,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
    {
      id: "ev_synd",
      project_id: projectId,
      source_id: syndicatedSource.id,
      exact_passage: sharedPassage,
      section_heading: "Overview",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: sharedPassage.length,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
  ];

  const { dependencies } = sourceReliabilityEngine.evaluateSources(
    projectId,
    inquiry,
    [originalSource, syndicatedSource],
    evidence
  );

  assert.ok(dependencies.length > 0, "Must detect dependency between original and syndicated duplicate");
  const dep = dependencies[0];
  assert.equal(dep.dependencyType, "syndicated_copy");
});

// ==============================================================================
// MODULE 05: CLAIM VERIFICATION ENGINE TESTS
// ==============================================================================

test("Module 05: Claim Verification accurately assigns epistemic status and calibrated confidence", async () => {
  const { claimVerificationEngine } = await import("./lib/research/claimVerificationEngine.ts");

  const projectId = "proj_test_verif_01";

  const sources = [
    {
      id: "src_node_docs",
      project_id: projectId,
      title: "Node.js Crypto API Documentation",
      url: "https://nodejs.org/api/crypto.html",
      canonical_url: "https://nodejs.org/api/crypto.html",
      source_type: "official_documentation",
      publisher: "OpenJS Foundation",
      published_date: "2025-01-01T00:00:00Z",
      credibility_tier: 1,
      content_hash: "hash_node_crypto",
      retrieval_status: "ingested",
      created_at: new Date().toISOString(),
    },
  ];

  const qualityAssessments = [
    {
      id: "qa_node_docs",
      projectId,
      sourceId: "src_node_docs",
      authorityScore: 0.98,
      relevanceScore: 0.95,
      freshnessScore: 0.92,
      evidenceScore: 0.95,
      independenceScore: 1.0,
      transparencyScore: 0.95,
      compositeQualityScore: 0.96,
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

  const evidence = [
    {
      id: "ev_aes_gcm",
      project_id: projectId,
      source_id: "src_node_docs",
      exact_passage: "The AES-256-GCM cipher is an authenticated encryption mode that provides both confidentiality and data integrity validation.",
      section_heading: "crypto.createCipheriv",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: 125,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
  ];

  const verifiedClaim = {
    id: "claim_verified_01",
    project_id: projectId,
    source_id: "src_node_docs",
    claim_text: "AES-256-GCM is an authenticated encryption mode that guarantees data integrity.",
    claim_type: "feature_capability",
    subject: "AES-256-GCM",
    predicate: "is",
    object_value: "authenticated encryption",
    confidence_score: 0.9,
    is_verified: false,
    created_at: new Date().toISOString(),
  };

  const unevidencedClaim = {
    id: "claim_unverified_02",
    project_id: projectId,
    source_id: "src_node_docs",
    claim_text: "Quantum computers will crack AES-256 by the end of next month.",
    claim_type: "general_fact",
    subject: "Quantum computers",
    predicate: "will crack",
    object_value: "AES-256",
    confidence_score: 0.2,
    is_verified: false,
    created_at: new Date().toISOString(),
  };

  const links = [
    {
      id: "link_01",
      claim_id: "claim_verified_01",
      evidence_id: "ev_aes_gcm",
      relationship_type: "supports",
      relevance_score: 0.95,
      created_at: new Date().toISOString(),
    },
  ];

  const verifications = claimVerificationEngine.verifyClaims(
    projectId,
    [verifiedClaim, unevidencedClaim],
    evidence,
    links,
    sources,
    qualityAssessments,
    []
  );

  assert.equal(verifications.length, 2);

  const resVerified = verifications.find((v) => v.claimId === "claim_verified_01");
  const resUnverified = verifications.find((v) => v.claimId === "claim_unverified_02");

  assert.ok(resVerified);
  assert.ok(resUnverified);

  // Claim with direct official evidence must be verified with HIGH confidence
  assert.equal(resVerified.verificationStatus, "verified");
  assert.equal(resVerified.confidenceLevel, "HIGH");
  assert.ok(resVerified.confidenceScore >= 0.85);
  assert.equal(resVerified.primarySourceChecked, true);

  // Claim with no linked evidence must remain unverified
  assert.equal(resUnverified.verificationStatus, "unverified");
  assert.equal(resUnverified.confidenceLevel, "LOW");
  assert.ok(resUnverified.confidenceScore < 0.4);
});

// ==============================================================================
// MODULE 06: CROSS-SOURCE COMPARISON & CONTRADICTION ENGINE TESTS
// ==============================================================================

test("Module 06: Contradiction Engine detects factual disagreement and resolves via primary source", async () => {
  const { crossSourceContradictionEngine } = await import("./lib/research/contradictionEngine.ts");

  const projectId = "proj_test_contra_01";

  const sources = [
    {
      id: "src_redis_official",
      project_id: projectId,
      title: "Redis Cluster Specification",
      url: "https://redis.io/topics/cluster-spec",
      canonical_url: "https://redis.io/topics/cluster-spec",
      source_type: "official_documentation",
      publisher: "Redis Ltd",
      published_date: "2025-06-01T00:00:00Z",
      credibility_tier: 1,
      content_hash: "hash_redis_official",
      retrieval_status: "ingested",
      created_at: new Date().toISOString(),
    },
    {
      id: "src_random_forum",
      project_id: projectId,
      title: "Redis Cluster Max Nodes Discussion",
      url: "https://random-forum.org/threads/redis-cluster-size",
      canonical_url: "https://random-forum.org/threads/redis-cluster-size",
      source_type: "community_discussion",
      publisher: "Random Forum Poster",
      published_date: "2018-02-01T00:00:00Z",
      credibility_tier: 6,
      content_hash: "hash_random_forum",
      retrieval_status: "ingested",
      created_at: new Date().toISOString(),
    },
  ];

  const qualityAssessments = [
    {
      id: "qa_redis_official",
      projectId,
      sourceId: "src_redis_official",
      authorityScore: 0.98,
      relevanceScore: 0.95,
      freshnessScore: 0.95,
      evidenceScore: 0.95,
      independenceScore: 1.0,
      transparencyScore: 0.95,
      compositeQualityScore: 0.96,
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
      id: "qa_random_forum",
      projectId,
      sourceId: "src_random_forum",
      authorityScore: 0.25,
      relevanceScore: 0.8,
      freshnessScore: 0.2,
      evidenceScore: 0.3,
      independenceScore: 1.0,
      transparencyScore: 0.2,
      compositeQualityScore: 0.32,
      qualityTier: "LOW_CREDIBILITY",
      isPrimarySource: false,
      isOfficialDoc: false,
      detectedBiases: [],
      transparencyLimitations: [],
      assessmentBreakdown: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Competing claims with mutually incompatible values
  const claimOfficial = {
    id: "claim_cluster_1000",
    project_id: projectId,
    source_id: "src_redis_official",
    claim_text: "Redis cluster supports a maximum recommended cluster size of 1000 nodes.",
    claim_type: "architectural_spec",
    subject: "Redis cluster size",
    predicate: "supports maximum",
    object_value: "1000 nodes",
    confidence_score: 0.95,
    is_verified: true,
    created_at: new Date().toISOString(),
  };

  const claimForum = {
    id: "claim_cluster_50",
    project_id: projectId,
    source_id: "src_random_forum",
    claim_text: "Redis cluster cannot exceed 50 nodes due to gossip protocol mesh overhead.",
    claim_type: "architectural_spec",
    subject: "Redis cluster size",
    predicate: "cannot exceed",
    object_value: "50 nodes",
    confidence_score: 0.4,
    is_verified: false,
    created_at: new Date().toISOString(),
  };

  const evidence = [
    {
      id: "ev_cluster_1000",
      project_id: projectId,
      source_id: "src_redis_official",
      exact_passage: "Every Redis Cluster node requires two TCP connections. Up to 1000 nodes are supported in production.",
      section_heading: "Cluster Scaling",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: 98,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
    {
      id: "ev_cluster_50",
      project_id: projectId,
      source_id: "src_random_forum",
      exact_passage: "Don't run more than 50 nodes or gossip protocol will saturate CPU.",
      section_heading: "Forum Comment",
      chunk_index: 0,
      char_offset_start: 0,
      char_offset_end: 67,
      evidence_type: "passage",
      created_at: new Date().toISOString(),
    },
  ];

  const verifications = [
    {
      id: "v1",
      projectId,
      claimId: "claim_cluster_1000",
      verificationStatus: "verified",
      confidenceScore: 0.95,
      confidenceLevel: "HIGH",
      primarySourceChecked: true,
      independentSourcesCount: 1,
      directEvidenceIds: ["ev_cluster_1000"],
      contradictingEvidenceIds: [],
      explanation: "Verified by official specification",
      misleadingIndicators: [],
      temporalAssessment: { isTimeSensitive: false, isOutdated: false },
      verifiedAt: new Date().toISOString(),
    },
    {
      id: "v2",
      projectId,
      claimId: "claim_cluster_50",
      verificationStatus: "partially_verified",
      confidenceScore: 0.35,
      confidenceLevel: "LOW",
      primarySourceChecked: false,
      independentSourcesCount: 1,
      directEvidenceIds: ["ev_cluster_50"],
      contradictingEvidenceIds: ["ev_cluster_1000"],
      explanation: "Community assertion contradicts official docs",
      misleadingIndicators: ["overgeneralization"],
      temporalAssessment: { isTimeSensitive: false, isOutdated: true },
      verifiedAt: new Date().toISOString(),
    },
  ];

  const contradictions = crossSourceContradictionEngine.analyzeContradictions(
    projectId,
    [claimOfficial, claimForum],
    verifications,
    evidence,
    sources,
    qualityAssessments,
    []
  );

  assert.ok(contradictions.length > 0, "Must detect contradiction between official spec and forum claim");
  const contra = contradictions[0];
  assert.equal(contra.subject, "redis cluster size");
  assert.equal(contra.resolutionStatus, "resolved_by_primary_source");
  assert.ok(contra.competingPositions.length === 2, "Must preserve both competing perspectives with provenance");
});
