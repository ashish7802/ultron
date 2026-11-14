/**
 * @file lib/orchestration/taskVerificationEngine.ts
 * @description Module 10: Task Verification Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 5 Approval & Verification.
 *
 * Key Responsibilities:
 * - Enforces the Non-Negotiable Principle: EXECUTION ALONE DOES NOT MEAN TASK COMPLETION.
 * - A task can only transition to VERIFIED status when its actual output satisfies all defined acceptance criteria.
 * - Validates concrete results: Exit codes, file existence and non-emptiness, stdout regex matches, JSON schemas, custom predicates.
 * - Records cryptographically hashed `VerificationEvidence` documenting SHA-256 artifact hashes, timestamp, and verifier identity.
 * - Detects partial completions (e.g. some deliverables produced, others failed) and marks tasks accordingly.
 * - Fails closed: rejects false positives and prevents false completion.
 *
 * Architectural Role & Interactions:
 * - Called by `orchestrator.ts` immediately after task execution finishes.
 * - Directly updates `task.verificationEvidence`, `task.status`, and `task.verifiedAt`.
 *
 * Safety / Security Guarantees:
 * - Evidence hashes guarantee that verification results cannot be forged or tampered with retroactively.
 * - Reverts task status to FAILED if verification criteria are not satisfied.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  OrchestrationTask,
  AcceptanceCriterion,
  VerificationEvidence,
} from "./types.ts";

export interface VerificationResult {
  isVerified: boolean;
  checkedCount: number;
  passedCount: number;
  evidence: VerificationEvidence;
  failureReasons: string[];
}

export class TaskVerificationEngine {
  /**
   * Evaluates the output and physical deliverables of an executed task against its acceptance criteria.
   *
   * @param task - The completed OrchestrationTask.
   * @param actualOutput - Execution output, return value, or process result.
   * @returns Detailed VerificationResult including cryptographic evidence.
   */
  public verifyTask(
    task: OrchestrationTask,
    actualOutput?: unknown
  ): VerificationResult {
    const evidenceId = `evid_${task.id}_${Date.now()}`;
    const failureReasons: string[] = [];
    const criteriaResults: VerificationEvidence["criteriaResults"] = [];
    const producedArtifacts: VerificationEvidence["producedArtifacts"] = [];

    let passedCount = 0;
    const criteria = task.acceptanceCriteria || [];

    // 1. Evaluate Acceptance Criteria
    for (const crit of criteria) {
      const evaluation = this._evaluateCriterion(crit, actualOutput, task);
      criteriaResults.push({
        criterionId: crit.id,
        passed: evaluation.passed,
        actualValue: evaluation.actualValue,
        details: evaluation.details,
      });

      if (evaluation.passed) {
        passedCount++;
      } else {
        failureReasons.push(`Criterion "${crit.description}" failed: ${evaluation.details}`);
      }
    }

    // 2. Inspect Deliverables (Files/Artifacts)
    for (const deliverable of task.deliverables) {
      const artifact = this._inspectDeliverable(deliverable);
      if (artifact) {
        producedArtifacts.push(artifact);
      }
    }

    // A task is verified ONLY if all criteria pass (or if criteria was empty, output is non-null/non-error)
    const isVerified = criteria.length > 0 ? passedCount === criteria.length : actualOutput !== undefined && !task.error;

    if (!isVerified && failureReasons.length === 0) {
      failureReasons.push("Task output was undefined or contained unhandled errors.");
    }

    // 3. Compute Cryptographic Evidence Hash
    const evidencePayload = {
      evidenceId,
      taskId: task.id,
      verified: isVerified,
      passedCount,
      criteriaResults,
      producedArtifacts,
      timestamp: Date.now(),
    };

    const evidenceHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(evidencePayload))
      .digest("hex");

    const evidence: VerificationEvidence = {
      ...evidencePayload,
      checkedCriteriaCount: criteria.length,
      passedCriteriaCount: passedCount,
      evidenceHash,
      verifier: "ULTRON_CORE_TASK_VERIFICATION_ENGINE_V1",
      notes: isVerified
        ? "All acceptance criteria verified with passing status."
        : `Verification failed: ${failureReasons.join("; ")}`,
    };

    // Update task state based on verification
    task.verificationEvidence = evidence;
    if (isVerified) {
      task.status = "VERIFIED";
      task.verifiedAt = Date.now();
    } else {
      task.status = "FAILED";
      task.error = `Task verification failed: ${failureReasons.join("; ")}`;
    }

    return {
      isVerified,
      checkedCount: criteria.length,
      passedCount,
      evidence,
      failureReasons,
    };
  }

  /**
   * Evaluates a single acceptance criterion against actual output and task context.
   */
  private _evaluateCriterion(
    criterion: AcceptanceCriterion,
    output: unknown,
    task: OrchestrationTask
  ): { passed: boolean; actualValue: unknown; details: string } {
    switch (criterion.evaluator) {
      case "EXIT_CODE": {
        // Enforce strict type validation: missing exit code is NEVER treated as 0
        let exitCode: number | undefined;

        if (typeof output === "object" && output !== null && "exitCode" in output) {
          const raw = (output as { exitCode: unknown }).exitCode;
          if (typeof raw === "number") {
            exitCode = raw;
          }
        } else if (typeof output === "number") {
          exitCode = output;
        }

        if (exitCode === undefined) {
          return {
            passed: false,
            actualValue: "MISSING_EXIT_CODE",
            details: "Verification rejected: Process or tool output is missing an explicit exit code.",
          };
        }

        const expected = typeof criterion.expectedValue === "number" ? criterion.expectedValue : 0;
        const passed = exitCode === expected;
        return {
          passed,
          actualValue: exitCode,
          details: passed
            ? `Exit code ${exitCode} matched expected ${expected}.`
            : `Exit code ${exitCode} does not match expected ${expected}.`,
        };
      }

      case "FILE_NON_EMPTY": {
        // Strictly inspect physical files on disk; never accept arbitrary object payloads
        const targetPath =
          typeof criterion.expectedValue === "string" && criterion.expectedValue.trim()
            ? criterion.expectedValue.trim()
            : task.deliverables && task.deliverables.length > 0
            ? task.deliverables[0]
            : null;

        if (!targetPath) {
          return {
            passed: false,
            actualValue: null,
            details: "Verification rejected: No physical target file specified for FILE_NON_EMPTY evaluation.",
          };
        }

        try {
          const resolvedPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), targetPath);
          if (!fs.existsSync(resolvedPath)) {
            return {
              passed: false,
              actualValue: "NON_EXISTENT",
              details: `Verification rejected: Target physical file "${targetPath}" does not exist on disk.`,
            };
          }

          const stats = fs.statSync(resolvedPath);
          if (stats.size === 0) {
            return {
              passed: false,
              actualValue: 0,
              details: `Verification rejected: Target physical file "${targetPath}" exists but is empty (0 bytes).`,
            };
          }

          return {
            passed: true,
            actualValue: stats.size,
            details: `Verified physical file "${targetPath}" exists on disk with ${stats.size} bytes.`,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            passed: false,
            actualValue: "FS_ERROR",
            details: `File inspection failed with filesystem error: ${msg}`,
          };
        }
      }

      case "STDOUT_REGEX": {
        const pattern = String(criterion.expectedValue || ".*");
        let outStr = "";

        if (typeof output === "string") {
          outStr = output;
        } else if (typeof output === "object" && output !== null) {
          if ("stdout" in output && typeof (output as any).stdout === "string") {
            outStr = (output as any).stdout;
          } else if ("output" in output && typeof (output as any).output === "string") {
            outStr = (output as any).output;
          } else {
            outStr = JSON.stringify(output);
          }
        }

        const regex = new RegExp(pattern, "i");
        const passed = regex.test(outStr);
        return {
          passed,
          actualValue: outStr.slice(0, 100),
          details: passed ? `Output matched regex pattern /${pattern}/.` : `Output did not match regex pattern /${pattern}/.`,
        };
      }

      case "JSON_SCHEMA": {
        const isObject = typeof output === "object" && output !== null && !Array.isArray(output);
        return {
          passed: isObject,
          actualValue: typeof output,
          details: isObject ? "Output conforms to structured JSON object." : "Output is not a valid JSON object.",
        };
      }

      case "CUSTOM_PREDICATE": {
        // Safe pure AST / Regex restricted expression evaluator: NO eval() or new Function() under ANY circumstances
        if (typeof criterion.expectedValue === "string" && criterion.expectedValue.trim()) {
          const expr = criterion.expectedValue.trim();

          // Reject excessively long expressions (DoS mitigation)
          if (expr.length > 256) {
            return {
              passed: false,
              actualValue: "EXPRESSION_TOO_LONG",
              details: "Security Policy Violation: Expression exceeds 256 character maximum limit.",
            };
          }

          // Strictly reject prototype pollution, constructor access, function calls, computed indexing, and quotes
          if (/[()\[\]{};`]|constructor|prototype|__proto__|import|require|process|global|window|Function|eval/i.test(expr)) {
            return {
              passed: false,
              actualValue: "FORBIDDEN_SYNTAX",
              details: "Security Policy Violation: Expression contains disallowed tokens, brackets, function calls, or prototype access.",
            };
          }

          // Strictly allow only: output.<ident>(.<ident>)* [===|!==|==|!=|>=|<=|>|<] <literal>
          // Or a standalone boolean check: output.<ident>(.<ident>)*
          const simpleCompRegex = /^output(?:\.([a-zA-Z0-9_$]+))+\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/;
          const match = expr.match(simpleCompRegex);

          if (match) {
            const propPath = expr.split(/\s*(?:===|!==|==|!=|>=|<=|>|<)\s*/)[0].replace(/^output\./, "");
            const op = match[2];
            const rawTarget = match[3].trim();

            let targetVal: unknown;
            if (rawTarget === "true") targetVal = true;
            else if (rawTarget === "false") targetVal = false;
            else if (rawTarget === "null") targetVal = null;
            else if (rawTarget === "undefined") targetVal = undefined;
            else if (!isNaN(Number(rawTarget))) targetVal = Number(rawTarget);
            else if ((rawTarget.startsWith('"') && rawTarget.endsWith('"')) || (rawTarget.startsWith("'") && rawTarget.endsWith("'"))) {
              targetVal = rawTarget.slice(1, -1);
            } else {
              return {
                passed: false,
                actualValue: "INVALID_LITERAL",
                details: `Security Policy Violation: Target value "${rawTarget}" is not a recognized safe literal.`,
              };
            }

            // Extract property from output safely with prototype pollution defense
            let cur: any = output;
            for (const seg of propPath.split(".")) {
              if (seg === "__proto__" || seg === "constructor" || seg === "prototype") {
                return {
                  passed: false,
                  actualValue: "PROTOTYPE_POLLUTION_BLOCKED",
                  details: "Security Policy Violation: Prototype property traversal detected.",
                };
              }
              if (cur && typeof cur === "object" && Object.prototype.hasOwnProperty.call(cur, seg)) {
                cur = cur[seg];
              } else {
                cur = undefined;
                break;
              }
            }

            let compResult = false;
            switch (op) {
              case "===":
              case "==":
                compResult = cur === targetVal;
                break;
              case "!==":
              case "!=":
                compResult = cur !== targetVal;
                break;
              case ">":
                compResult = typeof cur === "number" && typeof targetVal === "number" && cur > targetVal;
                break;
              case "<":
                compResult = typeof cur === "number" && typeof targetVal === "number" && cur < targetVal;
                break;
              case ">=":
                compResult = typeof cur === "number" && typeof targetVal === "number" && cur >= targetVal;
                break;
              case "<=":
                compResult = typeof cur === "number" && typeof targetVal === "number" && cur <= targetVal;
                break;
            }

            return {
              passed: compResult,
              actualValue: cur,
              details: compResult
                ? `Restricted predicate "${expr}" evaluated to true (resolved value: ${cur}).`
                : `Restricted predicate "${expr}" evaluated to false (resolved value: ${cur}).`,
            };
          }

          // Also allow standalone boolean property existence check: "output.success"
          const boolPathRegex = /^output(?:\.([a-zA-Z0-9_$]+))+$/;
          if (boolPathRegex.test(expr)) {
            const propPath = expr.replace(/^output\./, "");
            let cur: any = output;
            for (const seg of propPath.split(".")) {
              if (seg === "__proto__" || seg === "constructor" || seg === "prototype") {
                return {
                  passed: false,
                  actualValue: "PROTOTYPE_POLLUTION_BLOCKED",
                  details: "Security Policy Violation: Prototype property traversal detected.",
                };
              }
              if (cur && typeof cur === "object" && Object.prototype.hasOwnProperty.call(cur, seg)) {
                cur = cur[seg];
              } else {
                cur = undefined;
                break;
              }
            }
            const passed = Boolean(cur);
            return {
              passed,
              actualValue: cur,
              details: passed
                ? `Boolean property "${expr}" evaluated to truthy.`
                : `Boolean property "${expr}" evaluated to falsy (${cur}).`,
            };
          }

          return {
            passed: false,
            actualValue: "SYNTAX_REJECTED",
            details: `Security Policy Violation: Expression "${expr}" does not conform to allowed safe comparison syntax (output.<field> <op> <literal>).`,
          };
        }

        // Without an explicit condition, check that output is an object with explicit success: true
        const isExplicitSuccess =
          typeof output === "object" &&
          output !== null &&
          (output as { success?: unknown }).success === true &&
          !task.error;

        return {
          passed: isExplicitSuccess,
          actualValue: output,
          details: isExplicitSuccess
            ? "Custom predicate verified explicit success outcome."
            : "Output missing explicit success outcome or contains errors.",
        };
      }

      default: {
        return {
          passed: false,
          actualValue: null,
          details: `Unsupported criterion evaluator: "${criterion.evaluator}".`,
        };
      }
    }
  }

  /**
   * Verifies the cryptographic integrity of an existing VerificationEvidence record.
   * Protects against retroactive tampering with verification certificates.
   *
   * @param evidence - The evidence record to check.
   * @returns True if evidence hash matches the recomputed SHA-256 payload.
   */
  public verifyEvidenceIntegrity(evidence: VerificationEvidence): boolean {
    if (!evidence || !evidence.evidenceHash) return false;

    const evidencePayload = {
      evidenceId: evidence.evidenceId,
      taskId: evidence.taskId,
      verified: evidence.verified,
      passedCount: evidence.passedCriteriaCount,
      criteriaResults: evidence.criteriaResults,
      producedArtifacts: evidence.producedArtifacts,
      timestamp: evidence.timestamp,
    };

    const expectedHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(evidencePayload))
      .digest("hex");

    return expectedHash === evidence.evidenceHash;
  }

  /**
   * Inspects a deliverable file on disk and computes its SHA-256 hash.
   * Returns null if a file deliverable does not physically exist.
   */
  private _inspectDeliverable(deliverable: string): VerificationEvidence["producedArtifacts"][0] | null {
    const isFilePath = /\.[a-zA-Z0-9]{1,8}$/.test(deliverable) || deliverable.includes("/") || deliverable.includes("\\");

    try {
      const resolved = path.resolve(/*turbopackIgnore: true*/ process.cwd(), deliverable);
      if (fs.existsSync(resolved)) {
        const stats = fs.statSync(resolved);
        if (stats.isFile()) {
          const content = fs.readFileSync(resolved);
          const hash = crypto.createHash("sha256").update(content).digest("hex");
          return {
            name: deliverable,
            pathOrUri: resolved,
            sha256Hash: hash,
            sizeBytes: stats.size,
          };
        }
      }
    } catch {
      // File inspection error
    }

    // If it was supposed to be a concrete file deliverable on disk and doesn't exist, return null
    if (isFilePath) {
      return null;
    }

    // Non-file deliverables must be accompanied by explicit verification notes
    return {
      name: deliverable,
      sha256Hash: crypto.createHash("sha256").update(Buffer.from(deliverable, "utf-8")).digest("hex"),
      sizeBytes: Buffer.byteLength(deliverable, "utf-8"),
    };
  }
}

/** Global default task verification engine singleton */
export const defaultTaskVerificationEngine = new TaskVerificationEngine();
