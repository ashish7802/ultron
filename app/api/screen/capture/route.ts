/**
 * @file app/api/screen/capture/route.ts
 * @description API Endpoint for Screen Awareness Module 02: Multi-Mode Desktop Capture.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Capture Endpoint.
 *
 * Responsibilities:
 * - GET: Enumerates connected display monitors, resolutions, and active foreground window.
 * - POST: Triggers a single frame capture in requested mode (full_screen, active_window, selected_region).
 * - Enforces fail-closed privacy gating: Rejects with 403 if screen awareness is disabled.
 *
 * Safety & Security Guarantees:
 * - Raw pixel buffers are kept in ephemeral memory and never written to permanent disk storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { defaultScreenCaptureEngine } from "@/lib/screen/screenCaptureEngine";
import { defaultVisualProcessingEngine } from "@/lib/screen/visualProcessingEngine";
import { defaultWindowDetectionEngine } from "@/lib/screen/windowDetectionEngine";
import { defaultPrivacySecurityEngine } from "@/lib/screen/privacySecurityEngine";
import { defaultVisionControl } from "@/lib/screen/visionControl";
import { defaultScreenSessionManager } from "@/lib/screen/sessionManager";
import { validateSessionToken } from "@/lib/security/identityEngine";
import type { CaptureOptions } from "@/lib/screen/types";

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
      { success: false, error: "Unauthorized: Valid session required to inspect displays." },
      { status: 401 }
    );
  }

  try {
    const monitors = await defaultScreenCaptureEngine.getConnectedMonitors();
    const windowInfo = await defaultWindowDetectionEngine.detectActiveWindows();

    return NextResponse.json({
      success: true,
      monitors,
      activeWindow: windowInfo.activeWindow,
      openWindowsCount: windowInfo.openWindows.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to inspect displays" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { validation } = extractSession(req);
  if (!validation.isValid || !validation.session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Valid session required to trigger screen capture." },
      { status: 401 }
    );
  }

  try {
    let options: CaptureOptions = { mode: "full_screen" };
    try {
      const body = await req.json();
      if (body) options = { ...options, ...body };
    } catch {
      // Optional JSON body
    }

    // 1. Detect active window for sensitive application exclusion
    const windowInfo = await defaultWindowDetectionEngine.detectActiveWindows();
    const activeTitle = windowInfo.activeWindow?.title;
    const processName = windowInfo.activeWindow?.processName;
    const session = defaultScreenSessionManager.getActiveSession();

    // 2. Fail-Closed Privacy Evaluation
    const privacy = defaultPrivacySecurityEngine.evaluateCapturePermission(
      activeTitle,
      processName,
      session?.sessionId
    );

    if (!privacy.isPermissible) {
      return NextResponse.json(
        {
          success: false,
          error: privacy.denialReason || "Capture not permitted under active privacy policy",
          policyState: privacy.policyState,
        },
        { status: 403 }
      );
    }

    // 3. Execute Frame Capture
    const frame = await defaultScreenCaptureEngine.captureFrame(options, session?.sessionId);

    // 4. Record frame with Vision Control and Session Manager
    defaultVisionControl.recordFrameAcquired(activeTitle);
    if (session) {
      defaultScreenSessionManager.recordFrame(session.sessionId);
    }

    // 5. Run Visual Processing (diffing and region segmentation)
    const processed = defaultVisualProcessingEngine.processFrame(frame);

    return NextResponse.json({
      success: true,
      frameId: frame.frameId,
      timestamp: frame.timestamp,
      mode: frame.mode,
      dimensions: frame.dimensions,
      changeDetected: frame.changeDetected,
      changePercentage: frame.changePercentage,
      pixelHash: frame.pixelHash,
      captureLatencyMs: frame.captureLatencyMs,
      processingLatencyMs: processed.processingLatencyMs,
      segmentedRegionsCount: processed.segmentedRegions.length,
      activeWindow: windowInfo.activeWindow,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Capture failed" },
      { status: 500 }
    );
  }
}
