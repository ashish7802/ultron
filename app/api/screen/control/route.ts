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
 *
 * Safety & Security Guarantees:
 * - Fail-closed: EMERGENCY_KILL immediately terminates active sessions and purges memory buffers.
 * - Single-user desktop design on local loopback.
 */

import { NextRequest, NextResponse } from "next/server";
import { defaultVisionControl } from "@/lib/screen/visionControl";
import { defaultPrivacySecurityEngine } from "@/lib/screen/privacySecurityEngine";
import { defaultScreenSessionManager } from "@/lib/screen/sessionManager";
import type { VisionControlCommand } from "@/lib/screen/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
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

    // Handle Start: activate privacy consent + create session
    if (body.action === "START") {
      const durationMs = body.durationMs || 5 * 60 * 1000;
      defaultPrivacySecurityEngine.grantConsent(durationMs);
      defaultScreenSessionManager.createSession(body.displayId, durationMs);
      defaultVisionControl.startSession(body.displayId);
    } else if (body.action === "STOP") {
      defaultPrivacySecurityEngine.revokeConsent(body.reason || "User requested stop");
      if (defaultVisionControl.getStatus().activeSessionId) {
        defaultScreenSessionManager.terminateSession(defaultVisionControl.getStatus().activeSessionId!, body.reason);
      }
      defaultVisionControl.stopSession(body.reason);
    } else if (body.action === "EMERGENCY_KILL") {
      defaultPrivacySecurityEngine.revokeConsent("EMERGENCY KILL TRIGGERED");
      defaultVisionControl.emergencyKill();
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
