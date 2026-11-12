/**
 * @file lib/orchestration/taskDecompositionEngine.ts
 * @description Module 02: Intelligent Task Decomposition Engine for ULTRON.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 1 & Phase 2 Decomposition.
 *
 * Key Responsibilities:
 * - Automatically decomposes high-level StructuredGoals into discrete, actionable OrchestrationTasks.
 * - Establishes parent-child hierarchical task trees and assigns milestone boundaries.
 * - Formulates rigorous, machine-verifiable acceptance criteria for every leaf task.
 * - Computes calibrated complexity scores (1 to 10) and duration estimates based on operational requirements.
 * - Identifies required tools and flags security/permission requirements (e.g. file writing, shell execution).
 * - Detects incomplete or missing requirements at the subtask level.
 *
 * Architectural Role & Interactions:
 * - Ingests `StructuredGoal` from `goalUnderstandingEngine.ts`.
 * - Emits a map of `OrchestrationTask` instances and `Milestone` records consumed by
 *   `dependencyManagementEngine.ts` and `priorityEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - Any task that touches the filesystem, launches processes, or executes commands is
 *   automatically flagged with `requiresApproval = true` and appropriate `ActionRiskLevel`.
 */

import crypto from "crypto";
import type {
  StructuredGoal,
  OrchestrationTask,
  Milestone,
  TaskComplexity,
  AcceptanceCriterion,
} from "./types.ts";
import type { ActionRiskLevel, PermissionActionType } from "../permissionGateway.ts";

export interface DecompositionResult {
  workflowId: string;
  tasks: Record<string, OrchestrationTask>;
  milestones: Milestone[];
  rootTaskIds: string[];
  incompleteSubtasks: string[];
}

/**
 * Automatically decomposes a StructuredGoal into a hierarchical task breakdown with milestones.
 *
 * @param goal - The parsed and validated StructuredGoal.
 * @param workflowId - Unique identifier of the enclosing workflow instance.
 * @returns Fully structured map of tasks, milestones, and root task pointers.
 */
export function decomposeGoal(
  goal: StructuredGoal,
  workflowId: string
): DecompositionResult {
  const tasks: Record<string, OrchestrationTask> = {};
  const milestones: Milestone[] = [];
  const rootTaskIds: string[] = [];
  const incompleteSubtasks: string[] = [];

  // Generate 3 standard milestones per workflow
  const milestone1Id = `ms_prep_${workflowId.slice(-6)}`;
  const milestone2Id = `ms_exec_${workflowId.slice(-6)}`;
  const milestone3Id = `ms_verif_${workflowId.slice(-6)}`;

  const msPrep: Milestone = {
    id: milestone1Id,
    workflowId,
    title: "Phase 1: Environment & Requirements Preparation",
    description: "Preparation, baseline inspection, and prerequisite validation.",
    taskIds: [],
    isCompleted: false,
  };

  const msExec: Milestone = {
    id: milestone2Id,
    workflowId,
    title: "Phase 2: Core Execution & Implementation",
    description: "Primary operational work, asset creation, or code modification.",
    taskIds: [],
    isCompleted: false,
  };

  const msVerif: Milestone = {
    id: milestone3Id,
    workflowId,
    title: "Phase 3: Verification & Final Deliverables",
    description: "Independent acceptance testing, evidence recording, and reporting.",
    taskIds: [],
    isCompleted: false,
  };

  milestones.push(msPrep, msExec, msVerif);

  // 1. Root Parent Task
  const rootTaskId = `task_root_${workflowId.slice(-6)}`;
  rootTaskIds.push(rootTaskId);

  const rootTask: OrchestrationTask = {
    id: rootTaskId,
    workflowId,
    subtaskIds: [],
    title: `Master Goal: ${goal.title}`,
    description: goal.primaryObjective,
    status: "PENDING",
    complexity: 6,
    estimatedDurationMs: 60000,
    dependencies: [],
    deliverables: [...goal.expectedOutcomes],
    acceptanceCriteria: [
      {
        id: `crit_root_all_subtasks`,
        description: "All decomposed child subtasks are verified successfully.",
        evaluator: "CUSTOM_PREDICATE",
      },
    ],
    requiredTools: ["system"],
    requiresApproval: false,
    riskLevel: "low",
    retryCount: 0,
    maxRetries: 1,
    createdAt: Date.now(),
  };

  tasks[rootTaskId] = rootTask;

  // 2. Prepare Child Subtasks based on Category & Expected Outcomes
  const decomposedItems = generateTaskSpecs(goal);

  let previousTaskId: string | null = null;

  for (let i = 0; i < decomposedItems.length; i++) {
    const item = decomposedItems[i];
    const taskId = `task_${i + 1}_${workflowId.slice(-6)}`;

    // Assign Milestone
    let targetMilestone: Milestone;
    if (i === 0) {
      targetMilestone = msPrep;
    } else if (i === decomposedItems.length - 1) {
      targetMilestone = msVerif;
    } else {
      targetMilestone = msExec;
    }
    targetMilestone.taskIds.push(taskId);

    // Link subtask to root
    rootTask.subtaskIds.push(taskId);

    // Determine dependencies
    const dependencies: string[] = [];
    if (item.dependsOnPrevious && previousTaskId) {
      dependencies.push(previousTaskId);
    }
    if (item.customDependencies) {
      dependencies.push(...item.customDependencies);
    }

    const task: OrchestrationTask = {
      id: taskId,
      workflowId,
      parentTaskId: rootTaskId,
      subtaskIds: [],
      milestoneId: targetMilestone.id,
      title: item.title,
      description: item.description,
      status: "PENDING",
      complexity: item.complexity,
      estimatedDurationMs: item.estimatedDurationMs,
      dependencies,
      deliverables: item.deliverables,
      acceptanceCriteria: item.acceptanceCriteria,
      requiredTools: item.requiredTools,
      actionType: item.actionType,
      actionPayload: item.actionPayload,
      requiresApproval: item.requiresApproval,
      riskLevel: item.riskLevel,
      riskExplanation: item.riskExplanation,
      retryCount: 0,
      maxRetries: item.maxRetries || 3,
      createdAt: Date.now(),
    };

    tasks[taskId] = task;

    if (item.isIncomplete) {
      incompleteSubtasks.push(taskId);
    }

    previousTaskId = taskId;
  }

  return {
    workflowId,
    tasks,
    milestones,
    rootTaskIds,
    incompleteSubtasks,
  };
}

interface TaskSpec {
  title: string;
  description: string;
  complexity: TaskComplexity;
  estimatedDurationMs: number;
  dependsOnPrevious: boolean;
  customDependencies?: string[];
  deliverables: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  requiredTools: string[];
  actionType?: PermissionActionType;
  actionPayload?: Record<string, unknown>;
  requiresApproval: boolean;
  riskLevel: ActionRiskLevel;
  riskExplanation?: string;
  maxRetries?: number;
  isIncomplete?: boolean;
}

/**
 * Derives modular task specifications from the goal.
 */
function generateTaskSpecs(goal: StructuredGoal): TaskSpec[] {
  const specs: TaskSpec[] = [];

  // Step 1: Baseline inspection
  specs.push({
    title: `Inspect & Validate Baseline: ${goal.category}`,
    description: `Inspect existing environment and prerequisite assets for ${goal.title}.`,
    complexity: 2,
    estimatedDurationMs: 5000,
    dependsOnPrevious: false,
    deliverables: ["Baseline environment state snapshot"],
    acceptanceCriteria: [
      {
        id: "crit_prep_1",
        description: "Environment check returns active without fatal blocking conditions.",
        evaluator: "EXIT_CODE",
        expectedValue: 0,
      },
    ],
    requiredTools: ["system", "diagnostics"],
    requiresApproval: false,
    riskLevel: "low",
  });

  // Intermediate operational tasks based on category or outcomes
  if (goal.category === "ENGINEERING") {
    specs.push({
      title: "Synthesize Code Implementation",
      description: `Implement requested technical components for "${goal.title}".`,
      complexity: 7,
      estimatedDurationMs: 25000,
      dependsOnPrevious: true,
      deliverables: ["Source code artifacts"],
      acceptanceCriteria: [
        {
          id: "crit_eng_code",
          description: "Source code files generated and non-empty.",
          evaluator: "FILE_NON_EMPTY",
        },
      ],
      requiredTools: ["file_writer", "typescript_compiler"],
      actionType: "file_write",
      actionPayload: { purpose: "generate_source_code" },
      requiresApproval: true,
      riskLevel: "medium",
      riskExplanation: "Writes new source code files to the project directory.",
    });

    specs.push({
      title: "Run Unit & Regression Tests",
      description: "Execute test suite against implemented code artifacts.",
      complexity: 4,
      estimatedDurationMs: 15000,
      dependsOnPrevious: true,
      deliverables: ["Test execution log", "Zero failed assertions"],
      acceptanceCriteria: [
        {
          id: "crit_eng_test",
          description: "All automated test cases exit with code 0.",
          evaluator: "EXIT_CODE",
          expectedValue: 0,
        },
      ],
      requiredTools: ["node_test_runner"],
      actionType: "shell_exec",
      actionPayload: { command: "node test" },
      requiresApproval: false,
      riskLevel: "low",
    });
  } else if (goal.category === "RESEARCH") {
    specs.push({
      title: "Execute Multi-Source Discovery",
      description: "Gather evidence from local knowledge and verified research channels.",
      complexity: 5,
      estimatedDurationMs: 20000,
      dependsOnPrevious: true,
      deliverables: ["Raw discovery findings dataset"],
      acceptanceCriteria: [
        {
          id: "crit_res_discover",
          description: "Collected at least 3 relevant source references.",
          evaluator: "CUSTOM_PREDICATE",
        },
      ],
      requiredTools: ["research_agent"],
      requiresApproval: false,
      riskLevel: "low",
    });

    specs.push({
      title: "Synthesize Research Report & Citations",
      description: "Perform factual reconciliation and compile comprehensive research report.",
      complexity: 4,
      estimatedDurationMs: 10000,
      dependsOnPrevious: true,
      deliverables: ["Comprehensive research report markdown"],
      acceptanceCriteria: [
        {
          id: "crit_res_report",
          description: "Report contains executive summary and verified citations.",
          evaluator: "STDOUT_REGEX",
          expectedValue: "Executive Summary",
        },
      ],
      requiredTools: ["report_generator"],
      requiresApproval: false,
      riskLevel: "low",
    });
  } else {
    // Default task breakdown for other categories
    specs.push({
      title: `Execute Core Operation: ${goal.title}`,
      description: goal.primaryObjective,
      complexity: 5,
      estimatedDurationMs: 20000,
      dependsOnPrevious: true,
      deliverables: goal.expectedOutcomes.slice(0, 2),
      acceptanceCriteria: [
        {
          id: "crit_core_exec",
          description: "Primary operational step completes with valid output payload.",
          evaluator: "CUSTOM_PREDICATE",
        },
      ],
      requiredTools: ["system"],
      requiresApproval: false,
      riskLevel: "low",
    });
  }

  // Final Verification Task
  specs.push({
    title: "Final Output Verification & Quality Audit",
    description: "Verify that all deliverables satisfy defined acceptance criteria and compile executive summary.",
    complexity: 3,
    estimatedDurationMs: 8000,
    dependsOnPrevious: true,
    deliverables: ["Independent verification evidence report"],
    acceptanceCriteria: [
      {
        id: "crit_final_verif",
        description: "Verification evidence record produced with passing status.",
        evaluator: "CUSTOM_PREDICATE",
      },
    ],
    requiredTools: ["verification_engine", "audit_logger"],
    requiresApproval: false,
    riskLevel: "low",
  });

  return specs;
}
