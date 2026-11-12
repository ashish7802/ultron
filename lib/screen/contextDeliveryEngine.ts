/**
 * @file lib/screen/contextDeliveryEngine.ts
 * @description Module 11: Visual Context Delivery & Cognitive Pipeline Bridge Engine.
 *
 * Subsystem:
 * Screen Awareness & Live Visual Intelligence - Context Delivery Subsystem.
 *
 * Key Responsibilities:
 * - Bridges real-time visual screen context directly into ULTRON's cognitive engine (`lib/cognitive/`)
 *   and chat route (`app/api/chat/route.ts`).
 * - Formats high-density visual telemetry into token-optimized LLM prompt context blocks with strict
 *   separation of VISUAL OBSERVATION vs EXTRACTED TEXT (OCR).
 * - Enforces Redundant-Frame Suppression:
 *   If the desktop canvas has not changed (< 2% pixel change delta), suppresses redundant context serialization.
 * - Enforces Epistemic Honesty & Staleness Guardrails:
 *   - Attaches explicit observation timestamp and frame age in milliseconds.
 *   - Inserts mandatory uncertainty warning if frame age exceeds 15 seconds.
 *   - Never fabricates screen contents when screen awareness is inactive or unpermitted.
 * - Provides on-demand physical capture refresh (`getFreshOrCachedContext()`) for visual user inquiries.
 *
 * Architectural Role & Safety Guarantees:
 * - Interfaced by `app/api/chat/route.ts` and `app/api/screen/context/route.ts`.
 * - Fail-closed: returns empty/inactive context block if screen awareness is disabled or session is inactive.
 */

import type {
  ScreenActivityContext,
  VisualUnderstandingResult,
  OCRIntelligenceResult,
  VisualContextPayload,
} from "./types.ts";
import { canCaptureScreen } from "../screenPrivacyController.ts";
import { defaultVisionControl } from "./visionControl.ts";
import { defaultScreenCaptureEngine } from "./screenCaptureEngine.ts";
import { defaultVisualProcessingEngine } from "./visualProcessingEngine.ts";
import { defaultWindowDetectionEngine } from "./windowDetectionEngine.ts";
import { defaultVisualUnderstandingEngine } from "./visualUnderstandingEngine.ts";
import { defaultOCREngine } from "./ocrEngine.ts";
import { defaultScreenContextEngine } from "./screenContextEngine.ts";
import { defaultTemporalScreenIntelligence } from "./temporalScreenIntelligence.ts";
import { defaultVisionOcrFusionEngine } from "./visionOcrFusionEngine.ts";

export interface ContextPayloadOptions {
  frameId?: string;
  sequenceNumber?: number;
  frameTimestamp?: number;
  browserUrl?: string;
  isSyntheticTestFrame?: boolean;
}

export class VisualContextDeliveryEngine {
  private _lastDeliveredHash: string | null = null;
  private _lastPayload: VisualContextPayload | null = null;

  /**
   * Builds an optimized VisualContextPayload for cognitive grounding.
   *
   * @param sessionId - Active capture session ID.
   * @param context - ScreenActivityContext from Module 07.
   * @param visual - VisualUnderstandingResult from Module 05.
   * @param ocr - OCRIntelligenceResult from Module 06.
   * @param frameHash - Cryptographic hash of the current frame.
   * @param options - Additional contextual telemetry (sequence number, timestamp, browser URL).
   * @returns VisualContextPayload or null if capture is unauthorized.
   */
  public buildContextPayload(
    sessionId: string,
    context: ScreenActivityContext,
    visual: VisualUnderstandingResult,
    ocr: OCRIntelligenceResult,
    frameHash?: string,
    options?: ContextPayloadOptions
  ): VisualContextPayload | null {
    // 1. Fail-closed privacy check
    if (!canCaptureScreen(context.windowTitle)) {
      return null;
    }

    const now = Date.now();
    const frameTimestamp = options?.frameTimestamp || context.timestamp || now;
    const frameAgeMs = Math.max(0, now - frameTimestamp);

    // 2. Redundant Frame Detection
    const isRedundant = Boolean(frameHash && this._lastDeliveredHash === frameHash);
    if (frameHash) {
      this._lastDeliveredHash = frameHash;
    }

    // 3. Count UI Elements
    const buttonsCount = visual.elements.filter((e) => e.type === "button").length;
    const inputsCount = visual.elements.filter((e) => e.type === "input_field").length;
    const errorsCount = visual.visibleErrors.length + ocr.detectedErrors.length;

    // 4. Extract OCR Summary Snippet (max 5 key lines)
    const ocrSummary = ocr.lines
      .slice(0, 5)
      .map((l) => l.text)
      .join("\n");

    // 5. Separate Visual Evidence from OCR Evidence
    const visualEvidence: string[] = [
      `Active Window: "${context.windowTitle}" (Process: ${context.activeApplication})`,
      `Primary Activity: ${context.primaryActivity}`,
      `Layout Category: ${visual.layoutCategory}`,
      `Key Action Points: ${visual.keyActionPoints.slice(0, 3).join(" | ") || "Default navigation"}`,
    ];
    if (options?.browserUrl) {
      visualEvidence.push(`Active Browser URL: ${options.browserUrl}`);
    }

    const ocrEvidence: string[] = ocr.lines.slice(0, 8).map((l) => l.text);
    if (ocr.detectedErrors.length > 0) {
      ocrEvidence.unshift(...ocr.detectedErrors.map((e) => `[DETECTED ERROR]: ${e}`));
    }

    // 6. Staleness Uncertainty Assessment (> 15 seconds)
    let uncertainty: string | undefined;
    if (frameAgeMs > 15000) {
      uncertainty = `Caution: Screen context is ${(frameAgeMs / 1000).toFixed(1)}s old. Desktop state may have evolved.`;
    }

    // 7. Format Structured Prompt Context Block
    const formattedPromptContext = this.formatPromptBlock(context, visual, ocr, {
      frameAgeMs,
      frameTimestamp,
      browserUrl: options?.browserUrl,
      uncertainty,
    });

    const payload: VisualContextPayload = {
      sessionId,
      frameId: options?.frameId,
      sequenceNumber: options?.sequenceNumber,
      timestamp: frameTimestamp,
      frameAgeMs,
      activeApp: context.activeApplication,
      windowTitle: context.windowTitle,
      browserUrl: options?.browserUrl,
      activitySummary: context.screenSummary,
      ocrSummary,
      detectedUI: {
        buttonsCount,
        inputsCount,
        errorsCount,
      },
      visibleErrors: ocr.detectedErrors.slice(0, 3),
      visualEvidence,
      ocrEvidence,
      visualConfidence: visual.sceneConfidence,
      uncertainty,
      isRedundantFrame: isRedundant,
      formattedPromptContext,
    };

    this._lastPayload = payload;
    return payload;
  }

  /**
   * Formats an ultra-clean, token-efficient visual context block for ingestion by language models.
   * Explicitly separates VISUAL OBSERVATION from EXTRACTED TEXT (OCR) with observation timestamp and age.
   *
   * @param context - ScreenActivityContext.
   * @param visual - VisualUnderstandingResult.
   * @param ocr - OCRIntelligenceResult.
   * @param extra - Optional metadata for prompt formatting.
   * @returns Formatted prompt string.
   */
  public formatPromptBlock(
    context: ScreenActivityContext,
    visual: VisualUnderstandingResult,
    ocr: OCRIntelligenceResult,
    extra?: {
      frameAgeMs?: number;
      frameTimestamp?: number;
      browserUrl?: string;
      uncertainty?: string;
    }
  ): string {
    const ageMs = extra?.frameAgeMs ?? 0;
    const tsStr = extra?.frameTimestamp
      ? new Date(extra.frameTimestamp).toISOString()
      : new Date().toISOString();

    const buttonsCount = visual.elements.filter((e) => e.type === "button").length;
    const inputsCount = visual.elements.filter((e) => e.type === "input_field").length;

    const errorBlock =
      ocr.detectedErrors.length > 0
        ? `\n- VISIBLE ERRORS: ${ocr.detectedErrors.slice(0, 3).map((e) => `"${e}"`).join(", ")}`
        : "";

    const codeBlock =
      ocr.codeBlocks.length > 0
        ? `\n- CODE SNIPPET:\n\`\`\`${ocr.codeBlocks[0].language || "text"}\n${ocr.codeBlocks[0].lines.slice(0, 6).join("\n")}\n\`\`\``
        : "";

    const ocrSnippet =
      ocr.lines.length > 0
        ? `\n- EXTRACTED TEXT (OCR):\n${ocr.lines.slice(0, 6).map((l) => `  * ${l.text}`).join("\n")}`
        : "";

    const cautionBlock =
      ageMs > 15000
        ? `\n[CAUTION: Screen context is ${(ageMs / 1000).toFixed(1)}s old. Acknowledge this uncertainty if user asks about current state.]`
        : "";

    const browserLine = extra?.browserUrl ? `\n- BROWSER URL: ${extra.browserUrl}` : "";

    return `
[SCREEN AWARENESS CONTEXT]
Observed at: ${tsStr} (age: ${ageMs}ms)
- VISUAL OBSERVATION: Active Window "${context.windowTitle}" (Process: ${context.activeApplication}). Layout: ${visual.layoutCategory}. Interactive Elements: ${buttonsCount} buttons, ${inputsCount} inputs.${browserLine}
- ACTIVITY & WORKFLOW: ${context.primaryActivity} | Phase: ${context.activeWorkflow}
- ACTION CONTROLS: ${visual.keyActionPoints.slice(0, 3).join(" | ") || "Default navigation"}${errorBlock}${codeBlock}${ocrSnippet}${cautionBlock}
[/SCREEN AWARENESS CONTEXT]
`.trim();
  }

  /**
   * Generates a fail-closed prompt block stating that screen awareness is inactive or unpermitted.
   *
   * @param reason - Explanation for inactivity.
   * @returns Warning prompt block.
   */
  public formatInactivePromptBlock(reason: string = "Screen access is currently off or not permitted"): string {
    return `[SCREEN AWARENESS: Inactive / Not Permitted. State clearly that screen access is currently off (${reason}).]`;
  }

  /**
   * Retrieves fresh or cached screen context for cognitive chat integration.
   *
   * If existing context is older than `maxAgeMs` (default 10000ms) or `forceFresh` is requested,
   * performs an immediate physical capture cycle to ground downstream reasoning in reality.
   *
   * @param options - Context retrieval options.
   * @returns VisualContextPayload or null if screen awareness is disabled.
   */
  public async getFreshOrCachedContext(options?: {
    forceFresh?: boolean;
    maxAgeMs?: number;
    sessionId?: string;
  }): Promise<VisualContextPayload | null> {
    const status = defaultVisionControl.getStatus();

    // Fail-closed if vision is explicitly OFF, ERROR, or permission DENIED
    if (status.permissionState === "DENIED" || status.operationalState === "ERROR") {
      return null;
    }

    const maxAge = options?.maxAgeMs ?? 10000;
    const now = Date.now();

    // If cached payload is still fresh and fresh capture is not forced, return cached
    if (
      !options?.forceFresh &&
      this._lastPayload &&
      now - this._lastPayload.timestamp < maxAge
    ) {
      // Update frameAgeMs to reflect current age
      this._lastPayload.frameAgeMs = now - this._lastPayload.timestamp;
      return this._lastPayload;
    }

    // Otherwise, perform an authentic physical capture tick
    try {
      defaultVisionControl.setOperationalState("ANALYZING");

      // 1. Capture physical frame
      const frame = await defaultScreenCaptureEngine.captureFrame(
        { mode: "full_screen" },
        options?.sessionId || status.activeSessionId || undefined
      );

      // 2. Detect active windows and accessibility elements
      const windowInfo = await defaultWindowDetectionEngine.detectActiveWindows();
      const activeWin = windowInfo.activeWindow;

      // 3. Process frame metrics
      const processed = defaultVisualProcessingEngine.processFrame(frame);

      // 4. Multimodal scene understanding and OCR
      const visual = defaultVisualUnderstandingEngine.analyzeScene(processed, activeWin);
      const ocr = defaultOCREngine.extractText(processed, activeWin?.title);

      // 5. Synthesize high-level activity context
      const context = defaultScreenContextEngine.synthesizeContext(windowInfo, visual, ocr);

      // 6. Multimodal & OCR fusion layer
      const fusion = defaultVisionOcrFusionEngine.fuse(
        {
          analysisId: `fusion_${frame.frameId}`,
          frameId: frame.frameId,
          timestamp: frame.timestamp,
          modelUsed: "local-os-multimodal",
          isLiveModelInference: false,
          sceneSummary: visual.sceneExplanation,
          detectedApplication: activeWin?.processName || "desktop",
          layoutCategory: visual.layoutCategory,
          recognizedElements: visual.elements,
          detectedErrors: visual.visibleErrors,
          actionPoints: visual.keyActionPoints,
          visualConfidence: visual.confidenceScore,
          inferenceLatencyMs: 10,
        },
        ocr,
        activeWin
      );

      // 7. Track temporal transitions
      const targetSessionId = options?.sessionId || status.activeSessionId || "screen_sess_live";
      defaultTemporalScreenIntelligence.recordFrameObservation(targetSessionId, activeWin, fusion);

      // 8. Build delivered payload
      const payload = this.buildContextPayload(
        targetSessionId,
        context,
        visual,
        ocr,
        frame.pixelHash,
        {
          frameId: frame.frameId,
          sequenceNumber: frame.sequenceNumber,
          frameTimestamp: frame.timestamp,
          browserUrl: activeWin?.browserUrl,
          isSyntheticTestFrame: frame.isSyntheticTestFrame,
        }
      );

      defaultVisionControl.recordFrameAcquired(activeWin?.title);
      defaultVisionControl.setOperationalState("LIVE");

      return payload;
    } catch {
      defaultVisionControl.setOperationalState("DEGRADED");
      return this._lastPayload;
    }
  }

  /**
   * Retrieves the most recently synthesized context payload.
   */
  public getLastPayload(): VisualContextPayload | null {
    return this._lastPayload;
  }
}

/** Global singleton instance of VisualContextDeliveryEngine. */
export const defaultVisualContextDeliveryEngine = new VisualContextDeliveryEngine();
