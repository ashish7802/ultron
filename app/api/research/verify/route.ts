/**
 * @file app/api/research/verify/route.ts
 * @description API Endpoint for Module 05: Claim Verification Engine.
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - Claim Verification Endpoint.
 *
 * Key Responsibilities:
 * - Accepts a project ID and executes claim-level verification against gathered evidence.
 * - Computes the 6-status epistemic verification (`verified`, `partially_verified`, `conflicting`, `unverified`, `outdated`, `refuted`).
 * - Cross-checks official documentation and enforces genuine source independence.
 * - Persists verification records into `researchRepository`.
 * - Returns structured claim verification results with confidence levels and explanations.
 *
 * Architectural Role & Interactions:
 * - Invoked after source reliability evaluation.
 * - Feeds verified claims into `app/api/research/contradictions/route.ts`.
 *
 * Safety / Security Guarantees:
 * - Epistemic integrity: Never fabricates evidence or masks missing citations.
 * - Full audit linkage: Every claim links directly to its supporting or refuting evidence passages.
 */

import { NextRequest, NextResponse } from "next/server";
import { claimVerificationEngine } from "@/lib/research/claimVerificationEngine";
import { researchRepository } from "@/lib/research/repository";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import type { ClaimVerificationRecord } from "@/lib/research/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

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
    const dependencies = await researchRepository.getSourceDependencies(projectId);

    // Retrieve links for all claims in this project
    const allLinks = [];
    for (const claim of claims) {
      const claimLinks = await researchRepository.getLinksForClaim(claim.id);
      allLinks.push(...claimLinks);
    }

    if (claims.length === 0) {
      return NextResponse.json(
        { error: "No claims found for this project. Run evidence extraction first." },
        { status: 400 }
      );
    }

    // 1. Execute Claim Verification Engine
    const verificationResults = claimVerificationEngine.verifyClaims(
      projectId,
      claims,
      evidence,
      allLinks,
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

    // 2. Persist Verification Records in Shared Repository
    const records: ClaimVerificationRecord[] = verificationResults.map((vr) => ({
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
    const savedVerifications = await researchRepository.saveClaimVerifications(records);

    return NextResponse.json({
      success: true,
      projectId,
      claimsVerifiedCount: savedVerifications.length,
      verifiedCount: savedVerifications.filter((v) => v.verification_status === "verified").length,
      conflictingCount: savedVerifications.filter((v) => v.verification_status === "conflicting").length,
      partiallyVerifiedCount: savedVerifications.filter((v) => v.verification_status === "partially_verified").length,
      unverifiedCount: savedVerifications.filter((v) => v.verification_status === "unverified").length,
      outdatedCount: savedVerifications.filter((v) => v.verification_status === "outdated").length,
      refutedCount: savedVerifications.filter((v) => v.verification_status === "refuted").length,
      verifications: savedVerifications,
    });
  } catch (err: unknown) {
    console.error("[RESEARCH VERIFY API ERROR]", err);
    const message = err instanceof Error ? err.message : "Internal claim verification failure";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
