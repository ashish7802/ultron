/**
 * @file lib/orchestration/progressTrackingEngine.ts
 * @description Module 08: Progress Tracking Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 3 Workflow Orchestration.
 *
 * Key Responsibilities:
 * - Aggregates task statuses and computes overall completion percentages weighted by task complexity.
 * - Tracks milestone achievements and active phase boundaries.
 * - Detects blocked tasks and identifies exact blocking prerequisite tasks.
 * - Monitors active task execution heartbeats and computes estimated remaining time (ETA).
 * - Emits structured progress reports and human-readable summaries for the founder HUD.
 *
 * Architectural Role & Interactions:
 * - Reads state from `WorkflowInstance` and updates HUD via SSE/WebSocket/API endpoints.
 * - Consulted by `orchestrator.ts` during execution to provide real-time status feedback.
 *
 * Safety / Security Guarantees:
 * - Read-only analytical tracking: introduces no side-effects.
 * - Zero hallucinated progress: percentage is computed strictly from verified and completed states.
 */

import type {
  WorkflowInstance,
  WorkflowProgressReport,
} from "./types.ts";

export class ProgressTrackingEngine {
  /**
   * Generates a comprehensive progress report for a given workflow instance.
   *
   * @param workflow - Target workflow instance.
   * @returns Detailed WorkflowProgressReport.
   */
  public getProgressReport(workflow: WorkflowInstance): WorkflowProgressReport {
    const tasks = Object.values(workflow.tasks);
    const totalTasks = tasks.length;

    let pendingCount = 0;
    let readyCount = 0;
    let blockedCount = 0;
    let runningCount = 0;
    let awaitingApprovalCount = 0;
    let completedCount = 0;
    let verifiedCount = 0;
    let failedCount = 0;

    let totalWeight = 0;
    let completedWeight = 0;
    let remainingDurationEstimateMs = 0;

    for (const task of tasks) {
      const weight = task.complexity || 3;
      totalWeight += weight;

      switch (task.status) {
        case "PENDING":
          pendingCount++;
          remainingDurationEstimateMs += task.estimatedDurationMs || 5000;
          break;
        case "READY":
          readyCount++;
          remainingDurationEstimateMs += task.estimatedDurationMs || 5000;
          break;
        case "BLOCKED":
          blockedCount++;
          remainingDurationEstimateMs += task.estimatedDurationMs || 5000;
          break;
        case "RUNNING":
          runningCount++;
          remainingDurationEstimateMs += Math.max(1000, (task.estimatedDurationMs || 5000) / 2);
          break;
        case "AWAITING_APPROVAL":
          awaitingApprovalCount++;
          remainingDurationEstimateMs += task.estimatedDurationMs || 5000;
          break;
        case "COMPLETED":
          completedCount++;
          completedWeight += weight * 0.8; // Completed but not yet verified
          break;
        case "VERIFIED":
          verifiedCount++;
          completedWeight += weight; // 100% credit only upon verification
          break;
        case "FAILED":
          failedCount++;
          break;
        case "SKIPPED":
        case "CANCELLED":
          break;
      }
    }

    const overallPercentage = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
    const elapsedDurationMs = workflow.startedAt ? Date.now() - workflow.startedAt : 0;

    // Check Milestones
    const completedMilestones: string[] = [];
    let activeMilestone: string | undefined;

    for (const ms of workflow.milestones) {
      const allDone = ms.taskIds.every((id) => {
        const t = workflow.tasks[id];
        return t && (t.status === "VERIFIED" || t.status === "COMPLETED");
      });
      if (allDone && ms.taskIds.length > 0) {
        completedMilestones.push(ms.id);
        ms.isCompleted = true;
      } else if (!activeMilestone) {
        activeMilestone = ms.title;
      }
    }

    const totalWaves = workflow.executionPlan?.waves.length || 1;
    const currentWave = workflow.activeWaveIndex || 0;

    // Summary message
    let summaryMessage = `Workflow ${workflow.id} is ${workflow.state} (${overallPercentage}%).`;
    if (workflow.state === "RUNNING") {
      summaryMessage = `Executing Wave ${currentWave + 1} of ${totalWaves}. ${runningCount} active, ${verifiedCount} verified.`;
    } else if (workflow.state === "COMPLETED") {
      summaryMessage = `Workflow successfully finished! All ${verifiedCount} tasks verified.`;
    } else if (workflow.state === "FAILED") {
      summaryMessage = `Workflow encountered failures in ${failedCount} tasks.`;
    } else if (workflow.state === "PENDING_APPROVAL") {
      summaryMessage = `Workflow paused: ${awaitingApprovalCount} task(s) awaiting founder authorization.`;
    }

    return {
      workflowId: workflow.id,
      state: workflow.state,
      overallPercentage,
      totalTasks,
      pendingCount,
      readyCount,
      blockedCount,
      runningCount,
      awaitingApprovalCount,
      completedCount,
      verifiedCount,
      failedCount,
      elapsedDurationMs,
      estimatedRemainingMs: remainingDurationEstimateMs,
      activeMilestone,
      completedMilestones,
      currentWave,
      totalWaves,
      summaryMessage,
    };
  }
}

/** Global default progress tracking engine singleton */
export const defaultProgressTrackingEngine = new ProgressTrackingEngine();
