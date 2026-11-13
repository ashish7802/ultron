/**
 * @file lib/orchestration/parallelCoordinationEngine.ts
 * @description Module 07: Parallel Task Coordination Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 3 Workflow Orchestration.
 *
 * Key Responsibilities:
 * - Coordinates concurrent execution of independent tasks within the same execution wave.
 * - Enforces concurrency limits (configurable max concurrency pool to avoid thread/process exhaustion).
 * - Implements shared resource mutex locking to prevent file corruption and race conditions.
 * - Detects conflicts when two concurrent tasks attempt to modify identical resources.
 * - Implements wave synchronization barriers (joins) that ensure all tasks in Wave N complete
 *   and verify before Wave N+1 commences.
 * - Aggregates outputs, artifacts, and errors across concurrent workers.
 *
 * Architectural Role & Interactions:
 * - Invoked by `workflowManagementEngine.ts` to dispatch waves.
 * - Protects shared system resources and interacts with `resourceManagementEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - Deadlock prevention: resource locks feature automatic TTL expiration (default 30 seconds).
 * - Race condition protection: resource acquisition is atomic and serialized.
 */

import type {
  OrchestrationTask,
  ParallelExecutionConfig,
  ResourceLock,
} from "./types.ts";

export interface TaskExecutionHandler {
  (task: OrchestrationTask): Promise<unknown>;
}

export interface ParallelExecutionResult {
  waveIndex: number;
  totalTasks: number;
  successfulTasks: string[];
  failedTasks: { taskId: string; error: string }[];
  aggregatedOutputs: Record<string, unknown>;
  durationMs: number;
}

export class ParallelCoordinationEngine {
  private _config: ParallelExecutionConfig;
  private _activeLocks = new Map<string, ResourceLock>();

  constructor(config?: Partial<ParallelExecutionConfig>) {
    this._config = {
      maxConcurrency: config?.maxConcurrency ?? 4,
      acquireTimeoutMs: config?.acquireTimeoutMs ?? 5000,
      enableResourceLocking: config?.enableResourceLocking ?? true,
    };
  }

  /**
   * Acquires an exclusive lock on a resource for a specific task.
   *
   * @param resourceId - Unique string identifying the shared resource (e.g. file path).
   * @param taskId - ID of the task requesting exclusive access.
   * @param ttlMs - Time-to-live for the lock before automatic release (default 30,000ms).
   * @returns True if lock was acquired, false if held by another task.
   */
  public acquireResourceLock(
    resourceId: string,
    taskId: string,
    ttlMs: number = 30000
  ): boolean {
    if (!this._config.enableResourceLocking) {
      return true;
    }

    const now = Date.now();
    const existing = this._activeLocks.get(resourceId);

    // Clean up expired lock if present
    if (existing && existing.expiresAt <= now) {
      this._activeLocks.delete(resourceId);
    }

    const active = this._activeLocks.get(resourceId);
    if (active && active.heldByTaskId !== taskId) {
      return false; // Lock is held by another task
    }

    // Acquire or refresh lock
    this._activeLocks.set(resourceId, {
      resourceId,
      heldByTaskId: taskId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
    });

    return true;
  }

  /**
   * Asynchronously attempts to acquire an exclusive lock, waiting up to timeoutMs before failing.
   *
   * @param resourceId - Target resource ID.
   * @param taskId - ID of the task requesting access.
   * @param ttlMs - Lock TTL in milliseconds.
   * @param timeoutMs - Maximum duration to wait for the lock.
   * @returns True if acquired within the timeout window, false otherwise.
   */
  public async acquireResourceLockWithTimeout(
    resourceId: string,
    taskId: string,
    ttlMs: number = 30000,
    timeoutMs?: number
  ): Promise<boolean> {
    const maxWait = timeoutMs ?? this._config.acquireTimeoutMs;
    const start = Date.now();

    while (Date.now() - start <= maxWait) {
      if (this.acquireResourceLock(resourceId, taskId, ttlMs)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    return false;
  }

  /**
   * Releases an exclusive lock held by a task.
   *
   * @param resourceId - Target resource identifier.
   * @param taskId - ID of the holding task.
   */
  public releaseResourceLock(resourceId: string, taskId: string): void {
    const existing = this._activeLocks.get(resourceId);
    if (existing && existing.heldByTaskId === taskId) {
      this._activeLocks.delete(resourceId);
    }
  }

  /**
   * Identifies resource contention conflicts among a group of candidate tasks.
   *
   * @param tasks - Candidate tasks intended for concurrent execution.
   * @returns Array of identified conflicting resource descriptors.
   */
  public detectResourceConflicts(tasks: OrchestrationTask[]): { resource: string; taskIds: string[] }[] {
    const resourceUsageMap = new Map<string, string[]>();

    for (const task of tasks) {
      // Check deliverable files as potential shared resources
      for (const deliverable of task.deliverables) {
        const key = `file:${deliverable.toLowerCase()}`;
        if (!resourceUsageMap.has(key)) {
          resourceUsageMap.set(key, []);
        }
        resourceUsageMap.get(key)!.push(task.id);
      }

      // Check action payloads for shared targets
      if (task.actionPayload && typeof task.actionPayload.target === "string") {
        const key = `target:${task.actionPayload.target.toLowerCase()}`;
        if (!resourceUsageMap.has(key)) {
          resourceUsageMap.set(key, []);
        }
        resourceUsageMap.get(key)!.push(task.id);
      }
    }

    const conflicts: { resource: string; taskIds: string[] }[] = [];
    for (const [resource, taskIds] of resourceUsageMap.entries()) {
      if (taskIds.length > 1) {
        conflicts.push({ resource, taskIds });
      }
    }

    return conflicts;
  }

  /**
   * Executes a wave of tasks concurrently up to maxConcurrency, waiting for all to settle (Barrier Join).
   *
   * @param tasks - Array of tasks assigned to this wave.
   * @param waveIndex - Index of the execution wave.
   * @param executor - Async handler executing an individual task.
   * @returns Aggregated execution results.
   */
  public async executeWave(
    tasks: OrchestrationTask[],
    waveIndex: number,
    executor: TaskExecutionHandler
  ): Promise<ParallelExecutionResult> {
    const startTime = Date.now();
    const successfulTasks: string[] = [];
    const failedTasks: { taskId: string; error: string }[] = [];
    const aggregatedOutputs: Record<string, unknown> = {};

    // Work queue bounded by concurrency
    const queue = [...tasks];
    const workers: Promise<void>[] = [];
    const concurrency = Math.min(this._config.maxConcurrency, tasks.length);

    for (let i = 0; i < concurrency; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const task = queue.shift();
            if (!task) break;

            // Acquire resource locks for deliverables
            const acquiredResources: string[] = [];
            let lockFailed = false;

            for (const item of task.deliverables) {
              const resKey = `res:${item}`;
              const acquired = await this.acquireResourceLockWithTimeout(resKey, task.id);
              if (!acquired) {
                lockFailed = true;
                break;
              }
              acquiredResources.push(resKey);
            }

            if (lockFailed) {
              // Release any acquired locks
              for (const res of acquiredResources) {
                this.releaseResourceLock(res, task.id);
              }
              failedTasks.push({
                taskId: task.id,
                error: "Resource contention: Failed to acquire exclusive lock on shared resource.",
              });
              continue;
            }

            try {
              task.status = "RUNNING";
              task.startedAt = Date.now();

              const output = await executor(task);

              task.output = output;
              task.status = "COMPLETED";
              task.completedAt = Date.now();
              task.actualDurationMs = task.completedAt - task.startedAt;

              successfulTasks.push(task.id);
              aggregatedOutputs[task.id] = output;
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              task.status = "FAILED";
              task.error = errMsg;
              failedTasks.push({ taskId: task.id, error: errMsg });
            } finally {
              // Always release locks
              for (const res of acquiredResources) {
                this.releaseResourceLock(res, task.id);
              }
            }
          }
        })()
      );
    }

    // Wait for all workers in this wave to complete (Barrier)
    await Promise.all(workers);

    return {
      waveIndex,
      totalTasks: tasks.length,
      successfulTasks,
      failedTasks,
      aggregatedOutputs,
      durationMs: Date.now() - startTime,
    };
  }
}

/** Global default parallel coordination engine singleton */
export const defaultParallelCoordinationEngine = new ParallelCoordinationEngine();
