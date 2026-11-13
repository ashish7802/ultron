/**
 * @file app/api/screen/control/route.ts
 * @description API Endpoint for Screen Awareness Module 01: Vision Control & Floating Indicator Sync.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Control Endpoint.
 *
 * Responsibilities:
 * - GET: Retrieves the real-time operational status, permission state, and indicator text/color.
 * - POST: Dispatches control commands (START, STOP, PAUSE, RESUME, EMERGENCY_KILL).
 * - Synchronizes with `PrivacySecurityEngine` to grant or revoke time-bounded user consent.
 * - Uses one session ID for vision control and frame streaming; LIVE is reported only after a real frame arrives.
 *
 * Safety & Security Guarantees:
 * - Fail-closed: EMERGENCY_KILL immediately terminates active sessions and purges memory buffers.
 * - Single-user desktop design on local loopback.
 */

import { NextRequest, NextResponse } from "next/server";
import { defaultVisionControl } from "@/lib/screen/visionControl";
import { defaultPrivacySecurityEngine } from "@/lib/screen/privacySecurityEngine";
import { defaultScreenContextEngine } from "@/lib/screen/screenContextEngine";
import { defaultVisualContextDeliveryEngine } from "@/lib/screen/contextDeliveryEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";
import type { VisionControlCommand } from "@/lib/screen/types";

export const dynamic = "force-dynamic";

/**
 * Extracts and validates founder/user session token from request.
 */
function extractSession(req: NextRequest) {
  const token =
    req.headers.get("x-ultron-session-token") ||
    req.cookies.get("ultron_session")?.value ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return { token: token || "", validation: validateSessionToken(token) };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { validation } = extractSession(req);
  if (!validation.isValid || !validation.session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Valid session required to inspect vision status." },
      { status: 401 }
    );
  }

  try {
    const status = defaultVisionControl.getStatus();
    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to retrieve status" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { validation } = extractSession(req);
  if (!validation.isValid || !validation.session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Valid session required to control screen awareness." },
      { status: 401 }
    );
  }

  try {
    let body: VisionControlCommand;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON request payload" }, { status: 400 });
    }

    if (!body || !body.action) {
      return NextResponse.json({ success: false, error: "Missing required 'action' command field" }, { status: 400 });
    }

    // Handle Start: activate privacy consent bound to authenticated session + create session
    if (body.action === "START") {
      const durationMs = Math.min(15 * 60 * 1000, body.durationMs || 5 * 60 * 1000);
      defaultPrivacySecurityEngine.grantConsent(durationMs);
      defaultVisionControl.startSession(body.displayId, durationMs);
    } else if (body.action === "STOP") {
      defaultPrivacySecurityEngine.revokeConsent(body.reason || "User requested stop");
      defaultVisionControl.stopSession(body.reason);
    } else if (body.action === "EMERGENCY_KILL") {
      defaultPrivacySecurityEngine.revokeConsent("EMERGENCY KILL TRIGGERED");
      defaultVisionControl.emergencyKill();
      defaultScreenContextEngine.clearContext();
      defaultVisualContextDeliveryEngine.clearContext();
    } else if (body.action === "PAUSE") {
      defaultVisionControl.pauseSession();
    } else if (body.action === "RESUME") {
      defaultVisionControl.resumeSession();
    }

    const updatedStatus = defaultVisionControl.getStatus();
    return NextResponse.json({
      success: true,
      actionExecuted: body.action,
      status: updatedStatus,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Control action failed" },
      { status: 500 }
    );
  }
}
