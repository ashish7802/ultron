/**
 * @file lib/screen/types.ts
 * @description Comprehensive Type Definitions for ULTRON Screen Awareness & Visual Intelligence (Modules 01 - 12).
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence Architecture (Blueprint Section 4).
 *
 * Key Responsibilities:
 * - Defines strongly-typed domain models for all 12 Screen Awareness modules:
 *   1. Vision Control & Indicator State (Module 01)
 *   2. Multi-Mode Desktop Screen Capture (Module 02)
 *   3. Visual Processing & Diffing (Module 03)
 *   4. Window & Application Detection (Module 04)
 *   5. Visual UI Understanding & Element Recognition (Module 05)
 *   6. OCR & Text Intelligence (Module 06)
 *   7. Screen Context & Workflow Identification (Module 07)
 *   8. Grounded Visual Question Answering (Module 08)
 *   9. Privacy, Security & Sensitive Data Masking (Module 09)
 *   10. Session Lifecycle Management (Module 10)
 *   11. Visual Context Delivery to Cognitive Pipelines (Module 11)
 *   12. Diagnostics, Latency Profiling & Health Checks (Module 12)
 *
 * Architectural Role & Safety Guarantees:
 * - Single source of truth for screen awareness data structures across backend, API, and frontend.
 * - Guarantees fail-closed security invariants: unauthenticated captures default to blocked/empty states.
 * - Enforces zero raw image persistence: all frame buffers are marked ephemeral.
 */

// ==============================================================================
// 1. MODULE 01: VISION CONTROL & INDICATOR TYPES
// ==============================================================================

export type CaptureOperationalState = "OFF" | "INITIALIZING" | "LIVE" | "ANALYZING" | "PAUSED" | "DEGRADED" | "ERROR" | "TERMINATED";

export type PermissionSyncState = "GRANTED" | "DENIED" | "PROMPT" | "REVOKED";

export interface VisionControlStatus {
  operationalState: CaptureOperationalState;
  indicatorColor: "red" | "green" | "amber" | "gray";
  indicatorText: string;
  isCapturing: boolean;
  permissionState: PermissionSyncState;
  activeSessionId: string | null;
  targetDisplayId: string | null;
  startedAt: number | null;
  lastFrameAt: number | null;
  emergencyTerminationAvailable: boolean;
  activeWindowSummary?: string;
  visionEngineStatus?: string;
  lastAnalysisStatus?: string;
  modelAvailability?: string;
  lastCaptureLatencyMs?: number;
  lastInferenceLatencyMs?: number;
}

export interface VisionControlCommand {
  action: "START" | "STOP" | "PAUSE" | "RESUME" | "EMERGENCY_KILL";
  sessionId?: string;
  displayId?: string;
  durationMs?: number;
  reason?: string;
}

// ==============================================================================
// 2. MODULE 02: SCREEN CAPTURE TYPES
// ==============================================================================

export type CaptureMode = "full_screen" | "active_window" | "selected_region" | "multi_monitor";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayMonitor {
  id: string;
  name: string;
  isPrimary: boolean;
  bounds: BoundingBox;
  scaleFactor: number;
  resolution: {
    width: number;
    height: number;
  };
}

export interface CaptureOptions {
  mode: CaptureMode;
  displayId?: string;
  region?: BoundingBox;
  targetWindowHandle?: string;
  maxFps?: number;
  quality?: number; // 1 - 100
  includeCursor?: boolean;
}

export interface CapturedFrame {
  frameId: string;
  sessionId: string;
  sequenceNumber: number;
  timestamp: number;
  mode: CaptureMode;
  display: DisplayMonitor;
  imageBuffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/bmp";
  dimensions: {
    width: number;
    height: number;
  };
  pixelHash: string; // SHA-256 hash of processed image
  changeDetected: boolean;
  changePercentage: number;
  captureLatencyMs: number;
  isSyntheticTestFrame?: boolean;
}

// ==============================================================================
// 3. MODULE 03: VISUAL PROCESSING TYPES
// ==============================================================================

export interface VisualProcessingOptions {
  grayscale?: boolean;
  targetWidth?: number;
  targetHeight?: number;
  compressionQuality?: number;
  contrastEnhancement?: boolean;
  noiseReduction?: boolean;
}

export interface ProcessedVisualFrame {
  frameId: string;
  originalDimensions: { width: number; height: number };
  processedDimensions: { width: number; height: number };
  processedBuffer: Buffer;
  encoding: "base64" | "raw";
  contentHash: string;
  diffFromPreviousPercent: number;
  isSignificantChange: boolean;
  processingLatencyMs: number;
  segmentedRegions: SegmentedRegion[];
}

export interface SegmentedRegion {
  id: string;
  category: "header" | "content" | "sidebar" | "modal" | "terminal" | "editor" | "status_bar" | "unknown";
  bounds: BoundingBox;
  confidence: number;
}

// ==============================================================================
// 4. MODULE 04: WINDOW & APPLICATION DETECTION TYPES
// ==============================================================================

export type WindowVisualState = "normal" | "minimized" | "maximized" | "fullscreen" | "hidden";

export interface DesktopWindowInfo {
  handle: string;
  title: string;
  processName: string;
  processId: number;
  bounds: BoundingBox;
  isActive: boolean;
  state: WindowVisualState;
  isExcluded: boolean;
  browserUrlContext?: string;
  browserUrl?: string;
  zIndex: number;
}

export interface WindowDetectionResult {
  activeWindow: DesktopWindowInfo | null;
  openWindows: DesktopWindowInfo[];
  detectedApplication: string;
  isSensitiveAppActive: boolean;
  detectedAt: number;
  appSwitchDetected: boolean;
  previousApp?: string;
}

// ==============================================================================
// 5. MODULE 05: VISUAL UNDERSTANDING TYPES
// ==============================================================================

export type UIElementType =
  | "button"
  | "input_field"
  | "text_label"
  | "menu"
  | "menu_item"
  | "dialog"
  | "modal"
  | "table"
  | "form"
  | "icon"
  | "tab"
  | "code_editor"
  | "terminal_output"
  | "error_badge"
  | "notification";

export interface RecognizedUIElement {
  id: string;
  type: UIElementType;
  label?: string;
  bounds: BoundingBox;
  confidence: number;
  isClickable: boolean;
  isDestructiveAction?: boolean;
  associatedText?: string;
}

export type ApplicationLayoutCategory =
  | "ide_code_editor"
  | "browser_webpage"
  | "web_browser"
  | "terminal_cli"
  | "dashboard_analytics"
  | "document_reader"
  | "database_admin"
  | "chat_communication"
  | "dialog_settings"
  | "system_desktop"
  | "media_player"
  | "system_settings"
  | "dialog_modal"
  | "desktop_workspace";

export interface VisualUnderstandingResult {
  layoutCategory: ApplicationLayoutCategory;
  elements: RecognizedUIElement[];
  visibleErrors: VisibleErrorDescriptor[];
  sceneExplanation: string;
  keyActionPoints: string[];
  confidenceScore: number;
  sceneConfidence?: number;
  understandingLatencyMs: number;
}

export interface VisibleErrorDescriptor {
  id: string;
  errorType: "compiler_error" | "runtime_crash" | "dialog_alert" | "validation_warning" | "network_failure";
  message: string;
  locationContext?: string;
  bounds?: BoundingBox;
  severity: "high" | "medium" | "low";
}

// ==============================================================================
// 6. MODULE 06: OCR & TEXT INTELLIGENCE TYPES
// ==============================================================================

export interface OCRToken {
  text: string;
  confidence: number;
  bounds: BoundingBox;
  lineIndex: number;
  wordIndex: number;
}

export interface OCRLine {
  text: string;
  tokens: OCRToken[];
  bounds: BoundingBox;
  isHeading: boolean;
  isCodeBlock: boolean;
  isErrorMessage: boolean;
}

export interface ExtractedCodeBlock {
  language?: string;
  lines: string[];
  bounds: BoundingBox;
  estimatedFunctionality?: string;
}

export interface ExtractedTableData {
  headers: string[];
  rows: string[][];
  bounds: BoundingBox;
}

export interface OCRIntelligenceResult {
  fullText: string;
  lines: OCRLine[];
  codeBlocks: ExtractedCodeBlock[];
  tables: ExtractedTableData[];
  detectedErrors: string[];
  detectedLanguage: string;
  textToRegionMap: Array<{ text: string; regionId: string; bounds: BoundingBox }>;
  tokenCount: number;
  ocrLatencyMs: number;
}

// ==============================================================================
// 7. MODULE 07: SCREEN CONTEXT AWARENESS TYPES
// ==============================================================================

export interface ScreenActivityContext {
  primaryActivity: string; // e.g. "Editing TypeScript code in VS Code"
  activeWorkflow: "coding" | "debugging" | "browsing_documentation" | "terminal_ops" | "configuring" | "idle";
  activeApplication: string;
  windowTitle: string;
  screenSummary: string;
  salientTextSnippet: string;
  recentStateDelta: string;
  contextTimestamp: number;
  timestamp?: number;
  relevanceToCoFounderMission: number; // 0.0 to 1.0
}

// ==============================================================================
// 8. MODULE 08: VISUAL QUESTION ANSWERING (VQA) TYPES
// ==============================================================================

export type StandardVQAPrompt =
  | "what_is_open"
  | "explain_visible_error"
  | "identify_ui_elements"
  | "explain_code_issue"
  | "identify_next_step"
  | "detect_unclear_content";

export interface VQAQueryRequest {
  query: string;
  presetQuestion?: StandardVQAPrompt;
  sessionId?: string;
  includeEvidencePassages?: boolean;
}

export interface VQAQueryResponse {
  query: string;
  answer: string;
  groundedInVisualEvidence: boolean;
  evidenceElements: string[];
  citedBoundingBoxes: BoundingBox[];
  confidence: number;
  identifiedApplication: string;
  vqaLatencyMs: number;
  limitationsNoted?: string;
}

// ==============================================================================
// 9. MODULE 09: PRIVACY & SECURITY TYPES
// ==============================================================================

export interface SensitiveFieldMask {
  category: "password" | "credit_card" | "api_key" | "auth_token" | "personal_pin";
  bounds: BoundingBox;
  redactedReplacement: string;
}

export interface ScreenSecurityAuditRecord {
  id: string;
  timestamp: number;
  action: "CAPTURE_REQUEST" | "CAPTURE_BLOCKED" | "SENSITIVE_APP_EXCLUDED" | "BUFFER_PURGED" | "EMERGENCY_STOP";
  outcome: "PERMITTED" | "DENIED" | "PURGED";
  windowTitle?: string;
  processName?: string;
  reason: string;
  sessionId?: string;
  chainHash: string; // Cryptographic audit trail integrity hash
}

export interface PrivacyEvaluation {
  isPermissible: boolean;
  denialReason?: string;
  requiresMasking: boolean;
  masks: SensitiveFieldMask[];
  policyState: string;
}

// ==============================================================================
// 10. MODULE 10: SESSION MANAGEMENT TYPES
// ==============================================================================

export interface ScreenSession {
  sessionId: string;
  operationalState: CaptureOperationalState;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  framesCaptured: number;
  displayId: string;
  isPaused: boolean;
  cleanupCompleted: boolean;
  metadata?: Record<string, unknown>;
}

// ==============================================================================
// 11. MODULE 11: VISUAL CONTEXT DELIVERY TYPES
// ==============================================================================

export interface VisualContextPayload {
  sessionId: string;
  frameId?: string;
  sequenceNumber?: number;
  timestamp: number;
  frameAgeMs?: number;
  activeApp: string;
  windowTitle: string;
  browserUrl?: string;
  activitySummary: string;
  ocrSummary: string;
  detectedUI: {
    buttonsCount: number;
    inputsCount: number;
    errorsCount: number;
  };
  visibleErrors: string[];
  visualEvidence?: string[];
  ocrEvidence?: string[];
  visualConfidence?: number;
  uncertainty?: string;
  isRedundantFrame: boolean;
  formattedPromptContext: string;
}

// ==============================================================================
// 12. MODULE 12: DIAGNOSTICS & HEALTH TYPES
// ==============================================================================

export interface ScreenDiagnosticsReport {
  timestamp: number;
  overallHealth: "HEALTHY" | "DEGRADED" | "CRITICAL";
  capturePipelineReady: boolean;
  permissionGranted: boolean;
  activeDisplays: DisplayMonitor[];
  captureLatencyAvgMs: number;
  ocrLatencyAvgMs: number;
  vqaLatencyAvgMs: number;
  memoryUsageBytes: number;
  cpuLoadPercentEstimated: number;
  totalFramesProcessed: number;
  totalCapturesBlocked: number;
  errorsDetectedCount: number;
  diagnosticChecks: Array<{
    name: string;
    passed: boolean;
    details: string;
  }>;
}
