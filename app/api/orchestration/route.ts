/**
 * @file app/api/orchestration/route.ts
 * @description Next.js REST API Route for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine (Blueprint Section 7).
 *
 * Key Responsibilities:
 * - Ingests founder requests and triggers autonomous multi-phase task orchestration.
 * - Exposes real-time workflow status, progress metrics, and verification reports.
 * - Coordinates founder approvals and rejections through `HumanApprovalCoordinator`.
 * - Handles workflow resumption, cancellation, and restart recovery.
 *
 * Architectural Role & Safety Guarantees:
 * - Integrates with `lib/orchestration/index.ts`.
 * - Rejects unauthenticated or unauthorized calls fail-closed.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSessionToken } from "@/lib/security/identityEngine";
import { validateDesktopSession } from "@/lib/sessionGate";
import {
  defaultTaskOrchestrationEngine,
  defaultPersistentStateEngine,
  defaultProgressTrackingEngine,
  defaultHumanApprovalCoordinator,
  defaultTaskReportingEngine,
  defaultWorkflowManagementEngine,
  type WorkflowInstance,
} from "@/lib/orchestration";

/**
 * Validates session token from request headers or HttpOnly cookies.
 */
function extractAuthSession(request: NextRequest) {
  const token =
    request.headers.get("x-ultron-session-token") ||
    request.cookies.get("ultron_session")?.value ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return { token: token || "", validation: validateSessionToken(token) };
}

export async function GET(request: NextRequest) {
  // Read-only workflow inspection uses the authenticated desktop boundary; mutating POST actions
  // continue to require an identity-engine session and retain their existing role checks.
  const validation = validateDesktopSession(request);
  if (!validation.valid || !validation.session) {
    return NextResponse.json(
      {
        success: false,
        error: validation.error || "Unauthorized: Valid desktop session required to read Task Orchestration.",
      },
      { status: validation.status || 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("id");
    const action = searchParams.get("action");

    // 1. Pending Approvals Queue (Sanitize tokens: redact internal execution grant tokens)
    if (action === "pending_approvals") {
      const pending = defaultHumanApprovalCoordinator.listPendingRequests().map((p) => ({
        ...p,
        executionGrantToken: null,
      }));
      return NextResponse.json({ success: true, count: pending.length, pending });
    }

    // 2. Specific Workflow Inspection
    if (workflowId) {
      const workflow = defaultPersistentStateEngine.getWorkflow(workflowId);
      if (!workflow) {
        return NextResponse.json(
          { success: false, error: `Workflow "${workflowId}" not found.` },
          { status: 404 }
        );
      }

      const progress = defaultProgressTrackingEngine.getProgressReport(workflow);
      const report = defaultTaskReportingEngine.generateReport(workflow);
      const checkpoints = defaultPersistentStateEngine.getCheckpointsForWorkflow(workflowId);

      return NextResponse.json({
        success: true,
        workflow,
        progress,
        report,
        checkpointsCount: checkpoints.length,
      });
    }

    // 3. List All Workflows
    const workflows = defaultPersistentStateEngine.listWorkflows();
    return NextResponse.json({
      success: true,
      count: workflows.length,
      workflows: workflows.map((w) => ({
        id: w.id,
        title: w.goal.title,
        category: w.goal.category,
        state: w.state,
        taskCount: Object.keys(w.tasks).length,
        completedCount: w.completedTaskIds.length,
        version: w.version,
        updatedAt: w.updatedAt,
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { token, validation } = extractAuthSession(request);
  if (!validation.isValid || !validation.session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Valid session required to perform orchestration operations." },
      { status: 401 }
    );
  }

  const actorRole = validation.session.userRole;

  try {
    const body = await request.json();
    const { action, prompt, workflowId, taskId, approved, reason } = body;

    // Action 1: Resume Paused Workflow
    if (action === "resume") {
      if (!workflowId) {
        return NextResponse.json({ success: false, error: "Missing workflowId" }, { status: 400 });
      }
      const wf = defaultPersistentStateEngine.getWorkflow(workflowId);
      if (!wf) {
        return NextResponse.json({ success: false, error: `Workflow "${workflowId}" not found.` }, { status: 404 });
      }
      const updated = await defaultTaskOrchestrationEngine.executeWorkflow(workflowId);
      return NextResponse.json({ success: true, workflow: updated });
    }

    // Action 2: Resolve Task Approval
    if (action === "resolve_approval") {
      if (!taskId) {
        return NextResponse.json({ success: false, error: "Missing taskId" }, { status: 400 });
      }

      if (actorRole !== "founder" && actorRole !== "admin") {
        return NextResponse.json(
          { success: false, error: "Access Denied: Only Founder or Admin can resolve approvals." },
          { status: 403 }
        );
      }

      let updated: WorkflowInstance;
      if (approved) {
        updated = await defaultTaskOrchestrationEngine.approveTaskAndResume(
          taskId,
          token,
          actorRole
        );
      } else {
        updated = await defaultTaskOrchestrationEngine.rejectTaskApproval(
          taskId,
          token,
          reason || "Rejected by founder."
        );
      }

      return NextResponse.json({ success: true, workflow: updated });
    }

    // Action 3: Cancel Active Workflow
    if (action === "cancel") {
      if (!workflowId) {
        return NextResponse.json({ success: false, error: "Missing workflowId" }, { status: 400 });
      }
      const wf = defaultPersistentStateEngine.getWorkflow(workflowId);
      if (!wf) {
        return NextResponse.json({ success: false, error: "Workflow not found" }, { status: 404 });
      }
      const cancelled = defaultWorkflowManagementEngine.cancelWorkflow(wf, reason);
      defaultPersistentStateEngine.saveWorkflow(cancelled);
      defaultPersistentStateEngine.createCheckpoint(cancelled);
      return NextResponse.json({ success: true, workflow: cancelled });
    }

    // Action 4: Recover Interrupted Workflows
    if (action === "recover") {
      if (actorRole !== "founder" && actorRole !== "admin") {
        return NextResponse.json(
          { success: false, error: "Access Denied: Founder authorization required for workflow recovery." },
          { status: 403 }
        );
      }
      const recovered = defaultPersistentStateEngine.recoverInterruptedWorkflows();
      return NextResponse.json({
        success: true,
        recoveredCount: recovered.length,
        recoveredWorkflows: recovered.map((r) => r.workflow.id),
      });
    }

    // Default: Orchestrate New Goal
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid prompt string." },
        { status: 400 }
      );
    }

    const result = await defaultTaskOrchestrationEngine.orchestrateGoal(prompt, {
      autoExecuteNonSensitive: body.autoExecute !== false,
      founderAssumptions: body.assumptions,
      founderPriorityOverrides: body.priorityOverrides,
    });

    return NextResponse.json({
      success: true,
      workflow: result.workflow,
      report: result.report,
      markdownBrief: result.markdownBrief,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
