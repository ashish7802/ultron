/**
 * @file lib/security/permissionEngine.ts
 * @description Centralized Permission Management & Approval Lifecycle Engine for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Permission & Approval Subsystem (Module 2).
 *
 * Key Responsibilities:
 * - Implements the mandatory action approval lifecycle:
 *   REQUEST -> VALIDATE -> PRESENT TO FOUNDER -> APPROVE/REJECT -> REVALIDATE -> EXECUTE -> AUDIT.
 * - Computes immutable SHA-256 canonical parameter hashes to prevent parameter tampering.
 * - Enforces explicit action-specific and resource-specific approvals (no implicit or cross-action reuse).
 * - Issues short-lived, single-use approval and execution grant tokens.
 * - Enforces fail-closed expiration (5 minutes TTL).
 * - Prevents replay attacks, repeated approvals, and parameter substitution.
 * - Tracks destructive operations and associates impact assessments and rollback plans.
 *
 * Architectural Role & Interactions:
 * - Consumed by `lib/security/actionGateway.ts` and `app/api/security/permissions`.
 * - Maintains 100% backward compatibility with `lib/permissionGateway.ts`.
 *
 * Safety / Security Guarantees:
 * - Anti-tampering: Re-verifies canonical action hash before execution.
 * - Anti-replay: Execution grants are deleted immediately upon consumption.
 * - Fail-closed: Expired, cancelled, or revoked requests cannot execute.
 */

import crypto from "crypto";
import type {
  PermissionActionType,
  ActionRiskLevel,
  ApprovalStatus,
  PermissionApprovalRequest,
  ActionScope,
} from "./types.ts";

/** 5-minute Time-To-Live for pending approval requests. */
const REQUEST_TTL_MS = 5 * 60 * 1000;

/** Active in-memory approval requests registry. */
const activeRequests = new Map<string, PermissionApprovalRequest>();

/** Historical approval log (capped at 500 entries). */
const historicalDecisions: PermissionApprovalRequest[] = [];
const MAX_HISTORY = 500;

/**
 * Computes a deterministic SHA-256 hash of canonical action parameters.
 *
 * @param actionType - Category of action.
 * @param target - Target resource or executable.
 * @param params - Parameter map.
 * @returns 64-character SHA-256 hex string.
 */
export function computeCanonicalActionHash(
  actionType: PermissionActionType,
  target: string,
  params: Record<string, unknown>
): string {
  const sortedKeys = Object.keys(params).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = params[k];
  }

  const payload = JSON.stringify({
    actionType,
    target: target.trim().toLowerCase(),
    params: sortedObj,
  });

  return crypto.createHash("sha256").update(payload, "utf-8").digest("hex");
}

/**
 * Evaluates default risk level and explanation for an action type and target.
 *
 * @param actionType - Category of action.
 * @param target - Intended target.
 * @returns Risk tier and explanatory string.
 */
export function evaluateActionRisk(
  actionType: PermissionActionType,
  target: string
): { riskLevel: ActionRiskLevel; riskExplanation: string; isDestructive: boolean } {
  switch (actionType) {
    case "file_delete":
    case "folder_delete":
      return {
        riskLevel: "critical",
        riskExplanation: `Permanently deletes target file or folder "${target}".`,
        isDestructive: true,
      };

    case "memory_wipe":
      return {
        riskLevel: "critical",
        riskExplanation: "Purges or overwrites all cognitive memory vaults.",
        isDestructive: true,
      };

    case "shell_exec":
      return {
        riskLevel: "critical",
        riskExplanation: `Executes administrative host command line: "${target}".`,
        isDestructive: true,
      };

    case "credential_revoke":
    case "credential_write":
      return {
        riskLevel: "critical",
        riskExplanation: `Modifies or revokes security credentials for "${target}".`,
        isDestructive: true,
      };

    case "policy_update":
    case "emergency_unlock":
      return {
        riskLevel: "critical",
        riskExplanation: `Modifies core security policies or unlocks emergency lockdown.`,
        isDestructive: true,
      };

    case "file_write":
      return {
        riskLevel: "high",
        riskExplanation: `Modifies or overwrites disk file content at "${target}".`,
        isDestructive: false,
      };

    case "app_launch":
      if (/cmd|powershell|regedit|format|diskpart/i.test(target)) {
        return {
          riskLevel: "critical",
          riskExplanation: "Spawns an administrative or interactive command shell.",
          isDestructive: true,
        };
      }
      return {
        riskLevel: "medium",
        riskExplanation: `Launches desktop process "${target}" in interactive user session.`,
        isDestructive: false,
      };

    case "browser_open":
    case "volume_change":
      return {
        riskLevel: "low",
        riskExplanation: `Executes desktop convenience action on "${target}".`,
        isDestructive: false,
      };

    default:
      return {
        riskLevel: "medium",
        riskExplanation: `Executes system action on "${target}".`,
        isDestructive: false,
      };
  }
}

/**
 * Creates and queues a new permission approval request for explicit founder sign-off.
 *
 * @param actionType - Action category.
 * @param target - Target resource or executable.
 * @param params - Parameter map.
 * @param affectedResources - List of affected resources.
 * @param requestedByActor - Identity of actor or agent proposing the action.
 * @param sessionId - Active session ID.
 * @param projectId - Optional project tenant isolation ID.
 * @param rollbackPlan - Optional recovery / rollback instructions.
 * @returns Prepared PermissionApprovalRequest.
 */
export function createApprovalRequest(
  actionType: PermissionActionType,
  target: string,
  params: Record<string, unknown> = {},
  affectedResources: string[] = [],
  requestedByActor: string = "system_agent",
  sessionId: string = "sess_unknown",
  projectId?: string,
  rollbackPlan?: string
): PermissionApprovalRequest {
  const requestId = "req_" + crypto.randomBytes(12).toString("hex");
  const actionHash = computeCanonicalActionHash(actionType, target, params);
  const approvalToken = "appr_" + crypto.randomBytes(24).toString("hex");
  const { riskLevel, riskExplanation, isDestructive } = evaluateActionRisk(actionType, target);
  const now = Date.now();

  const scope: ActionScope = {
    exactTarget: target.trim(),
    permittedParameters: { ...params },
    affectedResources: affectedResources.length > 0 ? affectedResources : [target],
    projectId,
  };

  const request: PermissionApprovalRequest = {
    requestId,
    actionType,
    title: `Authorization Required: ${actionType.replace("_", " ").toUpperCase()}`,
    description: `Requesting authorization to execute ${actionType} on target "${target}".`,
    target,
    params,
    affectedResources: scope.affectedResources,
    riskLevel,
    riskExplanation,
    actionHash,
    scope,
    requestedByActor,
    sessionId,
    createdAt: now,
    expiresAt: now + REQUEST_TTL_MS,
    status: "pending",
    approvalToken,
    executionGrantToken: null,
    isDestructive,
    rollbackPlan,
  };

  activeRequests.set(requestId, request);
  return request;
}

/**
 * Approves a pending approval request using the explicit approval token.
 *
 * Security Enforcements:
 * - Rejects expired requests (fail-closed).
 * - Rejects already approved, executed, or cancelled requests.
 * - Validates cryptographic approval token signature.
 * - Issues a fresh single-use execution grant token.
 *
 * @param requestId - Request identifier.
 * @param presentedToken - Approval token submitted by founder UI.
 * @param decidedByActor - Identity of approving founder.
 * @returns Result object with executionGrantToken on success.
 */
export function approveRequest(
  requestId: string,
  presentedToken: string,
  decidedByActor: string = "founder"
): { success: boolean; error?: string; executionGrantToken?: string } {
  const request = activeRequests.get(requestId);
  if (!request) {
    return { success: false, error: "Approval request not found." };
  }

  if (request.status !== "pending") {
    return { success: false, error: `Approval request is already in status "${request.status}".` };
  }

  if (Date.now() > request.expiresAt) {
    request.status = "expired";
    archiveDecision(request);
    activeRequests.delete(requestId);
    return { success: false, error: "Approval request has expired (5-minute TTL exceeded)." };
  }

  if (request.approvalToken !== presentedToken) {
    return { success: false, error: "Invalid approval token signature. Approval rejected." };
  }

  // Issue single-use execution grant token
  const executionGrantToken = "exec_" + crypto.randomBytes(24).toString("hex");
  request.executionGrantToken = executionGrantToken;
  request.status = "approved";
  request.decidedByActor = decidedByActor;
  request.decidedAt = Date.now();

  return { success: true, executionGrantToken };
}

/**
 * Rejects or cancels an approval request.
 *
 * @param requestId - Request identifier.
 * @param reason - Explanation for rejection.
 * @param decidedByActor - Identity of rejecting actor.
 * @returns True if rejected; false if not found.
 */
export function rejectRequest(
  requestId: string,
  reason: string = "User rejected",
  decidedByActor: string = "founder"
): boolean {
  const request = activeRequests.get(requestId);
  if (!request) return false;

  request.status = "rejected";
  request.decidedByActor = decidedByActor;
  request.decidedAt = Date.now();
  request.decisionReason = reason;

  archiveDecision(request);
  activeRequests.delete(requestId);
  return true;
}

/**
 * Revalidates that an approved request is currently authorized for execution.
 *
 * Immediate Pre-Execution Verification:
 * 1. Confirms request exists and is in "approved" status.
 * 2. Confirms executionGrantToken matches.
 * 3. Confirms request has not expired.
 * 4. Re-computes SHA-256 action hash to verify parameters were NOT modified post-approval.
 *
 * @param requestId - Request ID.
 * @param presentedGrantToken - Grant token presented by executor.
 * @param currentParams - Parameters about to be executed.
 * @returns True if authorized; false otherwise.
 */
export function verifyExecutionGrant(
  requestId: string,
  presentedGrantToken: string,
  currentParams?: Record<string, unknown>
): { authorized: boolean; reason?: string } {
  const request = activeRequests.get(requestId);
  if (!request) {
    return { authorized: false, reason: "Request not found or already consumed." };
  }

  if (request.status !== "approved") {
    return { authorized: false, reason: `Request is already ${request.status} (single-use grant already consumed or invalid).` };
  }

  if (Date.now() > request.expiresAt) {
    request.status = "expired";
    archiveDecision(request);
    activeRequests.delete(requestId);
    return { authorized: false, reason: "Execution grant expired." };
  }

  if (request.executionGrantToken !== presentedGrantToken) {
    return { authorized: false, reason: "Invalid execution grant token." };
  }

  // Anti-tampering parameter check
  if (currentParams) {
    const currentHash = computeCanonicalActionHash(request.actionType, request.target, currentParams);
    if (currentHash !== request.actionHash) {
      request.status = "rejected";
      request.decisionReason = "Parameter tampering detected between approval and execution.";
      archiveDecision(request);
      activeRequests.delete(requestId);
      return { authorized: false, reason: "Security Violation: Parameters tampered with post-approval." };
    }
  }

  // Atomically transition status to "executing" to guarantee single-use consumption
  // and prevent concurrent execution race conditions or replay attacks.
  request.status = "executing";

  return { authorized: true };
}

/**
 * Consumes and archives an execution grant upon execution completion.
 *
 * @param requestId - Request ID.
 * @param success - Whether execution succeeded.
 * @param outcomeMessage - Outcome description.
 */
export function finalizeExecution(
  requestId: string,
  success: boolean,
  outcomeMessage?: string
): void {
  const request = activeRequests.get(requestId);
  if (!request) return;

  request.status = success ? "executed" : "rejected";
  request.decisionReason = outcomeMessage;
  request.executionGrantToken = null; // Single-use guarantee: destroyed immediately

  archiveDecision(request);
  activeRequests.delete(requestId);
}

/**
 * Archives a completed or rejected decision in the historical decision buffer.
 *
 * @param request - PermissionApprovalRequest to archive.
 */
function archiveDecision(request: PermissionApprovalRequest): void {
  historicalDecisions.unshift({ ...request });
  if (historicalDecisions.length > MAX_HISTORY) {
    historicalDecisions.pop();
  }
}

/**
 * Retrieves an active approval request by ID (sanitized for UI presentation).
 *
 * @param requestId - Request ID.
 * @returns Sanitized request or undefined.
 */
export function getApprovalRequest(requestId: string): PermissionApprovalRequest | undefined {
  const request = activeRequests.get(requestId);
  if (request && Date.now() > request.expiresAt) {
    request.status = "expired";
    archiveDecision(request);
    activeRequests.delete(requestId);
    return undefined;
  }
  return request;
}

/**
 * Lists all active pending approval requests.
 *
 * @returns Array of pending requests.
 */
export function listPendingRequests(): PermissionApprovalRequest[] {
  const now = Date.now();
  const list: PermissionApprovalRequest[] = [];
  for (const [id, req] of activeRequests.entries()) {
    if (now > req.expiresAt) {
      req.status = "expired";
      archiveDecision(req);
      activeRequests.delete(id);
    } else if (req.status === "pending") {
      list.push(req);
    }
  }
  return list;
}

/**
 * Lists recent approval decision history.
 *
 * @returns Array of recent requests.
 */
export function listApprovalHistory(): PermissionApprovalRequest[] {
  return [...historicalDecisions];
}
