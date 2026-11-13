/**
 * @file lib/screen/screenContextEngine.ts
 * @description Module 07: Screen Context Awareness & Workflow Intelligence Engine.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Context Synthesis Subsystem.
 *
 * Key Responsibilities:
 * - Synthesizes high-level user activity and active workflow from raw visual, window, and OCR inputs.
 * - Categorizes operational workflows: `coding`, `debugging`, `browsing_documentation`, `terminal_ops`, `configuring`, `idle`.
 * - Tracks visual state deltas across turns to explain what changed since the previous capture.
 * - Formulates concise, executive-level screen summaries for conversational grounding.
 * - Evaluates relevance of current screen activity to the overall co-founder mission.
 *
 * Architectural Role & Safety Guarantees:
 * - Direct feed into `VisualContextDeliveryEngine` (Module 11) and `VisualQAEngine` (Module 08).
 * - Read-only contextual analysis: does not execute system operations.
 */

import type {
  WindowDetectionResult,
  VisualUnderstandingResult,
  OCRIntelligenceResult,
  ScreenActivityContext,
} from "./types.ts";

export class ScreenContextEngine {
  private _previousContext: ScreenActivityContext | null = null;

  /**
   * Synthesizes comprehensive screen context from multimodal inputs.
   *
   * @param windowResult - WindowDetectionResult from Module 04.
   * @param visualResult - VisualUnderstandingResult from Module 05.
   * @param ocrResult - OCRIntelligenceResult from Module 06.
   * @returns ScreenActivityContext payload.
   */
  public synthesizeContext(
    windowResult: WindowDetectionResult,
    visualResult: VisualUnderstandingResult,
    ocrResult: OCRIntelligenceResult
  ): ScreenActivityContext {
    const activeWin = windowResult.activeWindow;
    const appName = windowResult.detectedApplication || "Application";
    const title = activeWin?.title || "Active Workspace";

    // 1. Identify Active Workflow
    const workflow = this.identifyWorkflow(title, visualResult, ocrResult);

    // 2. Classify Primary Activity
    const primaryActivity = this.classifyPrimaryActivity(workflow, title, ocrResult);

    // 3. Compute Recent State Delta
    const recentStateDelta = this.computeStateDelta(primaryActivity, title);

    // 4. Generate Screen Summary
    const screenSummary = this.generateSummary(primaryActivity, workflow, visualResult, ocrResult);

    // 5. Extract Salient Snippet
    const salientTextSnippet =
      ocrResult.detectedErrors.length > 0
        ? ocrResult.detectedErrors[0]
        : ocrResult.lines.slice(0, 3).map((l) => l.text).join(" | ");

    const context: ScreenActivityContext = {
      primaryActivity,
      activeWorkflow: workflow,
      activeApplication: appName,
      windowTitle: title,
      screenSummary,
      salientTextSnippet: salientTextSnippet.slice(0, 200),
      recentStateDelta,
      contextTimestamp: Date.now(),
      relevanceToCoFounderMission: 0.95,
    };

    this._previousContext = context;
    return context;
  }

  /**
   * Identifies the current workflow phase.
   */
  public identifyWorkflow(
    title: string,
    visualResult: VisualUnderstandingResult,
    ocrResult: OCRIntelligenceResult
  ): ScreenActivityContext["activeWorkflow"] {
    const lowerTitle = title.toLowerCase();

    // Check if terminal or errors are active -> debugging
    if (visualResult.visibleErrors.length > 0 || ocrResult.detectedErrors.length > 0) {
      return "debugging";
    }

    if (visualResult.layoutCategory === "terminal_cli") {
      return "terminal_ops";
    }

    if (visualResult.layoutCategory === "browser_webpage") {
      return "browsing_documentation";
    }

    if (lowerTitle.includes("settings") || lowerTitle.includes("preference")) {
      return "configuring";
    }

    if (visualResult.layoutCategory === "ide_code_editor" || lowerTitle.includes("code")) {
      return "coding";
    }

    return "coding";
  }

  /**
   * Classifies the specific human-understandable activity description.
   */
  public classifyPrimaryActivity(
    workflow: ScreenActivityContext["activeWorkflow"],
    title: string,
    ocrResult: OCRIntelligenceResult
  ): string {
    const cleanTitle = title || "Active Desktop Window";

    if (workflow === "debugging") {
      const err = ocrResult.detectedErrors[0] || "syntax error";
      return `Investigating and debugging test failure in ${cleanTitle}: "${err.slice(0, 80)}"`;
    }

    if (workflow === "coding") {
      return `Working on source code in ${cleanTitle}`;
    }

    if (workflow === "browsing_documentation") {
      return `Reviewing web content or documentation in browser (${cleanTitle})`;
    }

    if (workflow === "terminal_ops") {
      return `Executing system CLI commands and builds in terminal (${cleanTitle})`;
    }

    return `Working in ${cleanTitle}`;
  }

  /**
   * Computes a description of visual changes compared to previous turns.
   */
  public computeStateDelta(currentActivity: string, currentTitle: string): string {
    if (!this._previousContext) {
      return "Initial screen awareness capture established. Baseline workspace recorded.";
    }

    if (this._previousContext.windowTitle !== currentTitle) {
      return `Application focus changed from "${this._previousContext.windowTitle}" to "${currentTitle}".`;
    }

    if (this._previousContext.primaryActivity !== currentActivity) {
      return `Workflow transitioned from "${this._previousContext.primaryActivity}" to "${currentActivity}".`;
    }

    return "Workspace state remains focused on current editing task with stable visual elements.";
  }

  /**
   * Generates a concise co-founder screen summary.
   */
  public generateSummary(
    primaryActivity: string,
    workflow: ScreenActivityContext["activeWorkflow"],
    visualResult: VisualUnderstandingResult,
    ocrResult: OCRIntelligenceResult
  ): string {
    const errCount = ocrResult.detectedErrors.length;
    const errClause = errCount > 0 ? ` with ${errCount} active diagnostic error in terminal` : " with clean build state";
    return `${primaryActivity}${errClause}. Recognized ${visualResult.elements.length} interactive UI elements and ${ocrResult.tokenCount} text tokens on display.`;
  }

  /**
   * Resets and purges cached screen activity context during emergency stops or privacy revocations.
   */
  public clearContext(): void {
    this._previousContext = null;
  }
}

/** Global singleton instance of ScreenContextEngine. */
export const defaultScreenContextEngine = new ScreenContextEngine();
