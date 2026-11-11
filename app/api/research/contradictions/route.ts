/**
 * @file app/api/research/contradictions/route.ts
 * @description API Endpoint for Module 06: Cross-Source Comparison & Contradiction Engine.
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - Contradiction Intelligence Endpoint.
 *
 * Key Responsibilities:
 * - Compares verified claims across multiple sources for a research project.
 * - Detects direct contradictions, version mismatches, and specification variances.
 * - Investigates disputes and resolves them using authoritative primary sources and changelogs.
 * - Preserves competing positions and unresolved disagreements.
 * - Persists contradiction records into `researchRepository`.
 * - Returns structured contradiction analyses to the client.
 *
 * Architectural Role & Interactions:
 * - Completes the Batch 02 verification and intelligence pipeline.
 * - Provides verified intelligence inputs for future Batch 03 modules (Analysis, Freshness, Reporting).
 *
 * Safety / Security Guarantees:
 * - Read-only analytical evaluation: Preserves all competing perspectives without silent suppression.
 */

import { NextRequest, NextResponse } from "next/server";
import { crossSourceContradictionEngine } from "@/lib/research/contradictionEngine";
import { researchRepository } from "@/lib/research/repository";
import type { CrossSourceContradictionRecord } from "@/lib/research/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: { projectId: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request payload" }, { status: 400 });
    }

    if (!body || !body.projectId || typeof body.projectId !== "string") {
      return NextResponse.json({ error: "A valid projectId string is required" }, { status: 400 });
    }

    const { projectId } = body;
    const project = await researchRepository.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Research project ${projectId} not found` }, { status: 404 });
    }

    const claims = await researchRepository.getClaims(projectId);
    const evidence = await researchRepository.getEvidence(projectId);
    const sources = await researchRepository.getSources(projectId);
    const qualityAssessments = await researchRepository.getQualityAssessments(projectId);
    const verifications = await researchRepository.getClaimVerifications(projectId);
    const dependencies = await researchRepository.getSourceDependencies(projectId);

    // 1. Analyze Cross-Source Contradictions
    const contradictions = crossSourceContradictionEngine.analyzeContradictions(
      projectId,
      claims,
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
        assessmentBreakdown: qa.assessment_breakdown as unknown as {
          authorityReasoning: string;
          relevanceReasoning: string;
          freshnessReasoning: string;
          evidenceReasoning: string;
          independenceReasoning: string;
          transparencyReasoning: string;
        },
        assessedAt: qa.created_at,
      })),
      dependencies.map((sd) => ({
        id: sd.id,
        projectId: sd.project_id,
        sourceId: sd.source_id,
        upstreamSourceId: sd.upstream_source_id,
        dependencyType: sd.dependency_type,
        confidence: sd.confidence,
        detectedAt: sd.created_at,
      }))
    );

    // 2. Persist Contradiction Records in Shared Repository
    const records: CrossSourceContradictionRecord[] = contradictions.map((cr) => ({
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
    const savedContradictions = await researchRepository.saveContradictions(records);

    return NextResponse.json({
      success: true,
      projectId,
      contradictionsCount: savedContradictions.length,
      resolvedCount: savedContradictions.filter((c) => c.resolution_status !== "unresolved_disagreement").length,
      unresolvedCount: savedContradictions.filter((c) => c.resolution_status === "unresolved_disagreement").length,
      contradictions: savedContradictions,
    });
  } catch (err: unknown) {
    console.error("[RESEARCH CONTRADICTIONS API ERROR]", err);
    const message = err instanceof Error ? err.message : "Internal contradiction analysis failure";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
