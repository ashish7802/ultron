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
import { defaultScreenCaptureEngine } from "@/lib/screen/screenCaptureEngine";
import { defaultVisualProcessingEngine } from "@/lib/screen/visualProcessingEngine";
import { defaultWindowDetectionEngine } from "@/lib/screen/windowDetectionEngine";
import { defaultVisualUnderstandingEngine } from "@/lib/screen/visualUnderstandingEngine";
import { defaultOCREngine } from "@/lib/screen/ocrEngine";
import { defaultScreenContextEngine } from "@/lib/screen/screenContextEngine";
import { defaultVisualContextDeliveryEngine } from "@/lib/screen/contextDeliveryEngine";
import { defaultPrivacySecurityEngine } from "@/lib/screen/privacySecurityEngine";
import { defaultScreenSessionManager } from "@/lib/screen/sessionManager";
import { defaultVisionControl } from "@/lib/screen/visionControl";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
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

    // 2. Capture & Process Frame
    const frame = await defaultScreenCaptureEngine.captureFrame({ mode: "full_screen" }, session?.sessionId);
    const processed = defaultVisualProcessingEngine.processFrame(frame);

    // 3. Visual Understanding & OCR
    const visual = defaultVisualUnderstandingEngine.analyzeScene(processed, windowInfo.activeWindow);
    const ocr = defaultOCREngine.extractText(processed, activeTitle);

    // 4. Synthesize High-Level Context
    const context = defaultScreenContextEngine.synthesizeContext(windowInfo, visual, ocr);

    // 5. Deliver Formatted Context Payload
    const targetSessionId = (body?.sessionId as string) || session?.sessionId || "sess_ephemeral";
    const payload = defaultVisualContextDeliveryEngine.buildContextPayload(
      targetSessionId,
      context,
      visual,
      ocr,
      frame.pixelHash,
      {
        frameId: frame.frameId,
        sequenceNumber: frame.sequenceNumber,
        frameTimestamp: frame.timestamp,
        browserUrl: windowInfo.activeWindow?.browserUrl,
        isSyntheticTestFrame: frame.isSyntheticTestFrame,
      }
    );

    defaultVisionControl.recordFrameAcquired(windowInfo.activeWindow?.title);

    return NextResponse.json({
      success: true,
      payload,
      context,
      visual,
      ocr: {
        detectedErrors: ocr.detectedErrors,
        tokenCount: ocr.tokenCount,
        codeBlocksCount: ocr.codeBlocks.length,
        ocrLatencyMs: ocr.ocrLatencyMs,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Context synthesis failed" },
      { status: 500 }
    );
  }
}
