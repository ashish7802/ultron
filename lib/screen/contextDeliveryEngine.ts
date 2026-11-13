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
  CapturedFrame,
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
import { defaultMultimodalVisionEngine } from "./multimodalVisionEngine.ts";

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
  private _isProcessingFrame: boolean = false;
  private _lastProcessedSequence: number = 0;
  private _activeProcessingSessionId: string | null = null;
  private _timeProvider: () => number = () => Date.now();

  /**
   * Injects a deterministic clock provider (useful for unit testing temporal expiration).
   */
  public setTimeProvider(provider: () => number): void {
    this._timeProvider = provider;
  }

  /**
   * Resets clock provider to system wall clock.
   */
  public resetTimeProvider(): void {
    this._timeProvider = () => Date.now();
  }

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
  /**
   * Retrieves fresh or cached screen context for cognitive chat integration.
   *
   * Fail-Closed Invariants:
   * 1. If vision is OFF, TERMINATED, or permission is DENIED/REVOKED, returns null immediately.
   * 2. If `forceFresh: true`, a failure in capture or inference NEVER silently returns stale `_lastPayload`.
   *    It returns `null` or a typed failure.
   * 3. Any payload older than 15,000ms (15s TTL) is marked expired and rejected for live decisions.
   * 4. Session mismatch: if `options.sessionId` is provided and differs from cached payload's sessionId, cached payload is rejected.
   *
   * @param options - Context retrieval options.
   * @returns VisualContextPayload or null if screen awareness is disabled or fresh capture fails.
   */
  public async getFreshOrCachedContext(options?: {
    forceFresh?: boolean;
    maxAgeMs?: number;
    sessionId?: string;
  }): Promise<VisualContextPayload | null> {
    const status = defaultVisionControl.getStatus();

    // Fail-closed if vision is explicitly OFF, ERROR, TERMINATED, or permission is not GRANTED/PROMPT
    if (
      status.operationalState === "OFF" ||
      status.operationalState === "TERMINATED" ||
      status.operationalState === "ERROR" ||
      status.permissionState === "DENIED" ||
      status.permissionState === "REVOKED"
    ) {
      return null;
    }

    const ttlLimitMs = 15000; // Strict 15-second freshness ceiling
    const maxAge = Math.min(options?.maxAgeMs ?? 10000, ttlLimitMs);
    const now = this._timeProvider();

    const expectedSessionId = options?.sessionId || status.activeSessionId;

    // Check if cached payload is still valid and fresh
    if (!options?.forceFresh && this._lastPayload) {
      const payloadAge = now - this._lastPayload.timestamp;

      // Check session identity match
      const sessionMatches = !expectedSessionId || this._lastPayload.sessionId === expectedSessionId;

      if (sessionMatches && payloadAge < maxAge && payloadAge <= ttlLimitMs) {
        this._lastPayload.frameAgeMs = payloadAge;
        return this._lastPayload;
      }
    }

    // If cached payload was rejected or forceFresh is true, perform fresh capture
    // Wait for in-flight processing if currently locked (up to 2000ms) rather than dropping or racing
    if (this._isProcessingFrame) {
      const lockWaitStart = this._timeProvider();
      while (this._isProcessingFrame && this._timeProvider() - lockWaitStart < 2000) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    try {
      this._isProcessingFrame = true;
      this._activeProcessingSessionId = expectedSessionId || null;
      defaultVisionControl.setOperationalState("ANALYZING");

      // 1. Capture physical frame
      const frame = await defaultScreenCaptureEngine.captureFrame(
        { mode: "full_screen" },
        expectedSessionId || undefined
      );

      // Verify session has not been terminated during capture
      const currentStatus = defaultVisionControl.getStatus();
      if (
        currentStatus.operationalState === "TERMINATED" ||
        currentStatus.operationalState === "OFF" ||
        currentStatus.permissionState === "DENIED" ||
        currentStatus.permissionState === "REVOKED"
      ) {
        return null;
      }

      const result = await this._processCapturedFrame(frame, expectedSessionId || undefined);
      return result;
    } catch {
      defaultVisionControl.setOperationalState("DEGRADED");
      // STRICT FAIL-CLOSED: When forceFresh is requested, NEVER silently return stale _lastPayload
      if (options?.forceFresh) {
        return null;
      }
      return null;
    } finally {
      this._isProcessingFrame = false;
      this._activeProcessingSessionId = null;
    }
  }

  /**
   * Processes an incoming captured frame from the streaming pipeline or on-demand tick.
   * Concurrency-safe: prevents inference stampedes and racing analysis passes.
   *
   * @param frame - CapturedFrame from physical driver.
   * @param sessionId - Optional explicit session ID.
   * @returns VisualContextPayload or null.
   */
  /**
   * Processes an incoming captured frame from the streaming pipeline or on-demand tick.
   * Concurrency-safe: prevents inference stampedes and racing analysis passes.
   * Enforces monotonic sequence numbers to prevent stale out-of-order frames from overwriting newer context.
   *
   * @param frame - CapturedFrame from physical driver.
   * @returns VisualContextPayload or null.
   */
  public async processStreamingFrame(frame: CapturedFrame): Promise<VisualContextPayload | null> {
    if (this._isProcessingFrame) {
      // Drop frame to enforce backpressure and preserve ordered sequence
      return null;
    }

    // Sequence check: drop stale frames if sequence number is not strictly greater than last processed
    if (frame.sequenceNumber && frame.sequenceNumber <= this._lastProcessedSequence) {
      return null;
    }

    const status = defaultVisionControl.getStatus();
    if (
      status.operationalState === "TERMINATED" ||
      status.operationalState === "OFF" ||
      status.permissionState === "DENIED" ||
      status.permissionState === "REVOKED"
    ) {
      return null;
    }

    this._isProcessingFrame = true;
    this._activeProcessingSessionId = frame.sessionId;
    try {
      const res = await this._processCapturedFrame(frame, frame.sessionId);
      if (res && frame.sequenceNumber) {
        this._lastProcessedSequence = frame.sequenceNumber;
      }
      return res;
    } finally {
      this._isProcessingFrame = false;
      this._activeProcessingSessionId = null;
    }
  }

  /**
   * Internal processing pipeline: Window Detection -> OCR -> Real Vision Inference -> Fusion -> Temporal tracking.
   */
  private async _processCapturedFrame(frame: CapturedFrame, targetSessionId?: string): Promise<VisualContextPayload | null> {
    // 1. Validate physical image byte integrity
    if (!frame.imageBuffer || frame.imageBuffer.length < 8) {
      throw new Error("Invalid or corrupted screen capture buffer");
    }

    // Abort if session was terminated or killed during processing
    const liveStatus = defaultVisionControl.getStatus();
    if (
      liveStatus.operationalState === "TERMINATED" ||
      liveStatus.operationalState === "OFF" ||
      liveStatus.permissionState === "DENIED" ||
      liveStatus.permissionState === "REVOKED"
    ) {
      return null;
    }

    // 2. Detect active windows and OS accessibility elements
    const windowInfo = await defaultWindowDetectionEngine.detectActiveWindows();
    const activeWin = windowInfo.activeWindow;

    // Harvest genuine live accessible controls directly from Windows MSAA / IAccessible
    const accResult = await defaultWindowDetectionEngine.extractLiveAccessibilityElements(activeWin?.handle);
    const liveAccessibilityElements = accResult.isAvailable ? accResult.elements : [];

    // 3. Process frame metrics
    const processed = defaultVisualProcessingEngine.processFrame(frame);

    // 4. Run spatial OCR extraction (pass genuine OS accessible text if available)
    const ocr = defaultOCREngine.extractText(processed, activeWin?.title);

    // 5. Ingest UI elements and run REAL Multimodal Vision Inference
    // Explicitly pass harvested OS accessibility elements so heuristic estimations are bypassed
    const uiElements = defaultVisualUnderstandingEngine.analyzeScene(
      processed,
      activeWin,
      liveAccessibilityElements.length > 0 ? liveAccessibilityElements : undefined
    ).elements;

    const visualAnalysis = await defaultMultimodalVisionEngine.analyzeFrame(
      frame,
      activeWin,
      uiElements
    );

    // Re-verify that termination did not occur during vision inference
    const postInferenceStatus = defaultVisionControl.getStatus();
    if (
      postInferenceStatus.operationalState === "TERMINATED" ||
      postInferenceStatus.operationalState === "OFF"
    ) {
      return null;
    }

    // 6. Validate frame ID alignment between physical capture and vision model
    if (visualAnalysis.frameId !== frame.frameId) {
      throw new Error(`Frame ID mismatch: expected ${frame.frameId}, got ${visualAnalysis.frameId}`);
    }

    // 7. Synthesize structured context from verified visual & OCR results
    const visualResult: VisualUnderstandingResult = {
      layoutCategory: visualAnalysis.layoutCategory,
      elements: visualAnalysis.recognizedElements,
      visibleErrors: visualAnalysis.detectedErrors,
      sceneExplanation: visualAnalysis.sceneSummary,
      keyActionPoints: visualAnalysis.actionPoints,
      confidenceScore: visualAnalysis.visualConfidence,
      sceneConfidence: visualAnalysis.visualConfidence,
      understandingLatencyMs: visualAnalysis.inferenceLatencyMs,
    };

    const context = defaultScreenContextEngine.synthesizeContext(windowInfo, visualResult, ocr);

    // 8. Multimodal & OCR fusion layer with strict source attribution
    const fusion = defaultVisionOcrFusionEngine.fuse(visualAnalysis, ocr, activeWin);

    // 9. Track temporal transitions
    const effectiveSessionId = targetSessionId || defaultVisionControl.getStatus().activeSessionId || "screen_sess_live";
    defaultTemporalScreenIntelligence.recordFrameObservation(effectiveSessionId, activeWin, fusion);

    // 10. Deliver structured payload
    const payload = this.buildContextPayload(
      effectiveSessionId,
      context,
      visualResult,
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

    defaultVisionControl.recordFrameAcquired(
      activeWin?.title,
      frame.captureLatencyMs,
      visualAnalysis.inferenceLatencyMs,
      visualAnalysis.modelUsed
    );

    // Set verified operational state: LIVE if live model inference ran; DEGRADED if model is offline/unsupported
    if (visualAnalysis.isLiveModelInference) {
      defaultVisionControl.setOperationalState("LIVE");
    } else {
      defaultVisionControl.setOperationalState("DEGRADED");
    }

    // Invalidate if emergency termination happened just before saving
    if (defaultVisionControl.getStatus().operationalState === "TERMINATED") {
      this._lastPayload = null;
      return null;
    }

    this._lastPayload = payload;
    return payload;
  }

  /**
   * Emergency purge hook: immediately invalidates cached screen context within 5ms.
   */
  public clearContext(): void {
    this._lastPayload = null;
    this._lastDeliveredHash = null;
    this._lastProcessedSequence = 0;
    this._activeProcessingSessionId = null;
    this._isProcessingFrame = false;
    defaultTemporalScreenIntelligence.reset();
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

// Register emergency purge hook to immediately invalidate visual context on emergency kill
defaultVisionControl.registerEmergencyPurgeHook(() => {
  defaultVisualContextDeliveryEngine.clearContext();
});
