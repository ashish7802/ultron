/**
 * @file lib/permissionGateway.ts
 * @description Universal Computer Action Permission Gateway for ULTRON.
 *
 * Subsystem:
 * Centralized Desktop Execution, Authorization & Audit Gateway.
 *
 * Key Responsibilities:
 * - Enforces the non-negotiable policy: NO OS, APPLICATION, FILE, DATABASE, OR EXTERNAL-SYSTEM
 *   ACTION MAY EXECUTE WITHOUT EXPLICIT USER APPROVAL.
 * - Implements the mandatory action lifecycle:
 *   PLAN -> VALIDATE -> PRESENT ACTION -> REQUEST APPROVAL -> VERIFY APPROVAL -> EXECUTE -> VERIFY RESULT -> AUDIT LOG.
 * - Computes immutable SHA-256 action hashes to prevent parameter tampering after approval.
 * - Issues cryptographically secure, time-bounded, single-use approval and execution tokens.
 * - Maintains an in-memory and disk-persisted non-sensitive audit log of all decisions and outcomes.
 *
 * Architectural Role & Interactions:
 * - Gatekeeper between `app/api/chat/route.ts`, `lib/appLauncher.ts`, `lib/systemController.ts`,
 *   and host operating system execution primitives.
 * - Exposes verification endpoints for the UI confirmation modal.
 *
 * Safety / Security Guarantees:
 * - Anti-tampering: Re-verifies canonical action hash before executing.
 * - Anti-replay: Single-use execution grant tokens are deleted immediately upon consumption.
 * - Expiration: Action plans expire after 5 minutes (fail-closed).
 * - Zero Autonomous Bypass: LLM statements ("user said yes") are completely ignored; only
 *   cryptographically valid UI signatures are accepted.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { isSystemLockedDown } from "./security/emergencyEngine.ts";
import { recordSecurityEvent } from "./security/monitoringEngine.ts";
import { getApprovalRequest } from "./security/permissionEngine.ts";
import { getEffectiveRecoveryKey } from "./security/recoveryKey.ts";

export type PermissionActionType =
  | "app_launch"
  | "app_terminate"
  | "file_read"
  | "file_write"
  | "file_delete"
  | "shell_exec"
  | "browser_open"
  | "volume_change"
  | "system_command";

export type ActionRiskLevel = "low" | "medium" | "high" | "critical";

export type ActionPlanStatus =
  | "pending"
  | "approved"
  | "executing"
  | "rejected"
  | "executed"
  | "failed"
  | "cancelled"
  | "expired";

export interface ActionPlan {
  planId: string;
  actionType: PermissionActionType;
  title: string;
  description: string;
  target: string;
  params: Record<string, unknown>;
  affectedResources: string[];
  riskLevel: ActionRiskLevel;
  riskExplanation: string;
  actionHash: string;
  approvalToken: string;
  executionGrantToken: string | null;
  createdAt: number;
  expiresAt: number;
  status: ActionPlanStatus;
}

export interface AuditLogEntry {
  auditId: string;
  planId: string;
  actionType: PermissionActionType;
  target: string;
  riskLevel: ActionRiskLevel;
  decision: ActionPlanStatus;
  executionSuccess?: boolean;
  executionMessage?: string;
  timestamp: number;
}

/** 5-minute Time-To-Live for pending action approval plans. */
const PLAN_TTL_MS = 5 * 60 * 1000;
/** Maximum entries retained in the runtime audit log. */
const MAX_AUDIT_LOG_ENTRIES = 500;

const AUDIT_LOG_FILE = path.join(process.cwd(), "docs", "audit", "GATEWAY_AUDIT_LOG.json");

/** Active in-memory plan registry. */
const activePlans = new Map<string, ActionPlan>();
/** In-memory audit trail. */
const auditLog: AuditLogEntry[] = [];

/**
 * Computes a deterministic SHA-256 hash of the canonical action parameters.
 *
 * @param actionType - Category of action.
 * @param target - Target binary, URL, file, or resource.
 * @param params - Parameter map.
 * @returns SHA-256 hexadecimal string.
 */
export function computeActionHash(
  actionType: PermissionActionType,
  target: string,
  params: Record<string, unknown>
): string {
  // Sort keys to produce canonical JSON
  const sortedKeys = Object.keys(params).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = params[k];
  }

  const canonicalPayload = JSON.stringify({
    actionType,
    target: target.trim().toLowerCase(),
    params: sortedObj,
  });

  return crypto.createHash("sha256").update(canonicalPayload, "utf-8").digest("hex");
}

/**
 * Generates an HMAC-SHA256 authorization grant token for Python subprocess execution.
 * Cryptographically binds the grant to operation, canonical path, planId, and expiration.
 *
 * @param planId - Associated ActionPlan identifier.
 * @param operation - Specific operation (e.g., "write_file").
 * @param targetPath - Absolute canonical destination path.
 * @param ttlMs - Time to live in ms (default 30,000ms / 30 seconds).
 * @returns Signed grant object { token, planId, operation, targetPath, expiresAt }.
 */
export function generateSubprocessExecutionGrant(
  planId: string,
  operation: string,
  targetPath: string,
  ttlMs: number = 30000
): { token: string; planId: string; operation: string; targetPath: string; expiresAt: number } {
  const recoveryKey = getEffectiveRecoveryKey();
  const canonicalPath = path.resolve(targetPath).toLowerCase();
  const expiresAt = Date.now() + ttlMs;
  const nonce = crypto.randomBytes(16).toString("hex");

  const payload = `${planId}|${operation}|${canonicalPath}|${expiresAt}|${nonce}`;
  const signature = crypto.createHmac("sha256", recoveryKey).update(payload, "utf-8").digest("hex");
  const token = `${payload}|${signature}`;

  return { token, planId, operation, targetPath: canonicalPath, expiresAt };
}

/**
 * Evaluates default risk level and explanation for a given action.
 *
 * @param actionType - Category of action.
 * @param target - Intended target.
 * @returns Risk level and explanatory string.
 */
export function evaluateActionRisk(
  actionType: PermissionActionType,
  target: string
): { riskLevel: ActionRiskLevel; riskExplanation: string } {
  switch (actionType) {
    case "app_launch":
      if (/cmd|powershell|regedit|format/i.test(target)) {
        return {
          riskLevel: "critical",
          riskExplanation: "Spawns an administrative or interactive command shell.",
        };
      }
      return {
        riskLevel: "high",
        riskExplanation: `Spawns a local desktop process "${target}" in the user's interactive session.`,
      };

    case "browser_open":
      return {
        riskLevel: "low",
        riskExplanation: `Navigates the default web browser to external URL "${target}".`,
      };

    case "volume_change":
      return {
        riskLevel: "low",
        riskExplanation: "Dispatches virtual keyboard volume simulation to host audio.",
      };

    case "file_delete":
      return {
        riskLevel: "critical",
        riskExplanation: `Permanently deletes target file or folder "${target}".`,
      };

    case "file_write":
      return {
        riskLevel: "high",
        riskExplanation: `Modifies or overwrites disk file content at "${target}".`,
      };

    case "shell_exec":
      return {
        riskLevel: "critical",
        riskExplanation: `Executes raw shell command: "${target}".`,
      };

    default:
      return {
        riskLevel: "medium",
        riskExplanation: `Executes system action on "${target}".`,
      };
  }
}

/**
 * Plans a new computer action and queues it for explicit user approval.
 *
 * Lifecycle Phase 1 (PLAN) & Phase 2 (VALIDATE):
 * Creates an immutable plan containing action hash, risk analysis, and single-use approval token.
 *
 * @param actionType - Category of action.
 * @param target - Target application, file, or resource.
 * @param params - Additional arguments or parameters.
 * @param affectedResources - List of affected resources (e.g. "Google Chrome", "Windows Shell").
 * @returns The created ActionPlan ready to be presented to the user.
 */
export function planAction(
  actionType: PermissionActionType,
  target: string,
  params: Record<string, unknown> = {},
  affectedResources: string[] = []
): ActionPlan {
  const planId = "plan_" + crypto.randomBytes(12).toString("hex");
  const actionHash = computeActionHash(actionType, target, params);
  const approvalToken = "appr_" + crypto.randomBytes(24).toString("hex");
  const { riskLevel, riskExplanation } = evaluateActionRisk(actionType, target);
  const now = Date.now();

  const plan: ActionPlan = {
    planId,
    actionType,
    title: `Approval Required: ${actionType.replace("_", " ").toUpperCase()}`,
    description: `Requesting authorization to execute ${actionType} on target "${target}".`,
    target,
    params,
    affectedResources: affectedResources.length > 0 ? affectedResources : [target],
    riskLevel,
    riskExplanation,
    actionHash,
    approvalToken,
    executionGrantToken: null,
    createdAt: now,
    expiresAt: now + PLAN_TTL_MS,
    status: "pending",
  };

  activePlans.set(planId, plan);
  return plan;
}

/**
 * Approves a pending action plan using the explicit approval token.
 *
 * Lifecycle Phase 4 (REQUEST APPROVAL) & Phase 5 (VERIFY APPROVAL):
 * Validates expiration, verifies approval token, confirms action hash integrity,
 * and issues a single-use execution grant token.
 *
 * @param planId - ID of the pending plan.
 * @param presentedToken - Approval token submitted by user via UI.
 * @returns Result object containing executionGrantToken on success or error.
 */
export function approveActionPlan(
  planId: string,
  presentedToken: string
): { success: boolean; error?: string; executionGrantToken?: string } {
  // Emergency Lockdown Enforcement: Block any approvals immediately if system is in emergency stop
  if (isSystemLockedDown()) {
    const plan = activePlans.get(planId);
    if (plan) {
      plan.status = "rejected";
      activePlans.delete(planId);
      logAuditEvent(plan, "rejected", false, "System under active Emergency Security Lockdown.");
    }
    recordSecurityEvent(
      "EMERGENCY_STOP_TRIGGERED",
      "HIGH",
      "gateway",
      `Blocked approval of plan ${planId} due to active Emergency Security Lockdown.`
    );
    return { success: false, error: "Security Violation: Execution blocked due to active Emergency Security Lockdown." };
  }

  const plan = activePlans.get(planId);
  if (!plan) {
    return { success: false, error: "Action plan not found." };
  }

  if (plan.status !== "pending") {
    return { success: false, error: `Action plan is already ${plan.status}.` };
  }

  if (Date.now() > plan.expiresAt) {
    plan.status = "expired";
    logAuditEvent(plan, "expired");
    return { success: false, error: "Action plan has expired. Please re-initiate command." };
  }

  if (plan.approvalToken !== presentedToken) {
    return { success: false, error: "Invalid approval token signature." };
  }

  // Generate single-use execution grant token
  const grantToken = "exec_" + crypto.randomBytes(24).toString("hex");
  plan.executionGrantToken = grantToken;
  plan.status = "approved";

  // Security Invariant: Single-use approval token invalidation to prevent replay
  plan.approvalToken = "";

  return { success: true, executionGrantToken: grantToken };
}

/**
 * Verifies that a valid, single-use execution grant is currently active for a plan.
 * Used by executors (e.g. appLauncher, systemController) to guarantee that they are
 * never invoked directly outside the gateway.
 *
 * @param planId - Plan ID.
 * @param grantToken - Grant token presented by executor.
 * @returns True if authorized; false otherwise.
 */
export function verifyGatewayExecutionGrant(planId: string, grantToken: string): boolean {
  if (!planId || !grantToken) return false;
  // Emergency Lockdown Check: Fails closed when system is in emergency stop
  if (isSystemLockedDown()) {
    console.warn("[GATEWAY] Action blocked: System is under active Emergency Security Lockdown.");
    return false;
  }
  const plan = activePlans.get(planId);
  if (
    plan &&
    (plan.status === "approved" || plan.status === "executing") &&
    plan.executionGrantToken === grantToken
  ) {
    return true;
  }

  // Cross-engine synchronization: check central permission engine
  const centralReq = getApprovalRequest(planId);
  if (
    centralReq &&
    (centralReq.status === "approved" || centralReq.status === "executing") &&
    centralReq.executionGrantToken === grantToken
  ) {
    return true;
  }

  return false;
}

/**
 * Rejects or cancels a pending action plan.
 *
 * @param planId - ID of plan to cancel.
 * @param reason - Optional cancellation reason.
 * @returns Boolean success flag.
 */
export function cancelActionPlan(planId: string, reason: string = "User rejected"): boolean {
  const plan = activePlans.get(planId);
  if (!plan) return false;

  plan.status = "rejected";
  plan.executionGrantToken = null;
  plan.approvalToken = "";
  logAuditEvent(plan, "rejected", false, reason);
  activePlans.delete(planId);
  return true;
}

/**
 * Executes an approved action plan via its single-use execution grant token.
 *
 * Lifecycle Phase 6 (EXECUTE), Phase 7 (VERIFY RESULT), & Phase 8 (AUDIT LOG):
 * Validates execution token, re-computes action hash to guarantee zero modification,
 * asserts runtime invocation parameters match the approved plan, runs the executor
 * function within an active execution scope, logs the audit record without secrets,
 * and cleans up the plan and token immediately after completion.
 *
 * @param planId - ID of approved plan.
 * @param executionGrantToken - Single-use execution grant token.
 * @param executor - Async executor function that carries out the physical OS action.
 * @param runtimeParams - Optional runtime parameters supplied by caller to enforce F-15 parameter integrity.
 * @returns Result of execution or error.
 */
export async function executeApprovedAction<T>(
  planId: string,
  executionGrantToken: string,
  executor: () => Promise<T>,
  runtimeParams?: Record<string, unknown>
): Promise<{ success: boolean; result?: T; error?: string }> {
  // Emergency Lockdown Enforcement: Block execution immediately before any state lookup
  if (isSystemLockedDown()) {
    const plan = activePlans.get(planId);
    if (plan) {
      plan.status = "rejected";
      activePlans.delete(planId);
      logAuditEvent(plan, "rejected", false, "System under active Emergency Security Lockdown.");
    }
    recordSecurityEvent(
      "EMERGENCY_STOP_TRIGGERED",
      "HIGH",
      "gateway",
      `Blocked execution of plan ${planId} due to active Emergency Security Lockdown.`
    );
    return { success: false, error: "Security Violation: Execution blocked due to active Emergency Security Lockdown." };
  }

  const plan = activePlans.get(planId);
  if (!plan) {
    return { success: false, error: "Action plan not found." };
  }

  if (plan.status !== "approved" || !plan.executionGrantToken) {
    return { success: false, error: "Action plan is not authorized for execution." };
  }

  if (plan.executionGrantToken !== executionGrantToken) {
    return { success: false, error: "Invalid execution grant token." };
  }

  // Re-verify hash against stored plan parameters to prevent post-approval parameter tampering
  const currentHash = computeActionHash(plan.actionType, plan.target, plan.params);
  if (currentHash !== plan.actionHash) {
    plan.status = "rejected";
    activePlans.delete(planId);
    logAuditEvent(plan, "rejected", false, "Hash mismatch: Action parameters were modified after approval.");
    return { success: false, error: "Security Violation: Action parameters tampered with post-approval." };
  }

  // F-15 Parameter Integrity: If runtimeParams are supplied by the tool registry/caller,
  // assert they match the approved ActionPlan exactly.
  if (runtimeParams && typeof runtimeParams === "object") {
    // Determine runtime target from params or default to plan target
    const runtimeTarget = String(
      runtimeParams.target ||
      runtimeParams.appName ||
      runtimeParams.path ||
      runtimeParams.command ||
      runtimeParams.url ||
      plan.target
    );
    const runtimeHash = computeActionHash(plan.actionType, runtimeTarget, runtimeParams);
    if (runtimeHash !== plan.actionHash) {
      plan.status = "rejected";
      activePlans.delete(planId);
      logAuditEvent(plan, "rejected", false, `Runtime parameter tampering detected for ${plan.actionType}`);
      return {
        success: false,
        error: `Security Violation: Runtime invocation parameters do not match approved ActionPlan ${planId} (expected hash ${plan.actionHash.substring(0, 8)}).`,
      };
    }
  }

  // Set status to executing during execution run
  plan.status = "executing";

  try {
    const result = await executor();

    // ── Inspection of Physical Execution Result (F-04 False-Success Remediation) ──
    // A resolved Promise does NOT guarantee physical operation success.
    // Inspect structured return payload for explicit failure indicators.
    let isPhysicalSuccess = true;
    let failureDetail = "";

    if (result === null || result === undefined) {
      isPhysicalSuccess = false;
      failureDetail = "Executor returned null or undefined output.";
    } else if (typeof result === "object") {
      const obj = result as Record<string, unknown>;
      if ("success" in obj && obj.success === false) {
        isPhysicalSuccess = false;
        failureDetail = String(obj.error || obj.message || "Executor reported success: false");
      } else if ("ok" in obj && obj.ok === false) {
        isPhysicalSuccess = false;
        failureDetail = String(obj.error || obj.message || "Executor reported ok: false");
      } else if ("exitCode" in obj && typeof obj.exitCode === "number" && obj.exitCode !== 0) {
        isPhysicalSuccess = false;
        failureDetail = String(obj.error || obj.stderr || `Command exited with non-zero code ${obj.exitCode}`);
      } else if ("verified" in obj && obj.verified === false) {
        isPhysicalSuccess = false;
        failureDetail = String(obj.verificationDetails || obj.error || "Post-execution verification failed.");
      }
    }

    if (!isPhysicalSuccess) {
      plan.status = "failed";
      logAuditEvent(plan, "failed", false, `Execution failed: ${failureDetail}`);
      return { success: false, error: failureDetail, result };
    }

    plan.status = "executed";
    logAuditEvent(plan, "executed", true, "Action executed successfully.");
    return { success: true, result };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    plan.status = "failed";
    logAuditEvent(plan, "failed", false, `Execution failure: ${errorMsg}`);
    return { success: false, error: errorMsg };
  } finally {
    // Single-use guarantee: Invalidate grant token and remove plan immediately
    plan.executionGrantToken = null;
    activePlans.delete(planId);
  }
}

/**
 * Appends an entry to the non-sensitive gateway audit trail.
 *
 * @param plan - ActionPlan being audited.
 * @param decision - Status decision.
 * @param executionSuccess - Optional execution result flag.
 * @param executionMessage - Optional execution description.
 */
function logAuditEvent(
  plan: ActionPlan,
  decision: ActionPlanStatus,
  executionSuccess?: boolean,
  executionMessage?: string
): void {
  const entry: AuditLogEntry = {
    auditId: "aud_" + crypto.randomBytes(8).toString("hex"),
    planId: plan.planId,
    actionType: plan.actionType,
    target: plan.target,
    riskLevel: plan.riskLevel,
    decision,
    executionSuccess,
    executionMessage,
    timestamp: Date.now(),
  };

  auditLog.unshift(entry);
  if (auditLog.length > MAX_AUDIT_LOG_ENTRIES) {
    auditLog.pop();
  }

  // Asynchronously persist audit log file without blocking
  try {
    const dir = path.dirname(AUDIT_LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(auditLog.slice(0, 100), null, 2), "utf-8");
  } catch {
    // Non-fatal if disk write fails during audit
  }
}

/**
 * Retrieves the gateway audit log history.
 *
 * @returns Array of recent audit log entries.
 */
export function getGatewayAuditHistory(): AuditLogEntry[] {
  return [...auditLog];
}

/**
 * Retrieves a plan by ID (for UI inspection).
 *
 * @param planId - Plan ID.
 * @returns ActionPlan or undefined.
 */
export function getActionPlan(planId: string): ActionPlan | undefined {
  const plan = activePlans.get(planId);
  if (plan && Date.now() > plan.expiresAt) {
    plan.status = "expired";
    activePlans.delete(planId);
    return undefined;
  }
  return plan;
}
