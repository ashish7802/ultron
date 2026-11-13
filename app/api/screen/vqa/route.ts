/**
 * @file app/api/screen/vqa/route.ts
 * @description API Endpoint for Screen Awareness Module 08: Grounded Visual Question Answering (VQA).
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - VQA Endpoint.
 *
 * Responsibilities:
 * - POST: Accepts a user visual question (or standard blueprint preset) and returns an evidence-grounded answer.
 * - Extracts spatial bounding boxes, OCR text lines, and active window metadata as grounding proof.
 * - Enforces fail-closed privacy: Rejects with 403 if screen capture is unauthorized.
 */

import { NextRequest, NextResponse } from "next/server";
import { defaultScreenCaptureEngine } from "@/lib/screen/screenCaptureEngine";
import { defaultVisualProcessingEngine } from "@/lib/screen/visualProcessingEngine";
import { defaultWindowDetectionEngine } from "@/lib/screen/windowDetectionEngine";
import { defaultVisualUnderstandingEngine } from "@/lib/screen/visualUnderstandingEngine";
import { defaultOCREngine } from "@/lib/screen/ocrEngine";
import { defaultScreenContextEngine } from "@/lib/screen/screenContextEngine";
import { defaultVisualQAEngine } from "@/lib/screen/visualQAEngine";
import { defaultPrivacySecurityEngine } from "@/lib/screen/privacySecurityEngine";
import { defaultScreenSessionManager } from "@/lib/screen/sessionManager";
import { validateSessionToken } from "@/lib/security/identityEngine";
import type { VQAQueryRequest } from "@/lib/screen/types";

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { validation } = extractSession(req);
  if (!validation.isValid || !validation.session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Valid session required to execute VQA queries." },
      { status: 401 }
    );
  }

  try {
    let body: VQAQueryRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON request payload" }, { status: 400 });
    }

    if (!body || (!body.query && !body.presetQuestion)) {
      return NextResponse.json(
        { success: false, error: "Missing required 'query' or 'presetQuestion' parameter" },
        { status: 400 }
      );
    }

    // 1. Evaluate Privacy
    const session = defaultScreenSessionManager.getActiveSession();
    const windowInfo = await defaultWindowDetectionEngine.detectActiveWindows();
    const activeTitle = windowInfo.activeWindow?.title;

    const privacy = defaultPrivacySecurityEngine.evaluateCapturePermission(
      activeTitle,
      windowInfo.activeWindow?.processName,
      session?.sessionId
    );

    if (!privacy.isPermissible) {
      return NextResponse.json(
        {
          success: false,
          error: privacy.denialReason || "Screen capture is disabled. Cannot answer visual questions without explicit authorization.",
          policyState: privacy.policyState,
        },
        { status: 403 }
      );
    }

    // 2. Multimodal Extraction
    const frame = await defaultScreenCaptureEngine.captureFrame({ mode: "full_screen" }, session?.sessionId);
    const processed = defaultVisualProcessingEngine.processFrame(frame);
    const visual = defaultVisualUnderstandingEngine.analyzeScene(processed, windowInfo.activeWindow);
    const ocr = defaultOCREngine.extractText(processed, activeTitle);
    const context = defaultScreenContextEngine.synthesizeContext(windowInfo, visual, ocr);

    // 3. Grounded Visual Question Answering
    const response = defaultVisualQAEngine.answerQuestion(body, windowInfo, visual, ocr, context);

    return NextResponse.json({
      success: true,
      response,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "VQA processing failed" },
      { status: 500 }
    );
  }
}
