/**
 * ============================================================================
 * Module Name: Research Memory Ingestion API Route (Module 10)
 * Subsystem: ULTRON Research & Verification Engine - Batch 04
 * File: app/api/research/memory/route.ts
 * ============================================================================
 *
 * ARCHITECTURAL ROLE & PURPOSE:
 * -----------------------------
 * API Endpoint for Module 10: Advanced Memory Deep Ingestion Engine.
 * Exposes endpoints for transforming research outputs into persistent long-term
 * memories, managing knowledge graph nodes/edges, recalling prior research, and
 * performing memory self-healing integrity audits.
 *
 * KEY RESPONSIBILITIES:
 * ---------------------
 * - POST:
 *   - `action: "ingest"`: Deep-ingests a researched project's claims, conclusions,
 *     recommendations, and reports into `ultron_memory_vault.json` with provenance.
 *   - `action: "recall"`: Recalls previous research memories prior to new research.
 *   - `action: "audit"`: Verifies memory link integrity and identifies orphaned records.
 * - GET:
 *   - Retrieves all research memory links, knowledge graph nodes, knowledge edges,
 *     and memory versions associated with a `projectId`.
 *
 * SAFETY / SECURITY GUARANTEES:
 * -----------------------------
 * - Authenticated session validation on all calls.
 * - Local vault persistence with AES-256-GCM encryption at rest.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { advancedMemoryIngestionEngine } from "@/lib/research/memoryIngestionEngine";
import { researchRepository } from "@/lib/research/repository";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import type {
  MemoryIngestionOptions,
  ResearchAnalysisResult,
  ReportType,
  ReportFormat,
} from "@/lib/research/types";

/**
 * POST handler for deep memory ingestion, recall, and self-healing audits.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    let body: {
      action?: "ingest" | "recall" | "audit";
      projectId?: string;
      query?: string;
      limit?: number;
      options?: MemoryIngestionOptions;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request payload" }, { status: 400 });
    }

    const action = body.action || "ingest";

    // Action 1: Pre-Research Memory Recall
    if (action === "recall") {
      const query = body.query;
      if (!query || typeof query !== "string") {
        return NextResponse.json({ error: "A valid query string is required for recall" }, { status: 400 });
      }

      const memories = advancedMemoryIngestionEngine.recallHistoricalResearch(query, body.limit || 8);
      return NextResponse.json({
        success: true,
        action: "recall",
        count: memories.length,
        memories,
      });
    }

    // Action 2: Memory Self-Healing Integrity Audit
    if (action === "audit") {
      const projectId = body.projectId;
      if (!projectId) {
        return NextResponse.json({ error: "A valid projectId string is required for audit" }, { status: 400 });
      }

      const auditResult = await advancedMemoryIngestionEngine.auditMemoryIntegrity(projectId);
      return NextResponse.json({
        success: true,
        action: "audit",
        projectId,
        ...auditResult,
      });
    }

    // Action 3: Deep Memory Ingestion
    const projectId = body.projectId;
    if (!projectId) {
      return NextResponse.json({ error: "A valid projectId string is required for ingestion" }, { status: 400 });
    }

    const project = await researchRepository.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Research project ${projectId} not found` }, { status: 404 });
    }

    const sources = await researchRepository.getSources(projectId);
    const evidence = await researchRepository.getEvidence(projectId);
    const claims = await researchRepository.getClaims(projectId);
    const verifications = await researchRepository.getClaimVerifications(projectId);
    const contradictions = await researchRepository.getContradictions(projectId);
    const analysisRecord = await researchRepository.getAnalysis(projectId);
    const findings = await researchRepository.getFindings(projectId);
    const recommendations = await researchRepository.getRecommendations(projectId);
    const gaps = await researchRepository.getGaps(projectId);
    const alternatives = await researchRepository.getAlternatives(projectId);
    const reportRecords = await researchRepository.getReportsForProject(projectId);

    // Reconstruct analysis context if available
    let analysisContext: ResearchAnalysisResult | undefined;
    if (analysisRecord) {
      analysisContext = {
        id: analysisRecord.id,
        projectId,
        executiveSummary: analysisRecord.executive_summary,
        evidenceBasedConclusions: analysisRecord.evidence_based_conclusions,
        findings: findings.map((f) => ({
          id: f.id,
          projectId: f.project_id,
          subQuestionId: f.sub_question_id,
          findingTitle: f.finding_title,
          findingStatement: f.finding_statement,
          findingType: f.finding_type as "technical" | "architectural" | "operational" | "comparative",
          supportingClaimIds: f.supporting_claim_ids || [],
          supportingEvidenceIds: f.supporting_evidence_ids || [],
          confidenceLevel: f.confidence_level as "HIGH" | "MODERATE" | "PROVISIONAL" | "LOW",
          isConsensusFact: f.is_consensus_fact,
          createdAt: f.created_at,
        })),
        recommendations: recommendations.map((r) => ({
          id: r.id,
          projectId: r.project_id,
          recommendationText: r.recommendation_text,
          reasoning: r.reasoning,
          supportingClaimIds: r.supporting_claim_ids || [],
          supportingEvidenceIds: r.supporting_evidence_ids || [],
          advantages: r.advantages || [],
          tradeOffs: r.trade_offs || [],
          risks: r.risks || [],
          assumptions: r.assumptions || [],
          confidenceScore: r.confidence_score || 0.85,
          conditionalTriggers: r.conditional_triggers || [],
          createdAt: r.created_at,
        })),
        gaps: gaps.map((g) => ({
          id: g.id,
          projectId: g.project_id,
          gapTitle: g.gap_title,
          gapDescription: g.gap_description,
          subQuestionId: g.sub_question_id,
          severity: g.severity,
          impactAnalysis: g.impact_analysis,
          recommendedRemedy: g.recommended_remedy,
          createdAt: g.created_at,
        })),
        alternatives: alternatives.map((a) => ({
          id: a.id,
          projectId: a.project_id,
          name: a.name,
          description: a.description,
          advantages: a.advantages || [],
          disadvantages: a.disadvantages || [],
          dependencies: a.dependencies || [],
          technicalRequirements: a.technical_requirements || [],
          operationalLimitations: a.operational_limitations || [],
          risks: a.risks || [],
          unresolvedQuestions: a.unresolved_questions || [],
          supportingEvidenceIds: a.supporting_evidence_ids || [],
          createdAt: a.created_at,
        })),
        comparativeAnalysis: analysisRecord.comparative_analysis,
        architecturalImplications: analysisRecord.architectural_implications,
        uncertaintyProfile: analysisRecord.uncertainty_profile,
        decisionFramework: analysisRecord.decision_framework,
        analyzedAt: analysisRecord.updated_at,
      };
    }

    // Reconstruct reports
    const reconstructedReports = reportRecords.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      reportType: r.report_type as ReportType,
      format: r.format as ReportFormat,
      contentRaw: r.content_raw,
      contentStructured: r.content_structured,
      summaryBrief: r.summary_brief,
      version: r.version,
      citations: [],
      citationsCount: r.citations_count,
      generatedAt: r.generated_at,
    }));

    // Ingest into Advanced Memory
    const ingestionResult = await advancedMemoryIngestionEngine.ingestResearchProject({
      project,
      sources,
      evidence,
      claims,
      verifications,
      contradictions,
      analysis: analysisContext,
      reports: reconstructedReports,
      options: body.options,
    });

    return NextResponse.json({
      success: true,
      action: "ingest",
      ingestionResult,
    });
  } catch (error) {
    console.error("[RESEARCH_MEMORY_API_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to execute memory deep ingestion", details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET handler to retrieve knowledge graph and memory links for a project.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "Missing required parameter: projectId" }, { status: 400 });
  }

  const links = await researchRepository.getMemoryLinks(projectId);
  const nodes = await researchRepository.getKnowledgeNodes(projectId);
  const edges = await researchRepository.getKnowledgeEdges(projectId);
  const versions = await researchRepository.getMemoryVersions(projectId);

  return NextResponse.json({
    success: true,
    projectId,
    links,
    knowledgeGraph: {
      nodes,
      edges,
    },
    versions,
  });
}
