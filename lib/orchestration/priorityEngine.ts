/**
 * @file lib/orchestration/priorityEngine.ts
 * @description Module 04: Intelligent Priority Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 2 Intelligent Planning.
 *
 * Key Responsibilities:
 * - Computes multi-factor priority scores (0-100) and discrete priority tiers (CRITICAL, HIGH, MEDIUM, LOW).
 * - Incorporates Urgency, Business Impact, Deadline Proximity, Critical Path Status, and Founder Overrides.
 * - Boosts priority for bottleneck tasks that unblock multiple downstream operations.
 * - Manages risk-weighted priority adjustments.
 * - Resolves priority ties deterministically using critical path depth and creation timestamps.
 * - Recalculates priorities dynamically whenever dependencies complete or deadlines shift.
 *
 * Architectural Role & Interactions:
 * - Receives tasks and critical path data from `dependencyManagementEngine.ts`.
 * - Emits priority scores to `executionPlanningEngine.ts` and `workflowManagementEngine.ts`
 *   to determine execution dispatch order.
 *
 * Safety / Security Guarantees:
 * - Deterministic, non-random calculations guarantee reproducible execution order.
 * - Founder-defined priority weights take precedence over automated heuristic inferences.
 */

import type {
  OrchestrationTask,
  TaskPriorityScore,
  PriorityLevel,
} from "./types.ts";

export interface PriorityCalculationOptions {
  founderOverrides?: Record<string, number>; // taskId -> custom score 0..100
  globalDeadlineTimestamp?: number;
  criticalPathTaskIds?: string[];
}

export class IntelligentPriorityEngine {
  /**
   * Calculates comprehensive priority scores for all tasks in a workflow.
   *
   * @param tasks - Map of tasks to evaluate.
   * @param options - Contextual options including critical path and founder overrides.
   * @returns Map of taskId to TaskPriorityScore.
   */
  public calculatePriorities(
    tasks: Record<string, OrchestrationTask>,
    options?: PriorityCalculationOptions
  ): Record<string, TaskPriorityScore> {
    const scores: Record<string, TaskPriorityScore> = {};
    const criticalPathSet = new Set(options?.criticalPathTaskIds || []);
    const founderOverrides = options?.founderOverrides || {};

    // Count how many tasks depend on each task (Downstream unblock power)
    const downstreamCounts = new Map<string, number>();
    for (const task of Object.values(tasks)) {
      for (const dep of task.dependencies) {
        downstreamCounts.set(dep, (downstreamCounts.get(dep) || 0) + 1);
      }
    }

    for (const task of Object.values(tasks)) {
      scores[task.id] = this._scoreTask(
        task,
        criticalPathSet.has(task.id),
        downstreamCounts.get(task.id) || 0,
        founderOverrides[task.id],
        options?.globalDeadlineTimestamp
      );
    }

    return scores;
  }

  /**
   * Evaluates and scores an individual task.
   */
  private _scoreTask(
    task: OrchestrationTask,
    isOnCriticalPath: boolean,
    downstreamCount: number,
    founderOverride?: number,
    deadlineTimestamp?: number
  ): TaskPriorityScore {
    // 1. Urgency Score (0 - 25)
    let urgencyScore = 15;
    if (deadlineTimestamp) {
      const now = Date.now();
      const timeLeftMs = deadlineTimestamp - now;
      if (timeLeftMs <= 0) {
        urgencyScore = 25; // Overdue
      } else if (timeLeftMs < 60000) {
        urgencyScore = 24; // Less than 1 minute
      } else if (timeLeftMs < 300000) {
        urgencyScore = 20; // Less than 5 minutes
      } else {
        urgencyScore = Math.max(5, Math.min(25, 25 - Math.floor(timeLeftMs / 60000)));
      }
    }

    // 2. Importance & Business Impact (0 - 25)
    const businessImpactScore =
      task.complexity >= 8 ? 24 : task.complexity >= 5 ? 18 : 10;

    // 3. Critical Path & Downstream Boost (0 - 25)
    let criticalPathBoost = 0;
    if (isOnCriticalPath) {
      criticalPathBoost += 15;
    }
    criticalPathBoost += Math.min(10, downstreamCount * 3); // Up to +10 for bottleneck nodes

    // 4. Risk-based prioritization (0 - 15)
    const riskScore =
      task.riskLevel === "critical"
        ? 15
        : task.riskLevel === "high"
          ? 12
          : task.riskLevel === "medium"
            ? 9
            : 5;

    // 5. Founder Priority Weight (0 - 10)
    let founderWeight = 5;
    if (founderOverride !== undefined) {
      founderWeight = Math.min(10, Math.floor(founderOverride / 10));
    }

    // Total raw score (0 - 100)
    let totalScore = urgencyScore + businessImpactScore + criticalPathBoost + riskScore + founderWeight;

    // Apply explicit founder override if supplied
    if (founderOverride !== undefined) {
      totalScore = Math.min(100, Math.max(0, founderOverride));
    } else {
      totalScore = Math.min(100, Math.max(0, totalScore));
    }

    // Determine discrete Priority Level
    const level: PriorityLevel =
      totalScore >= 80
        ? "CRITICAL"
        : totalScore >= 60
          ? "HIGH"
          : totalScore >= 35
            ? "MEDIUM"
            : "LOW";

    return {
      taskId: task.id,
      level,
      totalScore,
      urgencyScore,
      importanceScore: businessImpactScore,
      businessImpactScore,
      criticalPathBoost,
      founderPriorityWeight: founderWeight,
      deadlineScore: urgencyScore,
      riskScore,
      calculatedAt: Date.now(),
    };
  }

  /**
   * Sorts candidate task IDs in descending priority order with deterministic tie-breaking.
   *
   * @param taskIds - Array of task IDs.
   * @param scores - Map of task priority scores.
   * @param tasks - Map of tasks (for tie-breaking on creation time).
   * @returns Sorted task IDs.
   */
  public sortTasksByPriority(
    taskIds: string[],
    scores: Record<string, TaskPriorityScore>,
    tasks: Record<string, OrchestrationTask>
  ): string[] {
    return [...taskIds].sort((a, b) => {
      const scoreA = scores[a]?.totalScore || 0;
      const scoreB = scores[b]?.totalScore || 0;

      // 1. Primary: totalScore descending
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // 2. Secondary: Critical path status
      const cpA = scores[a]?.criticalPathBoost || 0;
      const cpB = scores[b]?.criticalPathBoost || 0;
      if (cpA !== cpB) {
        return cpB - cpA;
      }

      // 3. Tertiary: Creation time ascending (FIFO tie breaker)
      const timeA = tasks[a]?.createdAt || 0;
      const timeB = tasks[b]?.createdAt || 0;
      return timeA - timeB;
    });
  }
}

/** Global default intelligent priority engine singleton */
export const defaultPriorityEngine = new IntelligentPriorityEngine();
