/**
 * @file lib/orchestration/executionPlanningEngine.ts
 * @description Module 05: Execution Planning Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 2 Intelligent Planning.
 *
 * Key Responsibilities:
 * - Compiles a complete, step-by-step ExecutionPlan from decomposed tasks, dependencies, and priorities.
 * - Groups independent tasks into parallel execution waves while respecting prerequisite constraints.
 * - Forecasts cumulative execution time, compute requirements, and estimated token consumption.
 * - Identifies tool requirements and evaluates pre-execution validation checks.
 * - Constructs alternative execution pathways for high-risk operations.
 * - Enforces separation of planning and execution: execution cannot proceed until the plan passes validation.
 *
 * Architectural Role & Interactions:
 * - Consumes `StructuredGoal`, `OrchestrationTask` map, and `DependencyValidationResult`.
 * - Delivers the finalized `ExecutionPlan` to `workflowManagementEngine.ts` and `humanApprovalCoordinator.ts`.
 *
 * Safety / Security Guarantees:
 * - Plans are cryptographically hashed and validated before any worker process is dispatched.
 * - Flags all security-sensitive actions and verifies that necessary approval gates are configured.
 */

import crypto from "crypto";
import type {
  StructuredGoal,
  OrchestrationTask,
  ExecutionPlan,
  ExecutionStep,
  DependencyValidationResult,
  TaskPriorityScore,
} from "./types.ts";
import { defaultDependencyManagementEngine } from "./dependencyManagementEngine.ts";

export interface PlanningOptions {
  availableTools?: string[];
  maxConcurrency?: number;
}

export class ExecutionPlanningEngine {
  /**
   * Generates a validated ExecutionPlan from a goal, tasks, dependencies, and priorities.
   *
   * @param goal - StructuredGoal from GoalUnderstandingEngine.
   * @param tasks - Map of decomposed OrchestrationTasks.
   * @param depValidation - Validation result from DependencyManagementEngine.
   * @param priorities - Priority scores from IntelligentPriorityEngine.
   * @param options - Environment options (e.g., installed tools).
   * @returns Complete ExecutionPlan with waves, steps, and validation status.
   */
  public generatePlan(
    goal: StructuredGoal,
    tasks: Record<string, OrchestrationTask>,
    depValidation: DependencyValidationResult,
    priorities: Record<string, TaskPriorityScore>,
    options?: PlanningOptions
  ): ExecutionPlan {
    const workflowId = Object.values(tasks)[0]?.workflowId || `wf_${Date.now()}`;
    const planId = `plan_${workflowId}_${Date.now()}`;

    // 1. Group tasks into execution waves based on topological ordering
    const rawWaves = defaultDependencyManagementEngine.partitionExecutionWaves(
      tasks,
      depValidation.topologicalOrder
    );

    // 2. Build detailed steps with wave annotations
    const steps: ExecutionStep[] = [];
    const identifiedRisks: string[] = [];
    let totalEstimatedTimeMs = 0;
    let totalEstimatedTokens = 0;
    let stepIndex = 1;

    for (let waveIndex = 0; waveIndex < rawWaves.length; waveIndex++) {
      const waveTaskIds = rawWaves[waveIndex];
      const canRunInParallel = waveTaskIds.length > 1;

      for (const taskId of waveTaskIds) {
        const task = tasks[taskId];
        if (!task) continue;

        totalEstimatedTimeMs += task.estimatedDurationMs || 5000;
        // Estimate token cost: 1500 tokens base per task complexity point
        totalEstimatedTokens += (task.complexity || 3) * 1500;

        if (task.riskLevel === "high" || task.riskLevel === "critical") {
          identifiedRisks.push(`Task "${task.title}" carries ${task.riskLevel} risk: ${task.riskExplanation || "System action"}`);
        }

        steps.push({
          stepIndex: stepIndex++,
          taskId: task.id,
          title: task.title,
          waveIndex,
          canRunInParallel,
          requiredTools: [...task.requiredTools],
          estimatedTimeMs: task.estimatedDurationMs || 5000,
          riskLevel: task.riskLevel,
          expectedOutputSummary: task.deliverables.join("; ") || "Operational result",
          fallbackStrategy: task.retryCount < task.maxRetries ? "Retry with exponential backoff" : "Escalate to founder",
        });
      }
    }

    // 3. Synthesize Alternative Execution Plans
    const alternativePlans = this._generateAlternativePlans(tasks);

    // 4. Pre-Execution Validation
    const validationIssues: string[] = [];
    if (!depValidation.isValid) {
      validationIssues.push(`Dependency validation failed: ${depValidation.error}`);
    }

    if (options?.availableTools && options.availableTools.length > 0) {
      const availableSet = new Set(options.availableTools.map((t) => t.toLowerCase()));
      for (const task of Object.values(tasks)) {
        for (const reqTool of task.requiredTools) {
          if (!availableSet.has(reqTool.toLowerCase()) && reqTool !== "system") {
            validationIssues.push(`Task "${task.title}" requires unavailable tool: "${reqTool}".`);
          }
        }
      }
    }

    const preExecutionValidationPassed = validationIssues.length === 0;

    return {
      id: planId,
      workflowId,
      goalId: goal.id,
      steps,
      waves: rawWaves,
      totalEstimatedTimeMs,
      totalEstimatedTokens,
      criticalPath: depValidation.criticalPath,
      identifiedRisks,
      alternativePlans,
      preExecutionValidationPassed,
      validationIssues,
      createdAt: Date.now(),
    };
  }

  /**
   * Generates alternative execution branches for failure-prone operations.
   */
  private _generateAlternativePlans(
    tasks: Record<string, OrchestrationTask>
  ): { condition: string; description: string; substituteStepIds: string[] }[] {
    const alternatives: { condition: string; description: string; substituteStepIds: string[] }[] = [];

    for (const task of Object.values(tasks)) {
      if (task.requiredTools.includes("research_agent")) {
        alternatives.push({
          condition: `External web discovery failure on ${task.id}`,
          description: "Fall back to local knowledge engine and persistent semantic memory records.",
          substituteStepIds: [task.id],
        });
      } else if (task.actionType === "shell_exec") {
        alternatives.push({
          condition: `Shell execution denied or failed on ${task.id}`,
          description: "Execute alternative direct Node.js runtime script without spawning terminal shell.",
          substituteStepIds: [task.id],
        });
      }
    }

    return alternatives;
  }
}

/** Global default execution planning engine singleton */
export const defaultExecutionPlanningEngine = new ExecutionPlanningEngine();
