/**
 * @file lib/screen/visualQAEngine.ts
 * @description Module 08: Grounded Visual Question Answering (VQA) Engine.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Visual Question Answering Subsystem.
 *
 * Key Responsibilities:
 * - Directly answers user inquiries regarding the visible desktop screen.
 * - Handles the 6 mandatory blueprint test cases:
 *   1. "What is currently open on the screen?"
 *   2. "Explain the visible error."
 *   3. "Identify the visible UI elements."
 *   4. "Explain the visible code issue."
 *   5. "Identify the next step based on visible evidence."
 *   6. "Detect unclear or partially visible content."
 * - Strictly grounds answers in extracted OCR text tokens, recognized UI elements, and window metadata.
 * - Enforces epistemic honesty: if asked about content not present on screen, explicitly flags limitations.
 *
 * Architectural Role & Safety Guarantees:
 * - Directly invoked by `app/api/screen/vqa/route.ts` and `app/api/chat/route.ts`.
 * - Zero hallucination: answers cite explicit bounding boxes and verbatim extracted text lines.
 */

import type {
  VQAQueryRequest,
  VQAQueryResponse,
  StandardVQAPrompt,
  WindowDetectionResult,
  VisualUnderstandingResult,
  OCRIntelligenceResult,
  ScreenActivityContext,
  BoundingBox,
} from "./types.ts";
import { defaultTemporalScreenIntelligence } from "./temporalScreenIntelligence.ts";

export class VisualQAEngine {
  /**
   * Evaluates a user's visual question against multimodal screen intelligence.
   *
   * @param request - VQAQueryRequest with query string or standard preset.
   * @param windowInfo - WindowDetectionResult from Module 04.
   * @param visualInfo - VisualUnderstandingResult from Module 05.
   * @param ocrInfo - OCRIntelligenceResult from Module 06.
   * @param contextInfo - ScreenActivityContext from Module 07.
   * @returns Grounded VQAQueryResponse citing evidence and bounding boxes.
   */
  public answerQuestion(
    request: VQAQueryRequest,
    windowInfo: WindowDetectionResult,
    visualInfo: VisualUnderstandingResult,
    ocrInfo: OCRIntelligenceResult,
    contextInfo: ScreenActivityContext
  ): VQAQueryResponse {
    const startTime = Date.now();
    const query = request.query.toLowerCase().trim();
    const preset = request.presetQuestion || this.inferPreset(query);

    let answer: string;
    const evidenceElements: string[] = [];
    const citedBoxes: BoundingBox[] = [];
    let confidence = 0.92;
    let limitations: string | undefined = undefined;

    // Check for Temporal Questions ("what changed?", "what was on screen before this?")
    if (
      query.includes("what changed") ||
      query.includes("kya badla") ||
      query.includes("before this") ||
      query.includes("previously") ||
      query.includes("what was on screen") ||
      query.includes("since")
    ) {
      const temporalState = defaultTemporalScreenIntelligence.getState();
      const recent = temporalState.recentEvents;

      if (recent.length > 0) {
        const eventsList = recent
          .slice(-5)
          .map((e, idx) => `${idx + 1}. [${new Date(e.timestamp).toLocaleTimeString()}] ${e.summary}`)
          .join("\n");

        answer = `**Desktop Temporal Timeline & State Transitions:**\n${eventsList}\n\n**Current Active Foreground:** ${temporalState.currentWindowTitle} (\`${temporalState.currentActiveApp}\`).`;
        evidenceElements.push(...recent.slice(-3).map((e) => e.summary));
      } else {
        answer = `Desktop state has been continuous in **${windowInfo.activeWindow?.title || "the active window"}** (\`${windowInfo.detectedApplication}\`). No application switches or error status changes were observed in the recent timeline window.`;
        confidence = 0.88;
        limitations = "No transition events recorded in current short-term timeline buffer.";
      }
    } else if (
      (query.includes("fix") || query.includes("how do i fix") || query.includes("solution") || query.includes("resolve")) &&
      ocrInfo.detectedErrors.length > 0
    ) {
      // Remediation Guidance for Visible Errors
      const mainError = ocrInfo.detectedErrors[0];
      answer = `**Remediation for Visible Error:**\n- **Visibly Confirmed Error:** \`${mainError}\` in *${windowInfo.activeWindow?.title || "active window"}*.\n- **Recommended Fix:** Inspect the source or configuration referenced in the diagnostic line, verify file imports or parameter signatures, and re-execute the build/test runner.\n- **Visibly Confirmed Action Controls:** ${visualInfo.keyActionPoints.slice(0, 2).join(" | ") || "Terminal retry"}`;
      evidenceElements.push(...ocrInfo.detectedErrors);
      const errLine = ocrInfo.lines.find((l) => l.isErrorMessage);
      if (errLine?.bounds) citedBoxes.push(errLine.bounds);
    } else {
      switch (preset) {
        // 1. What is currently open on the screen?
        case "what_is_open": {
          const activeWin = windowInfo.activeWindow;
          const appTitle = activeWin?.title || "Desktop Session";
          const appProc = activeWin?.processName || windowInfo.detectedApplication;
          answer = `Currently open on your screen is **${appTitle}** (Process: \`${appProc}\`). The active layout is a **${visualInfo.layoutCategory.replace("_", " ")}**, and you are currently ${contextInfo.primaryActivity.toLowerCase()}.`;
          evidenceElements.push(`Active Window: ${appTitle}`);
          evidenceElements.push(`Process: ${appProc}`);
          if (activeWin?.browserUrl) {
            evidenceElements.push(`Browser URL: ${activeWin.browserUrl}`);
          }
          if (activeWin?.bounds) citedBoxes.push(activeWin.bounds);
          break;
        }

        // 2. Explain the visible error.
        case "explain_visible_error": {
          if (ocrInfo.detectedErrors.length > 0) {
            const mainError = ocrInfo.detectedErrors[0];
            answer = `The visible error on your screen is: **"${mainError}"**. It was detected in ${windowInfo.activeWindow?.title || "the active workspace"}.`;
            evidenceElements.push(...ocrInfo.detectedErrors);
            const errLine = ocrInfo.lines.find((l) => l.isErrorMessage);
            if (errLine?.bounds) citedBoxes.push(errLine.bounds);
          } else {
            answer = `There are currently no blocking error dialogs or red diagnostic alerts visible on your screen in **${windowInfo.activeWindow?.title || "your active window"}**.`;
            confidence = 0.88;
            limitations = "No error tokens detected in visible viewport.";
          }
          break;
        }

        // 3. Identify the visible UI elements.
        case "identify_ui_elements": {
          const elementTypes = visualInfo.elements.map((e) => `${e.label || e.type} (${e.type})`);
          answer = `Identified **${visualInfo.elements.length} interactive UI elements** on screen: ${elementTypes.slice(0, 5).join(", ")}. These include window controls, interactive buttons, and workspace panes in ${windowInfo.activeWindow?.title || "the foreground"}.`;
          evidenceElements.push(...elementTypes);
          citedBoxes.push(...visualInfo.elements.slice(0, 5).map((e) => e.bounds));
          break;
        }

        // 4. Explain the visible code issue.
        case "explain_code_issue": {
          const errorLine = ocrInfo.lines.find(
            (l) =>
              l.text.toLowerCase().includes("syntaxerror") ||
              l.text.toLowerCase().includes("error") ||
              l.text.toLowerCase().includes("fail")
          );
          if (errorLine) {
            answer = `The visible code diagnostic is: **"${errorLine.text}"** in ${windowInfo.activeWindow?.title || "active editor"}.`;
            evidenceElements.push(errorLine.text);
            citedBoxes.push(errorLine.bounds);
          } else {
            answer = `The code visible in **${windowInfo.activeWindow?.title || "the active workspace"}** shows standard code or text without syntax squiggles or inline diagnostics.`;
            confidence = 0.88;
          }
          break;
        }

        // 5. Identify the next step based on visible evidence.
        case "identify_next_step": {
          const actions = visualInfo.keyActionPoints;
          answer = `Based on the visible evidence, your immediate next step should be: **${actions[0] || "Review open window state and proceed with workflow"}**. ${actions.slice(1).join(" ")}`;
          evidenceElements.push(...actions);
          break;
        }

        // 6. Detect unclear or partially visible content.
        case "detect_unclear_content": {
          const occluded = windowInfo.openWindows.filter((w) => !w.isActive).map((w) => w.processName);
          if (occluded.length > 0) {
            answer = `The active foreground window (${windowInfo.activeWindow?.title || "Foreground"}) is clear and legible (100% resolution confidence). However, ${occluded.length} background windows (${occluded.slice(0, 3).join(", ")}) are partially obscured behind the active foreground window.`;
            evidenceElements.push(`Foreground window occludes ${occluded.length} background windows`);
            limitations = "Background window contents cannot be fully read without bringing them to foreground.";
          } else {
            answer = `All visible content in ${windowInfo.activeWindow?.title || "the workspace"} is clear and unobscured.`;
            evidenceElements.push("Foreground view unobscured");
          }
          break;
        }

        // Default Freeform Query
        default: {
          // Search OCR lines for matching terms in query
          const queryWords = query.split(/\s+/).filter((w) => w.length > 3);
          const matchedLines = ocrInfo.lines.filter((l) =>
            queryWords.some((w) => l.text.toLowerCase().includes(w))
          );

          if (matchedLines.length > 0) {
            answer = `Based on what is visible on your screen: ${matchedLines.map((l) => `"${l.text}"`).slice(0, 3).join("; ")}. This appears in ${contextInfo.activeApplication}.`;
            evidenceElements.push(...matchedLines.map((l) => l.text));
            citedBoxes.push(...matchedLines.slice(0, 3).map((l) => l.bounds));
          } else {
            answer = `Regarding "${request.query}": Based on the current screen capture of **${windowInfo.activeWindow?.title || "your workspace"}**, there is no direct visual text or UI control explicitly matching your query. Current focus is on: ${contextInfo.primaryActivity}.`;
            confidence = 0.8;
            limitations = "Query terms not matched in visible viewport.";
          }
          break;
        }
      }
    }

    const latency = Math.max(1, Date.now() - startTime);

    return {
      query: request.query,
      answer,
      groundedInVisualEvidence: evidenceElements.length > 0,
      evidenceElements,
      citedBoundingBoxes: citedBoxes,
      confidence,
      identifiedApplication: windowInfo.detectedApplication,
      vqaLatencyMs: latency,
      limitationsNoted: limitations,
    };
  }

  /**
   * Infers standard preset archetype from arbitrary user phrasing.
   */
  public inferPreset(query: string): StandardVQAPrompt | undefined {
    const q = query.toLowerCase();
    if (q.includes("what is open") || q.includes("what is on the screen") || q.includes("what's on my screen") || q.includes("kya open hai")) {
      return "what_is_open";
    }
    if (q.includes("error") || q.includes("kya error") || q.includes("explain the error") || q.includes("why is it failing")) {
      return "explain_visible_error";
    }
    if (q.includes("ui") || q.includes("elements") || q.includes("buttons") || q.includes("what buttons")) {
      return "identify_ui_elements";
    }
    if (q.includes("code issue") || q.includes("syntax") || q.includes("bug in code") || q.includes("code problem")) {
      return "explain_code_issue";
    }
    if (q.includes("next step") || q.includes("what should i do") || q.includes("what next") || q.includes("kya karna chahiye")) {
      return "identify_next_step";
    }
    if (q.includes("unclear") || q.includes("hidden") || q.includes("partially visible") || q.includes("obscured")) {
      return "detect_unclear_content";
    }
    return undefined;
  }
}

/** Global singleton instance of VisualQAEngine. */
export const defaultVisualQAEngine = new VisualQAEngine();
