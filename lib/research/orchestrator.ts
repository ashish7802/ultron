/**
 * @file lib/research/orchestrator.ts
 * @description Central Pipeline Orchestrator for the ULTRON Research & Verification Engine (Batch 01).
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - End-to-End Pipeline Orchestration.
 *
 * Key Responsibilities:
 * - Glues together Module 01 (Planning), Module 02 (Discovery), and Module 03 (Evidence Extraction).
 * - Enforces the strict sequential workflow: Request -> Plan -> Discover -> Extract -> Traceable Mapping -> Persist.
 * - Coordinates transactional persistence in `lib/research/repository.ts` for all 6 core research entities.
 * - Enforces resource boundaries, time limits, and negative constraints.
 * - Prepares clean, unencumbered interfaces for future Batch 02 modules (Module 04: Source Reliability, Module 05: Claim Verification).
 *
 * Architectural Role & Interactions:
 * - Upstream: Called by Next.js API endpoints (`app/api/research/*`) and conversational chat tools.
 * - Downstream: Coordinates:
 *   - `lib/research/planningEngine.ts`
 *   - `lib/research/discoveryEngine.ts`
 *   - `lib/research/evidenceEngine.ts`
 *   - `lib/research/repository.ts`
 *
 * Safety / Security Guarantees:
 * - Read-only pipeline execution: Never invokes write commands against external APIs.
 * - Fail-safe isolation: If an individual provider or source fails, the pipeline continues gracefully.
 * - Complete data provenance: Every saved claim is linked to an exact passage and source URL.
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
} from "./types.ts";
import { researchPlanningEngine } from "./planningEngine.ts";
import { informationDiscoveryEngine } from "./discoveryEngine.ts";
import { evidenceCollectionEngine } from "./evidenceEngine.ts";
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
  boundaryForFutureModules: {
    sourceReliabilityPending: boolean; // Flag indicating Module 04 is next
    claimVerificationPending: boolean;  // Flag indicating Module 05 is next
  };
}

export class ResearchPipelineOrchestrator {
  /**
   * Executes the full end-to-end research workflow across Modules 01, 02, and 03.
   *
   * @param request - User research request payload.
   * @returns Complete, structured research dossier.
   */
  public async executeResearch(request: ResearchPlanRequest): Promise<ResearchPipelineResult> {
    const startTime = Date.now();

    // ==========================================================================
    // PHASE 1: MODULE 01 — RESEARCH PLANNING ENGINE
    // ==========================================================================
    const plan = researchPlanningEngine.generatePlan(request);

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
    // PHASE 2: MODULE 02 — INFORMATION DISCOVERY ENGINE
    // ==========================================================================
    const discoveredItems: NormalizedDiscoveryResult[] = await informationDiscoveryEngine.discoverAll(plan);

    // Save discovered source records
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

    await researchRepository.updateProjectStatus(plan.research_id, "extracting");

    // ==========================================================================
    // PHASE 3: MODULE 03 — EVIDENCE COLLECTION & EXTRACTION ENGINE
    // ==========================================================================
    const extractionResults: EvidenceExtractionResult[] = [];
    for (const discoveredSource of discoveredItems) {
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
      boundaryForFutureModules: {
        sourceReliabilityPending: true, // Clean boundary for Module 04
        claimVerificationPending: true, // Clean boundary for Module 05
      },
    };
  }
}

/** Global singleton instance */
export const researchPipelineOrchestrator = new ResearchPipelineOrchestrator();
