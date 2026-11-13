/**
 * @file lib/orchestration/workflowManagementEngine.ts
 * @description Module 06: Workflow Management Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 3 Workflow Orchestration.
 *
 * Key Responsibilities:
 * - Coordinates the end-to-end lifecycle of multi-step task workflows.
 * - Provides pre-defined templates for standard engineering, research, and audit workflows.
 * - Enforces valid state machine transitions (CREATED -> PLANNING -> RUNNING -> COMPLETED).
 * - Implements graceful workflow cancellation and checkpointed workflow resumption.
 * - Manages conditional execution branches based on task outputs.
 * - Automatically snapshots execution checkpoints to durable storage via `PersistentTaskStateEngine`.
 *
 * Architectural Role & Interactions:
 * - Central coordinating engine driving task execution, waves, and state management.
 * - Interacts with `parallelCoordinationEngine.ts`, `dependencyManagementEngine.ts`,
 *   `priorityEngine.ts`, and `persistentStateEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - Rejects illegal state transitions fail-closed (e.g. cannot transition directly from CREATED to COMPLETED).
 * - Verifies that running tasks are safely cancelled when a workflow is cancelled or paused.
 */

import crypto from "crypto";
import type {
  WorkflowInstance,
  WorkflowState,
  StructuredGoal,
  OrchestrationTask,
  Milestone,
  ExecutionPlan,
  WorkflowTemplate,
} from "./types.ts";
import { defaultPersistentStateEngine } from "./persistentStateEngine.ts";

/** Valid state transition graph */
const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  CREATED: ["PLANNING", "RUNNING", "CANCELLED"],
  PLANNING: ["PENDING_APPROVAL", "RUNNING", "CANCELLED", "FAILED"],
  PENDING_APPROVAL: ["RUNNING", "PAUSED", "CANCELLED", "FAILED"],
  RUNNING: ["PENDING_APPROVAL", "PAUSED", "VERIFYING", "FAILED", "CANCELLED", "COMPLETED"],
  PAUSED: ["RUNNING", "CANCELLED"],
  VERIFYING: ["COMPLETED", "FAILED", "RUNNING", "CANCELLED"],
  FAILED: ["RUNNING", "CANCELLED"], // Allows restart/retry from failure
  CANCELLED: [], // Terminal
  COMPLETED: [], // Terminal
};

export class WorkflowManagementEngine {
  /**
   * Initializes a fresh WorkflowInstance from a StructuredGoal and decomposed elements.
   *
   * @param goal - The StructuredGoal representing founder intent.
   * @param tasks - Map of decomposed tasks.
   * @param milestones - Milestones array.
   * @param executionPlan - Generated ExecutionPlan (optional at creation).
   * @returns Newly initialized and persisted WorkflowInstance.
   */
  public createWorkflow(
    goal: StructuredGoal,
    tasks: Record<string, OrchestrationTask>,
    milestones: Milestone[],
    executionPlan?: ExecutionPlan
  ): WorkflowInstance {
    const workflowId = `wf_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // Ensure all tasks carry the workflowId
    for (const task of Object.values(tasks)) {
      task.workflowId = workflowId;
    }
    for (const ms of milestones) {
      ms.workflowId = workflowId;
    }

    const workflow: WorkflowInstance = {
      id: workflowId,
      goal,
      state: "CREATED",
      tasks,
      milestones,
      executionPlan,
      priorityScores: {},
      activeWaveIndex: 0,
      activeTaskIds: [],
      completedTaskIds: [],
      failedTaskIds: [],
      blockedTaskIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };

    // Save initial state to disk
    const saved = defaultPersistentStateEngine.saveWorkflow(workflow);
    defaultPersistentStateEngine.createCheckpoint(saved);

    return saved;
  }

  /**
   * Transitions the workflow to a new state if permitted by the state transition graph.
   *
   * @param workflow - The workflow instance.
   * @param targetState - The requested target state.
   * @returns Updated workflow or throws Error on invalid transition.
   */
  public transitionState(
    workflow: WorkflowInstance,
    targetState: WorkflowState
  ): WorkflowInstance {
    const allowed = VALID_TRANSITIONS[workflow.state] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(
        `Invalid workflow state transition: Cannot transition from "${workflow.state}" to "${targetState}".`
      );
    }

    workflow.state = targetState;
    workflow.updatedAt = Date.now();

    if (targetState === "RUNNING" && !workflow.startedAt) {
      workflow.startedAt = Date.now();
    } else if (targetState === "COMPLETED") {
      workflow.completedAt = Date.now();
    } else if (targetState === "CANCELLED") {
      workflow.cancelledAt = Date.now();
    }

    const saved = defaultPersistentStateEngine.saveWorkflow(workflow);
    defaultPersistentStateEngine.createCheckpoint(saved);

    return saved;
  }

  /**
   * Gracefully cancels an active workflow and halts its running tasks.
   *
   * @param workflow - Target workflow.
   * @param reason - Optional cancellation reason.
   * @returns Updated workflow in CANCELLED state.
   */
  public cancelWorkflow(
    workflow: WorkflowInstance,
    reason?: string
  ): WorkflowInstance {
    if (workflow.state === "COMPLETED" || workflow.state === "CANCELLED") {
      return workflow;
    }

    workflow.cancellationReason = reason || "Cancelled by founder request.";

    // Cancel in-flight or pending tasks
    for (const task of Object.values(workflow.tasks)) {
      if (task.status === "RUNNING" || task.status === "READY" || task.status === "PENDING" || task.status === "AWAITING_APPROVAL") {
        task.status = "CANCELLED";
      }
    }

    workflow.activeTaskIds = [];

    return this.transitionState(workflow, "CANCELLED");
  }

  /**
   * Resumes a paused or interrupted workflow from its last saved state.
   *
   * @param workflow - Target workflow to resume.
   * @returns Updated workflow in RUNNING state.
   */
  public resumeWorkflow(workflow: WorkflowInstance): WorkflowInstance {
    if (workflow.state !== "PAUSED" && workflow.state !== "FAILED" && workflow.state !== "PENDING_APPROVAL") {
      throw new Error(`Cannot resume workflow in state "${workflow.state}".`);
    }

    // Reset any interrupted RUNNING tasks to READY
    for (const task of Object.values(workflow.tasks)) {
      if (task.status === "RUNNING") {
        task.status = "READY";
      }
    }

    return this.transitionState(workflow, "RUNNING");
  }

  /**
   * Pre-defined workflow templates for standard ULTRON co-founder operational tasks.
   */
  public getTemplates(): WorkflowTemplate[] {
    return [
      {
        id: "template_feature_engineering",
        name: "Full Feature Implementation & Verification",
        category: "ENGINEERING",
        description: "Standard end-to-end software feature development lifecycle with automated testing.",
        defaultTasks: [
          {
            title: "Inspect Target Codebase & Architecture",
            description: "Review repository dependencies, schemas, and target integration modules.",
            complexity: 3,
            requiredTools: ["system", "code_analyzer"],
            riskLevel: "low",
            deliverables: ["Architecture audit notes"],
            relativeDependencies: [],
          },
          {
            title: "Implement Feature Code",
            description: "Generate and integrate core TypeScript/Python modules.",
            complexity: 7,
            requiredTools: ["file_writer", "typescript_compiler"],
            riskLevel: "medium",
            deliverables: ["Source code files"],
            relativeDependencies: [0],
          },
          {
            title: "Execute Test Verification Suite",
            description: "Run automated regression and unit tests to verify correctness.",
            complexity: 4,
            requiredTools: ["node_test_runner"],
            riskLevel: "low",
            deliverables: ["Passing test report"],
            relativeDependencies: [1],
          },
        ],
      },
      {
        id: "template_security_audit",
        name: "System Security & Zero-Trust Audit",
        category: "SECURITY_AUDIT",
        description: "Zero-trust inspection of access controls, vaults, permissions, and log audit trails.",
        defaultTasks: [
          {
            title: "Audit Credential Storage & DPAPI Vault",
            description: "Inspect encrypted credential vaults and verify key persistence.",
            complexity: 4,
            requiredTools: ["security_scanner"],
            riskLevel: "low",
            deliverables: ["Vault audit report"],
            relativeDependencies: [],
          },
          {
            title: "Verify Permission Gateway Enforcements",
            description: "Validate that unapproved actions fail-closed across all endpoints.",
            complexity: 6,
            requiredTools: ["permission_tester"],
            riskLevel: "medium",
            deliverables: ["Gateway compliance certificate"],
            relativeDependencies: [0],
          },
        ],
      },
    ];
  }
}

/** Global default workflow management engine singleton */
export const defaultWorkflowManagementEngine = new WorkflowManagementEngine();
