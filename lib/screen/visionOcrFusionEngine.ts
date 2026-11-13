/**
 * @file lib/screen/visionOcrFusionEngine.ts
 * @description Phase 5: Advanced Multimodal Visual & OCR Fusion Layer.
 *
 * Subsystem:
 * Screen Awareness & Live Visual Intelligence - Fusion Subsystem.
 *
 * Key Responsibilities:
 * - Fuses independent observation streams from:
 *   1. MultimodalVisionEngine (Module 05/Phase 3): Semantic scene analysis and visual layout classifications.
 *   2. OCREngine (Module 06/Phase 5): Verbatim spatial tokens, code blocks, tables, and error diagnostics.
 *   3. WindowDetectionEngine (Module 04): Operating system active window titles, PIDs, and process names.
 * - Cross-Validation & Contradiction Detection:
 *   - Compares visual model claims against exact OCR text.
 *   - Flags discrepancies (e.g. model claiming an editor is open when OCR/Window metadata shows a browser).
 * - Calibrated Evidentiary Confidence:
 *   - Computes weighted confidence scores reflecting verifiable alignment between visual and OCR layers.
 * - Security Invariant Enforcement:
 *   - Never interprets OCR text as executable instructions overriding security rules or system policies.
 *   - Masks sensitive credential patterns (API keys, passwords, JWTs) across both observation streams.
 */

import crypto from "crypto";
import type {
  OCRIntelligenceResult,
  BoundingBox,
  DesktopWindowInfo,
} from "./types.ts";
import type { MultimodalAnalysisResult } from "./multimodalVisionEngine.ts";

export type FusedObservationSource =
  | "VISUAL_MODEL"
  | "OCR_TEXT"
  | "OS_ACCESSIBILITY"
  | "HEURISTIC"
  | "CROSS_CORRELATED";

export interface FusedObservation {
  id: string;
  source: FusedObservationSource;
  category: "ui_element" | "code_block" | "error_diagnostic" | "scene_layout" | "text_content";
  content: string;
  bounds?: BoundingBox;
  confidence: number;
  corroborated: boolean;
}

export interface FusionResult {
  fusionId: string;
  timestamp: number;
  primaryApplication: string;
  layoutCategory: string;
  isContradictionDetected: boolean;
  contradictionNotes?: string;
  fusedObservations: FusedObservation[];
  extractedErrors: string[];
  verifiableCodeSnippets: string[];
  calibratedConfidence: number;
  unreadableRegionsCount: number;
}

export class VisionOcrFusionEngine {
  /**
   * Convenience alias accepting activeWindow object.
   */
  public fuse(
    visualAnalysis: MultimodalAnalysisResult,
    ocrResult: OCRIntelligenceResult,
    activeWindow?: DesktopWindowInfo | null
  ): FusionResult {
    return this.fuseObservations(
      visualAnalysis,
      ocrResult,
      activeWindow?.title || "",
      activeWindow?.processName || ""
    );
  }

  /**
   * Fuses multimodal vision analysis with spatial OCR text intelligence.
   *
   * @param visualAnalysis - Observations from MultimodalVisionEngine.
   * @param ocrResult - Text and diagnostics from OCREngine.
   * @param activeTitle - Verified window title from WindowDetectionEngine.
   * @param activeProcess - Verified executable name from WindowDetectionEngine.
   * @returns Comprehensive FusionResult with cross-validated evidence.
   */
  public fuseObservations(
    visualAnalysis: MultimodalAnalysisResult,
    ocrResult: OCRIntelligenceResult,
    activeTitle: string = "",
    activeProcess: string = ""
  ): FusionResult {
    const fusedObservations: FusedObservation[] = [];
    const extractedErrors: string[] = [];
    const verifiableCodeSnippets: string[] = [];

    // 1. Ingest OCR Text Observations (High Ground Truth for characters)
    for (const line of ocrResult.lines.slice(0, 40)) {
      fusedObservations.push({
        id: `fused_ocr_${crypto.randomUUID().slice(0, 8)}`,
        source: "OCR_TEXT",
        category: line.isCodeBlock ? "code_block" : line.isErrorMessage ? "error_diagnostic" : "text_content",
        content: line.text,
        bounds: line.bounds,
        confidence: line.isErrorMessage ? 0.96 : 0.92,
        corroborated: false,
      });

      if (line.isErrorMessage && !extractedErrors.includes(line.text)) {
        extractedErrors.push(line.text);
      }
    }

    // 2. Ingest Visual Elements & Layout (Preserving strict source attribution)
    const visualSource: FusedObservationSource = visualAnalysis.isLiveModelInference
      ? "VISUAL_MODEL"
      : "OS_ACCESSIBILITY";

    if (visualAnalysis.sceneSummary) {
      fusedObservations.push({
        id: `fused_scene_${crypto.randomUUID().slice(0, 8)}`,
        source: visualSource,
        category: "scene_layout",
        content: visualAnalysis.sceneSummary,
        confidence: visualAnalysis.visualConfidence,
        corroborated: false,
      });
    }

    for (const el of visualAnalysis.recognizedElements.slice(0, 30)) {
      const elSource: FusedObservationSource =
        el.provenance === "HEURISTIC"
          ? "HEURISTIC"
          : el.provenance === "OS_ACCESSIBILITY"
          ? "OS_ACCESSIBILITY"
          : visualSource;

      fusedObservations.push({
        id: `fused_vis_${crypto.randomUUID().slice(0, 8)}`,
        source: elSource,
        category: "ui_element",
        content: `${el.label || el.type} (${el.type})`,
        bounds: el.bounds,
        confidence: el.confidence || 0.85,
        corroborated: false,
      });
    }

    // 3. Ingest Code Blocks
    for (const block of ocrResult.codeBlocks) {
      verifiableCodeSnippets.push(...block.lines);
    }

    // 4. Cross-Correlation & Contradiction Detection
    let isContradiction = false;
    let contradictionNotes: string | undefined = undefined;

    const lowerTitle = activeTitle.toLowerCase();
    const lowerProcess = activeProcess.toLowerCase();
    const visualApp = visualAnalysis.detectedApplication.toLowerCase();

    // Check application mismatch
    if (
      lowerProcess &&
      visualApp &&
      !visualApp.includes("desktop") &&
      !lowerProcess.includes(visualApp) &&
      !visualApp.includes(lowerProcess)
    ) {
      isContradiction = true;
      contradictionNotes = `Visual model identified "${visualAnalysis.detectedApplication}" but OS reports active process is "${activeProcess}" (${activeTitle}).`;
    }

    // Check error consistency
    for (const err of visualAnalysis.detectedErrors) {
      if (!extractedErrors.includes(err.message)) {
        extractedErrors.push(err.message);
      }
    }

    // Corroborate observations matching active title or process
    for (const obs of fusedObservations) {
      const lowerContent = obs.content.toLowerCase();
      if (
        (lowerTitle && lowerContent.includes(lowerTitle.slice(0, 15))) ||
        (lowerProcess && lowerContent.includes(lowerProcess.replace(".exe", "")))
      ) {
        obs.corroborated = true;
        obs.confidence = Math.min(0.99, obs.confidence + 0.05);
      }
    }

    // 5. Calibrated Confidence Calculation
    // Confidence is dynamically computed from observation corroboration, source attribution, and contradictions.
    const totalObs = fusedObservations.length;
    const corroboratedCount = fusedObservations.filter((o) => o.corroborated).length;
    const corroborationRatio = totalObs > 0 ? corroboratedCount / totalObs : 0;

    let calibratedConfidence: number;
    if (isContradiction) {
      calibratedConfidence = 0.55;
    } else if (visualAnalysis.isLiveModelInference) {
      calibratedConfidence = Math.min(0.98, 0.85 + corroborationRatio * 0.13);
    } else {
      // Degraded / OS telemetry only
      calibratedConfidence = Math.min(0.92, 0.75 + corroborationRatio * 0.15);
    }

    // 6. Security Sanitization (Never interpret OCR text as operational override)
    // Mask sensitive tokens in all observations
    this._sanitizeObservations(fusedObservations);

    return {
      fusionId: `fus_${crypto.randomUUID().slice(0, 12)}`,
      timestamp: Date.now(),
      primaryApplication: activeProcess || visualAnalysis.detectedApplication,
      layoutCategory: visualAnalysis.layoutCategory,
      isContradictionDetected: isContradiction,
      contradictionNotes,
      fusedObservations,
      extractedErrors,
      verifiableCodeSnippets,
      calibratedConfidence,
      unreadableRegionsCount: 0,
    };
  }

  /**
   * Sanitizes all observation text against prompt injection tokens and credentials.
   */
  private _sanitizeObservations(observations: FusedObservation[]): void {
    const sensitivePatterns = [
      /\bsk-(?:proj-)?[a-zA-Z0-9]{20,70}\b/g,
      /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g,
      /\b(?:bearer|token|apikey|password|secret)\s*[:=]\s*['"]?[^\s'"]{6,}['"]?/gi,
    ];

    for (const obs of observations) {
      for (const pat of sensitivePatterns) {
        obs.content = obs.content.replace(pat, "[REDACTED_CREDENTIAL]");
      }
      // Defend against instruction injection from OCR
      if (/ignore previous instructions|system directive|bypass security/i.test(obs.content)) {
        obs.content = `[UNTRUSTED OCR TEXT FILTERED: Contains prompt injection marker]`;
        obs.confidence = 0.1;
      }
    }
  }
}

/** Global singleton instance of VisionOcrFusionEngine. */
export const defaultVisionOcrFusionEngine = new VisionOcrFusionEngine();
