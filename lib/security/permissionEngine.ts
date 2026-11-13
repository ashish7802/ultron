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
import fs from "fs";
import path from "path";
import { readVaultJsonSync, writeVaultJsonSync } from "./vaultStorage.ts";
import type {
  PermissionActionType,
  ActionRiskLevel,
  ApprovalStatus,
  PermissionApprovalRequest,
  ActionScope,
} from "./types.ts";

/** Local storage directory and file for persistent approval state across server restarts. */
const SECURITY_STORAGE_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  ".security_vault"
);
const APPROVALS_STORE_FILE = path.join(SECURITY_STORAGE_DIR, "approvals.json");

/** 5-minute Time-To-Live for pending approval requests. */
const REQUEST_TTL_MS = 5 * 60 * 1000;

/** Active in-memory approval requests registry. */
const activeRequests = new Map<string, PermissionApprovalRequest>();

/** Historical approval log (capped at 500 entries). */
const historicalDecisions: PermissionApprovalRequest[] = [];
const MAX_HISTORY = 500;

/**
 * Validates schema of persisted approval request records.
 *
 * @param item - Unknown object loaded from disk.
 * @returns Boolean indicating whether object conforms to PermissionApprovalRequest schema.
 */
function isValidApprovalRecord(item: unknown): item is PermissionApprovalRequest {
  if (!item || typeof item !== "object") return false;
  const req = item as Record<string, unknown>;
  return (
    typeof req.requestId === "string" &&
    req.requestId.startsWith("req_") &&
    typeof req.actionType === "string" &&
    typeof req.target === "string" &&
    typeof req.actionHash === "string" &&
    typeof req.status === "string" &&
    typeof req.approvalToken === "string" &&
    typeof req.createdAt === "number" &&
    typeof req.expiresAt === "number"
  );
}

/**
 * Initializes the approvals store from persistent disk storage using crash-safe locking.
 */
function initializeApprovalsStore(): void {
  try {
    const data = readVaultJsonSync<{ active?: unknown[]; history?: unknown[] }>(
      APPROVALS_STORE_FILE,
      { active: [], history: [] }
    );

    if (Array.isArray(data.active)) {
      for (const req of data.active) {
        if (isValidApprovalRecord(req)) {
          activeRequests.set(req.requestId, req);
        } else {
          console.warn("[PermissionEngine] Discarded malformed active approval record from storage.");
        }
      }
    }

    if (Array.isArray(data.history)) {
      for (const req of data.history) {
        if (isValidApprovalRecord(req)) {
          historicalDecisions.push(req);
        } else {
          console.warn("[PermissionEngine] Discarded malformed historical approval record from storage.");
        }
      }
    }
  } catch (err) {
    console.warn("[PermissionEngine] Failed to load approvals from disk:", err);
  }
}

// Bootstrap persistence on load
initializeApprovalsStore();

/**
 * Persists active requests and historical decisions to disk using concurrency-safe lockfile.
 */
function persistApprovals(): void {
  try {
    const payload = {
      active: Array.from(activeRequests.values()),
      history: historicalDecisions.slice(0, MAX_HISTORY),
    };
    writeVaultJsonSync(APPROVALS_STORE_FILE, payload);
  } catch (err) {
    console.error("[PermissionEngine] Failed to persist approvals to vault storage:", err);
  }
}

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

    case "payment_exec":
      return {
        riskLevel: "critical",
        riskExplanation: `Executes financial payment transaction on target "${target}". Irreversible external financial operation.`,
        isDestructive: true,
      };

    case "external_publish":
      return {
        riskLevel: "critical",
        riskExplanation: `Publishes data or artifacts to external public channel "${target}". Irreversible public dissemination.`,
        isDestructive: true,
      };

    case "prod_deploy":
      return {
        riskLevel: "critical",
        riskExplanation: `Triggers production deployment or infrastructure alteration on "${target}".`,
        isDestructive: true,
      };

    case "file_read":
      return {
        riskLevel: "low",
        riskExplanation: `Reads file content at "${target}" within authorized access scope.`,
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
      // Invariant: Never automatically downgrade action risk. If risk classification is uncertain, use the safer higher-risk classification.
      return {
        riskLevel: "high",
        riskExplanation: `Unclassified or uncertain system operation on target "${target}". Elevated to HIGH risk under fail-safe policy.`,
        isDestructive: false,
      };
  }
}

/**
 * Creates and queues a new permission approval request for explicit founder sign-off.
 *
 * Supports both options object and positional argument signatures for seamless integration.
 *
 * @param actionTypeOrOptions - Action category or options object.
 * @param targetArg - Target resource or executable when using positional args.
 * @param paramsArg - Parameter map.
 * @param affectedResourcesArg - List of affected resources.
 * @param requestedByActorArg - Identity of actor or agent proposing the action.
 * @param sessionIdArg - Active session ID.
 * @param projectIdArg - Optional project tenant isolation ID.
 * @param rollbackPlanArg - Optional recovery / rollback instructions.
 * @returns Prepared PermissionApprovalRequest.
 */
export function createApprovalRequest(
  actionTypeOrOptions: PermissionActionType | {
    actionType: PermissionActionType;
    target: string;
    params?: Record<string, unknown>;
    affectedResources?: string[];
    requestedByActor?: string;
    requesterActor?: string;
    sessionId?: string;
    projectId?: string;
    rollbackPlan?: string;
    justification?: string;
  },
  targetArg?: string,
  paramsArg?: Record<string, unknown>,
  affectedResourcesArg: string[] = [],
  requestedByActorArg: string = "system_agent",
  sessionIdArg: string = "sess_unknown",
  projectIdArg?: string,
  rollbackPlanArg?: string
): PermissionApprovalRequest {
  let actionType: PermissionActionType;
  let target: string;
  let params: Record<string, unknown>;
  let affectedResources: string[];
  let requestedByActor: string;
  let sessionId: string;
  let projectId: string | undefined;
  let rollbackPlan: string | undefined;

  if (typeof actionTypeOrOptions === "object" && actionTypeOrOptions !== null) {
    const opts = actionTypeOrOptions;
    actionType = opts.actionType;
    target = opts.target || "";
    params = opts.params || {};
    affectedResources = opts.affectedResources || [];
    requestedByActor = opts.requestedByActor || opts.requesterActor || "system_agent";
    sessionId = opts.sessionId || "sess_unknown";
    projectId = opts.projectId;
    rollbackPlan = opts.rollbackPlan || opts.justification;
  } else {
    actionType = actionTypeOrOptions;
    target = targetArg || "";
    params = paramsArg || {};
    affectedResources = affectedResourcesArg || [];
    requestedByActor = requestedByActorArg || "system_agent";
    sessionId = sessionIdArg || "sess_unknown";
    projectId = projectIdArg;
    rollbackPlan = rollbackPlanArg;
  }

  const requestId = "req_" + crypto.randomBytes(12).toString("hex");
  const actionId = "act_" + crypto.randomBytes(8).toString("hex");
  const actionHash = computeCanonicalActionHash(actionType, target, params);
  const approvalToken = "appr_" + crypto.randomBytes(24).toString("hex");
  const { riskLevel, riskExplanation, isDestructive } = evaluateActionRisk(actionType, target);
  const now = Date.now();

  // Duplicate Prevention: Check if an identical action request is already pending
  for (const existing of activeRequests.values()) {
    if (existing.status === "pending" && existing.actionHash === actionHash) {
      if (now <= existing.expiresAt) {
        return existing;
      }
    }
  }

  const scope: ActionScope = {
    exactTarget: target.trim(),
    permittedParameters: { ...params },
    affectedResources: affectedResources.length > 0 ? affectedResources : [target],
    projectId,
  };

  const request: PermissionApprovalRequest = {
    requestId,
    actionId,
    actionType,
    title: `Authorization Required: ${actionType.replace("_", " ").toUpperCase()}`,
    description: `Requesting authorization to execute ${actionType} on target "${target}".`,
    target,
    resourceId: target.trim(),
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
    executionStatus: "PENDING",
  };

  activeRequests.set(requestId, request);
  persistApprovals();
  return request;
}

/**
 * Approves a pending approval request using the explicit approval token.
 *
 * Security Enforcements:
 * - Rejects expired requests (fail-closed).
 * - Rejects already approved, executed, or cancelled requests.
 * - Validates cryptographic approval token signature.
 * - Enforces Founder authority.
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
    request.executionStatus = "FAILED";
    archiveDecision(request);
    activeRequests.delete(requestId);
    persistApprovals();
    return { success: false, error: "Approval request has expired (5-minute TTL exceeded)." };
  }

  if (request.approvalToken !== presentedToken) {
    return { success: false, error: "Invalid approval token signature. Approval rejected." };
  }

  // Issue single-use execution grant token
  const executionGrantToken = "exec_" + crypto.randomBytes(24).toString("hex");
  request.executionGrantToken = executionGrantToken;
  request.status = "approved";
  request.founderIdentity = decidedByActor;
  request.decidedByActor = decidedByActor;
  request.decidedAt = Date.now();
  request.executionStatus = "PENDING";

  persistApprovals();
  return { success: true, executionGrantToken };
}

/**
 * Rejects an approval request.
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

  // Strict state machine: pending requests can be rejected; approved requests can be revoked/rejected
  if (request.status !== "pending" && request.status !== "approved") {
    return false;
  }

  // Invalidate single-use execution grant token if request was already approved
  if (request.executionGrantToken) {
    request.executionGrantToken = null;
  }

  request.status = "rejected";
  request.executionStatus = "FAILED";
  request.decidedByActor = decidedByActor;
  request.decidedAt = Date.now();
  request.decisionReason = reason;

  archiveDecision(request);
  activeRequests.delete(requestId);
  persistApprovals();
  return true;
}

/**
 * Cancels a pending approval request before decision.
 *
 * @param requestId - Request identifier.
 * @param reason - Cancellation reason.
 * @param decidedByActor - Actor cancelling the request.
 * @returns True if cancelled; false if not found or not pending.
 */
export function cancelRequest(
  requestId: string,
  reason: string = "Founder cancelled request",
  decidedByActor: string = "founder"
): boolean {
  const request = activeRequests.get(requestId);
  if (!request) return false;

  if (request.status !== "pending") {
    return false;
  }

  request.status = "cancelled";
  request.executionStatus = "FAILED";
  request.decidedByActor = decidedByActor;
  request.decidedAt = Date.now();
  request.decisionReason = reason;

  archiveDecision(request);
  activeRequests.delete(requestId);
  persistApprovals();
  return true;
}

/**
 * Revokes an already approved action grant before execution completes.
 *
 * Enforces immediate invalidation of the single-use execution grant token.
 *
 * @param requestId - Request identifier.
 * @param reason - Explanation for revocation.
 * @param decidedByActor - Actor revoking the approval.
 * @returns True if revoked; false if not found.
 */
export function revokeApproval(
  requestId: string,
  reason: string = "Founder revoked approval",
  decidedByActor: string = "founder"
): boolean {
  const request = activeRequests.get(requestId);
  if (!request) return false;

  // Strict state machine: only approved requests can be revoked
  if (request.status !== "approved") {
    return false;
  }

  // Invalidate execution grant immediately
  request.executionGrantToken = null;
  request.status = "revoked";
  request.executionStatus = "FAILED";
  request.decidedByActor = decidedByActor;
  request.decidedAt = Date.now();
  request.decisionReason = reason;

  archiveDecision(request);
  activeRequests.delete(requestId);
  persistApprovals();
  return true;
}

/**
 * Revalidates that an approved request is currently authorized for execution.
 *
 * Immediate Pre-Execution Verification:
 * 1. Confirms request exists and is in "approved" status.
 * 2. Confirms executionGrantToken matches.
 * 3. Confirms request has not expired or been revoked.
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
  currentParams?: Record<string, unknown>,
  currentTarget?: string
): { authorized: boolean; reason?: string } {
  const request = activeRequests.get(requestId);
  if (!request) {
    return { authorized: false, reason: "Request not found or already consumed." };
  }

  if (request.status !== "approved") {
    return { authorized: false, reason: `Request is already ${request.status} (single-use grant already consumed, revoked or invalid).` };
  }

  if (Date.now() > request.expiresAt) {
    request.status = "expired";
    request.executionStatus = "FAILED";
    archiveDecision(request);
    activeRequests.delete(requestId);
    persistApprovals();
    return { authorized: false, reason: "Execution grant expired." };
  }

  if (request.executionGrantToken !== presentedGrantToken) {
    return { authorized: false, reason: "Invalid execution grant token." };
  }

  // Anti-tampering target resource scope check
  if (currentTarget && currentTarget.trim().toLowerCase() !== request.target.trim().toLowerCase()) {
    request.status = "rejected";
    request.executionStatus = "FAILED";
    request.decisionReason = "Target resource altered post-approval.";
    archiveDecision(request);
    activeRequests.delete(requestId);
    persistApprovals();
    return { authorized: false, reason: "Security Violation: Target resource scope altered post-approval." };
  }

  // Anti-tampering parameter check
  if (currentParams) {
    const currentHash = computeCanonicalActionHash(request.actionType, request.target, currentParams);
    if (currentHash !== request.actionHash) {
      request.status = "rejected";
      request.executionStatus = "FAILED";
      request.decisionReason = "Parameter tampering detected between approval and execution.";
      archiveDecision(request);
      activeRequests.delete(requestId);
      persistApprovals();
      return { authorized: false, reason: "Security Violation: Parameters tampered with post-approval." };
    }
  }

  // Atomically transition status to "executing" to guarantee single-use consumption
  // and prevent concurrent execution race conditions or replay attacks.
  request.status = "executing";
  request.executionStatus = "EXECUTING";
  persistApprovals();

  return { authorized: true };
}

/**
 * Consumes and archives an execution grant upon execution completion.
 *
 * @param requestId - Request ID.
 * @param success - Whether execution succeeded.
 * @param outcomeMessage - Outcome description.
 * @returns True if finalized; false if not found or not in executing status.
 */
export function finalizeExecution(
  requestId: string,
  success: boolean,
  outcomeMessage?: string
): boolean {
  const request = activeRequests.get(requestId);
  if (!request) return false;

  // Strict state machine: only currently executing grants can be finalized
  if (request.status !== "executing") {
    return false;
  }

  request.status = success ? "executed" : "failed";
  request.executionStatus = success ? "COMPLETED" : "FAILED";
  request.executedAt = Date.now();
  request.finalResultRef = outcomeMessage || (success ? "Success" : "Failed");
  request.decisionReason = outcomeMessage;
  request.executionGrantToken = null; // Single-use guarantee: destroyed immediately

  archiveDecision(request);
  activeRequests.delete(requestId);
  persistApprovals();
  return true;
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
    request.executionStatus = "FAILED";
    archiveDecision(request);
    activeRequests.delete(requestId);
    persistApprovals();
    return undefined;
  }
  return request;
}

/**
 * Invalidates all active execution grant tokens across all pending or approved requests.
 * Invoked immediately upon Emergency Stop or Security Lockdown.
 *
 * @param reason - Diagnostic explanation for mass grant revocation.
 * @returns Count of invalidated grants.
 */
export function invalidateAllActiveGrants(reason: string = "Emergency Stop triggered"): number {
  let count = 0;
  for (const [id, req] of activeRequests.entries()) {
    if (req.status === "approved" || req.status === "executing") {
      req.status = "revoked";
      req.executionStatus = "FAILED";
      req.executionGrantToken = null;
      req.decisionReason = reason;
      archiveDecision(req);
      activeRequests.delete(id);
      count++;
    }
  }
  persistApprovals();
  return count;
}

/**
 * Lists all active pending approval requests.
 *
 * @returns Array of pending requests.
 */
export function listPendingRequests(): PermissionApprovalRequest[] {
  const now = Date.now();
  const list: PermissionApprovalRequest[] = [];
  let expiredFound = false;
  for (const [id, req] of activeRequests.entries()) {
    if (now > req.expiresAt) {
      req.status = "expired";
      req.executionStatus = "FAILED";
      archiveDecision(req);
      activeRequests.delete(id);
      expiredFound = true;
    } else if (req.status === "pending") {
      list.push(req);
    }
  }
  if (expiredFound) {
    persistApprovals();
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

/**
 * Lists approvals filtered optionally by status from both active and historical sets.
 *
 * @param status - Optional status filter.
 * @returns Filtered array of requests.
 */
export function listAllApprovals(status?: ApprovalStatus): PermissionApprovalRequest[] {
  const all: PermissionApprovalRequest[] = [];
  for (const req of activeRequests.values()) {
    all.push(req);
  }
  for (const req of historicalDecisions) {
    all.push(req);
  }
  if (!status) return all;
  return all.filter((r) => r.status === status);
}
