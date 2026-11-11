/**
 * ============================================================================
 * Module Name: Freshness & Revalidation API Route (Module 08)
 * Subsystem: ULTRON Research & Verification Engine - Batch 03
 * File: app/api/research/freshness/route.ts
 * ============================================================================
 *
 * ARCHITECTURAL ROLE & PURPOSE:
 * -----------------------------
 * API Endpoint for Module 08: Freshness & Revalidation Engine.
 * Evaluates time-based decay across research sources, calculates category-aware
 * Time-To-Live (TTL) expiration schedules, detects content drift using SHA-256
 * digests, schedules background revalidation jobs, and traces downstream impact on
 * claims and architectural recommendations.
 *
 * KEY RESPONSIBILITIES:
 * ---------------------
 * - POST: Evaluates freshness state for a project's sources (`CURRENT`, `AGING`,
 *   `STALE`, `EXPIRED`, `UNKNOWN`) and generates revalidation schedules.
 *   Also supports manual revalidation triggers (`action: "revalidate"`).
 * - GET: Retrieves source freshness records, scheduled jobs, and revalidation logs.
 * - Enforces zero-cost local execution without third-party paid API dependencies.
 *
 * SAFETY / SECURITY GUARANTEES:
 * -----------------------------
 * - Read-only validation: Inspects content hashes and timestamps without writing to external hosts.
 * - Safe error handling: Missing dates are marked as UNKNOWN rather than fabricated.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { researchPlanningEngine } from "@/lib/research/planningEngine";
import { freshnessEngine } from "@/lib/research/freshnessEngine";
import { researchRepository } from "@/lib/research/repository";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import type {
  SourceFreshnessRecordData,
  RevalidationJobRecord,
  RevalidationLogRecord,
} from "@/lib/research/types";

/**
 * POST handler to evaluate source freshness or trigger revalidation.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    let body: { projectId: string; action?: "evaluate" | "revalidate"; sourceId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request payload" }, { status: 400 });
    }

    if (!body || !body.projectId || typeof body.projectId !== "string") {
      return NextResponse.json({ error: "A valid projectId string is required" }, { status: 400 });
    }

    const { projectId, action = "evaluate", sourceId } = body;
    const project = await researchRepository.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: `Research project ${projectId} not found` }, { status: 404 });
    }

    const sources = await researchRepository.getSources(projectId);
    const evidence = await researchRepository.getEvidence(projectId);
    const claims = await researchRepository.getClaims(projectId);
    const recommendations = await researchRepository.getRecommendations(projectId);

    // Generate valid plan context
    const plan = researchPlanningEngine.generatePlan({
      query: project.topic,
      depth: project.research_depth,
    });
    plan.research_id = project.id;
    plan.title = project.title;
    plan.topic = project.topic;
    plan.problem_statement = project.problem_statement;
    plan.research_intent = project.research_intent;

    if (action === "revalidate") {
      const sourcesToRevalidate = sourceId
        ? sources.filter((s) => s.id === sourceId)
        : sources;

      if (sourcesToRevalidate.length === 0) {
        return NextResponse.json(
          { error: `No matching sources found for revalidation in project ${projectId}` },
          { status: 404 }
        );
      }

      const freshnessResult = freshnessEngine.evaluateFreshness(
        plan,
        sourcesToRevalidate,
        evidence,
        claims,
        recommendations
      );

      const manualLogs: RevalidationLogRecord[] = sourcesToRevalidate.map((src) => {
        const matchingEv = evidence.filter((e) => e.source_id === src.id);
        const matchingEvIds = matchingEv.map((e) => e.id);
        const matchingClaimIds = claims
          .filter((c) => matchingEv.some((e) => e.exact_passage.includes(c.claim_text)))
          .map((c) => c.id);

        return {
          id: crypto.randomUUID(),
          project_id: projectId,
          source_id: src.id,
          change_description: "Manual revalidation audit executed by founder command",
          previous_content_hash: src.content_hash,
          new_content_hash: src.content_hash,
          impacted_claim_ids: matchingClaimIds,
          impacted_evidence_ids: matchingEvIds,
          impacted_recommendation_ids: [],
          detected_at: new Date().toISOString(),
        };
      });
      await researchRepository.saveRevalidationLogs(manualLogs);

      return NextResponse.json({
        success: true,
        action: "revalidate",
        revalidatedSourcesCount: sourcesToRevalidate.length,
        freshness: freshnessResult,
        logs: manualLogs,
      });
    }

    // Default Action: Evaluate Freshness
    const freshnessResult = freshnessEngine.evaluateFreshness(
      plan,
      sources,
      evidence,
      claims,
      recommendations
    );

    // Save Source Freshness
    const freshnessRecords: SourceFreshnessRecordData[] = freshnessResult.sourceFreshness.map((sf) => ({
      id: sf.id,
      project_id: projectId,
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

    // Save Revalidation Jobs
    const jobRecords: RevalidationJobRecord[] = freshnessResult.scheduledJobs.map((j) => ({
      id: j.id,
      project_id: projectId,
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

    // Save Revalidation Logs
    const logRecords: RevalidationLogRecord[] = freshnessResult.revalidationLogs.map((l) => ({
      id: l.id,
      project_id: projectId,
      source_id: l.sourceId,
      change_description: l.changeDescription,
      previous_content_hash: l.previousContentHash,
      new_content_hash: l.newContentHash,
      previous_version: l.previousVersion,
      new_version: l.newVersion,
      impacted_claim_ids: l.impactedClaimIds,
      impacted_evidence_ids: l.impactedEvidenceIds,
      impacted_recommendation_ids: l.impactedRecommendationIds,
      detected_at: l.detectedAt,
    }));
    await researchRepository.saveRevalidationLogs(logRecords);

    return NextResponse.json({
      success: true,
      overallFreshness: freshnessResult.overallProjectFreshness,
      sourceFreshnessCount: freshnessRecords.length,
      scheduledJobsCount: jobRecords.length,
      detectedChangesCount: freshnessResult.detectedChanges.length,
      result: freshnessResult,
    });
  } catch (error) {
    console.error("[RESEARCH_FRESHNESS_API_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to evaluate source freshness", details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET handler to retrieve freshness status, jobs, and revalidation logs.
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

  const sourceFreshness = await researchRepository.getSourceFreshness(projectId);
  const jobs = await researchRepository.getRevalidationJobs(projectId);
  const logs = await researchRepository.getRevalidationLogs(projectId);

  return NextResponse.json({
    success: true,
    projectId,
    sourceFreshness,
    jobs,
    logs,
  });
}
