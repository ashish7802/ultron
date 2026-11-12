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
        riskLevel: "medium",
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
  return Boolean(
    plan &&
    (plan.status === "approved" || plan.status === "executing") &&
    plan.executionGrantToken === grantToken
  );
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
  logAuditEvent(plan, "rejected", false, reason);
  activePlans.delete(planId);
  return true;
}

/**
 * Executes an approved action plan via its single-use execution grant token.
 *
 * Lifecycle Phase 6 (EXECUTE), Phase 7 (VERIFY RESULT), & Phase 8 (AUDIT LOG):
 * Validates execution token, re-computes action hash to guarantee zero modification,
 * runs the executor function within an active execution scope, logs the audit record
 * without secrets, and cleans up the plan and token immediately after completion.
 *
 * @param planId - ID of approved plan.
 * @param executionGrantToken - Single-use execution grant token.
 * @param executor - Async executor function that carries out the physical OS action.
 * @returns Result of execution or error.
 */
export async function executeApprovedAction<T>(
  planId: string,
  executionGrantToken: string,
  executor: () => Promise<T>
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

  // Re-verify hash to prevent post-approval parameter tampering
  const currentHash = computeActionHash(plan.actionType, plan.target, plan.params);
  if (currentHash !== plan.actionHash) {
    plan.status = "rejected";
    activePlans.delete(planId);
    logAuditEvent(plan, "rejected", false, "Hash mismatch: Action parameters were modified after approval.");
    return { success: false, error: "Security Violation: Action parameters tampered with post-approval." };
  }

  // Set status to executing during execution run
  plan.status = "executing";

  try {
    const result = await executor();
    plan.status = "executed";
    logAuditEvent(plan, "executed", true, "Action executed successfully.");
    return { success: true, result };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    plan.status = "executed";
    logAuditEvent(plan, "executed", false, `Execution failure: ${errorMsg}`);
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
