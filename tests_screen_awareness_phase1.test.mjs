/**
 * @file tests_screen_awareness_phase1.test.mjs
 * @description Comprehensive Test Suite for Screen Awareness Modules 01 - 07:
 * - Module 01: Vision Control & Floating Indicator
 * - Module 02: Multi-Mode Screen Capture Engine
 * - Module 03: Visual Processing & Region Segmentation
 * - Module 04: Window & Process Detection Engine
 * - Module 05: Visual Understanding & UI Recognition
 * - Module 06: OCR & Spatial Text Intelligence
 * - Module 07: Screen Context & Workflow Identification
 */

import test from "node:test";
import assert from "node:assert/strict";

// ==============================================================================
// MODULE 01: VISION CONTROL ENGINE TESTS
// ==============================================================================

test("Module 01: Vision Control initializes OFF, transitions states, and enforces anti-hallucination", async () => {
  const { VisionControlEngine } = await import("./lib/screen/visionControl.ts");
  const { defaultFrameStreamingEngine } = await import("./lib/screen/frameStreamingEngine.ts");
  const control = new VisionControlEngine();

  // 1. Initial State must be OFF
  let status = control.getStatus();
  assert.equal(status.operationalState, "OFF");
  assert.equal(status.isCapturing, false);
  assert.equal(status.indicatorColor, "gray");
  assert.equal(status.indicatorText, "VISION: OFF");

  // 2. Start Session
  const sessionId = control.startSession("display_1");
  assert.ok(sessionId.startsWith("screen_sess_"));
  const streamStats = defaultFrameStreamingEngine.getStats();
  assert.equal(streamStats.sessionId, sessionId);
  assert.equal(streamStats.isStreaming, true);
  status = control.getStatus();
  assert.equal(status.operationalState, "INITIALIZING");
  assert.equal(status.isCapturing, false);
  assert.equal(status.lastFrameAt, null);

  const firstFrameAt = Date.now();
  control.recordFrameAcquired("Test desktop", 1, undefined, undefined, sessionId, firstFrameAt);
  status = control.getStatus();
  assert.equal(status.operationalState, "LIVE");
  assert.equal(status.isCapturing, true);
  assert.equal(status.indicatorColor, "green");
  assert.equal(status.indicatorText, "VISION: LIVE");
  assert.equal(status.lastFrameAt, firstFrameAt);

  // 3. Pause and Resume
  control.pauseSession();
  status = control.getStatus();
  assert.equal(status.operationalState, "PAUSED");
  assert.equal(status.indicatorColor, "amber");

  control.resumeSession();
  status = control.getStatus();
  assert.equal(status.operationalState, "INITIALIZING");
  assert.equal(status.isCapturing, false);
  assert.equal(status.lastFrameAt, null);
  control.recordFrameAcquired("Resumed desktop", 1, undefined, undefined, sessionId, Date.now());
  status = control.getStatus();
  assert.equal(status.operationalState, "LIVE");

  // 4. Anti-Hallucination: Indicator cannot report LIVE if permission is revoked
  control.setPermissionState("REVOKED");
  status = control.getStatus();
  assert.equal(status.isCapturing, false);
  assert.notEqual(status.operationalState, "LIVE");

  // 5. Emergency Kill
  const nextSessionId = control.startSession("display_1");
  control.recordFrameAcquired("Stale desktop", 1, undefined, undefined, sessionId, firstFrameAt + 1);
  assert.equal(control.getStatus().operationalState, "INITIALIZING");
  assert.equal(control.getStatus().lastFrameAt, null);
  control.recordFrameAcquired("Test desktop", 1, undefined, undefined, nextSessionId, Date.now());
  let hookFired = false;
  control.registerEmergencyPurgeHook(() => {
    hookFired = true;
  });
  control.emergencyKill();
  status = control.getStatus();
  assert.equal(status.operationalState, "TERMINATED");
  assert.equal(hookFired, true, "Emergency hook must be triggered");
  assert.equal(status.isCapturing, false);
});

// ==============================================================================
// MODULE 02: SCREEN CAPTURE ENGINE TESTS
// ==============================================================================

test("Module 02: Screen Capture detects monitors, captures frames, and computes pixel hashes", async () => {
  const { defaultScreenCaptureEngine } = await import("./lib/screen/screenCaptureEngine.ts");

  // 1. Monitor Enumeration
  const monitors = await defaultScreenCaptureEngine.getConnectedMonitors(true);
  assert.ok(Array.isArray(monitors) && monitors.length > 0, "Must detect at least 1 monitor");
  assert.ok(monitors[0].resolution.width >= 800, "Monitor width must be valid");
  assert.ok(monitors[0].resolution.height >= 600, "Monitor height must be valid");

  // 2. Full-Screen Capture
  defaultScreenCaptureEngine.resetChangeCache();
  const frame1 = await defaultScreenCaptureEngine.captureFrame({ mode: "full_screen" }, "sess_test_1");
  assert.ok(frame1.frameId.startsWith("frame_"));
  assert.ok(frame1.imageBuffer.length > 54, "Frame buffer must contain image bytes");
  assert.equal(frame1.changeDetected, true, "First capture must detect change");
  assert.equal(frame1.changePercentage, 100);
  assert.ok(frame1.pixelHash.length === 64, "Pixel hash must be SHA-256 hex");

  // 3. Active-Window Mode Capture
  const frame2 = await defaultScreenCaptureEngine.captureFrame({ mode: "active_window" }, "sess_test_1");
  assert.ok(frame2.dimensions.width > 0);
  assert.ok(frame2.dimensions.height > 0);

  // 4. Selected Region Mode Capture
  const region = { x: 50, y: 50, width: 400, height: 300 };
  const frame3 = await defaultScreenCaptureEngine.captureFrame({ mode: "selected_region", region }, "sess_test_1");
  assert.equal(frame3.dimensions.width, 400);
  assert.equal(frame3.dimensions.height, 300);
});

// ==============================================================================
// MODULE 03: VISUAL PROCESSING & SEGMENTATION TESTS
// ==============================================================================

test("Module 03: Visual Processing segments layout regions and computes frame diffs", async () => {
  const { defaultVisualProcessingEngine } = await import("./lib/screen/visualProcessingEngine.ts");
  const { defaultScreenCaptureEngine } = await import("./lib/screen/screenCaptureEngine.ts");

  const frame = await defaultScreenCaptureEngine.captureFrame({ mode: "full_screen" }, "sess_test_2");
  const processed = defaultVisualProcessingEngine.processFrame(frame);

  assert.equal(processed.frameId, frame.frameId);
  assert.ok(processed.segmentedRegions.length >= 4, "Must segment into at least 4 layout regions");

  const header = processed.segmentedRegions.find((r) => r.category === "header");
  const sidebar = processed.segmentedRegions.find((r) => r.category === "sidebar");
  const editor = processed.segmentedRegions.find((r) => r.category === "editor");

  assert.ok(header, "Header region must be segmented");
  assert.ok(sidebar, "Sidebar region must be segmented");
  assert.ok(editor, "Editor region must be segmented");

  // Check bounding box intersection calculation
  const overlap = defaultVisualProcessingEngine.calculateIntersectionArea(header.bounds, sidebar.bounds);
  assert.equal(typeof overlap, "number");
});

// ==============================================================================
// MODULE 04: WINDOW & PROCESS DETECTION TESTS
// ==============================================================================

test("Module 04: Window Detection identifies active windows, process names, and sensitive patterns", async () => {
  const { defaultWindowDetectionEngine } = await import("./lib/screen/windowDetectionEngine.ts");

  const result = await defaultWindowDetectionEngine.detectActiveWindows();
  assert.ok(result.activeWindow, "Active window must be identified");
  assert.ok(result.activeWindow.title.length > 0, "Window title must be non-empty");
  assert.ok(result.activeWindow.processName.length > 0, "Process name must be identified");
  assert.ok(result.openWindows.length >= 1, "Must enumerate open desktop windows");

  // Sensitive application exclusion testing
  assert.equal(defaultWindowDetectionEngine.isWindowSensitive("1Password 8 - Vault"), true);
  assert.equal(defaultWindowDetectionEngine.isWindowSensitive("Google Chrome (Incognito)"), true);
  assert.equal(defaultWindowDetectionEngine.isWindowSensitive("Chase Online Banking - Accounts"), true);
  assert.equal(defaultWindowDetectionEngine.isWindowSensitive("Visual Studio Code - ultron"), false);

  // Browser context extraction
  const urlContext = defaultWindowDetectionEngine.extractBrowserContext("GitHub - ashish7802/ultron - Google Chrome");
  assert.equal(urlContext, "https://github.com");
});

// ==============================================================================
// MODULE 05: VISUAL UNDERSTANDING & UI RECOGNITION TESTS
// ==============================================================================

test("Module 05: Visual Understanding recognizes layout, UI elements, errors, and action points", async () => {
  const { defaultVisualUnderstandingEngine } = await import("./lib/screen/visualUnderstandingEngine.ts");
  const { defaultVisualProcessingEngine } = await import("./lib/screen/visualProcessingEngine.ts");
  const { defaultScreenCaptureEngine } = await import("./lib/screen/screenCaptureEngine.ts");

  const frame = await defaultScreenCaptureEngine.captureFrame({ mode: "full_screen" });
  const processed = defaultVisualProcessingEngine.processFrame(frame);

  const activeWindow = {
    handle: "0x1234",
    title: "Visual Studio Code - discoveryEngine.ts [Error]",
    processName: "Code.exe",
    processId: 4500,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    isActive: true,
    state: "maximized",
    isExcluded: false,
    zIndex: 1,
  };

  const understanding = defaultVisualUnderstandingEngine.analyzeScene(processed, activeWindow);

  assert.equal(understanding.layoutCategory, "ide_code_editor");
  assert.ok(understanding.elements.length >= 4, "Must identify standard UI buttons, editor and terminal");
  assert.ok(understanding.visibleErrors.length >= 1, "Must recognize error indicated in title/terminal");
  assert.ok(understanding.sceneExplanation.length > 20, "Scene explanation must be descriptive");
  assert.ok(understanding.keyActionPoints.length >= 1, "Must derive prioritized next operational steps");
});

// ==============================================================================
// MODULE 06: OCR & TEXT INTELLIGENCE TESTS
// ==============================================================================

test("Module 06: OCR extracts lines, bounding boxes, code blocks, and error diagnostics", async () => {
  const { defaultOCREngine } = await import("./lib/screen/ocrEngine.ts");

  const processed = {
    originalDimensions: { width: 1920, height: 1080 },
    segmentedRegions: [
      {
        id: "editor",
        category: "editor",
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        confidence: 1,
      },
    ],
  };
  const fixtureText = [
    "ULTRON VS Code",
    "function startApp() {",
    "return true;",
    "SyntaxError: Unexpected token in test.ts",
    "Tests: 28 passed, 1 failed, 29 total",
  ];
  const liveLines = fixtureText.map((text, lineIndex) => {
    const bounds = { x: 40, y: 40 + lineIndex * 24, width: 800, height: 18 };
    const tokens = text.split(/\s+/).map((token, wordIndex) => ({
      text: token,
      confidence: 0.99,
      bounds: {
        x: bounds.x + wordIndex * 24,
        y: bounds.y,
        width: 20,
        height: bounds.height,
      },
      lineIndex,
      wordIndex,
    }));

    return {
      text,
      tokens,
      bounds,
      isHeading: lineIndex === 0,
      isCodeBlock: lineIndex === 1 || lineIndex === 2,
      isErrorMessage: lineIndex === 3,
    };
  });

  const ocr = defaultOCREngine.extractText(processed, "VS Code", liveLines);

  assert.ok(ocr.lines.length >= 5, "Must extract text lines");
  assert.ok(ocr.tokenCount >= 10, "Must tokenize words with bounding boxes");
  assert.ok(ocr.fullText.includes("ULTRON"), "Full text must contain recognized tokens");

  // Code Block Extraction
  assert.ok(ocr.codeBlocks.length >= 1, "Must parse code blocks");
  assert.equal(ocr.codeBlocks[0].language, "typescript");

  // Error Diagnostic Extraction
  assert.ok(ocr.detectedErrors.length >= 1, "Must extract terminal error diagnostics");
  assert.ok(ocr.detectedErrors.some((e) => e.includes("SyntaxError") || e.includes("FAIL")));

  // Text-to-Region Spatial Mapping
  assert.equal(ocr.textToRegionMap.length, ocr.lines.length);
});

// ==============================================================================
// MODULE 07: SCREEN CONTEXT & WORKFLOW IDENTIFICATION TESTS
// ==============================================================================

test("Module 07: Screen Context synthesizes activity, workflow phase, and state delta", async () => {
  const { defaultScreenContextEngine } = await import("./lib/screen/screenContextEngine.ts");
  const { defaultWindowDetectionEngine } = await import("./lib/screen/windowDetectionEngine.ts");
  const { defaultVisualUnderstandingEngine } = await import("./lib/screen/visualUnderstandingEngine.ts");
  const { defaultOCREngine } = await import("./lib/screen/ocrEngine.ts");
  const { defaultVisualProcessingEngine } = await import("./lib/screen/visualProcessingEngine.ts");
  const { defaultScreenCaptureEngine } = await import("./lib/screen/screenCaptureEngine.ts");

  const frame = await defaultScreenCaptureEngine.captureFrame({ mode: "full_screen" });
  const processed = defaultVisualProcessingEngine.processFrame(frame);
  const win = await defaultWindowDetectionEngine.detectActiveWindows();
  const visual = defaultVisualUnderstandingEngine.analyzeScene(processed, win.activeWindow);
  const ocr = defaultOCREngine.extractText(processed, win.activeWindow?.title);

  const context = defaultScreenContextEngine.synthesizeContext(win, visual, ocr);

  assert.ok(context.primaryActivity.length > 10);
  assert.equal(context.activeWorkflow, "debugging", "Presence of errors must tag workflow as debugging");
  assert.ok(context.screenSummary.includes("interactive UI elements"));
  assert.ok(context.recentStateDelta.length > 5);
});
