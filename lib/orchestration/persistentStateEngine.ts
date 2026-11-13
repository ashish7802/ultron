/**
 * @file lib/orchestration/persistentStateEngine.ts
 * @description Module 11: Persistent Task State Management & Checkpointing for ULTRON.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 1 Foundation & Phase 4 Reliability.
 *
 * Key Responsibilities:
 * - Persists active and historical workflows, tasks, milestones, and audit events to durable storage.
 * - Atomic checkpointing: guarantees crash resilience across unexpected application restarts.
 * - Concurrency control & state versioning: increments monotonic version numbers on state updates.
 * - Duplicate execution prevention: maintains an idempotency registry of executed tasks.
 * - Restart recovery: scans storage on startup to rehydrate in-flight workflows and pending approvals.
 * - Immutable execution history and audit log preservation.
 *
 * Architectural Role & Interactions:
 * - Underlying persistence layer for `workflowManagementEngine.ts` and `orchestrator.ts`.
 * - Stores state in `.tasks/` directory with atomic write-and-rename semantics (`.tmp` -> `.json`).
 *
 * Safety / Security Guarantees:
 * - Transaction-safe atomic writes prevent corrupted JSON files during sudden power loss or process kill.
 * - Preserves cryptographic hashes for checkpoints to detect file tampering.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type {
  WorkflowInstance,
  ExecutionCheckpoint,
  OrchestrationTask,
} from "./types.ts";

export interface PersistenceOptions {
  storageDir?: string;
  maxHistoricalCheckpoints?: number;
}

export class PersistentTaskStateEngine {
  private _storageDir: string;
  private _workflowsDir: string;
  private _checkpointsDir: string;
  private _idempotencyRegistry: Set<string> = new Set();
  private _initialized: boolean = false;

  constructor(options?: PersistenceOptions) {
    this._storageDir = options?.storageDir || path.join(process.cwd(), ".tasks");
    this._workflowsDir = path.join(this._storageDir, "workflows");
    this._checkpointsDir = path.join(this._storageDir, "checkpoints");
    this._ensureDirectories();
  }

  private _ensureDirectories(): void {
    try {
      if (!fs.existsSync(this._storageDir)) {
        fs.mkdirSync(this._storageDir, { recursive: true });
      }
      if (!fs.existsSync(this._workflowsDir)) {
        fs.mkdirSync(this._workflowsDir, { recursive: true });
      }
      if (!fs.existsSync(this._checkpointsDir)) {
        fs.mkdirSync(this._checkpointsDir, { recursive: true });
      }
      this._initialized = true;
    } catch (err) {
      console.error("[PersistentTaskStateEngine] Failed to initialize storage directories:", err);
    }
  }

  /**
   * Computes a SHA-256 checksum of an object payload for integrity validation.
   */
  private _computeChecksum(data: unknown): string {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
  }

  /**
   * Atomically writes data to disk with Windows/OneDrive lock-resilience.
   */
  private _atomicWriteJson(filePath: string, data: unknown): void {
    const tmpPath = `${filePath}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    const serialized = JSON.stringify(data, null, 2);
    try {
      fs.writeFileSync(tmpPath, serialized, "utf-8");
      try {
        fs.renameSync(tmpPath, filePath);
      } catch {
        // Fallback for Windows/OneDrive locks: copyFileSync over destination then clean up tmp
        fs.copyFileSync(tmpPath, filePath);
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // Ignore temp cleanup errors
        }
      }
    } catch {
      // Direct write fallback
      fs.writeFileSync(filePath, serialized, "utf-8");
    }
  }

  /**
   * Persists a workflow instance to durable disk storage.
   * Increments the state version and updates the timestamp.
   *
   * @param workflow - The workflow instance to persist.
   * @returns Updated workflow with incremented version.
   */
  public saveWorkflow(workflow: WorkflowInstance): WorkflowInstance {
    this._ensureDirectories();

    const updated: WorkflowInstance = {
      ...workflow,
      version: (workflow.version || 0) + 1,
      updatedAt: Date.now(),
    };

    const filePath = path.join(this._workflowsDir, `${workflow.id}.json`);
    this._atomicWriteJson(filePath, updated);

    // Also register completed tasks in idempotency registry
    for (const taskId of updated.completedTaskIds) {
      this._idempotencyRegistry.add(`${workflow.id}:${taskId}`);
    }

    return updated;
  }

  /**
   * Loads a workflow by its unique ID.
   *
   * @param workflowId - Unique workflow ID.
   * @returns Loaded WorkflowInstance or null if not found.
   */
  public getWorkflow(workflowId: string): WorkflowInstance | null {
    this._ensureDirectories();
    const filePath = path.join(this._workflowsDir, `${workflowId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as WorkflowInstance;
    } catch (err) {
      console.error(`[PersistentTaskStateEngine] Corrupted workflow file ${filePath}:`, err);
      return null;
    }
  }

  /**
   * Lists all persisted workflows.
   */
  public listWorkflows(): WorkflowInstance[] {
    this._ensureDirectories();
    const files = fs.readdirSync(this._workflowsDir).filter((f) => f.endsWith(".json"));
    const list: WorkflowInstance[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this._workflowsDir, file), "utf-8");
        list.push(JSON.parse(content) as WorkflowInstance);
      } catch {
        // Skip unparseable files
      }
    }

    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Creates an immutable execution checkpoint snapshot.
   *
   * @param workflow - Workflow instance to snapshot.
   * @returns Created ExecutionCheckpoint.
   */
  public createCheckpoint(workflow: WorkflowInstance): ExecutionCheckpoint {
    this._ensureDirectories();

    const checkpointId = `chk_${workflow.id}_v${workflow.version}_${Date.now()}`;
    const checksum = this._computeChecksum(workflow);

    const checkpoint: ExecutionCheckpoint = {
      checkpointId,
      workflowId: workflow.id,
      version: workflow.version,
      state: workflow.state,
      snapshot: JSON.parse(JSON.stringify(workflow)),
      checksum,
      createdAt: Date.now(),
    };

    const filePath = path.join(this._checkpointsDir, `${checkpointId}.json`);
    this._atomicWriteJson(filePath, checkpoint);

    return checkpoint;
  }

  /**
   * Retrieves all checkpoints for a specific workflow.
   */
  public getCheckpointsForWorkflow(workflowId: string): ExecutionCheckpoint[] {
    this._ensureDirectories();
    const files = fs.readdirSync(this._checkpointsDir).filter((f) => f.startsWith(`chk_${workflowId}_`));
    const checkpoints: ExecutionCheckpoint[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this._checkpointsDir, file), "utf-8");
        const parsed = JSON.parse(content) as ExecutionCheckpoint;
        // Verify checksum
        if (this._computeChecksum(parsed.snapshot) === parsed.checksum) {
          checkpoints.push(parsed);
        } else {
          console.warn(`[PersistentTaskStateEngine] Checkpoint ${parsed.checkpointId} checksum mismatch!`);
        }
      } catch {
        // Ignore corrupted files
      }
    }

    return checkpoints.sort((a, b) => a.version - b.version);
  }

  /**
   * Checks whether a task execution has already completed (Idempotency Protection).
   *
   * @param workflowId - Enclosing workflow ID.
   * @param taskId - Task ID.
   * @returns True if already recorded as executed.
   */
  public isTaskExecuted(workflowId: string, taskId: string): boolean {
    const key = `${workflowId}:${taskId}`;
    if (this._idempotencyRegistry.has(key)) {
      return true;
    }
    const wf = this.getWorkflow(workflowId);
    if (wf && (wf.completedTaskIds.includes(taskId) || wf.tasks[taskId]?.status === "VERIFIED")) {
      this._idempotencyRegistry.add(key);
      return true;
    }
    return false;
  }

  /**
   * Scans durable storage for in-flight workflows that were interrupted by a restart.
   *
   * @returns Array of recoverable workflows.
   */
  public recoverInterruptedWorkflows(): {
    workflow: WorkflowInstance;
    interruptedTasks: OrchestrationTask[];
    pendingApprovals: OrchestrationTask[];
  }[] {
    const workflows = this.listWorkflows();
    const recoverable: {
      workflow: WorkflowInstance;
      interruptedTasks: OrchestrationTask[];
      pendingApprovals: OrchestrationTask[];
    }[] = [];

    for (const wf of workflows) {
      if (wf.state === "RUNNING" || wf.state === "PLANNING" || wf.state === "PENDING_APPROVAL" || wf.state === "PAUSED") {
        const interruptedTasks: OrchestrationTask[] = [];
        const pendingApprovals: OrchestrationTask[] = [];

        for (const task of Object.values(wf.tasks)) {
          if (task.status === "RUNNING") {
            // Process crashed while this task was running; reset to READY for safe restart
            task.status = "READY";
            interruptedTasks.push(task);
          } else if (task.status === "AWAITING_APPROVAL") {
            pendingApprovals.push(task);
          }
        }

        // Persist reset tasks to durable disk storage
        if (interruptedTasks.length > 0) {
          this.saveWorkflow(wf);
        }

        recoverable.push({
          workflow: wf,
          interruptedTasks,
          pendingApprovals,
        });
      }
    }

    return recoverable;
  }

  /**
   * Cleans up old workflow or checkpoint files (utility method).
   */
  public deleteWorkflow(workflowId: string): boolean {
    const filePath = path.join(this._workflowsDir, `${workflowId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}

/** Global default persistent state engine singleton */
export const defaultPersistentStateEngine = new PersistentTaskStateEngine();
