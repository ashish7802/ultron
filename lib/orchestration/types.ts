/**
 * @file lib/orchestration/types.ts
 * @description Centralized Type Definitions & Contracts for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine (Blueprint Section 7).
 *
 * Key Responsibilities:
 * - Defines universal data models, enums, interfaces, and state contracts across all 14 orchestration modules:
 *   1. Goal Understanding Engine
 *   2. Intelligent Task Decomposition
 *   3. Dependency Management Engine
 *   4. Intelligent Priority Engine
 *   5. Execution Planning Engine
 *   6. Workflow Management Engine
 *   7. Parallel Task Coordination
 *   8. Progress Tracking Engine
 *   9. Failure & Retry Management
 *   10. Task Verification Engine
 *   11. Persistent Task State Management
 *   12. Resource & Execution Management
 *   13. Human Approval Coordination
 *   14. Task Reporting & Summary
 *
 * Architectural Role & Interactions:
 * - Shared contract library consumed by all orchestration engines, API routes (`/api/orchestration`),
 *   and UI components. Integrates with `lib/permissionGateway.ts` for security and authorization.
 *
 * Safety / Security Guarantees:
 * - Immutable identifiers (UUID v4 / SHA-256).
 * - Cryptographically bound approval and verification hashes.
 * - Strict enum typing preventing invalid state transitions.
 */

import type { ActionRiskLevel, PermissionActionType } from "../permissionGateway.ts";

// ==============================================================================
// 1. GOAL UNDERSTANDING ENGINE CONTRACTS
// ==============================================================================

export type GoalCategory =
  | "ENGINEERING"
  | "RESEARCH"
  | "AUTOMATION"
  | "ANALYSIS"
  | "DEPLOYMENT"
  | "SYSTEM_CONFIG"
  | "SECURITY_AUDIT"
  | "MAINTENANCE"
  | "GENERAL";

export type GoalClarityLevel = "HIGH" | "MEDIUM" | "AMBIGUOUS" | "INCOMPLETE";

export interface GoalConstraint {
  id: string;
  type: "TIME" | "RESOURCE" | "PERMISSION" | "SCOPE" | "SECURITY" | "BUDGET";
  description: string;
  isHardConstraint: boolean;
}

export interface GoalSuccessCriterion {
  id: string;
  description: string;
  isQuantitative: boolean;
  targetMetric?: string;
  targetValue?: string | number;
  verificationMethod: "AUTOMATED_TEST" | "FILE_EXISTS" | "REGEX_MATCH" | "OUTPUT_EVALUATION" | "MANUAL_ATTESTATION";
}

export interface StructuredGoal {
  id: string;
  rawPrompt: string;
  title: string;
  category: GoalCategory;
  clarity: GoalClarityLevel;
  primaryObjective: string;
  expectedOutcomes: string[];
  inScope: string[];
  outOfScope: string[];
  constraints: GoalConstraint[];
  missingInformation: string[];
  assumptions: string[];
  successCriteria: GoalSuccessCriterion[];
  requiresClarification: boolean;
  clarificationQuestions: string[];
  createdAt: number;
}

// ==============================================================================
// 2. TASK DECOMPOSITION & STRUCTURE
// ==============================================================================

export type TaskStatus =
  | "PENDING"
  | "READY"
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "RUNNING"
  | "COMPLETED"
  | "VERIFIED"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED";

export type TaskComplexity = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface AcceptanceCriterion {
  id: string;
  description: string;
  evaluator: "EXIT_CODE" | "FILE_NON_EMPTY" | "STDOUT_REGEX" | "JSON_SCHEMA" | "CUSTOM_PREDICATE";
  expectedValue?: string | number | boolean | Record<string, unknown>;
  tolerance?: number;
}

export interface OrchestrationTask {
  id: string;
  workflowId: string;
  parentTaskId?: string;
  subtaskIds: string[];
  milestoneId?: string;
  title: string;
  description: string;
  status: TaskStatus;
  complexity: TaskComplexity;
  estimatedDurationMs: number;
  actualDurationMs?: number;
  dependencies: string[]; // Prerequisite task IDs
  deliverables: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  requiredTools: string[];
  actionType?: PermissionActionType;
  actionPayload?: Record<string, unknown>;
  requiresApproval: boolean;
  riskLevel: ActionRiskLevel;
  riskExplanation?: string;
  approvalToken?: string;
  executionGrantToken?: string;
  retryCount: number;
  maxRetries: number;
  output?: unknown;
  error?: string;
  verificationEvidence?: VerificationEvidence;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  verifiedAt?: number;
}

export interface Milestone {
  id: string;
  workflowId: string;
  title: string;
  description: string;
  taskIds: string[];
  isCompleted: boolean;
  completedAt?: number;
}

// ==============================================================================
// 3. DEPENDENCY MANAGEMENT CONTRACTS
// ==============================================================================

export interface DependencyGraphNode {
  taskId: string;
  dependencies: string[]; // Incoming edges (must finish first)
  dependents: string[];   // Outgoing edges (blocked until this finishes)
  depth: number;
  isCriticalPath: boolean;
}

export interface DependencyValidationResult {
  isValid: boolean;
  hasCycles: boolean;
  cycleNodes?: string[];
  topologicalOrder: string[];
  criticalPath: string[];
  bottlenecks: string[];
  error?: string;
}

// ==============================================================================
// 4. PRIORITY & PLANNING CONTRACTS
// ==============================================================================

export type PriorityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface TaskPriorityScore {
  taskId: string;
  level: PriorityLevel;
  totalScore: number; // 0 - 100
  urgencyScore: number;
  importanceScore: number;
  businessImpactScore: number;
  criticalPathBoost: number;
  founderPriorityWeight: number;
  deadlineScore: number;
  riskScore: number;
  calculatedAt: number;
}

export interface ExecutionStep {
  stepIndex: number;
  taskId: string;
  title: string;
  waveIndex: number; // Parallel execution wave
  canRunInParallel: boolean;
  requiredTools: string[];
  estimatedTimeMs: number;
  riskLevel: ActionRiskLevel;
  expectedOutputSummary: string;
  fallbackStrategy?: string;
}

export interface ExecutionPlan {
  id: string;
  workflowId: string;
  goalId: string;
  steps: ExecutionStep[];
  waves: string[][]; // Array of task IDs grouped by parallel execution waves
  totalEstimatedTimeMs: number;
  totalEstimatedTokens: number;
  criticalPath: string[];
  identifiedRisks: string[];
  alternativePlans: {
    condition: string;
    description: string;
    substituteStepIds: string[];
  }[];
  preExecutionValidationPassed: boolean;
  validationIssues: string[];
  createdAt: number;
}

// ==============================================================================
// 5. WORKFLOW LIFECYCLE & TEMPLATES
// ==============================================================================

export type WorkflowState =
  | "CREATED"
  | "PLANNING"
  | "PENDING_APPROVAL"
  | "RUNNING"
  | "PAUSED"
  | "CANCELLED"
  | "FAILED"
  | "VERIFYING"
  | "COMPLETED";

export interface WorkflowInstance {
  id: string;
  goal: StructuredGoal;
  state: WorkflowState;
  tasks: Record<string, OrchestrationTask>;
  milestones: Milestone[];
  executionPlan?: ExecutionPlan;
  priorityScores: Record<string, TaskPriorityScore>;
  activeWaveIndex: number;
  activeTaskIds: string[];
  completedTaskIds: string[];
  failedTaskIds: string[];
  blockedTaskIds: string[];
  createdAt: number;
  startedAt?: number;
  updatedAt: number;
  completedAt?: number;
  cancelledAt?: number;
  cancellationReason?: string;
  version: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: GoalCategory;
  description: string;
  defaultTasks: {
    title: string;
    description: string;
    complexity: TaskComplexity;
    requiredTools: string[];
    riskLevel: ActionRiskLevel;
    deliverables: string[];
    relativeDependencies: number[]; // Indices of dependent tasks
  }[];
}

// ==============================================================================
// 6. PARALLEL COORDINATION & CONCURRENCY
// ==============================================================================

export interface ParallelExecutionConfig {
  maxConcurrency: number;
  acquireTimeoutMs: number;
  enableResourceLocking: boolean;
}

export interface ResourceLock {
  resourceId: string;
  heldByTaskId: string;
  acquiredAt: number;
  expiresAt: number;
}

// ==============================================================================
// 7. PROGRESS TRACKING & METRICS
// ==============================================================================

export interface WorkflowProgressReport {
  workflowId: string;
  state: WorkflowState;
  overallPercentage: number;
  totalTasks: number;
  pendingCount: number;
  readyCount: number;
  blockedCount: number;
  runningCount: number;
  awaitingApprovalCount: number;
  completedCount: number;
  verifiedCount: number;
  failedCount: number;
  elapsedDurationMs: number;
  estimatedRemainingMs: number;
  activeMilestone?: string;
  completedMilestones: string[];
  currentWave: number;
  totalWaves: number;
  summaryMessage: string;
}

// ==============================================================================
// 8. FAILURE, RETRY & ROLLBACK
// ==============================================================================

export type ErrorClassification =
  | "TRANSIENT_NETWORK"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "RESOURCE_EXHAUSTION"
  | "PERMISSION_DENIED"
  | "ACCEPTANCE_CRITERIA_FAILED"
  | "INVALID_PARAMETER"
  | "PROCESS_CRASH"
  | "PERMANENT_ERROR";

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface RollbackAction {
  taskId: string;
  description: string;
  handler: string;
  payload: Record<string, unknown>;
}

export interface FailureIncident {
  id: string;
  taskId: string;
  workflowId: string;
  error: string;
  classification: ErrorClassification;
  attempt: number;
  retryPolicy: RetryPolicy;
  willRetry: boolean;
  nextRetryDelayMs?: number;
  alternativeStrategyChosen?: string;
  recoveryRecommendation: string;
  escalatedToFounder: boolean;
  timestamp: number;
}

// ==============================================================================
// 9. TASK VERIFICATION & EVIDENCE
// ==============================================================================

export interface VerificationEvidence {
  evidenceId: string;
  taskId: string;
  verified: boolean;
  checkedCriteriaCount: number;
  passedCriteriaCount: number;
  criteriaResults: {
    criterionId: string;
    passed: boolean;
    actualValue: unknown;
    details: string;
  }[];
  producedArtifacts: {
    name: string;
    pathOrUri?: string;
    sha256Hash: string;
    sizeBytes?: number;
  }[];
  evidenceHash: string;
  verifier: string;
  timestamp: number;
  notes?: string;
}

// ==============================================================================
// 10. PERSISTENCE & CHECKPOINTING
// ==============================================================================

export interface ExecutionCheckpoint {
  checkpointId: string;
  workflowId: string;
  version: number;
  state: WorkflowState;
  snapshot: WorkflowInstance;
  checksum: string;
  createdAt: number;
}

// ==============================================================================
// 11. RESOURCE & EXECUTION MANAGEMENT
// ==============================================================================

export interface ResourceAllocationSummary {
  allocatedCpuShares: number;
  activeWorkers: number;
  maxWorkers: number;
  estimatedTokensConsumed: number;
  estimatedCostUsd: number;
  toolAvailability: Record<string, boolean>;
  apiQuotaRemaining: Record<string, number>;
  resourceContentionWarnings: string[];
}

// ==============================================================================
// 12. HUMAN APPROVAL COORDINATION
// ==============================================================================

export interface ApprovalRequestRecord {
  requestId: string;
  taskId: string;
  workflowId: string;
  planId: string;
  title: string;
  actionType: PermissionActionType;
  actionSummary: string;
  riskLevel: ActionRiskLevel;
  riskExplanation: string;
  actionHash: string;
  approvalToken: string;
  executionGrantToken: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  requestedAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
  rejectionReason?: string;
}

// ==============================================================================
// 13. TASK REPORTING & EXECUTIVE SUMMARY
// ==============================================================================

export interface TaskReportingSummary {
  workflowId: string;
  goalTitle: string;
  finalStatus: "VERIFIED_COMPLETE" | "PARTIALLY_COMPLETE" | "FAILED" | "CANCELLED";
  executionDurationMs: number;
  totalTasks: number;
  verifiedTasks: number;
  failedTasks: number;
  verifiedDeliverables: {
    name: string;
    hash: string;
  }[];
  resourceUsage: {
    durationFormatted: string;
    tokensEstimated: number;
    retriesAttempted: number;
  };
  errorsAndWarnings: string[];
  recoveryHistory: string[];
  founderExecutiveBrief: string;
  timestamp: number;
}
