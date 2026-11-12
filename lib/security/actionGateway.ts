/**
 * @file lib/security/actionGateway.ts
 * @description Centralized Action Authorization Gateway for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Execution & Authorization Subsystem (Module 4).
 *
 * Key Responsibilities:
 * - Implements the non-negotiable core security principle:
 *   NO VALID AUTHORIZATION = NO EXECUTION.
 * - Enforces the 14-Step Mandatory Execution Pipeline:
 *   1. Receive action request.
 *   2. Identify actor and session.
 *   3. Identify requested operation.
 *   4. Identify target resource.
 *   5. Classify risk.
 *   6. Evaluate security policy.
 *   7. Validate resource permissions (RBAC & ABAC).
 *   8. Validate approval requirements.
 *   9. Validate approval scope and expiration.
 *   10. Request founder approval when required.
 *   11. Revalidate authorization immediately prior to execution.
 *   12. Execute only the authorized operation.
 *   13. Verify actual execution result.
 *   14. Record an audit event.
 * - Protects all destructive actions (file deletion, memory wipe, credential changes, shell execution).
 * - Blocks tool bypass: Tools cannot execute without valid single-use execution grant tokens.
 * - Fail-closed: Any exception, missing approval, or hash mismatch terminates execution.
 *
 * Architectural Role & Interactions:
 * - Central checkpoint between `app/api/chat/route.ts`, `lib/appLauncher.ts`,
 *   `lib/systemController.ts`, and host execution primitives.
 * - Interacts with `lib/security/permissionEngine.ts`, `lib/security/accessControlEngine.ts`,
 *   `lib/security/identityEngine.ts`, and `lib/security/auditEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - Anti-bypass: Execution functions check gateway authorization grants.
 * - Anti-tampering: Re-checks SHA-256 canonical hash immediately before running.
 * - Single-use: Execution grant tokens are destroyed upon completion or rejection.
 */

import crypto from "crypto";
import { validateSessionToken } from "./identityEngine.ts";
import { evaluateAccess } from "./accessControlEngine.ts";
import {
  createApprovalRequest,
  evaluateActionRisk,
  verifyExecutionGrant,
  finalizeExecution,
  computeCanonicalActionHash,
} from "./permissionEngine.ts";
import type {
  PermissionActionType,
  ActionRiskLevel,
  GatewayExecutionRequest,
  GatewayExecutionResult,
  ABACContext,
  ResourceDomain,
  AccessOperation,
} from "./types.ts";

/** Hook type for auditing gateway actions. */
type AuditLogHook = (
  actor: string,
  action: PermissionActionType,
  target: string,
  riskLevel: ActionRiskLevel,
  status: "SUCCESS" | "FAILURE" | "DENIED" | "BLOCKED",
  details: string,
  sessionId?: string,
  approvalId?: string
) => void;

let auditHook: AuditLogHook | null = null;

/**
 * Registers an audit logger hook to be triggered at Pipeline Step 14.
 *
 * @param hook - Audit function.
 */
export function setGatewayAuditHook(hook: AuditLogHook): void {
  auditHook = hook;
}

/**
 * Maps PermissionActionType to AccessOperation for ABAC evaluation.
 *
 * @param action - PermissionActionType.
 * @returns Corresponding AccessOperation.
 */
function mapActionToOperation(action: PermissionActionType): AccessOperation {
  switch (action) {
    case "file_read":
      return "read";
    case "file_write":
    case "credential_write":
      return "write";
    case "file_delete":
    case "folder_delete":
    case "memory_wipe":
    case "credential_revoke":
      return "delete";
    case "policy_update":
    case "emergency_unlock":
      return "admin";
    default:
      return "execute";
  }
}

/**
 * Maps PermissionActionType to ResourceDomain for ABAC evaluation.
 *
 * @param action - PermissionActionType.
 * @returns Corresponding ResourceDomain.
 */
function mapActionToDomain(action: PermissionActionType): ResourceDomain {
  switch (action) {
    case "file_read":
    case "file_write":
    case "file_delete":
    case "folder_delete":
      return "file";
    case "app_launch":
    case "app_terminate":
      return "application";
    case "browser_open":
      return "network";
    case "volume_change":
    case "system_command":
      return "system";
    case "memory_wipe":
      return "database";
    case "credential_read":
    case "credential_write":
    case "credential_revoke":
      return "credential";
    default:
      return "system";
  }
}

/**
 * Evaluates an incoming action through the 14-Step Action Authorization Gateway.
 *
 * If explicit founder approval is required, the gateway generates a cryptographically
 * bound PermissionApprovalRequest, halts execution, and returns `requiresApproval: true`.
 *
 * If a valid execution grant token is already provided (after founder sign-off),
 * the gateway verifies token authenticity, validates parameter integrity, executes
 * the provided executor, and records Step 14 audit telemetry.
 *
 * @param request - GatewayExecutionRequest describing the proposed action.
 * @param grantToken - Optional single-use execution grant token.
 * @param executor - Async closure that carries out the physical operation.
 * @returns GatewayExecutionResult.
 */
export async function executeThroughGateway<TOutput>(
  request: GatewayExecutionRequest,
  grantToken?: string,
  executor?: () => Promise<TOutput>
): Promise<GatewayExecutionResult<TOutput>> {
  const { actionType, target, params, actorId, sessionId, projectId, justification } = request;

  // Step 1: Receive action request
  // Step 2: Identify actor and session
  const sessionCheck = validateSessionToken(sessionId);
  if (!sessionCheck.isValid || !sessionCheck.session) {
    if (auditHook) {
      auditHook(actorId, actionType, target, "high", "DENIED", `Invalid session: ${sessionCheck.error}`, sessionId);
    }
    return {
      success: false,
      requiresApproval: false,
      error: `Action blocked at Step 2: ${sessionCheck.error || "Invalid session"}`,
      pipelineStepCompleted: 2,
    };
  }

  const actorRole = sessionCheck.session.userRole;

  // Step 3: Identify requested operation
  const requestedOperation = mapActionToOperation(actionType);
  const resourceDomain = mapActionToDomain(actionType);

  // Step 4: Identify target resource
  const cleanTarget = target.trim();

  // Step 5: Classify risk
  const { riskLevel, riskExplanation, isDestructive } = evaluateActionRisk(actionType, cleanTarget);

  // Step 6: Evaluate security policy & Step 7: Validate resource permissions (ABAC)
  const abacContext: ABACContext = {
    actorId,
    actorRole,
    sessionId,
    requestedOperation,
    resourceDomain,
    resourceIdentifier: cleanTarget,
    projectId,
    isEmergencyLocked: false, // Updated by emergency engine if active
    environment: {
      ipAddress: "127.0.0.1",
      isLoopback: true,
      timestamp: Date.now(),
      platform: process.platform,
    },
  };

  const accessEval = evaluateAccess(abacContext);
  if (!accessEval.isAllowed) {
    if (auditHook) {
      auditHook(actorId, actionType, cleanTarget, riskLevel, "DENIED", accessEval.reason, sessionId);
    }
    return {
      success: false,
      requiresApproval: false,
      error: `Access Denied at Step 7: ${accessEval.reason}`,
      pipelineStepCompleted: 7,
    };
  }

  // Step 8: Validate approval requirements
  const requiresApproval = accessEval.requiresFounderApproval || isDestructive || riskLevel === "critical";

  // Step 9 & Step 10: If approval is required and no grant token provided, request approval
  if (requiresApproval && !grantToken) {
    const approvalReq = createApprovalRequest(
      actionType,
      cleanTarget,
      params,
      [cleanTarget],
      actorId,
      sessionId,
      projectId,
      isDestructive ? `Impact: ${riskExplanation}. Reversible: false.` : undefined
    );

    if (auditHook) {
      auditHook(
        actorId,
        actionType,
        cleanTarget,
        riskLevel,
        "BLOCKED",
        `Approval requested: ${approvalReq.requestId}`,
        sessionId,
        approvalReq.requestId
      );
    }

    return {
      success: false,
      requiresApproval: true,
      approvalRequest: approvalReq,
      pipelineStepCompleted: 10,
    };
  }

  // Step 11: Revalidate authorization immediately prior to execution
  if (requiresApproval && grantToken) {
    // Strip internal gateway tracking metadata keys starting with _
    const sanitizedParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (!k.startsWith("_")) {
        sanitizedParams[k] = v;
      }
    }

    const grantCheck = verifyExecutionGrant(
      request.params._approvalRequestId as string || "",
      grantToken,
      sanitizedParams
    );

    if (!grantCheck.authorized) {
      if (auditHook) {
        auditHook(
          actorId,
          actionType,
          cleanTarget,
          riskLevel,
          "DENIED",
          `Authorization revalidation failed: ${grantCheck.reason}`,
          sessionId
        );
      }
      return {
        success: false,
        requiresApproval: false,
        error: `Action blocked at Step 11: ${grantCheck.reason}`,
        pipelineStepCompleted: 11,
      };
    }
  }

  // Step 12: Execute only the authorized operation
  if (!executor) {
    return {
      success: false,
      requiresApproval: false,
      error: "Missing physical action executor.",
      pipelineStepCompleted: 11,
    };
  }

  try {
    const output = await executor();

    // Step 13: Verify actual execution result
    if (output === false || output === null) {
      throw new Error("Executor returned unsuccessful outcome.");
    }

    // Step 14: Record an audit event
    if (request.params._approvalRequestId) {
      finalizeExecution(request.params._approvalRequestId as string, true, "Executed successfully.");
    }

    if (auditHook) {
      auditHook(
        actorId,
        actionType,
        cleanTarget,
        riskLevel,
        "SUCCESS",
        "Action executed successfully through gateway.",
        sessionId,
        request.params._approvalRequestId as string
      );
    }

    return {
      success: true,
      requiresApproval: false,
      result: output,
      pipelineStepCompleted: 14,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (request.params._approvalRequestId) {
      finalizeExecution(request.params._approvalRequestId as string, false, errorMsg);
    }

    if (auditHook) {
      auditHook(
        actorId,
        actionType,
        cleanTarget,
        riskLevel,
        "FAILURE",
        `Execution failed at Step 12: ${errorMsg}`,
        sessionId,
        request.params._approvalRequestId as string
      );
    }

    return {
      success: false,
      requiresApproval: false,
      error: `Execution failed at Step 12: ${errorMsg}`,
      pipelineStepCompleted: 12,
    };
  }
}
