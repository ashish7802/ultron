/**
 * @file app/api/security/permissions/route.ts
 * @description Centralized Permission Management API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Permission & Approval Subsystem (Module 2).
 *
 * Key Responsibilities:
 * - GET: Retrieves pending approval requests, specific request details, or approval history.
 * - POST: Handles approval, rejection, and cancellation with single-use cryptographic tokens.
 *
 * Safety / Security Guarantees:
 * - Re-validates canonical SHA-256 action hash.
 * - Enforces fail-closed 5-minute approval expiration.
 * - Single-use execution grant token issuance.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  revokeApproval,
  getApprovalRequest,
  listPendingRequests,
  listApprovalHistory,
  listAllApprovals,
} from "@/lib/security/permissionEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";
import type { ApprovalStatus } from "@/lib/security/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get("requestId");
  const showHistory = searchParams.get("history") === "true";
  const statusFilter = searchParams.get("status") as ApprovalStatus | null;

  if (statusFilter) {
    return NextResponse.json({ ok: true, approvals: listAllApprovals(statusFilter) });
  }

  if (showHistory) {
    return NextResponse.json({ ok: true, history: listApprovalHistory() });
  }

  if (requestId) {
    const request = getApprovalRequest(requestId);
    if (!request) {
      return NextResponse.json({ ok: false, error: "Request not found or expired." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, request });
  }

  return NextResponse.json({ ok: true, pendingRequests: listPendingRequests() });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid || !auth.session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, requestId, approvalToken, reason, actionType, target, params } = body;

    switch (action) {
      case "request": {
        const reqPlan = createApprovalRequest(
          actionType,
          target,
          params || {},
          [target],
          auth.session.userId,
          auth.session.sessionId
        );
        return NextResponse.json({ ok: true, request: reqPlan });
      }

      case "approve": {
        if (!requestId || !approvalToken) {
          return NextResponse.json({ ok: false, error: "requestId and approvalToken required." }, { status: 400 });
        }
        const outcome = approveRequest(requestId, approvalToken, auth.session.userRole);
        return NextResponse.json({
          ok: outcome.success,
          executionGrantToken: outcome.executionGrantToken,
          error: outcome.error,
        });
      }

      case "reject": {
        if (!requestId) {
          return NextResponse.json({ ok: false, error: "requestId required." }, { status: 400 });
        }
        const success = rejectRequest(requestId, reason || "User rejected", auth.session.userRole);
        return NextResponse.json({ ok: success });
      }

      case "cancel": {
        if (!requestId) {
          return NextResponse.json({ ok: false, error: "requestId required." }, { status: 400 });
        }
        const success = cancelRequest(requestId, reason || "Founder cancelled", auth.session.userRole);
        return NextResponse.json({ ok: success });
      }

      case "revoke": {
        if (!requestId) {
          return NextResponse.json({ ok: false, error: "requestId required." }, { status: 400 });
        }
        const success = revokeApproval(requestId, reason || "Founder revoked approval", auth.session.userRole);
        return NextResponse.json({ ok: success });
      }

      default:
        return NextResponse.json({ ok: false, error: `Invalid action "${action}".` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Permission error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
