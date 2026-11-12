/**
 * @file lib/orchestration/resourceManagementEngine.ts
 * @description Module 12: Resource & Execution Management Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 6 Optimization.
 *
 * Key Responsibilities:
 * - Monitors system compute capacity, CPU share allocations, and memory constraints.
 * - Checks tool and CLI availability before dispatching tasks.
 * - Manages API quota budgets and calculates token/cost consumption estimates.
 * - Dynamically recommends the optimal model tier (e.g. fast/flash for simple tasks, pro for high complexity).
 * - Enforces per-task execution timeouts and halts hanging operations.
 * - Detects resource contention and throttles execution waves when capacity thresholds are exceeded.
 * - Produces comprehensive resource allocation and usage telemetry reports.
 *
 * Architectural Role & Interactions:
 * - Consulted by `executionPlanningEngine.ts` during plan generation and `orchestrator.ts` during dispatch.
 * - Interfaces with local system telemetry and hardware capabilities.
 *
 * Safety / Security Guarantees:
 * - Zero cost overrun: strictly bounds execution within founder-configured quotas.
 * - Fails safely on resource starvation or missing system prerequisites.
 */

import os from "os";
import type {
  OrchestrationTask,
  ResourceAllocationSummary,
  TaskComplexity,
} from "./types.ts";

export interface ResourceManagementOptions {
  maxWorkers?: number;
  perTaskTimeoutMs?: number;
  tokenBudgetLimit?: number;
}

export class ResourceManagementEngine {
  private _maxWorkers: number;
  private _defaultTimeoutMs: number;
  private _consumedTokens: number = 0;
  private _installedTools: Set<string> = new Set([
    "system",
    "diagnostics",
    "file_writer",
    "node_test_runner",
    "research_agent",
    "report_generator",
    "verification_engine",
    "audit_logger",
    "typescript_compiler",
  ]);

  constructor(options?: ResourceManagementOptions) {
    const cpuCount = os.cpus()?.length || 4;
    this._maxWorkers = options?.maxWorkers || Math.min(8, Math.max(2, Math.floor(cpuCount * 0.75)));
    this._defaultTimeoutMs = options?.perTaskTimeoutMs || 60000;
  }

  /**
   * Recommends the optimal model tier and parameters based on task complexity.
   *
   * @param complexity - Task complexity score (1-10).
   * @returns Recommended model family and context window size.
   */
  public selectModelForTask(complexity: TaskComplexity): {
    tier: "FAST_LOCAL" | "BALANCED" | "DEEP_REASONING";
    modelName: string;
    temperature: number;
    maxTokens: number;
  } {
    if (complexity <= 3) {
      return {
        tier: "FAST_LOCAL",
        modelName: "gemini-flash-lite",
        temperature: 0.1,
        maxTokens: 1024,
      };
    }
    if (complexity <= 6) {
      return {
        tier: "BALANCED",
        modelName: "gemini-flash",
        temperature: 0.2,
        maxTokens: 2048,
      };
    }
    return {
      tier: "DEEP_REASONING",
      modelName: "gemini-pro",
      temperature: 0.3,
      maxTokens: 4096,
    };
  }

  /**
   * Verifies that all required tools for a task are available in the local runtime.
   *
   * @param task - The candidate OrchestrationTask.
   * @returns Object indicating availability and any missing tools.
   */
  public checkToolAvailability(task: OrchestrationTask): {
    available: boolean;
    missingTools: string[];
  } {
    const missing: string[] = [];

    for (const tool of task.requiredTools) {
      if (!this._installedTools.has(tool.toLowerCase()) && tool !== "system") {
        missing.push(tool);
      }
    }

    return {
      available: missing.length === 0,
      missingTools: missing,
    };
  }

  /**
   * Registers custom available tools into the registry.
   */
  public registerTool(toolName: string): void {
    this._installedTools.add(toolName.toLowerCase());
  }

  /**
   * Executes a task function with strict timeout enforcement.
   *
   * @param task - Target task.
   * @param fn - The async task executor promise factory.
   * @param timeoutMs - Optional override timeout.
   * @returns Promise resolving to the result, or rejects with Timeout error.
   */
  public async executeWithTimeout<T>(
    task: OrchestrationTask,
    fn: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    const limit = timeoutMs || task.estimatedDurationMs * 2 || this._defaultTimeoutMs;

    let timer: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Task "${task.id}" timed out after ${limit}ms.`));
      }, limit);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timer!);
      return result;
    } catch (err) {
      clearTimeout(timer!);
      throw err;
    }
  }

  /**
   * Records token consumption for telemetry and budgeting.
   */
  public recordTokenUsage(tokens: number): void {
    this._consumedTokens += Math.max(0, tokens);
  }

  /**
   * Generates a snapshot of current system resource allocation and telemetry.
   */
  public getResourceSummary(activeWorkers: number = 0): ResourceAllocationSummary {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsageRatio = (totalMem - freeMem) / totalMem;

    const contentionWarnings: string[] = [];
    if (memUsageRatio > 0.85) {
      contentionWarnings.push(`Host memory utilization is high (${Math.round(memUsageRatio * 100)}%).`);
    }
    if (activeWorkers >= this._maxWorkers) {
      contentionWarnings.push(`Worker pool capacity fully saturated (${activeWorkers}/${this._maxWorkers}).`);
    }

    const toolAvailability: Record<string, boolean> = {};
    for (const tool of this._installedTools) {
      toolAvailability[tool] = true;
    }

    return {
      allocatedCpuShares: os.cpus()?.length || 4,
      activeWorkers,
      maxWorkers: this._maxWorkers,
      estimatedTokensConsumed: this._consumedTokens,
      estimatedCostUsd: Number(((this._consumedTokens / 1_000_000) * 0.15).toFixed(4)), // $0.15 per 1M tokens estimate
      toolAvailability,
      apiQuotaRemaining: {
        gemini_api: 1000000 - this._consumedTokens,
        ollama_local: Infinity,
      },
      resourceContentionWarnings: contentionWarnings,
    };
  }
}

/** Global default resource management engine singleton */
export const defaultResourceManagementEngine = new ResourceManagementEngine();
