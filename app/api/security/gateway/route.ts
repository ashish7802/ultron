/**
 * @file app/api/security/gateway/route.ts
 * @description Centralized Action Authorization Gateway API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Execution & Authorization Subsystem (Module 4).
 *
 * Key Responsibilities:
 * - Executes all protected external tools and operations through the 14-step pipeline.
 * - Prevents tool bypass and enforces destructive action protection.
 *
 * Safety / Security Guarantees:
 * - NO VALID AUTHORIZATION = NO EXECUTION.
 * - Single-use execution grant tokens destroyed immediately upon completion.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeThroughGateway } from "@/lib/security/actionGateway";
import { validateSessionToken } from "@/lib/security/identityEngine";
import { launchAppByName } from "@/lib/appLauncher";
import { controlAudioVolume, openUrlInBrowser } from "@/lib/systemController";
import type { GatewayExecutionRequest } from "@/lib/security/types";

const ALLOWED_GATEWAY_ACTIONS = new Set<string>([
  "app_launch",
  "browser_open",
  "volume_change",
]);

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid || !auth.session) {
    return NextResponse.json({ ok: false, error: "Authentication required to access Gateway." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { actionType, target, params, executionGrantToken } = body;

    if (!actionType || !target) {
      return NextResponse.json({ ok: false, error: "actionType and target are required." }, { status: 400 });
    }

    // Enforce explicit allowlist: unknown operations are strictly rejected
    if (!ALLOWED_GATEWAY_ACTIONS.has(actionType)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Security Policy Violation: Action type '${actionType}' is not supported or permitted for gateway execution.`,
        },
        { status: 400 }
      );
    }

    const gatewayRequest: GatewayExecutionRequest = {
      actionType,
      target,
      params: params || {},
      actorId: auth.session.userId,
      sessionId: auth.session.sessionToken,
    };

    // Executor mapping based on actionType
    const executor = async () => {
      const planId = (params?._approvalRequestId as string) || "";
      const grantToken = (executionGrantToken as string) || "";
      const gatewayAuth = planId && grantToken ? { planId, grantToken } : undefined;

      switch (actionType) {
        case "app_launch": {
          const res = await launchAppByName(target, gatewayAuth);
          return res;
        }

        case "browser_open": {
          const res = await openUrlInBrowser(target, gatewayAuth);
          return res;
        }

        case "volume_change": {
          const volAction = (params?.volumeAction as "up" | "down" | "mute") || "up";
          const res = await controlAudioVolume(volAction, gatewayAuth);
          return res;
        }

        default:
          throw new Error(`Unsupported or unmapped action executor for '${actionType}'.`);
      }
    };

    const outcome = await executeThroughGateway(gatewayRequest, executionGrantToken, executor);

    return NextResponse.json({
      ok: outcome.success,
      requiresApproval: outcome.requiresApproval,
      approvalRequest: outcome.approvalRequest,
      result: outcome.result,
      error: outcome.error,
      stepCompleted: outcome.pipelineStepCompleted,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Gateway execution error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
