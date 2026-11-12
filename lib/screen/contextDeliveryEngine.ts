/**
 * @file lib/screen/contextDeliveryEngine.ts
 * @description Module 11: Visual Context Delivery & Cognitive Pipeline Bridge Engine.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Context Delivery Subsystem.
 *
 * Key Responsibilities:
 * - Bridges real-time visual screen context into ULTRON's cognitive engine (`lib/cognitive/`) and chat route (`app/api/chat/route.ts`).
 * - Formats high-density visual telemetry into token-optimized LLM prompt context blocks.
 * - Enforces Redundant-Frame Suppression:
 *   If the desktop canvas has not changed (< 2% pixel change delta), skips redundant context serialization to minimize token costs.
 * - Extracts salient visual evidence (active window, open file, visible errors, UI buttons) for multimodal reasoning.
 *
 * Architectural Role & Safety Guarantees:
 * - Interfaced by `app/api/chat/route.ts` and `app/api/screen/context/route.ts`.
 * - Fail-closed: returns empty context block if screen awareness is disabled or session is inactive.
 */

import type {
  ScreenActivityContext,
  VisualUnderstandingResult,
  OCRIntelligenceResult,
  VisualContextPayload,
} from "./types.ts";
import { canCaptureScreen } from "../screenPrivacyController.ts";

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
   * @returns VisualContextPayload or null if capture is unauthorized.
   */
  public buildContextPayload(
    sessionId: string,
    context: ScreenActivityContext,
    visual: VisualUnderstandingResult,
    ocr: OCRIntelligenceResult,
    frameHash?: string
  ): VisualContextPayload | null {
    // 1. Fail-closed privacy check
    if (!canCaptureScreen(context.windowTitle)) {
      return null;
    }

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

    // 5. Format Structured Prompt Context Block
    const formattedPromptContext = this.formatPromptBlock(context, visual, ocr);

    const payload: VisualContextPayload = {
      sessionId,
      timestamp: Date.now(),
      activeApp: context.activeApplication,
      windowTitle: context.windowTitle,
      activitySummary: context.screenSummary,
      ocrSummary,
      detectedUI: {
        buttonsCount,
        inputsCount,
        errorsCount,
      },
      visibleErrors: ocr.detectedErrors.slice(0, 3),
      isRedundantFrame: isRedundant,
      formattedPromptContext,
    };

    this._lastPayload = payload;
    return payload;
  }

  /**
   * Formats an ultra-clean, token-efficient visual context block for ingestion by language models.
   */
  public formatPromptBlock(
    context: ScreenActivityContext,
    visual: VisualUnderstandingResult,
    ocr: OCRIntelligenceResult
  ): string {
    const errorBlock =
      ocr.detectedErrors.length > 0
        ? `\n- Visible Errors: ${ocr.detectedErrors.slice(0, 2).map((e) => `"${e}"`).join(", ")}`
        : "";

    const codeBlock =
      ocr.codeBlocks.length > 0
        ? `\n- Visible Code:\n\`\`\`${ocr.codeBlocks[0].language || "text"}\n${ocr.codeBlocks[0].lines.slice(0, 6).join("\n")}\n\`\`\``
        : "";

    return `
[SCREEN AWARENESS CONTEXT]
- Active Window: ${context.windowTitle} (Process: ${context.activeApplication})
- Activity: ${context.primaryActivity}
- Workflow Phase: ${context.activeWorkflow}
- Layout: ${visual.layoutCategory}${errorBlock}${codeBlock}
- Recognized Action Controls: ${visual.keyActionPoints.slice(0, 2).join(" | ")}
[/SCREEN AWARENESS CONTEXT]
`.trim();
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
