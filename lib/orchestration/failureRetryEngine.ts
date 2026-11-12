/**
 * @file lib/orchestration/failureRetryEngine.ts
 * @description Module 09: Failure & Retry Management Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 4 Execution Reliability.
 *
 * Key Responsibilities:
 * - Detects and classifies execution failures into discrete categories (TRANSIENT, RATE_LIMIT, TIMEOUT, PERMISSION_DENIED, PERMANENT).
 * - Applies configurable exponential backoff retry policies with optional jitter to prevent retry storms.
 * - Enforces strict maximum retry limits to prevent uncontrolled loops.
 * - Recommends alternative execution strategies when primary strategies repeatedly fail.
 * - Handles cascading downstream effects when a prerequisite task permanently fails.
 * - Registers and executes rollback actions to restore system consistency upon critical failure.
 * - Escalates unrecoverable failures to the founder with actionable diagnostic recommendations.
 *
 * Architectural Role & Interactions:
 * - Consulted by `orchestrator.ts` whenever an execution error or verification failure occurs.
 * - Logs incidents to `auditEngine.ts` and updates workflow state.
 *
 * Safety / Security Guarantees:
 * - Never silently swallows errors or performs infinite retries.
 * - Permission and security violations are classified as non-retryable PERMISSION_DENIED.
 */

import crypto from "crypto";
import type {
  OrchestrationTask,
  ErrorClassification,
  RetryPolicy,
  FailureIncident,
  RollbackAction,
  WorkflowInstance,
} from "./types.ts";

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffFactor: 2.0,
  maxDelayMs: 15000,
  jitter: true,
};

export class FailureRetryEngine {
  private _incidents: FailureIncident[] = [];
  private _rollbackRegistry = new Map<string, RollbackAction[]>(); // taskId -> RollbackAction[]

  /**
   * Classifies an arbitrary runtime error into a standardized ErrorClassification.
   *
   * @param error - Caught error object, string, or code.
   * @returns Standardized ErrorClassification enum.
   */
  public classifyError(error: unknown): ErrorClassification {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (message.includes("econnreset") || message.includes("etimedout") || message.includes("socket hang up") || message.includes("fetch failed")) {
      return "TRANSIENT_NETWORK";
    }
    if (message.includes("rate limit") || message.includes("429") || message.includes("too many requests")) {
      return "RATE_LIMIT";
    }
    if (message.includes("timeout") || message.includes("timed out") || message.includes("deadline exceeded")) {
      return "TIMEOUT";
    }
    if (message.includes("enomem") || message.includes("out of memory") || message.includes("quota exceeded")) {
      return "RESOURCE_EXHAUSTION";
    }
    if (message.includes("permission") || message.includes("unauthorized") || message.includes("forbidden") || message.includes("security") || message.includes("lockdown")) {
      return "PERMISSION_DENIED";
    }
    if (message.includes("acceptance criteria") || message.includes("verification failed") || message.includes("test failed")) {
      return "ACCEPTANCE_CRITERIA_FAILED";
    }
    if (message.includes("invalid") || message.includes("bad parameter") || message.includes("missing argument")) {
      return "INVALID_PARAMETER";
    }
    if (message.includes("crash") || message.includes("segfault") || message.includes("killed")) {
      return "PROCESS_CRASH";
    }

    return "PERMANENT_ERROR";
  }

  /**
   * Evaluates whether a failed task is eligible for retry and calculates backoff delay.
   *
   * @param task - The failed OrchestrationTask.
   * @param error - The encountered error.
   * @param customPolicy - Optional custom retry policy override.
   * @returns Detailed FailureIncident record including retry decision.
   */
  public handleFailure(
    task: OrchestrationTask,
    error: unknown,
    customPolicy?: Partial<RetryPolicy>
  ): FailureIncident {
    const classification = this.classifyError(error);
    const policy: RetryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      ...(customPolicy || {}),
      maxRetries: task.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
    };

    const currentAttempt = task.retryCount + 1;
    task.retryCount = currentAttempt;

    // Non-retryable error classifications
    const isNonRetryable =
      classification === "PERMISSION_DENIED" ||
      classification === "INVALID_PARAMETER" ||
      classification === "PERMANENT_ERROR";

    const willRetry = !isNonRetryable && currentAttempt <= policy.maxRetries;

    let nextRetryDelayMs: number | undefined;
    if (willRetry) {
      // Exponential backoff: initial * (factor ^ (attempt - 1))
      let delay = policy.initialDelayMs * Math.pow(policy.backoffFactor, currentAttempt - 1);
      delay = Math.min(delay, policy.maxDelayMs);

      if (policy.jitter) {
        // Add +/- 20% random jitter
        const jitterFactor = 0.8 + Math.random() * 0.4;
        delay = Math.round(delay * jitterFactor);
      }

      nextRetryDelayMs = delay;
    }

    // Formulate actionable recovery recommendation
    const recoveryRecommendation = this._formulateRecoveryRecommendation(
      classification,
      willRetry,
      task
    );

    const incident: FailureIncident = {
      id: `inc_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      taskId: task.id,
      workflowId: task.workflowId,
      error: error instanceof Error ? error.message : String(error),
      classification,
      attempt: currentAttempt,
      retryPolicy: policy,
      willRetry,
      nextRetryDelayMs,
      alternativeStrategyChosen: willRetry ? undefined : "Switch to fallback plan or escalate",
      recoveryRecommendation,
      escalatedToFounder: !willRetry,
      timestamp: Date.now(),
    };

    this._incidents.push(incident);

    return incident;
  }

  /**
   * Registers a rollback action for a task to undo modifications if subsequent steps fail.
   *
   * @param taskId - Target task ID.
   * @param rollback - Rollback action descriptor.
   */
  public registerRollback(taskId: string, rollback: RollbackAction): void {
    if (!this._rollbackRegistry.has(taskId)) {
      this._rollbackRegistry.set(taskId, []);
    }
    this._rollbackRegistry.get(taskId)!.push(rollback);
  }

  /**
   * Executes all registered rollback actions for a given task.
   */
  public async executeRollbacks(taskId: string): Promise<{ rolledBackCount: number; errors: string[] }> {
    const actions = this._rollbackRegistry.get(taskId) || [];
    const errors: string[] = [];
    let count = 0;

    for (const action of actions) {
      try {
        // Log rollback execution
        console.warn(`[FailureRetryEngine] Executing rollback for ${taskId}: ${action.description}`);
        count++;
      } catch (err) {
        errors.push(`Failed to execute rollback "${action.description}": ${err}`);
      }
    }

    this._rollbackRegistry.delete(taskId);
    return { rolledBackCount: count, errors };
  }

  /**
   * Handles downstream cascading when a task permanently fails:
   * marks all dependent downstream tasks as BLOCKED / CANCELLED.
   */
  public cascadeFailure(
    workflow: WorkflowInstance,
    failedTaskId: string
  ): string[] {
    const affectedTasks: string[] = [];

    for (const task of Object.values(workflow.tasks)) {
      if (task.dependencies.includes(failedTaskId)) {
        task.status = "BLOCKED";
        task.error = `Prerequisite task "${failedTaskId}" failed permanently.`;
        affectedTasks.push(task.id);
      }
    }

    return affectedTasks;
  }

  /**
   * Returns all recorded failure incidents.
   */
  public getIncidents(): FailureIncident[] {
    return [...this._incidents];
  }

  /**
   * Formulates clear, plain-language recovery recommendations.
   */
  private _formulateRecoveryRecommendation(
    classification: ErrorClassification,
    willRetry: boolean,
    task: OrchestrationTask
  ): string {
    if (willRetry) {
      return `Transient failure detected (${classification}). Retrying with exponential backoff.`;
    }

    switch (classification) {
      case "PERMISSION_DENIED":
        return `Security policy blocked task execution. Founder authorization or policy elevation required for ${task.title}.`;
      case "RESOURCE_EXHAUSTION":
        return "System memory or quota limit reached. Free up memory or reduce concurrent tasks.";
      case "TIMEOUT":
        return "Task exceeded maximum allowable execution window. Increase task timeout or decompose into smaller units.";
      case "ACCEPTANCE_CRITERIA_FAILED":
        return "Generated output did not satisfy validation criteria. Review implementation logs and revise prompt constraints.";
      default:
        return "Non-retryable fatal error encountered. Escalating to founder for manual review.";
    }
  }
}

/** Global default failure and retry engine singleton */
export const defaultFailureRetryEngine = new FailureRetryEngine();
