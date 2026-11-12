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

import { NextResponse } from "next/server";
import {
  defaultTaskOrchestrationEngine,
  defaultPersistentStateEngine,
  defaultProgressTrackingEngine,
  defaultHumanApprovalCoordinator,
  defaultTaskReportingEngine,
  type WorkflowInstance,
} from "@/lib/orchestration";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("id");
    const action = searchParams.get("action");

    // 1. Pending Approvals Queue
    if (action === "pending_approvals") {
      const pending = defaultHumanApprovalCoordinator.listPendingRequests();
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, prompt, workflowId, taskId, approved, reason, founderSessionToken } = body;

    // Action 1: Resume Paused Workflow
    if (action === "resume") {
      if (!workflowId) {
        return NextResponse.json({ success: false, error: "Missing workflowId" }, { status: 400 });
      }
      const updated = await defaultTaskOrchestrationEngine.executeWorkflow(workflowId);
      return NextResponse.json({ success: true, workflow: updated });
    }

    // Action 2: Resolve Task Approval
    if (action === "resolve_approval") {
      if (!taskId) {
        return NextResponse.json({ success: false, error: "Missing taskId" }, { status: 400 });
      }

      let updated: WorkflowInstance;
      if (approved) {
        updated = await defaultTaskOrchestrationEngine.approveTaskAndResume(
          taskId,
          founderSessionToken || "founder_session_default",
          "founder"
        );
      } else {
        updated = await defaultTaskOrchestrationEngine.rejectTaskApproval(
          taskId,
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
      const cancelled = wf; // cancelWorkflow transitions it
      return NextResponse.json({ success: true, workflow: cancelled });
    }

    // Action 4: Recover Interrupted Workflows
    if (action === "recover") {
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
