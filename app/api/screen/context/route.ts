/**
 * @file app/api/screen/context/route.ts
 * @description API Endpoint for Screen Awareness Modules 07 & 11: Context Synthesis & Delivery.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Context Delivery Endpoint.
 *
 * Responsibilities:
 * - GET: Retrieves the latest synthesized screen context and formatted prompt context block.
 * - POST: Executes an on-demand full pipeline cycle (Capture -> Window Detect -> Visual Understand -> OCR -> Context Synthesis)
 *         and returns the token-optimized `VisualContextPayload`.
 *
 * Safety & Security Guarantees:
 * - Strict fail-closed privacy: Returns 403 or empty context if screen awareness is disabled.
 */

import { NextRequest, NextResponse } from "next/server";
import { defaultWindowDetectionEngine } from "@/lib/screen/windowDetectionEngine";
import { defaultVisualContextDeliveryEngine } from "@/lib/screen/contextDeliveryEngine";
import { defaultPrivacySecurityEngine } from "@/lib/screen/privacySecurityEngine";
import { defaultScreenSessionManager } from "@/lib/screen/sessionManager";
import { defaultVisionControl } from "@/lib/screen/visionControl";
import { validateSessionToken } from "@/lib/security/identityEngine";

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
      { success: false, error: "Unauthorized: Valid session required to read screen context." },
      { status: 401 }
    );
  }

  try {
    const lastPayload = defaultVisualContextDeliveryEngine.getLastPayload();
    if (!lastPayload) {
      return NextResponse.json({
        success: true,
        hasContext: false,
        message: "No active screen context available. Vision may be disabled.",
      });
    }

    return NextResponse.json({
      success: true,
      hasContext: true,
      payload: lastPayload,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to retrieve context" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { validation } = extractSession(req);
  if (!validation.isValid || !validation.session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Valid session required to synthesize screen context." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const session = defaultScreenSessionManager.getActiveSession();
    const windowInfo = await defaultWindowDetectionEngine.detectActiveWindows();
    const activeTitle = windowInfo.activeWindow?.title;

    // 1. Evaluate Privacy
    const privacy = defaultPrivacySecurityEngine.evaluateCapturePermission(
      activeTitle,
      windowInfo.activeWindow?.processName,
      session?.sessionId
    );

    if (!privacy.isPermissible) {
      return NextResponse.json(
        {
          success: false,
          error: privacy.denialReason || "Screen capture not permitted",
          policyState: privacy.policyState,
        },
        { status: 403 }
      );
    }

    // 2. Execute Real Multimodal Context Synthesis Pipeline
    const targetSessionId = (body?.sessionId as string) || session?.sessionId || "sess_ephemeral";
    const payload = await defaultVisualContextDeliveryEngine.getFreshOrCachedContext({
      forceFresh: true,
      sessionId: targetSessionId,
    });

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Screen context could not be captured or was unpermitted" },
        { status: 500 }
      );
    }

    const visionStatus = defaultVisionControl.getStatus();

    return NextResponse.json({
      success: true,
      payload,
      visionStatus,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Context synthesis failed" },
      { status: 500 }
    );
  }
}
