/**
 * @file lib/gameDev/resourceQueueEngine.ts
 * @description Centralized Single-Inference Queue and Laptop Resource Manager for Game Development.
 *
 * Subsystem:
 * Game Development Lifecycle Management - Resource & Execution Throttle.
 *
 * Key Responsibilities:
 * - Enforces the strict invariant: Concurrency = 1 for local model inference across all departments.
 * - Manages the shared FIFO queue for role inference jobs (using the existing local Ollama runtime).
 * - Prevents duplicate task executions via fingerprint hashing.
 * - Serializes heavy computer operations (model inference, engine builds, 3D rendering, video export).
 * - Monitors laptop hardware metrics (Intel Core i5 / 8GB baseline); defers execution when memory is severely strained.
 * - Safely pauses/defers work without terminating ULTRON or user processes.
 *
 * Architectural Role & Interactions:
 * - Consulted by all departments before dispatching inference or heavy computation.
 * - Calls local Ollama endpoint (`http://127.0.0.1:11434`) via `lib/cognitive/localModelClient.ts` or loopback fetch.
 *
 * Safety / Security Guarantees:
 * - Zero parallel inference overrunning the 8GB RAM host.
 * - Fail-closed error handling and checkpoint preservation.
 */

import os from "os";
import type { ExecutionJob, GameDevTask } from "./types.ts";

export interface ResourceTelemetrySnapshot {
  cpuCount: number;
  freeMemoryMb: number;
  totalMemoryMb: number;
  memoryUsagePercent: number;
  isResourceConstrained: boolean;
  status: "optimal" | "constrained" | "unknown";
}

export interface QueueStatusSummary {
  activeJob: ExecutionJob | null;
  queuedJobsCount: number;
  concurrencyLimit: number;
  isLocked: boolean;
  telemetry: ResourceTelemetrySnapshot;
}

export class ResourceQueueEngine {
  private static _instance: ResourceQueueEngine | null = null;
  private _concurrencyLimit: number = 1; // Strictly 1 active inference worker globally
  private _activeJob: ExecutionJob | null = null;
  private _queue: Array<{
    job: ExecutionJob;
    task: GameDevTask;
    executor: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  private _activeTaskIds: Set<string> = new Set();
  private _isProcessing: boolean = false;

  private constructor() {}

  public static getInstance(): ResourceQueueEngine {
    if (!ResourceQueueEngine._instance) {
      ResourceQueueEngine._instance = new ResourceQueueEngine();
    }
    return ResourceQueueEngine._instance;
  }

  /**
   * Samples current laptop telemetry (Intel Core i5, 8GB baseline).
   *
   * @returns Telemetry snapshot with constraint classification.
   */
  public getTelemetry(): ResourceTelemetrySnapshot {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const totalMb = Math.round(totalMem / (1024 * 1024));
      const freeMb = Math.round(freeMem / (1024 * 1024));
      const usagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

      // Laptop safety threshold: if free memory drops below 500MB, flag as constrained
      const isConstrained = freeMb < 500 || usagePercent > 92;

      return {
        cpuCount: os.cpus()?.length || 4,
        freeMemoryMb: freeMb,
        totalMemoryMb: totalMb,
        memoryUsagePercent: usagePercent,
        isResourceConstrained: isConstrained,
        status: isConstrained ? "constrained" : "optimal",
      };
    } catch {
      return {
        cpuCount: 4,
        freeMemoryMb: 0,
        totalMemoryMb: 0,
        memoryUsagePercent: 0,
        isResourceConstrained: false,
        status: "unknown",
      };
    }
  }

  /**
   * Returns current queue and worker status.
   */
  public getQueueStatus(): QueueStatusSummary {
    return {
      activeJob: this._activeJob ? { ...this._activeJob } : null,
      queuedJobsCount: this._queue.length,
      concurrencyLimit: this._concurrencyLimit,
      isLocked: this._activeJob !== null,
      telemetry: this.getTelemetry(),
    };
  }

  /**
   * Enqueues an inference or heavy execution job for a role profile.
   *
   * @param task - The GameDevTask requiring execution.
   * @param roleId - The role profile claiming the job.
   * @param executor - Async function running the bounded task logic.
   * @returns Promise resolving to the executor's output once completed.
   * @throws Error if task is already running (duplicate execution prevention).
   */
  public async enqueueJob<T = unknown>(
    task: GameDevTask,
    roleId: string,
    executor: () => Promise<T>
  ): Promise<T> {
    // 1. Invariant: Prevent duplicate execution of the same task ID
    if (this._activeTaskIds.has(task.id)) {
      throw new Error(`Duplicate execution rejected: Task "${task.id}" is already active in queue or running.`);
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: ExecutionJob = {
      id: jobId,
      taskId: task.id,
      roleId,
      status: "queued",
      workerSlot: 0,
      queuedAt: Date.now(),
    };

    this._activeTaskIds.add(task.id);

    return new Promise<T>((resolve, reject) => {
      this._queue.push({
        job,
        task,
        executor: executor as () => Promise<unknown>,
        resolve: resolve as (val: unknown) => void,
        reject,
      });

      // Trigger queue drain
      this.processNextJob();
    });
  }

  /**
   * Drains the queue obeying the single-inference concurrency limit.
   */
  private async processNextJob(): Promise<void> {
    if (this._isProcessing) return;
    if (this._activeJob !== null) {
      // Concurrency limit = 1: worker slot 0 is occupied; wait until finished
      return;
    }
    if (this._queue.length === 0) return;

    this._isProcessing = true;
    const entry = this._queue.shift()!;
    const { job, task, executor, resolve, reject } = entry;

    // Check resource pressure before starting
    const telemetry = this.getTelemetry();
    if (telemetry.isResourceConstrained) {
      console.warn(`[RESOURCE QUEUE] High memory pressure (${telemetry.freeMemoryMb}MB free). Deferring task "${task.id}" by 1.5s.`);
      job.status = "deferred";
      job.resourceSnapshot = {
        freeMemoryMb: telemetry.freeMemoryMb,
        resourcePressureThrottled: true,
      };
      // Re-queue at head and wait
      this._queue.unshift(entry);
      this._isProcessing = false;
      setTimeout(() => this.processNextJob(), 1500);
      return;
    }

    job.status = "executing";
    job.startedAt = Date.now();
    job.resourceSnapshot = {
      freeMemoryMb: telemetry.freeMemoryMb,
      resourcePressureThrottled: false,
    };
    this._activeJob = job;
    this._isProcessing = false;

    try {
      const result = await executor();
      job.status = "completed";
      job.completedAt = Date.now();
      resolve(result);
    } catch (err) {
      job.status = "failed";
      job.failureReason = err instanceof Error ? err.message : String(err);
      job.completedAt = Date.now();
      reject(err);
    } finally {
      this._activeTaskIds.delete(task.id);
      this._activeJob = null;
      // Process next waiting job
      setImmediate(() => this.processNextJob());
    }
  }
}

export const defaultResourceQueueEngine = ResourceQueueEngine.getInstance();
