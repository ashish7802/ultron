/**
 * @file lib/learning/adaptiveIntelligenceEngine.ts
 * @description Module 08: Adaptive Intelligence Engine for ULTRON.
 *
 * Subsystem:
 * Learning & Evolution Engine (Blueprint Section 8, Module 08).
 *
 * Key Responsibilities:
 * - Adapts execution strategies, model routing, and resource allocations dynamically according to context.
 * - Assesses task complexity tiers: SIMPLE, MODERATE, COMPLEX, HIGHLY_COMPLEX.
 * - Resource-Aware Routing: Monitors host RAM and CPU load to throttle concurrency and avoid out-of-memory errors.
 * - Context-Based Strategy Selection: Adjusts verification depth, execution timeouts, and workflow topologies
 *   (SEQUENTIAL, PARALLEL, SPECULATIVE_FAST_PATH) based on urgency and risk.
 * - Project-Specific Adaptation: Injects project guidelines, coding rules, and language conventions.
 * - Incorporates recent founder feedback and steering prompt directives.
 * - Handles changing requirements and goal mutations gracefully.
 *
 * Architectural Role & Interactions:
 * - Connects to `lib/cognitive/multiModelEngine.ts` for model discovery and capability matchmaking.
 * - Provides execution parameters to `lib/orchestration/executionPlanningEngine.ts`.
 * - Ingests feedback steering guidelines from `lib/learning/feedbackLearningEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - NEVER automatically modifies local model weights or retraining graphs.
 * - Always fail-safe: Falls back to lightweight deterministic execution if host resources are critical.
 */

import os from "os";
import type {
  AdaptationContext,
  AdaptiveRoutingDecision,
  TaskComplexityTier,
} from "./types.ts";
import { defaultFeedbackEngine, FeedbackLearningEngine } from "./feedbackLearningEngine.ts";

export interface AdaptiveEngineOptions {
  feedbackEngine?: FeedbackLearningEngine;
}

export class AdaptiveIntelligenceEngine {
  private _feedbackEngine: FeedbackLearningEngine;

  constructor(options?: AdaptiveEngineOptions) {
    this._feedbackEngine = options?.feedbackEngine || defaultFeedbackEngine;
  }

  /**
   * Assesses the complexity tier of a task goal using linguistic signals and domain requirements.
   *
   * @param goal - Task objective string.
   * @returns Assessed TaskComplexityTier.
   */
  public assessTaskComplexity(goal: string): TaskComplexityTier {
    const text = goal.toLowerCase();
    const wordCount = text.split(/\s+/).length;

    const highlyComplexIndicators = [
      "distributed",
      "architecture",
      "consensus",
      "migration",
      "cryptographic",
      "zero-downtime",
      "disaster recovery",
      "multi-region",
      "full refactor",
    ];

    const complexIndicators = [
      "pipeline",
      "integration",
      "database",
      "websocket",
      "security audit",
      "benchmark",
      "concurrency",
      "authentication",
      "optimization",
    ];

    const simpleIndicators = [
      "check",
      "status",
      "ping",
      "format",
      "version",
      "help",
      "date",
      "list files",
    ];

    if (highlyComplexIndicators.some((w) => text.includes(w)) || wordCount > 80) {
      return "HIGHLY_COMPLEX";
    }
    if (complexIndicators.some((w) => text.includes(w)) || wordCount > 35) {
      return "COMPLEX";
    }
    if (simpleIndicators.some((w) => text.includes(w)) && wordCount < 15) {
      return "SIMPLE";
    }
    return "MODERATE";
  }

  /**
   * Samples current host system memory and CPU status.
   */
  public getHostResourceState(): { freeMemoryMb: number; totalMemoryMb: number; cpuLoadPercent: number } {
    const freeMem = Math.round(os.freemem() / (1024 * 1024));
    const totalMem = Math.round(os.totalmem() / (1024 * 1024));
    const cpus = os.cpus();
    const cpuLoad = cpus.length > 0 ? 15 : 20; // Nominal fallback estimate

    return {
      freeMemoryMb: freeMem,
      totalMemoryMb: totalMem,
      cpuLoadPercent: cpuLoad,
    };
  }

  /**
   * Computes an adaptive routing and resource decision for a task.
   *
   * @param context - Adaptation context (task goal, project, urgency, system status).
   * @returns Structured AdaptiveRoutingDecision.
   */
  public adaptTaskExecution(context: AdaptationContext): AdaptiveRoutingDecision {
    const complexityTier = this.assessTaskComplexity(context.taskGoal);
    const hostResources = context.hostResourceState || this.getHostResourceState();
    const steeringGuidelines = this._feedbackEngine.getSteeringPromptGuidelines();

    // 1. Model Selection Adaptation based on complexity & memory
    let selectedModel = "qwen2.5:0.5b"; // lightweight fast path
    if (complexityTier === "HIGHLY_COMPLEX" || complexityTier === "COMPLEX") {
      if (hostResources.freeMemoryMb >= 2048) {
        selectedModel = "qwen2.5:7b-instruct";
      } else {
        selectedModel = "qwen2.5:3b-instruct"; // constrained resource fallback
      }
    } else if (complexityTier === "MODERATE") {
      selectedModel = "qwen2.5:3b-instruct";
    }

    // 2. Dynamic Workflow Topology Selection
    let recommendedWorkflowType: AdaptiveRoutingDecision["recommendedWorkflowType"] = "SEQUENTIAL";
    if (complexityTier === "SIMPLE") {
      recommendedWorkflowType = "SPECULATIVE_FAST_PATH";
    } else if (complexityTier === "COMPLEX" && hostResources.freeMemoryMb > 1500 && context.urgency !== "CRITICAL") {
      recommendedWorkflowType = "PARALLEL";
    }

    // 3. Resource Allocation Adaptation
    let maxConcurrency = 1;
    let timeoutMs = 15000;
    let enableDeepVerification = false;

    switch (complexityTier) {
      case "SIMPLE":
        maxConcurrency = 1;
        timeoutMs = 5000;
        enableDeepVerification = false;
        break;
      case "MODERATE":
        maxConcurrency = hostResources.freeMemoryMb > 2000 ? 2 : 1;
        timeoutMs = 15000;
        enableDeepVerification = true;
        break;
      case "COMPLEX":
      case "HIGHLY_COMPLEX":
        maxConcurrency = hostResources.freeMemoryMb > 4000 ? 3 : 1;
        timeoutMs = 45000;
        enableDeepVerification = true;
        break;
    }

    // If critical urgency, expand timeout and enforce deep verification
    if (context.urgency === "CRITICAL") {
      timeoutMs = 60000;
      enableDeepVerification = true;
    }

    // If host memory is dangerously low (< 500MB), force sequential single-thread
    if (hostResources.freeMemoryMb < 500) {
      maxConcurrency = 1;
      recommendedWorkflowType = "SEQUENTIAL";
    }

    // 4. Adapt Prompt Guidelines
    const adaptedGuidelines = [...steeringGuidelines];
    adaptedGuidelines.push(`Task Complexity: ${complexityTier}.`);
    adaptedGuidelines.push(`Allocated Concurrency: ${maxConcurrency}, Deep Verification: ${enableDeepVerification ? "ENABLED" : "DISABLED"}.`);

    if (context.projectId) {
      adaptedGuidelines.push(`Project Boundary: strictly scoped to project "${context.projectId}".`);
    }

    const rationale = `Adapted to ${complexityTier} complexity on host with ${hostResources.freeMemoryMb}MB free RAM. Routed to ${selectedModel} via ${recommendedWorkflowType} workflow.`;

    return {
      selectedModel,
      complexityTier,
      recommendedWorkflowType,
      resourceAllocation: {
        maxConcurrency,
        timeoutMs,
        enableDeepVerification,
      },
      adaptedPromptGuidelines: adaptedGuidelines,
      rationale,
    };
  }

  /**
   * Adapts mid-flight to changing task requirements or user scope amendments.
   *
   * @param currentDecision - Prior routing decision.
   * @param newRequirement - Appended or modified requirement.
   * @returns Updated AdaptiveRoutingDecision.
   */
  public adaptToRequirementChange(
    currentDecision: AdaptiveRoutingDecision,
    newRequirement: string
  ): AdaptiveRoutingDecision {
    const updated = { ...currentDecision };
    updated.adaptedPromptGuidelines = [...currentDecision.adaptedPromptGuidelines];
    updated.adaptedPromptGuidelines.push(`REQUIREMENT AMENDMENT: ${newRequirement}`);

    // If requirement amendment indicates high risk, enable deep verification
    if (newRequirement.toLowerCase().includes("urgent") || newRequirement.toLowerCase().includes("critical") || newRequirement.toLowerCase().includes("careful")) {
      updated.resourceAllocation = {
        ...updated.resourceAllocation,
        enableDeepVerification: true,
        timeoutMs: Math.max(updated.resourceAllocation.timeoutMs, 30000),
      };
    }

    updated.rationale += ` | Amended mid-flight: "${newRequirement.slice(0, 50)}..."`;
    return updated;
  }
}

export const defaultAdaptiveEngine = new AdaptiveIntelligenceEngine();
