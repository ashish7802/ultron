/**
 * @file app/api/research/plan/route.ts
 * @description API Endpoint for Module 01: Research Planning Engine.
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - Planning Endpoint.
 *
 * Key Responsibilities:
 * - Accepts user research requests with optional depth, constraints, and exclusions.
 * - Invokes `researchPlanningEngine.generatePlan` to produce a machine-readable `ResearchPlan`.
 * - Persists the planned project and decomposed queries into `researchRepository`.
 * - Returns structured planning telemetry directly to the client.
 *
 * Architectural Role & Interactions:
 * - Invoked by UI research assistants or automated agent workflows before executing any web searches.
 * - Feeds output directly into `app/api/research/discover/route.ts`.
 *
 * Safety / Security Guarantees:
 * - Read-only planning: Pure analytical computation with zero network side effects.
 * - Input validation: Enforces non-empty string queries and sanitized constraints.
 */

import { NextRequest, NextResponse } from "next/server";
import { researchPlanningEngine } from "@/lib/research/planningEngine";
import { researchRepository } from "@/lib/research/repository";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import type { ResearchPlanRequest, ResearchProjectRecord, ResearchQueryRecord } from "@/lib/research/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  try {
    let body: ResearchPlanRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request payload" }, { status: 400 });
    }

    if (!body || !body.query || typeof body.query !== "string" || !body.query.trim()) {
      return NextResponse.json({ error: "A valid, non-empty inquiry string is required" }, { status: 400 });
    }

    // 1. Generate Structured Research Plan
    const plan = researchPlanningEngine.generatePlan(body);

    // 2. Persist Initial Project Record in Shared Repository
    const projectRecord: ResearchProjectRecord = {
      id: plan.research_id,
      tenant_id: "00000000-0000-0000-0000-000000000000",
      user_id: auth.session?.sessionId || "00000000-0000-0000-0000-000000000000",
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
      status: "planned",
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    };
    await researchRepository.saveProject(projectRecord);

    // 3. Persist Decomposed Sub-Questions in Shared Repository
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

    return NextResponse.json({
      success: true,
      research_id: plan.research_id,
      plan,
    });
  } catch (err: unknown) {
    console.error("[RESEARCH PLAN API ERROR]", err);
    const message = err instanceof Error ? err.message : "Internal research planning failure";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
