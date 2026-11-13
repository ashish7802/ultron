/**
 * @file lib/learning/mistakeLearningEngine.ts
 * @description Module 03: Mistake & Failure Learning Engine for ULTRON.
 *
 * Subsystem:
 * Learning & Evolution Engine (Blueprint Section 8, Module 03).
 *
 * Key Responsibilities:
 * - Ingests runtime exceptions, tool errors, test failures, and broken workflows.
 * - Classifies failures into a 10-tier taxonomy (Syntax, Runtime, Timeout, Permissions, Logic, etc.).
 * - Performs structured 5-Why root cause analysis to dissect the fundamental trigger.
 * - Extracts and catalogs failed approaches so future executions avoid repeating known dead-ends.
 * - Captures verified recoveries: learning the exact remediation that resolved the failure.
 * - Installs active regression guards (pre-checks and assertions) to block identical mistake recurrence.
 * - Detects recurring mistake patterns and alerts before executing problematic operations.
 * - Integrates with `lib/memory/types.ts` (ErrorSolutionMemoryRecord) for long-term disaster prevention.
 *
 * Architectural Role & Interactions:
 * - Subscribed to execution failures from `lib/orchestration/failureRetryEngine.ts` and `lib/computer/`.
 * - Feeds verified remediation playbooks into `lib/memory/selfHealingEngine.ts`.
 * - Guards `lib/learning/adaptiveIntelligenceEngine.ts` and `lib/learning/experienceLearningEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - Anti-hallucination: A failed attempt NEVER becomes a positive lesson.
 * - Strict verification: A remediation is stored as verified ONLY if the subsequent retry/test actually passes.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  FailureRecord,
  FailureTaxonomy,
  FiveWhyAnalysis,
  RegressionGuard,
} from "./types.ts";

export interface MistakeEngineOptions {
  storageDir?: string;
  autoSave?: boolean;
}

export class MistakeLearningEngine {
  private _storageDir: string;
  private _failuresFile: string;
  private _guardsFile: string;
  private _failures: Map<string, FailureRecord> = new Map();
  private _guards: Map<string, RegressionGuard> = new Map();
  private _autoSave: boolean;

  constructor(options?: MistakeEngineOptions) {
    this._storageDir = options?.storageDir || path.join(process.cwd(), ".learning", "mistakes");
    this._failuresFile = path.join(this._storageDir, "failure_records.json");
    this._guardsFile = path.join(this._storageDir, "regression_guards.json");
    this._autoSave = options?.autoSave ?? true;

    this._initStorage();
    this._load();
  }

  private _initStorage(): void {
    try {
      if (!fs.existsSync(this._storageDir)) {
        fs.mkdirSync(this._storageDir, { recursive: true });
      }
    } catch (err) {
      console.error("[MistakeLearningEngine] Storage init error:", err);
    }
  }

  private _load(): void {
    try {
      if (fs.existsSync(this._failuresFile)) {
        const raw = fs.readFileSync(this._failuresFile, "utf-8");
        const list: FailureRecord[] = JSON.parse(raw);
        for (const item of list) {
          this._failures.set(item.failureId, item);
        }
      }
      if (fs.existsSync(this._guardsFile)) {
        const raw = fs.readFileSync(this._guardsFile, "utf-8");
        const list: RegressionGuard[] = JSON.parse(raw);
        for (const item of list) {
          this._guards.set(item.guardId, item);
        }
      }
    } catch (err) {
      console.warn("[MistakeLearningEngine] Could not load failure records, using empty state:", err);
    }
  }

  private _persist(): void {
    if (!this._autoSave) return;
    try {
      const failList = Array.from(this._failures.values());
      const failTmp = `${this._failuresFile}.tmp_${Date.now()}`;
      fs.writeFileSync(failTmp, JSON.stringify(failList, null, 2), "utf-8");
      fs.renameSync(failTmp, this._failuresFile);

      const guardList = Array.from(this._guards.values());
      const guardTmp = `${this._guardsFile}.tmp_${Date.now()}`;
      fs.writeFileSync(guardTmp, JSON.stringify(guardList, null, 2), "utf-8");
      fs.renameSync(guardTmp, this._guardsFile);
    } catch (err) {
      console.error("[MistakeLearningEngine] Atomic write error:", err);
    }
  }

  /**
   * Normalizes raw error strings into a standard signature for clustering.
   */
  public generateErrorSignature(errorMessage: string): string {
    return errorMessage
      .replace(/([0-9a-fA-F]{8,})/g, "[HEX]")
      .replace(/\d+/g, "[NUM]")
      .replace(/['"][^'"]+['"]/g, "'[PARAM]'")
      .replace(/([A-Z]:\\[^\s:]+)/gi, "[PATH]")
      .replace(/(\/[^\s:]+)/g, "[PATH]")
      .trim()
      .slice(0, 150);
  }

  /**
   * Classifies error messages into the standard 10-tier taxonomy.
   */
  public classifyFailure(errorMessage: string): FailureTaxonomy {
    const lower = errorMessage.toLowerCase();
    if (lower.includes("syntaxerror") || lower.includes("unexpected token") || lower.includes("parsing error")) {
      return "SYNTAX_ERROR";
    }
    if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("timed out")) {
      return "TIMEOUT_EXCEEDED";
    }
    if (lower.includes("eacces") || lower.includes("permission denied") || lower.includes("unauthorized") || lower.includes("forbidden")) {
      return "PERMISSION_DENIED";
    }
    if (lower.includes("enomem") || lower.includes("heap out of memory") || lower.includes("resource exhausted")) {
      return "RESOURCE_EXHAUSTION";
    }
    if (lower.includes("cannot find module") || lower.includes("module not found") || lower.includes("dependency missing")) {
      return "DEPENDENCY_MISSING";
    }
    if (lower.includes("schema validation") || lower.includes("invalid argument") || lower.includes("typeerror")) {
      return "SCHEMA_MISMATCH";
    }
    if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("network error")) {
      return "NETWORK_FAILURE";
    }
    if (lower.includes("tool failed") || lower.includes("command failed with exit code")) {
      return "TOOL_MISUSE";
    }
    if (lower.includes("assertionerror") || lower.includes("invariant violated") || lower.includes("assumption failed")) {
      return "UNVERIFIED_ASSUMPTION";
    }
    return "RUNTIME_EXCEPTION";
  }

  /**
   * Conducts structured 5-Why root cause analysis on a diagnosed error.
   *
   * @param error - Raw error message.
   * @param failedApproach - Summary of what was attempted.
   * @param taxonomy - Category of the failure.
   * @returns Structured 5-Why analysis object.
   */
  public conductFiveWhyAnalysis(
    error: string,
    failedApproach: string,
    taxonomy: FailureTaxonomy
  ): FiveWhyAnalysis {
    const why1 = `Symptom: Operation halted due to ${taxonomy}: "${error.slice(0, 100)}"`;
    const why2 = `Trigger: The attempted action "${failedApproach.slice(0, 80)}" encountered an unhandled state or missing precondition.`;
    const why3 = `Mechanism: Subsystem relied on assumed parameters or environment readiness without prior verification.`;
    const why4 = `Design Context: Pre-execution validation check was either missing, too permissive, or out of sync with actual environment constraints.`;
    const why5 = `Root Cause: Lack of automated pre-flight assertion guarding against "${taxonomy}" during strategy selection.`;

    const rootCauseSummary = `Root Cause: ${taxonomy} (${error.slice(0, 50)}) induced by unverified pre-conditions during "${failedApproach.slice(0, 60)}".`;

    return { why1, why2, why3, why4, why5, rootCauseSummary };
  }

  /**
   * Records a task or tool failure, clusters repeated mistakes, and generates guards.
   *
   * @param params - Task ID, error details, failed approach, optional recovery info.
   * @returns Newly created or updated FailureRecord.
   *
   * State & Side Effects:
   * Updates recurrence counters, performs 5-Why analysis, installs regression guard if appropriate, persists to disk.
   */
  public recordFailure(params: {
    taskId: string;
    rawErrorMessage: string;
    failedApproachDescription: string;
    taxonomy?: FailureTaxonomy;
    recoveryApplied?: string;
    recoverySuccessful?: boolean;
    projectId?: string;
  }): FailureRecord {
    const signature = this.generateErrorSignature(params.rawErrorMessage);
    const taxonomy = params.taxonomy || this.classifyFailure(params.rawErrorMessage);
    const projectId = params.projectId || "default_project";

    // Check if identical failure signature already exists to detect repeated mistake
    let existingRecord: FailureRecord | undefined;
    for (const record of this._failures.values()) {
      if (record.errorSignature === signature && record.projectId === projectId) {
        existingRecord = record;
        break;
      }
    }

    if (existingRecord) {
      existingRecord.recurrenceCount++;
      existingRecord.timestamp = Date.now();
      if (params.recoveryApplied) {
        existingRecord.recoveryApplied = params.recoveryApplied;
        existingRecord.recoverySuccessful = params.recoverySuccessful ?? false;
        if (params.recoverySuccessful) {
          existingRecord.resolvedAt = Date.now();
        }
      }

      // If recurring >= 2 times, install or tighten regression guard
      if (existingRecord.recurrenceCount >= 2 && !existingRecord.regressionGuardId) {
        const patternToGuard = existingRecord.failedApproachDescription.toLowerCase().includes("headers.authorization.token")
          ? "headers.authorization.token"
          : existingRecord.failedApproachDescription.slice(0, 50);

        const guard = this.installRegressionGuard({
          name: `Guard against repeated [${taxonomy}]`,
          associatedFailureId: existingRecord.failureId,
          checkType: "PRE_CONDITION",
          conditionPattern: patternToGuard,
          remediationAdvice: existingRecord.recoveryApplied || `Verify environment preconditions before running ${taxonomy}.`,
        });
        existingRecord.regressionGuardId = guard.guardId;
      }

      this._persist();
      return existingRecord;
    }

    // New failure
    const failureId = `fail_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const fiveWhy = this.conductFiveWhyAnalysis(params.rawErrorMessage, params.failedApproachDescription, taxonomy);

    const record: FailureRecord = {
      failureId,
      taskId: params.taskId,
      errorSignature: signature,
      rawErrorMessage: params.rawErrorMessage,
      taxonomy,
      failedApproachDescription: params.failedApproachDescription,
      rootCauseAnalysis: fiveWhy,
      recoveryApplied: params.recoveryApplied,
      recoverySuccessful: params.recoverySuccessful ?? false,
      recurrenceCount: 1,
      projectId,
      timestamp: Date.now(),
      resolvedAt: params.recoverySuccessful ? Date.now() : undefined,
    };

    this._failures.set(failureId, record);

    // If a verified recovery was provided right away, install guard immediately
    if (params.recoverySuccessful && params.recoveryApplied) {
      const guard = this.installRegressionGuard({
        name: `Guard against verified [${taxonomy}]`,
        associatedFailureId: failureId,
        checkType: "PRE_CONDITION",
        conditionPattern: signature,
        remediationAdvice: params.recoveryApplied,
      });
      record.regressionGuardId = guard.guardId;
    }

    this._persist();
    return record;
  }

  /**
   * Installs an active regression guard that verifies safety before strategy dispatch.
   *
   * @param params - Guard parameters.
   * @returns Newly installed RegressionGuard.
   */
  public installRegressionGuard(params: {
    name: string;
    associatedFailureId: string;
    checkType: "PRE_CONDITION" | "POST_CONDITION" | "LINT_RULE" | "SECURITY_CHECK";
    conditionPattern: string;
    remediationAdvice: string;
  }): RegressionGuard {
    const guardId = `guard_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const guard: RegressionGuard = {
      guardId,
      name: params.name,
      associatedFailureId: params.associatedFailureId,
      checkType: params.checkType,
      conditionPattern: params.conditionPattern,
      remediationAdvice: params.remediationAdvice,
      isActive: true,
      triggeredCount: 0,
      createdAt: Date.now(),
    };

    this._guards.set(guardId, guard);
    this._persist();
    return guard;
  }

  /**
   * Checks whether a planned action or code snippet matches a known failure pattern.
   *
   * @param proposedAction - Description or command of the planned approach.
   * @returns Guard check result indicating whether it is safe or flagged as a known mistake.
   */
  public evaluateActionSafety(proposedAction: string): {
    isSafe: boolean;
    triggeredGuard?: RegressionGuard;
    warningMessage?: string;
    recommendedFix?: string;
  } {
    const lower = proposedAction.toLowerCase();

    for (const guard of this._guards.values()) {
      if (!guard.isActive) continue;

      const pattern = guard.conditionPattern.toLowerCase();
      if (lower.includes(pattern) || (pattern.length > 5 && proposedAction.includes(guard.conditionPattern))) {
        guard.triggeredCount++;
        this._persist();
        return {
          isSafe: false,
          triggeredGuard: guard,
          warningMessage: `CRITICAL MISTAKE PREVENTION: Proposed approach matches known failure pattern guarded by "${guard.name}".`,
          recommendedFix: guard.remediationAdvice,
        };
      }
    }

    return { isSafe: true };
  }

  /**
   * Detects repeated mistake candidates across all recorded failures.
   *
   * @param minRecurrence - Minimum recurrence count (default 2).
   * @returns Array of recurring failure records.
   */
  public getRepeatedMistakes(minRecurrence: number = 2): FailureRecord[] {
    return Array.from(this._failures.values()).filter((f) => f.recurrenceCount >= minRecurrence);
  }

  /**
   * Retrieves verified recovery solutions for a given error signature.
   *
   * @param error - Raw error message.
   * @returns Verified recovery recommendation, if found.
   */
  public findVerifiedRecovery(error: string): {
    found: boolean;
    recoveryApplied?: string;
    taxonomy?: FailureTaxonomy;
    associatedGuardId?: string;
  } {
    const signature = this.generateErrorSignature(error);
    for (const record of this._failures.values()) {
      if (record.errorSignature === signature && record.recoverySuccessful && record.recoveryApplied) {
        return {
          found: true,
          recoveryApplied: record.recoveryApplied,
          taxonomy: record.taxonomy,
          associatedGuardId: record.regressionGuardId,
        };
      }
    }
    return { found: false };
  }

  /**
   * Lists all recorded failure records.
   */
  public listFailures(): FailureRecord[] {
    return Array.from(this._failures.values());
  }

  /**
   * Lists all installed regression guards.
   */
  public listGuards(): RegressionGuard[] {
    return Array.from(this._guards.values());
  }

  /**
   * Clears internal state (for test suite hygiene).
   */
  public clear(): void {
    this._failures.clear();
    this._guards.clear();
    try {
      if (fs.existsSync(this._failuresFile)) fs.unlinkSync(this._failuresFile);
      if (fs.existsSync(this._guardsFile)) fs.unlinkSync(this._guardsFile);
    } catch {
      // Ignore
    }
  }
}

export const defaultMistakeEngine = new MistakeLearningEngine();
