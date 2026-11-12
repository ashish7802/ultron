/**
 * @file lib/orchestration/orchestrator.ts
 * @description Master Task Orchestration Facade & Coordinator for the ULTRON Co-Founder System.
 *
 * Subsystem:
 * Central Task Orchestration Engine (Blueprint Section 7).
 *
 * Implements the Complete 10-Step Lifecycle:
 * 1. FOUNDER REQUEST
 * 2. GOAL UNDERSTANDING
 * 3. TASK DECOMPOSITION
 * 4. DEPENDENCY & PRIORITY ANALYSIS
 * 5. EXECUTION PLAN
 * 6. FOUNDER APPROVAL
 * 7. TASK EXECUTION (Sequential & Safe Parallel)
 * 8. PROGRESS MONITORING
 * 9. TASK VERIFICATION
 * 10. REPORT & STATE UPDATE -> FINAL STATUS: TASK COMPLETE (Only after verification).
 *
 * Architectural Role & Interactions:
 * - Unifies all 14 Section 7 modules under one coordinated interface.
 * - Called by Next.js API route `/api/orchestration` and conversational handlers in `app/api/chat/route.ts`.
 * - Coordinates with `lib/permissionGateway.ts` for security and authorization.
 *
 * Safety / Security Guarantees:
 * - Execution alone never means completion: only tasks whose outputs satisfy acceptance criteria are marked VERIFIED.
 * - Never bypasses approval gates: tasks requiring authorization pause until explicitly approved by the founder.
 * - Persistent checkpointing across all state transitions guarantees crash recovery.
 */

import type {
  StructuredGoal,
  WorkflowInstance,
  ExecutionPlan,
  TaskPriorityScore,
  WorkflowProgressReport,
  TaskReportingSummary,
  OrchestrationTask,
  VerificationEvidence,
} from "./types.ts";
import { understandGoal } from "./goalUnderstandingEngine.ts";
import { decomposeGoal } from "./taskDecompositionEngine.ts";
import { defaultDependencyManagementEngine } from "./dependencyManagementEngine.ts";
import { defaultPriorityEngine } from "./priorityEngine.ts";
import { defaultExecutionPlanningEngine } from "./executionPlanningEngine.ts";
import { defaultWorkflowManagementEngine } from "./workflowManagementEngine.ts";
import { defaultParallelCoordinationEngine } from "./parallelCoordinationEngine.ts";
import { defaultProgressTrackingEngine } from "./progressTrackingEngine.ts";
import { defaultFailureRetryEngine } from "./failureRetryEngine.ts";
import { defaultTaskVerificationEngine } from "./taskVerificationEngine.ts";
import { defaultPersistentStateEngine } from "./persistentStateEngine.ts";
import { defaultResourceManagementEngine } from "./resourceManagementEngine.ts";
import { defaultHumanApprovalCoordinator } from "./humanApprovalCoordinator.ts";
import { defaultTaskReportingEngine } from "./taskReportingEngine.ts";

export interface OrchestrationOptions {
  autoExecuteNonSensitive?: boolean;
  founderAssumptions?: string[];
  founderPriorityOverrides?: Record<string, number>;
  onProgress?: (progress: WorkflowProgressReport) => void;
  customTaskExecutor?: (task: OrchestrationTask) => Promise<unknown>;
}

export class TaskOrchestrationEngine {
  /**
   * Complete End-to-End Orchestration: Ingests a founder prompt, parses goals, decomposes tasks,
   * analyzes dependencies & priorities, generates an execution plan, and executes the workflow.
   *
   * @param founderPrompt - Raw natural language request.
   * @param options - Orchestration configuration options.
   * @returns Executed or planned WorkflowInstance and comprehensive report.
   */
  public async orchestrateGoal(
    founderPrompt: string,
    options?: OrchestrationOptions
  ): Promise<{
    workflow: WorkflowInstance;
    report: TaskReportingSummary;
    markdownBrief: string;
  }> {
    // ── STEP 1 & 2: FOUNDER REQUEST -> GOAL UNDERSTANDING ───────────────────
    const goal: StructuredGoal = understandGoal(founderPrompt, {
      founderAssumptions: options?.founderAssumptions,
    });

    const workflowId = `wf_${Date.now()}`;

    // ── STEP 3: TASK DECOMPOSITION ──────────────────────────────────────────
    const decomposition = decomposeGoal(goal, workflowId);

    // ── STEP 4: DEPENDENCY & PRIORITY ANALYSIS ──────────────────────────────
    const depValidation = defaultDependencyManagementEngine.validateGraph(decomposition.tasks);
    if (!depValidation.isValid) {
      throw new Error(`Graph validation failed during decomposition: ${depValidation.error}`);
    }

    const priorityScores = defaultPriorityEngine.calculatePriorities(decomposition.tasks, {
      criticalPathTaskIds: depValidation.criticalPath,
      founderOverrides: options?.founderPriorityOverrides,
    });

    // ── STEP 5: EXECUTION PLAN ──────────────────────────────────────────────
    const plan: ExecutionPlan = defaultExecutionPlanningEngine.generatePlan(
      goal,
      decomposition.tasks,
      depValidation,
      priorityScores
    );

    // ── STEP 6: WORKFLOW INITIALIZATION & CREATION ──────────────────────────
    let workflow = defaultWorkflowManagementEngine.createWorkflow(
      goal,
      decomposition.tasks,
      decomposition.milestones,
      plan
    );
    workflow.priorityScores = priorityScores;
    workflow = defaultPersistentStateEngine.saveWorkflow(workflow);

    // Check if auto-execution is disabled or if first task requires founder approval
    if (options?.autoExecuteNonSensitive === false) {
      const report = defaultTaskReportingEngine.generateReport(workflow);
      return {
        workflow,
        report,
        markdownBrief: defaultTaskReportingEngine.formatMarkdownReport(report),
      };
    }

    // ── STEPS 7 - 10: EXECUTION, MONITORING, VERIFICATION, & REPORTING ─────────
    workflow = await this.executeWorkflow(workflow.id, options);
    const report = defaultTaskReportingEngine.generateReport(workflow);

    return {
      workflow,
      report,
      markdownBrief: defaultTaskReportingEngine.formatMarkdownReport(report),
    };
  }

  /**
   * Executes a prepared workflow through its topological execution waves.
   *
   * @param workflowId - Unique workflow ID.
   * @param options - Execution options.
   * @returns Updated WorkflowInstance upon completion, pause, or failure.
   */
  public async executeWorkflow(
    workflowId: string,
    options?: OrchestrationOptions
  ): Promise<WorkflowInstance> {
    let workflow = defaultPersistentStateEngine.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow "${workflowId}" not found in persistent state.`);
    }

    if (workflow.state === "COMPLETED" || workflow.state === "CANCELLED") {
      return workflow;
    }

    // Transition to RUNNING
    if (workflow.state === "CREATED" || workflow.state === "PLANNING" || workflow.state === "PAUSED") {
      workflow = defaultWorkflowManagementEngine.transitionState(workflow, "RUNNING");
    }

    // Auto-synthesize execution plan if not already present
    if (!workflow.executionPlan) {
      const depValidation = defaultDependencyManagementEngine.validateGraph(workflow.tasks);
      const priorities = defaultPriorityEngine.calculatePriorities(workflow.tasks);
      workflow.executionPlan = defaultExecutionPlanningEngine.generatePlan(
        workflow.goal,
        workflow.tasks,
        depValidation,
        priorities
      );
    }

    const waves = workflow.executionPlan.waves;

    // Execute waves in sequential order; tasks within each wave execute in parallel
    for (let waveIdx = workflow.activeWaveIndex; waveIdx < waves.length; waveIdx++) {
      workflow.activeWaveIndex = waveIdx;
      const waveTaskIds = waves[waveIdx];

      // Filter tasks that are ready to run
      const tasksToRun: OrchestrationTask[] = [];

      for (const taskId of waveTaskIds) {
        const task = workflow.tasks[taskId];
        if (!task) continue;

        // Skip already verified or completed tasks (Idempotency)
        if (task.status === "VERIFIED" || defaultPersistentStateEngine.isTaskExecuted(workflow.id, taskId)) {
          continue;
        }

        // Check if dependencies are satisfied
        const check = defaultDependencyManagementEngine.canExecute(taskId, workflow.tasks);
        if (!check.eligible) {
          task.status = "BLOCKED";
          task.error = check.reason;
          if (!workflow.blockedTaskIds.includes(taskId)) {
            workflow.blockedTaskIds.push(taskId);
          }
          continue;
        }

        // Check if task requires Human Approval
        if (defaultHumanApprovalCoordinator.requiresApproval(task) && !task.executionGrantToken) {
          // Request approval and pause workflow
          await defaultHumanApprovalCoordinator.requestApproval(task);
          workflow = defaultWorkflowManagementEngine.transitionState(workflow, "PENDING_APPROVAL");
          workflow = defaultPersistentStateEngine.saveWorkflow(workflow);
          defaultPersistentStateEngine.createCheckpoint(workflow);

          if (options?.onProgress) {
            options.onProgress(defaultProgressTrackingEngine.getProgressReport(workflow));
          }

          // Return early; workflow will resume once approved
          return workflow;
        }

        tasksToRun.push(task);
      }

      if (tasksToRun.length === 0) {
        continue;
      }

      // Check tool availability
      for (const task of tasksToRun) {
        const toolCheck = defaultResourceManagementEngine.checkToolAvailability(task);
        if (!toolCheck.available) {
          task.status = "FAILED";
          task.error = `Missing required tools: [${toolCheck.missingTools.join(", ")}].`;
          if (!workflow.failedTaskIds.includes(task.id)) {
            workflow.failedTaskIds.push(task.id);
          }
        }
      }

      const activeTasks = tasksToRun.filter((t) => t.status !== "FAILED");

      // Execute wave concurrently via ParallelCoordinationEngine
      const waveResult = await defaultParallelCoordinationEngine.executeWave(
        activeTasks,
        waveIdx,
        async (task) => {
          if (options?.customTaskExecutor) {
            return await options.customTaskExecutor(task);
          }
          return await this._defaultTaskExecutor(task);
        }
      );

      // Verify each task output independently via TaskVerificationEngine
      for (const taskId of waveResult.successfulTasks) {
        const task = workflow.tasks[taskId];
        if (task) {
          const verification = defaultTaskVerificationEngine.verifyTask(task, task.output);
          if (verification.isVerified) {
            if (!workflow.completedTaskIds.includes(taskId)) {
              workflow.completedTaskIds.push(taskId);
            }
          } else {
            // Verification failed: trigger Failure & Retry Engine
            const incident = defaultFailureRetryEngine.handleFailure(task, task.error || "Verification failed");
            if (incident.willRetry) {
              task.status = "READY"; // Ready for retry
            } else {
              task.status = "FAILED";
              if (!workflow.failedTaskIds.includes(taskId)) {
                workflow.failedTaskIds.push(taskId);
              }
              defaultFailureRetryEngine.cascadeFailure(workflow, taskId);
            }
          }
        }
      }

      // Handle tasks that failed during execution
      for (const failed of waveResult.failedTasks) {
        const task = workflow.tasks[failed.taskId];
        if (task) {
          const incident = defaultFailureRetryEngine.handleFailure(task, failed.error);
          if (incident.willRetry) {
            task.status = "READY";
          } else {
            task.status = "FAILED";
            if (!workflow.failedTaskIds.includes(task.id)) {
              workflow.failedTaskIds.push(task.id);
            }
            defaultFailureRetryEngine.cascadeFailure(workflow, task.id);
          }
        }
      }

      // Persist state after wave execution
      workflow = defaultPersistentStateEngine.saveWorkflow(workflow);
      defaultPersistentStateEngine.createCheckpoint(workflow);

      // Emit Progress Update
      if (options?.onProgress) {
        options.onProgress(defaultProgressTrackingEngine.getProgressReport(workflow));
      }

      // If any critical task failed permanently, fail workflow
      if (workflow.failedTaskIds.length > 0) {
        const hasBlockingFailures = workflow.failedTaskIds.some((fid) => {
          return workflow!.tasks[fid]?.riskLevel === "critical" || workflow!.tasks[fid]?.complexity >= 7;
        });

        if (hasBlockingFailures) {
          workflow = defaultWorkflowManagementEngine.transitionState(workflow, "FAILED");
          return workflow;
        }
      }
    }

    // ── STEP 9 & 10: FINAL COMPLETION EVALUATION ────────────────────────────
    const allTasks = Object.values(workflow.tasks);
    const allVerified = allTasks.every((t) => t.status === "VERIFIED");

    if (allVerified && allTasks.length > 0) {
      workflow = defaultWorkflowManagementEngine.transitionState(workflow, "COMPLETED");
    } else if (workflow.failedTaskIds.length > 0) {
      workflow = defaultWorkflowManagementEngine.transitionState(workflow, "FAILED");
    }

    workflow = defaultPersistentStateEngine.saveWorkflow(workflow);
    defaultPersistentStateEngine.createCheckpoint(workflow);

    return workflow;
  }

  /**
   * Approves a paused task awaiting founder authorization and resumes workflow execution.
   *
   * @param taskId - Target task ID.
   * @param founderSessionToken - Active founder session token.
   * @param founderRole - Identity role.
   * @returns Resumed WorkflowInstance.
   */
  public async approveTaskAndResume(
    taskId: string,
    founderSessionToken: string = "founder_session_default",
    founderRole: string = "founder"
  ): Promise<WorkflowInstance> {
    const req = defaultHumanApprovalCoordinator.getRequestForTask(taskId);
    if (!req) {
      throw new Error(`No pending approval request found for task "${taskId}".`);
    }

    // Resolve approval
    const resolved = await defaultHumanApprovalCoordinator.resolveApproval(
      req.requestId,
      true,
      founderSessionToken,
      founderRole
    );

    const workflow = defaultPersistentStateEngine.getWorkflow(req.workflowId);
    if (!workflow) {
      throw new Error(`Workflow "${req.workflowId}" not found.`);
    }

    const task = workflow.tasks[taskId];
    if (task) {
      task.executionGrantToken = resolved.executionGrantToken || undefined;
      task.status = "READY";
    }

    workflow.state = "RUNNING";
    defaultPersistentStateEngine.saveWorkflow(workflow);

    // Resume execution
    return await this.executeWorkflow(workflow.id);
  }

  /**
   * Rejects an approval request and cancels or fails the task.
   */
  public async rejectTaskApproval(
    taskId: string,
    reason: string = "Rejected by founder."
  ): Promise<WorkflowInstance> {
    const req = defaultHumanApprovalCoordinator.getRequestForTask(taskId);
    if (!req) {
      throw new Error(`No pending approval request found for task "${taskId}".`);
    }

    await defaultHumanApprovalCoordinator.resolveApproval(
      req.requestId,
      false,
      "founder_session_default",
      "founder",
      reason
    );

    const workflow = defaultPersistentStateEngine.getWorkflow(req.workflowId);
    if (!workflow) {
      throw new Error(`Workflow "${req.workflowId}" not found.`);
    }

    const task = workflow.tasks[taskId];
    if (task) {
      task.status = "FAILED";
      task.error = `Approval rejected: ${reason}`;
      workflow.failedTaskIds.push(taskId);
    }

    return defaultPersistentStateEngine.saveWorkflow(workflow);
  }

  /**
   * Default mock execution simulation for tasks without external handlers.
   */
  private async _defaultTaskExecutor(task: OrchestrationTask): Promise<unknown> {
    defaultResourceManagementEngine.recordTokenUsage((task.complexity || 3) * 1500);

    return {
      success: true,
      exitCode: 0,
      output: `Executed ${task.title} successfully.`,
      deliverables: task.deliverables,
      timestamp: Date.now(),
    };
  }
}

/** Global default task orchestration engine singleton */
export const defaultTaskOrchestrationEngine = new TaskOrchestrationEngine();
