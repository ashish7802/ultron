/**
 * ============================================================================
 * Module Name: Research Analysis API Route (Module 07)
 * Subsystem: ULTRON Research & Verification Engine - Batch 03
 * File: app/api/research/analyze/route.ts
 * ============================================================================
 *
 * ARCHITECTURAL ROLE & PURPOSE:
 * -----------------------------
 * API Endpoint for Module 07: Research Analysis & Intelligence Engine.
 * Converts verified claims, evidence passages, source quality metrics, and cross-source
 * contradictions into structured conclusions, comparative tradeoff matrices,
 * architectural implications, prioritized recommendations, and knowledge gap audits.
 *
 * KEY RESPONSIBILITIES:
 * ---------------------
 * - POST: Triggers comprehensive analytical synthesis for a target `projectId`.
 *   Persists generated findings, recommendations, gaps, and alternatives to `researchRepository`.
 * - GET: Retrieves existing analysis record and associated analytical collections for a `projectId`.
 * - Adheres strictly to Zero-Trust session validation and local vault persistence.
 *
 * SAFETY / SECURITY GUARANTEES:
 * -----------------------------
 * - Epistemic integrity: Conclusions derive strictly from verified facts and recorded evidence.
 * - Read-only analytical execution: No external write operations or cloud leaks.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { researchPlanningEngine } from "@/lib/research/planningEngine";
import { researchAnalysisEngine } from "@/lib/research/analysisEngine";
import { researchRepository } from "@/lib/research/repository";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import type {
  ResearchFinding,
  ResearchRecommendation,
  ResearchGap,
  ResearchAlternative,
  ResearchAnalysisRecord,
  ResearchFindingRecord,
  ResearchRecommendationRecord,
  ResearchGapRecord,
  ResearchAlternativeRecord,
} from "@/lib/research/types";

/**
 * POST handler to trigger Module 07 synthesis on a researched project.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    let body: { projectId: string; forceRecompute?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request payload" }, { status: 400 });
    }

    if (!body || !body.projectId || typeof body.projectId !== "string") {
      return NextResponse.json({ error: "A valid projectId string is required" }, { status: 400 });
    }

    const { projectId, forceRecompute = false } = body;
    const project = await researchRepository.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Research project ${projectId} not found` }, { status: 404 });
    }

    // Return existing analysis if not forcing recompute
    if (!forceRecompute) {
      const existing = await researchRepository.getAnalysis(projectId);
      if (existing) {
        const findings = await researchRepository.getFindings(projectId);
        const recommendations = await researchRepository.getRecommendations(projectId);
        const gaps = await researchRepository.getGaps(projectId);
        const alternatives = await researchRepository.getAlternatives(projectId);

        return NextResponse.json({
          success: true,
          cached: true,
          analysis: existing,
          findings,
          recommendations,
          gaps,
          alternatives,
        });
      }
    }

    // Retrieve prerequisite data from Modules 01 - 06
    const claims = await researchRepository.getClaims(projectId);
    const evidence = await researchRepository.getEvidence(projectId);
    const sources = await researchRepository.getSources(projectId);
    const qualityAssessments = await researchRepository.getQualityAssessments(projectId);
    const verifications = await researchRepository.getClaimVerifications(projectId);
    const contradictions = await researchRepository.getContradictions(projectId);

    // Reconstruct fully valid ResearchPlan for synthesis context
    const plan = researchPlanningEngine.generatePlan({
      query: project.topic,
      depth: project.research_depth,
    });
    plan.research_id = project.id;
    plan.title = project.title;
    plan.topic = project.topic;
    plan.problem_statement = project.problem_statement;
    plan.research_intent = project.research_intent;

    // Execute Module 07 Synthesis
    const analysisResult = researchAnalysisEngine.analyzeResearch(
      plan,
      claims,
      evidence,
      sources,
      qualityAssessments.map((qa) => ({
        id: qa.id,
        projectId: qa.project_id,
        sourceId: qa.source_id,
        authorityScore: qa.authority_score,
        relevanceScore: qa.relevance_score,
        freshnessScore: qa.freshness_score,
        evidenceScore: qa.evidence_score,
        independenceScore: qa.independence_score,
        transparencyScore: qa.transparency_score,
        compositeQualityScore: qa.composite_quality_score,
        qualityTier: qa.quality_tier,
        isPrimarySource: qa.is_primary_source,
        isOfficialDoc: qa.is_official_doc,
        detectedBiases: qa.detected_biases,
        transparencyLimitations: qa.transparency_limitations,
        assessmentBreakdown: {
          authorityReasoning: (qa.assessment_breakdown as Record<string, unknown>)?.authorityReasoning as string || "Curated domain evaluation",
          relevanceReasoning: (qa.assessment_breakdown as Record<string, unknown>)?.relevanceReasoning as string || "Topic keyword alignment",
          freshnessReasoning: (qa.assessment_breakdown as Record<string, unknown>)?.freshnessReasoning as string || "Publication timestamp decay",
          evidenceReasoning: (qa.assessment_breakdown as Record<string, unknown>)?.evidenceReasoning as string || "Verbatim evidence presence",
          independenceReasoning: (qa.assessment_breakdown as Record<string, unknown>)?.independenceReasoning as string || "Independent source verification",
          transparencyReasoning: (qa.assessment_breakdown as Record<string, unknown>)?.transparencyReasoning as string || "Citations and quotes evaluated",
        },
        assessedAt: qa.created_at,
      })),
      verifications.map((v) => ({
        id: v.id,
        projectId: v.project_id,
        claimId: v.claim_id,
        verificationStatus: v.verification_status,
        confidenceScore: v.confidence_score,
        confidenceLevel: v.confidence_level,
        primarySourceChecked: v.primary_source_checked,
        independentSourcesCount: v.independent_sources_count,
        directEvidenceIds: v.direct_evidence_ids,
        contradictingEvidenceIds: v.contradicting_evidence_ids,
        explanation: v.explanation,
        qualifierNotes: v.qualifier_notes,
        misleadingIndicators: v.misleading_indicators,
        temporalAssessment: v.temporal_assessment as unknown as {
          isTimeSensitive: boolean;
          statedDateOrVersion?: string;
          currentObservedDateOrVersion?: string;
          isOutdated: boolean;
          temporalNote?: string;
        },
        verifiedAt: v.created_at,
      })),
      contradictions.map((c) => ({
        id: c.id,
        projectId: c.project_id,
        subject: c.subject,
        contradictionType: c.contradiction_type,
        competingClaimIds: c.competing_claim_ids,
        competingEvidenceIds: c.competing_evidence_ids,
        competingPositions: c.competing_positions,
        resolutionStatus: c.resolution_status,
        primarySourceEvidenceId: c.primary_source_evidence_id,
        resolutionExplanation: c.resolution_explanation,
        severity: (c.severity?.toUpperCase() || "MEDIUM") as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
        detectedAt: c.created_at,
      }))
    );

    // Save Analysis Record
    const analysisRecord: ResearchAnalysisRecord = {
      id: analysisResult.id,
      project_id: projectId,
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

    // Save Findings
    const findingRecords: ResearchFindingRecord[] = analysisResult.findings.map((f: ResearchFinding) => ({
      id: f.id,
      project_id: projectId,
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

    // Save Recommendations
    const recommendationRecords: ResearchRecommendationRecord[] = analysisResult.recommendations.map(
      (r: ResearchRecommendation) => ({
        id: r.id,
        project_id: projectId,
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
      })
    );
    await researchRepository.saveRecommendations(recommendationRecords);

    // Save Gaps
    const gapRecords: ResearchGapRecord[] = analysisResult.gaps.map((g: ResearchGap) => ({
      id: g.id,
      project_id: projectId,
      gap_title: g.gapTitle,
      gap_description: g.gapDescription,
      sub_question_id: g.subQuestionId,
      severity: g.severity,
      impact_analysis: g.impactAnalysis,
      recommended_remedy: g.recommendedRemedy,
      created_at: g.createdAt,
    }));
    await researchRepository.saveGaps(gapRecords);

    // Save Alternatives
    const alternativeRecords: ResearchAlternativeRecord[] = analysisResult.alternatives.map(
      (a: ResearchAlternative) => ({
        id: a.id,
        project_id: projectId,
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
      })
    );
    await researchRepository.saveAlternatives(alternativeRecords);

    return NextResponse.json({
      success: true,
      analysis: analysisRecord,
      findings: findingRecords,
      recommendations: recommendationRecords,
      gaps: gapRecords,
      alternatives: alternativeRecords,
    });
  } catch (error) {
    console.error("[RESEARCH_ANALYZE_API_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to execute research intelligence analysis", details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET handler to retrieve existing Module 07 analysis for a project.
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

  const analysis = await researchRepository.getAnalysis(projectId);
  if (!analysis) {
    return NextResponse.json({ error: `No analysis found for project ${projectId}` }, { status: 404 });
  }

  const findings = await researchRepository.getFindings(projectId);
  const recommendations = await researchRepository.getRecommendations(projectId);
  const gaps = await researchRepository.getGaps(projectId);
  const alternatives = await researchRepository.getAlternatives(projectId);

  return NextResponse.json({
    success: true,
    analysis,
    findings,
    recommendations,
    gaps,
    alternatives,
  });
}
