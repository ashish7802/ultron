/**
 * @file app/api/research/reliability/route.ts
 * @description API Endpoint for Module 04: Source Reliability & Quality Engine.
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - Source Reliability Endpoint.
 *
 * Key Responsibilities:
 * - Accepts a project ID and optional custom sources.
 * - Computes multi-dimensional explainable quality scores (Authority, Relevance, Freshness, Evidence, Independence, Transparency).
 * - Identifies primary sources, official documentation, syndication lineage, and commercial/vendor biases.
 * - Persists quality assessments and source dependencies into `researchRepository`.
 * - Returns structured source quality metrics to the client.
 *
 * Architectural Role & Interactions:
 * - Invoked after discovery/extraction or standalone by UI source inspector components.
 * - Feeds quality metrics directly to `app/api/research/verify/route.ts`.
 *
 * Safety / Security Guarantees:
 * - Read-only analytical evaluation: Zero external network probes or modifications.
 * - Multi-tenant isolation: Scoped strictly to the requested project.
 */

import { NextRequest, NextResponse } from "next/server";
import { sourceReliabilityEngine } from "@/lib/research/sourceReliabilityEngine";
import { researchRepository } from "@/lib/research/repository";
import type { SourceQualityAssessmentRecord, SourceDependencyRecord } from "@/lib/research/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: { projectId: string; inquiry?: string };
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

    const inquiry = body.inquiry || project.topic || project.title;
    const sources = await researchRepository.getSources(projectId);
    const evidence = await researchRepository.getEvidence(projectId);

    if (sources.length === 0) {
      return NextResponse.json(
        { error: "No sources found for this project. Run discovery first." },
        { status: 400 }
      );
    }

    // 1. Evaluate Source Reliability & Quality
    const { assessments, dependencies } = sourceReliabilityEngine.evaluateSources(
      projectId,
      inquiry,
      sources,
      evidence
    );

    // 2. Persist Quality Assessments
    const qualityRecords: SourceQualityAssessmentRecord[] = assessments.map((qa) => ({
      id: qa.id,
      project_id: qa.projectId,
      source_id: qa.sourceId,
      authority_score: qa.authorityScore,
      relevance_score: qa.relevanceScore,
      freshness_score: qa.freshnessScore,
      evidence_score: qa.evidenceScore,
      independence_score: qa.independenceScore,
      transparency_score: qa.transparencyScore,
      composite_quality_score: qa.compositeQualityScore,
      quality_tier: qa.qualityTier,
      is_primary_source: qa.isPrimarySource,
      is_official_doc: qa.isOfficialDoc,
      detected_biases: qa.detectedBiases,
      transparency_limitations: qa.transparencyLimitations,
      assessment_breakdown: qa.assessmentBreakdown,
      created_at: qa.assessedAt,
      updated_at: qa.assessedAt,
    }));
    const savedAssessments = await researchRepository.saveQualityAssessments(qualityRecords);

    // 3. Persist Source Dependencies
    const dependencyRecords: SourceDependencyRecord[] = dependencies.map((sd) => ({
      id: sd.id,
      project_id: sd.projectId,
      source_id: sd.sourceId,
      upstream_source_id: sd.upstreamSourceId,
      dependency_type: sd.dependencyType,
      confidence: sd.confidence,
      created_at: sd.detectedAt,
    }));
    const savedDependencies = await researchRepository.saveSourceDependencies(dependencyRecords);

    return NextResponse.json({
      success: true,
      projectId,
      sourcesAssessed: savedAssessments.length,
      dependenciesDetected: savedDependencies.length,
      qualityAssessments: savedAssessments,
      dependencies: savedDependencies,
    });
  } catch (err: unknown) {
    console.error("[RESEARCH RELIABILITY API ERROR]", err);
    const message = err instanceof Error ? err.message : "Internal source reliability evaluation failure";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
