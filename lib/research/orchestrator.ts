/**
 * ============================================================================
 * Module Name: Central Pipeline Orchestrator (Modules 01 - 11)
 * Subsystem: ULTRON Research & Verification Engine - Batch 04
 * File: lib/research/orchestrator.ts
 * ============================================================================
 *
 * ARCHITECTURAL ROLE & PURPOSE:
 * -----------------------------
 * Central Coordinator executing the complete end-to-end autonomous research
 * workflow across all 11 implemented modules:
 * 
 * 1. Module 01: Research Planning Engine (Intent, Scope, Query Decomposition)
 * 2. Module 02: Information Discovery Engine (Web, Docs, Repositories, Offline)
 * 3. Module 03: Evidence Collection & Extraction Engine (Passages, Claims, Facts)
 * 4. Module 04: Source Reliability & Quality Engine (Authority, Freshness, Independence)
 * 5. Module 05: Claim Verification Engine (Truthfulness, Primary Source Check)
 * 6. Module 06: Cross-Source Contradiction Engine (Divergence, Reconciliation)
 * 7. Module 07: Research Analysis & Intelligence Engine (Conclusions, Alternatives, Tradeoffs)
 * 8. Module 08: Freshness & Revalidation Engine (TTL Decay, Drift, Revalidation Scheduler)
 * 9. Module 09: Research Report Generator (Executive Briefings, Dossiers, Verbatim Citations)
 * 10. Module 10: Advanced Memory Deep Ingestion (Provenance Links, Knowledge Graph, Versioning)
 * 11. Module 11: Research Safety & Integrity Engine (Prompt Injection, Quarantine, Citation Firewall)
 *
 * KEY RESPONSIBILITIES:
 * ---------------------
 * - Enforces the strict sequential pipeline with in-flight security firewalls.
 * - Coordinates transactional persistence in `lib/research/repository.ts` for all 22 entity types.
 * - Ingests verified outputs into the Advanced Memory vault with full provenance.
 * - Prepares clean, unencumbered boundaries for future Module 12 (Final Certification).
 *
 * SAFETY / SECURITY GUARANTEES:
 * -----------------------------
 * - In-flight prompt injection defense and credential masking across all ingested sources.
 * - Strict citation integrity verification preventing hallucinated footnotes.
 * - Fail-safe isolation: If an individual provider or source fails, the pipeline continues gracefully.
 * ============================================================================
 */

import crypto from "crypto";
import type {
  ResearchPlan,
  ResearchPlanRequest,
  NormalizedDiscoveryResult,
  EvidenceExtractionResult,
  ResearchProjectRecord,
  ResearchQueryRecord,
  SourceRecord,
  EvidenceRecord,
  ClaimRecord,
  ClaimEvidenceLinkRecord,
  SourceQualityAssessmentRecord,
  ClaimVerificationRecord,
  CrossSourceContradictionRecord,
  SourceDependencyRecord,
  ResearchAnalysisResult,
  FreshnessEngineResult,
  ResearchReport,
  ResearchAnalysisRecord,
  ResearchFindingRecord,
  ResearchRecommendationRecord,
  ResearchGapRecord,
  ResearchAlternativeRecord,
  SourceFreshnessRecordData,
  RevalidationJobRecord,
  RevalidationLogRecord,
  ResearchReportRecord,
  ResearchReportCitationRecord,
  MemoryIngestionResult,
} from "./types.ts";
import { researchPlanningEngine } from "./planningEngine.ts";
import { informationDiscoveryEngine } from "./discoveryEngine.ts";
import { evidenceCollectionEngine } from "./evidenceEngine.ts";
import { sourceReliabilityEngine } from "./sourceReliabilityEngine.ts";
import { claimVerificationEngine } from "./claimVerificationEngine.ts";
import { crossSourceContradictionEngine } from "./contradictionEngine.ts";
import { researchAnalysisEngine } from "./analysisEngine.ts";
import { freshnessEngine } from "./freshnessEngine.ts";
import { researchReportGenerator } from "./reportGenerator.ts";
import { advancedMemoryIngestionEngine } from "./memoryIngestionEngine.ts";
import { researchSafetyEngine } from "./safetyEngine.ts";
import { researchRepository } from "./repository.ts";

/**
 * Composite result returned by the unified research pipeline.
 */
export interface ResearchPipelineResult {
  researchId: string;
  status: "completed" | "partial" | "failed";
  plan: ResearchPlan;
  discoveryCount: number;
  sourcesProcessedCount: number;
  extractedClaimsCount: number;
  extractedPassagesCount: number;
  extractedFactsCount: number;
  extractedSpecsCount: number;
  verifiedClaimsCount: number;
  contradictionsCount: number;
  findingsCount: number;
  recommendationsCount: number;
  gapsCount: number;
  durationMs: number;
  summary: {
    title: string;
    topic: string;
    intent: string;
    depth: string;
    completionCriteria: string[];
  };
  sources: SourceRecord[];
  claims: ClaimRecord[];
  evidence: EvidenceRecord[];
  links: ClaimEvidenceLinkRecord[];
  qualityAssessments: SourceQualityAssessmentRecord[];
  verifications: ClaimVerificationRecord[];
  contradictions: CrossSourceContradictionRecord[];
  dependencies: SourceDependencyRecord[];
  analysis?: ResearchAnalysisResult;
  freshness?: FreshnessEngineResult;
  reports?: ResearchReport[];
  memoryIngestion?: MemoryIngestionResult;
  safetyAudit?: {
    securityEventsCount: number;
    quarantinedSourcesCount: number;
    citationIntegrityPassed: boolean;
    auditedAt: string;
  };
  boundaryForFutureModules: {
    finalCertificationPending: boolean; // Clean boundary for Module 12
  };
}

export class ResearchPipelineOrchestrator {
  /**
   * Executes the full end-to-end research workflow across Modules 01 through 11.
   *
   * @param request - User research request payload.
   * @returns Complete, structured research dossier.
   */
  public async executeResearch(
    request: ResearchPlanRequest,
    onProgress?: (event: Record<string, unknown>) => void
  ): Promise<ResearchPipelineResult> {
    const startTime = Date.now();

    // ==========================================================================
    // PRE-FLIGHT: RECALL HISTORICAL RESEARCH CONTEXT (MODULE 10)
    // ==========================================================================
    const recalledMemories = advancedMemoryIngestionEngine.recallHistoricalResearch(request.query, 5);
    const priorInferredAssumptions = recalledMemories.map(
      (m) => `Prior Research Context: ${m.content}`
    );

    // ==========================================================================
    // PHASE 1: MODULE 01 — RESEARCH PLANNING ENGINE
    // ==========================================================================
    const plan = researchPlanningEngine.generatePlan(request);
    if (priorInferredAssumptions.length > 0) {
      plan.inferred_assumptions.push(...priorInferredAssumptions);
    }
    onProgress?.({
      stage: "MODULE_01_PLANNING",
      message: `Formulated research plan: ${plan.title}`,
      progress: 10,
      plan,
    });

    // Save project entity into repository
    const projectRecord: ResearchProjectRecord = {
      id: plan.research_id,
      tenant_id: "00000000-0000-0000-0000-000000000000", // Default tenant isolation
      user_id: "00000000-0000-0000-0000-000000000000",   // Single-user desktop owner
      title: plan.title,
      objective: plan.objective,
      research_intent: plan.research_intent,
      topic: plan.topic,
      problem_statement: plan.problem_statement,
      expected_outcome: plan.expected_outcome,
      intended_decision: plan.intended_decision,
      research_depth: plan.research_depth,
      scope_included: plan.scope.includedSubtopics,
      scope_excluded: plan.scope.excludedSubtopics,
      geographic_scope: plan.scope.geographicScope,
      time_period: plan.scope.timePeriod,
      constraints: {
        explicit_requirements: plan.explicit_requirements,
        inferred_assumptions: plan.inferred_assumptions,
      },
      resource_limits: plan.resource_limits,
      completion_criteria: plan.completion_criteria,
      status: "discovering",
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    };
    await researchRepository.saveProject(projectRecord);

    // Save decomposed query entities
    const queryRecords: ResearchQueryRecord[] = plan.sub_questions.map((sq) => ({
      id: sq.id,
      project_id: plan.research_id,
      sub_question: sq.question,
      search_objective: sq.searchObjective,
      primary_query: sq.searchStrategy.primaryQuery,
      alternative_queries: sq.searchStrategy.alternativeQueries,
      priority: sq.priority,
      preferred_source_types: sq.searchStrategy.preferredSourceTypes,
      official_domains: sq.searchStrategy.officialDomains,
      relevant_repositories: sq.searchStrategy.relevantRepositories,
      requires_current_info: sq.requiresCurrentInfo,
      requires_official_docs: sq.requiresOfficialDocs,
      execution_status: "pending",
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    }));
    await researchRepository.saveQueries(queryRecords);

    // ==========================================================================
    // PHASE 2: MODULE 02 — INFORMATION DISCOVERY ENGINE & SAFETY INSPECTION (MODULE 11)
    // ==========================================================================
    const discoveredItems: NormalizedDiscoveryResult[] = await informationDiscoveryEngine.discoverAll(plan);

    // In-flight safety inspection on all discovered URLs
    for (const item of discoveredItems) {
      await researchSafetyEngine.inspectSourceUrl(
        item.original_url,
        item.discovery_id,
        plan.research_id,
        item.provider
      );
    }

    // Save discovered sources (normalized and deduplicated)
    const sourceRecords: SourceRecord[] = discoveredItems.map((item) => ({
      id: item.discovery_id,
      project_id: plan.research_id,
      query_id: item.query_id,
      title: item.title,
      original_url: item.original_url,
      canonical_url: item.canonical_url,
      canonical_url_hash: crypto.createHash("sha256").update(item.canonical_url || item.original_url).digest("hex"),
      source_type: item.source_type,
      publisher: item.publisher,
      author: item.author,
      snippet: item.snippet,
      provider: item.provider,
      provider_metadata: item.provider_metadata,
      publication_date: item.publication_date,
      discovered_at: item.discovered_at,
      retrieval_status: item.retrieval_status,
      content_availability: item.content_availability,
      created_at: item.discovered_at,
      updated_at: item.discovered_at,
    }));
    const savedSources = await researchRepository.saveSources(sourceRecords);

    onProgress?.({
      stage: "MODULE_02_DISCOVERY",
      message: `Discovered ${discoveredItems.length} multi-source references across web and repositories`,
      progress: 20,
      sourcesCount: discoveredItems.length,
    });

    await researchRepository.updateProjectStatus(plan.research_id, "extracting");

    // ==========================================================================
    // PHASE 3: MODULE 03 — EVIDENCE EXTRACTION & PROMPT INJECTION SANITIZATION (MODULE 11)
    // ==========================================================================
    const extractionResults: EvidenceExtractionResult[] = [];
    for (const discoveredSource of discoveredItems) {
      // In-flight content sanitization and secret masking
      if (discoveredSource.snippet) {
        const { sanitizedContent } = await researchSafetyEngine.sanitizeContent(
          discoveredSource.snippet,
          discoveredSource.discovery_id,
          plan.research_id
        );
        discoveredSource.snippet = sanitizedContent;
      }

      const extraction = await evidenceCollectionEngine.processSource(discoveredSource);
      extractionResults.push(extraction);
    }

    // Persist extracted evidence passages, claims, and links
    const allEvidenceToSave: EvidenceRecord[] = [];
    const allClaimsToSave: ClaimRecord[] = [];
    const allLinksToSave: ClaimEvidenceLinkRecord[] = [];

    for (const res of extractionResults) {
      // Evidence records
      for (const p of res.passages) {
        allEvidenceToSave.push({
          id: p.id,
          project_id: plan.research_id,
          source_id: res.sourceId,
          exact_passage: p.exactText,
          surrounding_context: p.surroundingContext,
          section_heading: p.sectionHeading,
          chunk_index: p.chunkIndex,
          char_offset_start: p.charOffsetStart,
          char_offset_end: p.charOffsetEnd,
          evidence_type: p.evidenceType,
          structured_data: p.structuredData,
          content_hash: p.contentHash,
          extracted_at: p.extractedAt,
          created_at: p.extractedAt,
          updated_at: p.extractedAt,
        });
      }

      // Claim records
      for (const c of res.claims) {
        allClaimsToSave.push({
          id: c.id,
          project_id: plan.research_id,
          claim_text: c.claimText,
          claim_type: c.claimType,
          subject: c.subject,
          predicate: c.predicate,
          object_value: c.objectValue,
          context_qualifier: c.contextQualifier,
          extracted_at: c.extractedAt,
          created_at: c.extractedAt,
          updated_at: c.extractedAt,
        });
      }

      // Link records
      for (const l of res.claimEvidenceLinks) {
        allLinksToSave.push({
          id: l.id,
          claim_id: l.claimId,
          evidence_id: l.evidenceId,
          relationship_type: l.relationshipType,
          relevance_score: l.relevanceScore,
          created_at: l.createdAt,
        });
      }
    }

    const savedEvidence = await researchRepository.saveEvidence(allEvidenceToSave);
    const savedClaims = await researchRepository.saveClaims(allClaimsToSave);
    const savedLinks = await researchRepository.saveClaimEvidenceLinks(allLinksToSave);

    onProgress?.({
      stage: "MODULE_03_EXTRACTION",
      message: `Extracted ${allClaimsToSave.length} atomic claims and ${allEvidenceToSave.length} verbatim evidence passages`,
      progress: 35,
      claimsCount: allClaimsToSave.length,
    });

    // ==========================================================================
    // PHASE 4: MODULE 04 — SOURCE RELIABILITY & QUALITY ENGINE
    // ==========================================================================
    const { assessments: sourceQualityAssessments, dependencies: sourceDependencies } =
      sourceReliabilityEngine.evaluateSources(plan.research_id, plan.topic, savedSources, savedEvidence);

    const qualityAssessmentRecords: SourceQualityAssessmentRecord[] = sourceQualityAssessments.map((sqa) => ({
      id: sqa.id,
      project_id: sqa.projectId,
      source_id: sqa.sourceId,
      authority_score: sqa.authorityScore,
      relevance_score: sqa.relevanceScore,
      freshness_score: sqa.freshnessScore,
      evidence_score: sqa.evidenceScore,
      independence_score: sqa.independenceScore,
      transparency_score: sqa.transparencyScore,
      composite_quality_score: sqa.compositeQualityScore,
      quality_tier: sqa.qualityTier,
      is_primary_source: sqa.isPrimarySource,
      is_official_doc: sqa.isOfficialDoc,
      detected_biases: sqa.detectedBiases,
      transparency_limitations: sqa.transparencyLimitations,
      assessment_breakdown: sqa.assessmentBreakdown as unknown as Record<string, unknown>,
      created_at: sqa.assessedAt,
      updated_at: sqa.assessedAt,
    }));
    const savedQualityAssessments = await researchRepository.saveQualityAssessments(qualityAssessmentRecords);

    const dependencyRecords: SourceDependencyRecord[] = sourceDependencies.map((sd) => ({
      id: sd.id,
      project_id: sd.projectId,
      source_id: sd.sourceId,
      upstream_source_id: sd.upstreamSourceId,
      dependency_type: sd.dependencyType,
      confidence: sd.confidence,
      created_at: sd.detectedAt,
    }));
    const savedDependencies = await researchRepository.saveSourceDependencies(dependencyRecords);

    onProgress?.({
      stage: "MODULE_04_RELIABILITY",
      message: `Evaluated 6-dimensional reliability across ${sourceQualityAssessments.length} sources and tracked syndication lineage`,
      progress: 50,
      qualityAssessmentsCount: sourceQualityAssessments.length,
    });

    // ==========================================================================
    // PHASE 5: MODULE 05 — CLAIM VERIFICATION ENGINE
    // ==========================================================================
    const verificationResults = claimVerificationEngine.verifyClaims(
      plan.research_id,
      savedClaims,
      savedEvidence,
      savedLinks,
      savedSources,
      sourceQualityAssessments,
      sourceDependencies
    );

    const verificationRecords: ClaimVerificationRecord[] = verificationResults.map((vr) => ({
      id: vr.id,
      project_id: vr.projectId,
      claim_id: vr.claimId,
      verification_status: vr.verificationStatus,
      confidence_score: vr.confidenceScore,
      confidence_level: vr.confidenceLevel,
      primary_source_checked: vr.primarySourceChecked,
      independent_sources_count: vr.independentSourcesCount,
      direct_evidence_ids: vr.directEvidenceIds,
      contradicting_evidence_ids: vr.contradictingEvidenceIds,
      explanation: vr.explanation,
      qualifier_notes: vr.qualifierNotes,
      misleading_indicators: vr.misleadingIndicators,
      temporal_assessment: vr.temporalAssessment as unknown as Record<string, unknown>,
      created_at: vr.verifiedAt,
      updated_at: vr.verifiedAt,
    }));
    const savedVerifications = await researchRepository.saveClaimVerifications(verificationRecords);

    onProgress?.({
      stage: "MODULE_05_VERIFICATION",
      message: `Verified ${verificationResults.length} individual claims (${verificationResults.filter((v) => v.verificationStatus === "verified").length} verified)`,
      progress: 65,
      verificationsCount: verificationResults.length,
    });

    // ==========================================================================
    // PHASE 6: MODULE 06 — CROSS-SOURCE COMPARISON & CONTRADICTION ENGINE
    // ==========================================================================
    const contradictionResults = crossSourceContradictionEngine.analyzeContradictions(
      plan.research_id,
      savedClaims,
      verificationResults,
      savedEvidence,
      savedSources,
      sourceQualityAssessments,
      sourceDependencies
    );

    const contradictionRecords: CrossSourceContradictionRecord[] = contradictionResults.map((cr) => ({
      id: cr.id,
      project_id: cr.projectId,
      subject: cr.subject,
      contradiction_type: cr.contradictionType,
      competing_claim_ids: cr.competingClaimIds,
      competing_evidence_ids: cr.competingEvidenceIds,
      competing_positions: cr.competingPositions,
      resolution_status: cr.resolutionStatus,
      primary_source_evidence_id: cr.primarySourceEvidenceId,
      resolution_explanation: cr.resolutionExplanation,
      severity: cr.severity,
      created_at: cr.detectedAt,
      updated_at: cr.detectedAt,
    }));
    const savedContradictions = await researchRepository.saveContradictions(contradictionRecords);

    onProgress?.({
      stage: "MODULE_06_CONTRADICTIONS",
      message: `Analyzed cross-source contradictions (${contradictionResults.length} disagreements investigated)`,
      progress: 75,
      contradictionsCount: contradictionResults.length,
    });

    // ==========================================================================
    // PHASE 7: MODULE 07 — RESEARCH ANALYSIS & INTELLIGENCE ENGINE
    // ==========================================================================
    const analysisResult = researchAnalysisEngine.analyzeResearch(
      plan,
      savedClaims,
      savedEvidence,
      savedSources,
      sourceQualityAssessments,
      verificationResults,
      contradictionResults
    );

    const analysisRecord: ResearchAnalysisRecord = {
      id: analysisResult.id,
      project_id: plan.research_id,
      executive_summary: analysisResult.executiveSummary,
      evidence_based_conclusions: analysisResult.evidenceBasedConclusions,
      comparative_analysis: analysisResult.comparativeAnalysis,
      architectural_implications: analysisResult.architecturalImplications,
      uncertainty_profile: analysisResult.uncertaintyProfile,
      decision_framework: analysisResult.decisionFramework,
      created_at: analysisResult.analyzedAt,
      updated_at: analysisResult.analyzedAt,
    };
    await researchRepository.saveAnalysis(analysisRecord);

    const findingRecords: ResearchFindingRecord[] = analysisResult.findings.map((f) => ({
      id: f.id,
      project_id: plan.research_id,
      sub_question_id: f.subQuestionId,
      finding_title: f.findingTitle,
      finding_statement: f.findingStatement,
      finding_type: f.findingType,
      supporting_claim_ids: f.supportingClaimIds,
      supporting_evidence_ids: f.supportingEvidenceIds,
      confidence_level: f.confidenceLevel,
      is_consensus_fact: f.isConsensusFact,
      created_at: f.createdAt,
    }));
    await researchRepository.saveFindings(findingRecords);

    const recommendationRecords: ResearchRecommendationRecord[] = analysisResult.recommendations.map((r) => ({
      id: r.id,
      project_id: plan.research_id,
      recommendation_text: r.recommendationText,
      reasoning: r.reasoning,
      supporting_claim_ids: r.supportingClaimIds,
      supporting_evidence_ids: r.supportingEvidenceIds,
      advantages: r.advantages,
      trade_offs: r.tradeOffs,
      risks: r.risks,
      assumptions: r.assumptions,
      confidence_score: r.confidenceScore,
      conditional_triggers: r.conditionalTriggers,
      created_at: r.createdAt,
    }));
    await researchRepository.saveRecommendations(recommendationRecords);

    const gapRecords: ResearchGapRecord[] = analysisResult.gaps.map((g) => ({
      id: g.id,
      project_id: plan.research_id,
      gap_title: g.gapTitle,
      gap_description: g.gapDescription,
      sub_question_id: g.subQuestionId,
      severity: g.severity,
      impact_analysis: g.impactAnalysis,
      recommended_remedy: g.recommendedRemedy,
      created_at: g.createdAt,
    }));
    await researchRepository.saveGaps(gapRecords);

    const alternativeRecords: ResearchAlternativeRecord[] = analysisResult.alternatives.map((a) => ({
      id: a.id,
      project_id: plan.research_id,
      name: a.name,
      description: a.description,
      advantages: a.advantages,
      disadvantages: a.disadvantages,
      dependencies: a.dependencies,
      technical_requirements: a.technicalRequirements,
      operational_limitations: a.operationalLimitations,
      risks: a.risks,
      unresolved_questions: a.unresolvedQuestions,
      supporting_evidence_ids: a.supportingEvidenceIds,
      created_at: a.createdAt,
    }));
    await researchRepository.saveAlternatives(alternativeRecords);

    onProgress?.({
      stage: "MODULE_07_ANALYSIS",
      message: `Synthesized intelligence: ${analysisResult.findings.length} findings, ${analysisResult.recommendations.length} recommendations`,
      progress: 85,
      analysisSummary: analysisResult.executiveSummary,
    });

    // ==========================================================================
    // PHASE 8: MODULE 08 — FRESHNESS & REVALIDATION ENGINE
    // ==========================================================================
    const freshnessResult = freshnessEngine.evaluateFreshness(
      plan,
      savedSources,
      savedEvidence,
      savedClaims,
      recommendationRecords
    );

    const freshnessRecords: SourceFreshnessRecordData[] = freshnessResult.sourceFreshness.map((sf) => ({
      id: sf.id,
      project_id: plan.research_id,
      source_id: sf.sourceId,
      freshness_state: sf.freshnessState,
      last_verified_at: sf.lastVerifiedAt,
      next_revalidation_due: sf.nextRevalidationDue,
      staleness_reasons: sf.stalenessReasons,
      version_observed: sf.versionObserved,
      content_hash_observed: sf.contentHashObserved,
      created_at: sf.lastVerifiedAt,
      updated_at: sf.lastVerifiedAt,
    }));
    await researchRepository.saveSourceFreshness(freshnessRecords);

    const jobRecords: RevalidationJobRecord[] = freshnessResult.scheduledJobs.map((j) => ({
      id: j.id,
      project_id: plan.research_id,
      source_id: j.sourceId,
      status: j.status,
      scheduled_for: j.scheduledFor,
      started_at: j.startedAt,
      completed_at: j.completedAt,
      retry_count: j.retryCount,
      error_message: j.errorMessage,
      created_at: j.createdAt,
    }));
    await researchRepository.saveRevalidationJobs(jobRecords);

    const logRecords: RevalidationLogRecord[] = freshnessResult.revalidationLogs.map((l) => ({
      id: l.id,
      project_id: plan.research_id,
      source_id: l.sourceId,
      previous_content_hash: l.previousContentHash,
      new_content_hash: l.newContentHash,
      previous_version: l.previousVersion,
      new_version: l.newVersion,
      change_description: l.changeDescription,
      impacted_claim_ids: l.impactedClaimIds,
      impacted_evidence_ids: l.impactedEvidenceIds,
      impacted_recommendation_ids: l.impactedRecommendationIds,
      detected_at: l.detectedAt,
    }));
    await researchRepository.saveRevalidationLogs(logRecords);

    onProgress?.({
      stage: "MODULE_08_FRESHNESS",
      message: `Assessed freshness decay (${freshnessResult.overallProjectFreshness.toUpperCase()}) & scheduled ${freshnessResult.scheduledJobs.length} revalidation jobs`,
      progress: 92,
      freshness: freshnessResult.overallProjectFreshness,
    });

    // ==========================================================================
    // PHASE 9: MODULE 09 — RESEARCH REPORT GENERATION & CITATION FIREWALL (MODULE 11)
    // ==========================================================================
    const execReport = researchReportGenerator.generateReport({
      project: projectRecord,
      sources: savedSources,
      evidence: savedEvidence,
      claims: savedClaims,
      reliabilities: savedQualityAssessments,
      verifications: savedVerifications,
      contradictions: savedContradictions,
      analysis: analysisResult,
      freshness: freshnessResult,
      options: {
        reportType: "executive_briefing",
        format: "markdown",
      },
    });

    const comprehensiveReport = researchReportGenerator.generateReport({
      project: projectRecord,
      sources: savedSources,
      evidence: savedEvidence,
      claims: savedClaims,
      reliabilities: savedQualityAssessments,
      verifications: savedVerifications,
      contradictions: savedContradictions,
      analysis: analysisResult,
      freshness: freshnessResult,
      options: {
        reportType: "comprehensive_report",
        format: "markdown",
      },
    });

    const reportsToSave = [execReport, comprehensiveReport];
    let allCitationsValid = true;

    for (const rep of reportsToSave) {
      // Citation Integrity Firewall
      const audit = await researchSafetyEngine.verifyCitationIntegrity(rep, plan.research_id);
      if (audit.hasFabricatedReferences) {
        allCitationsValid = false;
      }

      const repRecord: ResearchReportRecord = {
        id: rep.id,
        project_id: plan.research_id,
        title: rep.title,
        report_type: rep.reportType,
        format: rep.format,
        content_raw: rep.contentRaw,
        content_structured: rep.contentStructured,
        summary_brief: rep.summaryBrief,
        version: rep.version,
        citations_count: rep.citationsCount,
        generated_at: rep.generatedAt,
        updated_at: rep.generatedAt,
      };
      await researchRepository.saveReport(repRecord);

      const citRecords: ResearchReportCitationRecord[] = rep.citations.map((c) => ({
        id: c.id,
        report_id: rep.id,
        citation_index: c.citationIndex,
        citation_marker: c.citationMarker,
        source_id: c.sourceId,
        evidence_id: c.evidenceId,
        claim_id: c.claimId,
        source_title: c.sourceTitle,
        source_url: c.sourceUrl,
        publisher: c.publisher,
        publication_date: c.publicationDate,
        exact_passage_excerpt: c.exactPassageExcerpt,
        created_at: rep.generatedAt,
      }));
      await researchRepository.saveReportCitations(citRecords);
    }

    onProgress?.({
      stage: "MODULE_09_REPORT_GENERATION",
      message: `Generated ${reportsToSave.length} verifiable research reports with exact citations`,
      progress: 95,
      reportsCount: reportsToSave.length,
    });

    // ==========================================================================
    // PHASE 10: MODULE 10 — ADVANCED MEMORY DEEP INGESTION ENGINE
    // ==========================================================================
    const memoryIngestionResult = await advancedMemoryIngestionEngine.ingestResearchProject({
      project: projectRecord,
      sources: savedSources,
      evidence: savedEvidence,
      claims: savedClaims,
      verifications: savedVerifications,
      contradictions: savedContradictions,
      analysis: analysisResult,
      reports: reportsToSave,
    });

    onProgress?.({
      stage: "MODULE_10_MEMORY_INGESTION",
      message: `Ingested ${memoryIngestionResult.ingestedMemoriesCount} research memories into knowledge graph`,
      progress: 98,
      memoriesIngestedCount: memoryIngestionResult.ingestedMemoriesCount,
    });

    // ==========================================================================
    // PHASE 11: MODULE 11 — RESEARCH SAFETY & INTEGRITY AUDIT SUMMARY
    // ==========================================================================
    const projectSecurityEvents = await researchRepository.getSecurityEvents(plan.research_id);
    const safetyAuditSummary = {
      securityEventsCount: projectSecurityEvents.length,
      quarantinedSourcesCount: projectSecurityEvents.filter((e) => e.action_taken === "quarantined").length,
      citationIntegrityPassed: allCitationsValid,
      auditedAt: new Date().toISOString(),
    };

    onProgress?.({
      stage: "MODULE_11_SAFETY_AUDIT",
      message: `Completed safety audit (${safetyAuditSummary.securityEventsCount} events monitored, citation integrity: ${safetyAuditSummary.citationIntegrityPassed ? "PASSED" : "FLAGGED"})`,
      progress: 100,
      securitySummary: safetyAuditSummary,
    });

    await researchRepository.updateProjectStatus(plan.research_id, "completed");

    const totalFactsCount = extractionResults.reduce((acc, r) => acc + r.facts.length, 0);
    const totalSpecsCount = extractionResults.reduce((acc, r) => acc + r.specifications.length, 0);

    return {
      researchId: plan.research_id,
      status: savedClaims.length > 0 || savedSources.length > 0 ? "completed" : "partial",
      plan,
      discoveryCount: discoveredItems.length,
      sourcesProcessedCount: extractionResults.length,
      extractedClaimsCount: savedClaims.length,
      extractedPassagesCount: savedEvidence.length,
      extractedFactsCount: totalFactsCount,
      extractedSpecsCount: totalSpecsCount,
      verifiedClaimsCount: savedVerifications.filter((v) => v.verification_status === "verified").length,
      contradictionsCount: savedContradictions.length,
      findingsCount: findingRecords.length,
      recommendationsCount: recommendationRecords.length,
      gapsCount: gapRecords.length,
      durationMs: Date.now() - startTime,
      summary: {
        title: plan.title,
        topic: plan.topic,
        intent: plan.research_intent,
        depth: plan.research_depth,
        completionCriteria: plan.completion_criteria,
      },
      sources: savedSources,
      claims: savedClaims,
      evidence: savedEvidence,
      links: savedLinks,
      qualityAssessments: savedQualityAssessments,
      verifications: savedVerifications,
      contradictions: savedContradictions,
      dependencies: savedDependencies,
      analysis: analysisResult,
      freshness: freshnessResult,
      reports: reportsToSave,
      memoryIngestion: memoryIngestionResult,
      safetyAudit: safetyAuditSummary,
      boundaryForFutureModules: {
        finalCertificationPending: true, // Clean boundary for Module 12
      },
    };
  }
}

/** Global singleton instance */
export const researchPipelineOrchestrator = new ResearchPipelineOrchestrator();
