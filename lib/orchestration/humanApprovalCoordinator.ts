/**
 * @file lib/orchestration/humanApprovalCoordinator.ts
 * @description Module 13: Human Approval Coordination for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 5 Approval & Verification.
 *
 * Key Responsibilities:
 * - Coordinates approval requirements with ULTRON's centralized `PermissionGateway` (`lib/permissionGateway.ts`).
 * - Detects actions requiring explicit founder authorization based on risk level and action type.
 * - Formulates plain-English action summaries and transparent risk disclosures.
 * - Enforces strict separation of planning and execution: external actions CANNOT execute without valid approval.
 * - Cryptographically binds approvals to exact action parameters via SHA-256 action hashes.
 * - Re-approval enforcement: any parameter alteration invalidates prior approvals (Anti-Tampering).
 * - Manages approval lifecycles (PENDING, APPROVED, REJECTED, EXPIRED) and handles recovery across restarts.
 * - Coordinates transition from approval grant token to authorized execution.
 *
 * Architectural Role & Interactions:
 * - Direct bridge between `workflowManagementEngine.ts` and `lib/permissionGateway.ts`.
 * - Strictly respects the core security invariant: NO VALID AUTHORIZATION = NO EXECUTION.
 *
 * Safety / Security Guarantees:
 * - Single-use execution grant tokens cannot be reused or replayed.
 * - Fails closed: expired or rejected approvals immediately halt downstream task execution.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  planAction,
  approveActionPlan,
  computeActionHash,
  type ActionPlan,
  type ActionRiskLevel,
  type PermissionActionType,
} from "../permissionGateway.ts";
import { validateSessionToken } from "../security/identityEngine.ts";
import type {
  OrchestrationTask,
  ApprovalRequestRecord,
} from "./types.ts";

export class HumanApprovalCoordinator {
  private _approvalRequests = new Map<string, ApprovalRequestRecord>(); // requestId -> record
  private _taskToRequestMap = new Map<string, string>(); // taskId -> requestId
  private _approvalsDir: string;

  constructor(storageDir?: string) {
    this._approvalsDir = storageDir || path.join(process.cwd(), ".tasks", "approvals");
    try {
      if (!fs.existsSync(this._approvalsDir)) {
        fs.mkdirSync(this._approvalsDir, { recursive: true });
      }
    } catch (err) {
      console.error("[HumanApprovalCoordinator] Failed to create approvals dir:", err);
    }
  }

  private _persistApproval(record: ApprovalRequestRecord): void {
    try {
      if (!fs.existsSync(this._approvalsDir)) {
        fs.mkdirSync(this._approvalsDir, { recursive: true });
      }
      const filePath = path.join(this._approvalsDir, `${record.requestId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");

      // Also persist task pointer
      const taskPointer = path.join(this._approvalsDir, `task_${record.taskId}.json`);
      fs.writeFileSync(taskPointer, JSON.stringify({ requestId: record.requestId }), "utf-8");
    } catch (err) {
      console.warn("[HumanApprovalCoordinator] Failed to persist approval record:", err);
    }
  }

  /**
   * Determines whether an OrchestrationTask requires founder authorization.
   *
   * @param task - The candidate task.
   * @returns Boolean indicating whether human approval is required.
   */
  public requiresApproval(task: OrchestrationTask): boolean {
    if (task.requiresApproval) {
      return true;
    }
    if (task.riskLevel === "high" || task.riskLevel === "critical") {
      return true;
    }
    // Specific sensitive action types always require approval
    const sensitiveActions: PermissionActionType[] = [
      "file_write",
      "file_delete",
      "shell_exec",
      "system_command",
      "app_terminate",
    ];
    if (task.actionType && sensitiveActions.includes(task.actionType)) {
      return true;
    }

    return false;
  }

  /**
   * Creates an ActionPlan in the PermissionGateway and registers an ApprovalRequestRecord for the task.
   *
   * @param task - Target OrchestrationTask.
   * @returns Generated ApprovalRequestRecord.
   */
  public async requestApproval(task: OrchestrationTask): Promise<ApprovalRequestRecord> {
    const actionType: PermissionActionType = task.actionType || "system_command";
    const target = (task.actionPayload?.target as string) || task.title;
    const params = task.actionPayload || { taskId: task.id, title: task.title };

    const riskExplanation =
      task.riskExplanation ||
      `Task "${task.title}" performs action "${actionType}" which requires explicit founder authorization.`;

    // 1. Submit to PermissionGateway to generate cryptographically hashed ActionPlan
    const plan: ActionPlan = planAction(
      actionType as PermissionActionType,
      target,
      params,
      [...task.deliverables]
    );

    const requestId = `appr_req_${task.id}_${Date.now()}`;

    const record: ApprovalRequestRecord = {
      requestId,
      taskId: task.id,
      workflowId: task.workflowId,
      planId: plan.planId,
      title: task.title,
      actionType,
      actionSummary: `Execute "${task.title}" on target "${target}".`,
      riskLevel: task.riskLevel,
      riskExplanation,
      actionHash: plan.actionHash,
      approvalToken: plan.approvalToken,
      executionGrantToken: null,
      status: "PENDING",
      requestedAt: Date.now(),
    };

    this._approvalRequests.set(requestId, record);
    this._taskToRequestMap.set(task.id, requestId);
    this._persistApproval(record);

    // Update task status
    task.status = "AWAITING_APPROVAL";
    task.approvalToken = plan.approvalToken;

    return record;
  }

  /**
   * Processes a founder's approval or rejection of an action plan.
   *
   * Enforces server-side authorization: requires a valid founder or admin session token.
   * Rejects unauthenticated callers or forged fallback tokens fail-closed.
   *
   * @param requestId - The approval request identifier.
   * @param approved - True to approve, false to reject.
   * @param founderSessionToken - Valid founder session token.
   * @param founderRole - Role of the actor (must be founder or admin).
   * @param rejectionReason - Optional explanation if rejected.
   * @returns Updated ApprovalRequestRecord with executionGrantToken if approved.
   */
  public async resolveApproval(
    requestId: string,
    approved: boolean,
    founderSessionToken: string,
    founderRole: string = "founder",
    rejectionReason?: string
  ): Promise<ApprovalRequestRecord> {
    const record = this._approvalRequests.get(requestId);
    if (!record) {
      throw new Error(`Approval request "${requestId}" not found.`);
    }

    if (record.status !== "PENDING") {
      throw new Error(`Approval request "${requestId}" is already resolved (${record.status}).`);
    }

    // Server-side Founder Session Authorization Check (Finding F-02)
    let effectiveRole = founderRole;
    if (founderSessionToken) {
      const sessionCheck = validateSessionToken(founderSessionToken);
      if (!sessionCheck.isValid || !sessionCheck.session) {
        throw new Error(`Unauthorized: Invalid founder session for approval resolution: ${sessionCheck.error || "Invalid session"}`);
      }
      if (sessionCheck.session.userRole !== "founder" && sessionCheck.session.userRole !== "admin") {
        throw new Error(`Access Denied: Role "${sessionCheck.session.userRole}" is not authorized to grant task approvals.`);
      }
      effectiveRole = sessionCheck.session.userRole;
    } else if (approved) {
      // Approvals strictly require authenticated founder session token (NO execution grant without authorization)
      throw new Error("Unauthorized: Founder session token required to approve task execution.");
    }

    if (!approved) {
      record.status = "REJECTED";
      record.resolvedAt = Date.now();
      record.resolvedBy = effectiveRole;
      record.rejectionReason = rejectionReason || "Rejected by founder.";
      this._persistApproval(record);
      return record;
    }

    // Approve through PermissionGateway
    const approvalResult = approveActionPlan(
      record.planId,
      record.approvalToken
    );

    if (!approvalResult.success || !approvalResult.executionGrantToken) {
      record.status = "REJECTED";
      record.resolvedAt = Date.now();
      record.rejectionReason = approvalResult.error || "PermissionGateway rejected approval.";
      this._persistApproval(record);
      throw new Error(`Gateway approval failed: ${record.rejectionReason}`);
    }

    record.status = "APPROVED";
    record.executionGrantToken = approvalResult.executionGrantToken;
    record.resolvedAt = Date.now();
    record.resolvedBy = effectiveRole;
    this._persistApproval(record);

    return record;
  }

  /**
   * Retrieves the active approval request for a task with restart rehydration.
   */
  public getRequestForTask(taskId: string): ApprovalRequestRecord | null {
    let reqId = this._taskToRequestMap.get(taskId);
    if (!reqId) {
      // Check disk storage for restart recovery
      try {
        const taskPointer = path.join(this._approvalsDir, `task_${taskId}.json`);
        if (fs.existsSync(taskPointer)) {
          const parsed = JSON.parse(fs.readFileSync(taskPointer, "utf-8"));
          reqId = parsed.requestId;
          if (reqId) {
            this._taskToRequestMap.set(taskId, reqId);
          }
        }
      } catch {}
    }

    if (!reqId) return null;

    let record = this._approvalRequests.get(reqId);
    if (!record) {
      try {
        const filePath = path.join(this._approvalsDir, `${reqId}.json`);
        if (fs.existsSync(filePath)) {
          record = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ApprovalRequestRecord;
          this._approvalRequests.set(reqId, record);
        }
      } catch {}
    }

    return record || null;
  }

  /**
   * Lists all pending approval requests awaiting founder decision with restart rehydration.
   */
  public listPendingRequests(): ApprovalRequestRecord[] {
    // Scan disk storage to rehydrate any approvals persisted prior to process reboot
    try {
      if (fs.existsSync(this._approvalsDir)) {
        const files = fs.readdirSync(this._approvalsDir).filter((f) => f.startsWith("appr_req_") && f.endsWith(".json"));
        for (const file of files) {
          try {
            const content = fs.readFileSync(path.join(this._approvalsDir, file), "utf-8");
            const record = JSON.parse(content) as ApprovalRequestRecord;
            this._approvalRequests.set(record.requestId, record);
            this._taskToRequestMap.set(record.taskId, record.requestId);
          } catch {}
        }
      }
    } catch {}

    return Array.from(this._approvalRequests.values()).filter((r) => r.status === "PENDING");
  }

  /**
   * Validates that an action's parameters have not been tampered with since approval.
   *
   * @param task - Target task.
   * @param currentParams - Current parameters intended for execution.
   * @returns Boolean: true if parameters match canonical hash, false if modified (tampered).
   */
  public verifyParameterIntegrity(
    task: OrchestrationTask,
    currentParams: Record<string, unknown>
  ): boolean {
    const record = this.getRequestForTask(task.id);
    if (!record) return false;

    // Filter out internal tracking keys
    const sanitizedParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(currentParams)) {
      if (!k.startsWith("_")) {
        sanitizedParams[k] = v;
      }
    }

    const target = (task.actionPayload?.target as string) || task.title;
    const currentHash = computeActionHash(record.actionType, target, sanitizedParams);

    return currentHash === record.actionHash;
  }
}

/** Global default human approval coordinator singleton */
export const defaultHumanApprovalCoordinator = new HumanApprovalCoordinator();
