/**
 * @file app/api/permission/route.ts
 * @description Universal Computer Action Permission Gateway Route for ULTRON.
 *
 * Subsystem:
 * Centralized Desktop Execution, Authorization & Audit Gateway.
 *
 * Key Responsibilities:
 * - GET: Retrieves active action plan details or recent audit history.
 * - POST: Handles user approval (with verification token) and triggers controlled execution,
 *   or user cancellation of pending actions.
 *
 * Architectural Role & Interactions:
 * - Interfaced by the Next.js UI when an action confirmation card is presented to the user.
 * - Coordinates execution through `lib/permissionGateway.ts`, `lib/appLauncher.ts`,
 *   and `lib/systemController.ts`.
 * - Protected by `lib/sessionGate.ts`.
 *
 * Safety / Security Guarantees:
 * - Session token & loopback origin validation required.
 * - Single-use approval tokens and immutable hash verification.
 * - Complete non-sensitive audit logging.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getActionPlan,
  approveActionPlan,
  cancelActionPlan,
  executeApprovedAction,
  getGatewayAuditHistory,
} from "@/lib/permissionGateway";
import { launchAppByName } from "@/lib/appLauncher";
import { controlAudioVolume, openUrlInBrowser } from "@/lib/systemController";
import { defaultComputerToolRegistry } from "@/lib/computer/toolRegistry";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";

/**
 * Handles GET requests to inspect pending action plans or retrieve audit history.
 *
 * @param req - Incoming NextRequest.
 * @returns JSON response.
 */
export async function GET(req: NextRequest) {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get("planId");
  const showAudit = searchParams.get("action") === "audit";

  if (showAudit) {
    return NextResponse.json({ ok: true, auditLog: getGatewayAuditHistory() });
  }

  if (!planId) {
    return NextResponse.json({ ok: false, error: "planId parameter is required" }, { status: 400 });
  }

  const plan = getActionPlan(planId);
  if (!plan) {
    return NextResponse.json({ ok: false, error: "Action plan not found or expired" }, { status: 404 });
  }

  // Do not expose internal execution or approval tokens to public GET queries
  const sanitizedPlan = {
    planId: plan.planId,
    actionType: plan.actionType,
    title: plan.title,
    description: plan.description,
    target: plan.target,
    params: plan.params,
    affectedResources: plan.affectedResources,
    riskLevel: plan.riskLevel,
    riskExplanation: plan.riskExplanation,
    expiresAt: plan.expiresAt,
    status: plan.status,
  };

  return NextResponse.json({ ok: true, plan: sanitizedPlan });
}

/**
 * Handles POST requests to approve or reject action plans.
 *
 * @param req - Incoming NextRequest.
 * @returns JSON response with execution or cancellation outcome.
 */
export async function POST(req: NextRequest) {
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

  // F-11 Enforcement & Local Console Authorization:
  // Privileged Action Approval requires authorized console access.
  // Founder authority (FOUNDER_AUTHORIZED) or an authenticated desktop session (operator / founder)
  // is authorized to approve desktop actions.
  // Guest or unauthenticated callers are rejected fail-closed with HTTP 403 Forbidden.
  const effectiveRole = auth.session?.userRole || "guest";
  const authLevel = auth.session?.authenticationLevel;

  const isAuthorized =
    (effectiveRole === "founder" && authLevel === "FOUNDER_AUTHORIZED") ||
    effectiveRole === "founder" ||
    (effectiveRole === "operator" && authLevel === "CHAT_AUTHENTICATED");

  if (!isAuthorized) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: `Authorization Denied: Privileged computer actions strictly require an authorized desktop session. Session role is "${effectiveRole}" (${authLevel || "UNAUTHENTICATED"}).`,
      },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    // Normalize action: accommodate either direct 'action' or legacy 'decision' field
    const rawAction = body.action || (body.decision === "deny" ? "reject" : body.decision);
    const action = typeof rawAction === "string" ? rawAction.toLowerCase().trim() : "";
    const { planId, approvalToken, reason } = body;

    if (!planId || typeof planId !== "string") {
      return NextResponse.json({ ok: false, success: false, error: "planId is required" }, { status: 400 });
    }

    // Cancellation pathway
    if (action === "reject" || action === "cancel" || action === "deny") {
      const cancelled = cancelActionPlan(planId, reason || "User cancelled in UI");
      if (!cancelled) {
        return NextResponse.json({ ok: false, success: false, error: "Action plan not found or already processed" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, success: true, message: "Action was cancelled successfully." });
    }

    // Approval pathway
    if (action === "approve") {
      if (!approvalToken || typeof approvalToken !== "string") {
        return NextResponse.json({ ok: false, success: false, error: "approvalToken is required to authorize action" }, { status: 400 });
      }

      const plan = getActionPlan(planId);
      if (!plan) {
        return NextResponse.json({ ok: false, success: false, error: "Action plan not found or expired" }, { status: 404 });
      }

      const approvalResult = approveActionPlan(planId, approvalToken);
      if (!approvalResult.success || !approvalResult.executionGrantToken) {
        return NextResponse.json({ ok: false, success: false, error: approvalResult.error || "Approval rejected" }, { status: 403 });
      }

      const grantToken = approvalResult.executionGrantToken;

      // Define concrete executor depending on the action type
      let executionOutcome;
      if (plan.actionType === "app_launch") {
        // App launch dispatcher: route through tool registry or fallback launcher
        executionOutcome = await executeApprovedAction(planId, grantToken, async () => {
          const appName = String(plan.params.appName || plan.target);
          return await defaultComputerToolRegistry.executeTool("launch_application", { appName }, {
            planId,
            executionGrantToken: grantToken,
            approvalGranted: true,
          });
        });
      } else if (plan.actionType === "file_write") {
        // File write / overwrite dispatcher
        executionOutcome = await executeApprovedAction(planId, grantToken, async () => {
          const filePath = String(plan.params.path || plan.target);
          const content = String(plan.params.content || "");
          const overwrite = plan.params.overwrite !== false;
          return await defaultComputerToolRegistry.executeTool("write_file", { path: filePath, content, overwrite }, {
            planId,
            executionGrantToken: grantToken,
            approvalGranted: true,
          });
        });
      } else if (plan.actionType === "file_delete") {
        // File deletion dispatcher
        executionOutcome = await executeApprovedAction(planId, grantToken, async () => {
          const filePath = String(plan.params.path || plan.target);
          return await defaultComputerToolRegistry.executeTool("delete_file", { path: filePath }, {
            planId,
            executionGrantToken: grantToken,
            approvalGranted: true,
          });
        });
      } else if (plan.actionType === "shell_exec") {
        // Terminal command execution dispatcher
        executionOutcome = await executeApprovedAction(planId, grantToken, async () => {
          const cmd = String(plan.params.command || plan.target);
          return await defaultComputerToolRegistry.executeTool("execute_command", { command: cmd }, {
            planId,
            executionGrantToken: grantToken,
            approvalGranted: true,
          });
        });
      } else if (plan.actionType === "volume_change") {
        const volAction = plan.params.volumeAction as "up" | "down" | "mute";
        executionOutcome = await executeApprovedAction(planId, grantToken, async () => {
          return await controlAudioVolume(volAction, { planId, grantToken });
        });
      } else if (plan.actionType === "browser_open") {
        const targetUrl = String(plan.params.targetUrl || plan.target);
        executionOutcome = await executeApprovedAction(planId, grantToken, async () => {
          return await openUrlInBrowser(targetUrl, { planId, grantToken });
        });
      } else {
        return NextResponse.json(
          { ok: false, success: false, error: `Unsupported action type: ${plan.actionType}` },
          { status: 400 }
        );
      }

      if (!executionOutcome.success) {
        return NextResponse.json(
          {
            ok: false,
            success: false,
            executionSuccess: false,
            error: executionOutcome.error || "Execution failed",
            result: executionOutcome.result,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        success: true,
        executionSuccess: true,
        message: "Action approved and executed successfully.",
        result: executionOutcome.result,
      });
    }

    return NextResponse.json(
      { ok: false, success: false, error: `Invalid action "${action}". Must be "approve" or "reject".` },
      { status: 400 }
    );
  } catch (err) {
    console.error("[API PERMISSION] Execution error:", err);
    return NextResponse.json({ ok: false, success: false, error: "Internal error processing permission" }, { status: 500 });
  }
}
