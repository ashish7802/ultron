/**
 * @file tests_screen_awareness_phase2.test.mjs
 * @description Comprehensive Test Suite for Screen Awareness Modules 08 - 12:
 * - Module 08: Grounded Visual Question Answering (6 Required Test Questions)
 * - Module 09: Privacy & Security Engine (Fail-Closed, Masking, Audit Trail)
 * - Module 10: Session Management & Single Active Pipeline Invariant
 * - Module 11: Visual Context Delivery & Prompt Integration
 * - Module 12: Screen Awareness Diagnostics & Health Telemetry
 */

import test from "node:test";
import assert from "node:assert/strict";

// ==============================================================================
// MODULE 08: VISUAL QUESTION ANSWERING (VQA) TESTS
// ==============================================================================

test("Module 08: VQA answers all 6 required blueprint questions grounded in screen evidence", async () => {
  const { defaultVisualQAEngine } = await import("./lib/screen/visualQAEngine.ts");
  const { defaultWindowDetectionEngine } = await import("./lib/screen/windowDetectionEngine.ts");
  const { defaultVisualUnderstandingEngine } = await import("./lib/screen/visualUnderstandingEngine.ts");
  const { defaultOCREngine } = await import("./lib/screen/ocrEngine.ts");
  const { defaultScreenContextEngine } = await import("./lib/screen/screenContextEngine.ts");
  const { defaultVisualProcessingEngine } = await import("./lib/screen/visualProcessingEngine.ts");
  const { defaultScreenCaptureEngine } = await import("./lib/screen/screenCaptureEngine.ts");

  const frame = await defaultScreenCaptureEngine.captureFrame({ mode: "full_screen" });
  const processed = defaultVisualProcessingEngine.processFrame(frame);
  const win = await defaultWindowDetectionEngine.detectActiveWindows();
  const visual = defaultVisualUnderstandingEngine.analyzeScene(processed, win.activeWindow);
  const ocr = defaultOCREngine.extractText(processed, win.activeWindow?.title);
  const context = defaultScreenContextEngine.synthesizeContext(win, visual, ocr);

  // Question 1: What is currently open on the screen?
  const res1 = defaultVisualQAEngine.answerQuestion(
    { query: "What is currently open on the screen?", presetQuestion: "what_is_open" },
    win,
    visual,
    ocr,
    context
  );
  assert.equal(res1.groundedInVisualEvidence, true);
  assert.match(res1.answer, /Visual Studio Code|Chrome|Terminal/i);
  assert.ok(res1.evidenceElements.length >= 1);

  // Question 2: Explain the visible error.
  const res2 = defaultVisualQAEngine.answerQuestion(
    { query: "Explain the visible error", presetQuestion: "explain_visible_error" },
    win,
    visual,
    ocr,
    context
  );
  assert.equal(res2.groundedInVisualEvidence, true);
  assert.match(res2.answer, /(?:SyntaxError|FAIL|error|diagnostic)/i);
  assert.ok(res2.citedBoundingBoxes.length >= 1);

  // Question 3: Identify the visible UI elements.
  const res3 = defaultVisualQAEngine.answerQuestion(
    { query: "Identify the visible UI elements", presetQuestion: "identify_ui_elements" },
    win,
    visual,
    ocr,
    context
  );
  assert.equal(res3.groundedInVisualEvidence, true);
  assert.match(res3.answer, /button|tab|code_editor|terminal_output/i);
  assert.ok(res3.citedBoundingBoxes.length >= 2);

  // Question 4: Explain the visible code issue.
  const res4 = defaultVisualQAEngine.answerQuestion(
    { query: "Explain the visible code issue", presetQuestion: "explain_code_issue" },
    win,
    visual,
    ocr,
    context
  );
  assert.equal(res4.groundedInVisualEvidence, true);
  assert.match(res4.answer, /(?:SyntaxError|unexpected token|FAIL|diagnostic|issue|error)/i);

  // Question 5: Identify the next step based on visible evidence.
  const res5 = defaultVisualQAEngine.answerQuestion(
    { query: "Identify the next step based on visible evidence", presetQuestion: "identify_next_step" },
    win,
    visual,
    ocr,
    context
  );
  assert.equal(res5.groundedInVisualEvidence, true);
  assert.ok(res5.answer.length > 20);

  // Question 6: Detect unclear or partially visible content.
  const res6 = defaultVisualQAEngine.answerQuestion(
    { query: "Detect unclear or partially visible content", presetQuestion: "detect_unclear_content" },
    win,
    visual,
    ocr,
    context
  );
  assert.ok(res6.limitationsNoted && res6.limitationsNoted.length > 5);
});

// ==============================================================================
// MODULE 09: PRIVACY & SECURITY NEGATIVE TESTS
// ==============================================================================

test("Module 09: Privacy & Security enforces fail-closed authorization, sensitive app exclusion, and audit trail", async () => {
  const { defaultPrivacySecurityEngine } = await import("./lib/screen/privacySecurityEngine.ts");
  const { getScreenPrivacyPolicy, purgeScreenBuffers } = await import("./lib/screenPrivacyController.ts");

  // Ensure baseline state is OFF
  purgeScreenBuffers();
  assert.equal(getScreenPrivacyPolicy().enabled, false);

  // Negative Test 1: Attempt capture without authorization -> Must fail closed
  const eval1 = defaultPrivacySecurityEngine.evaluateCapturePermission("Visual Studio Code");
  assert.equal(eval1.isPermissible, false, "Unauthorized capture must be rejected");
  assert.match(eval1.denialReason, /disabled|explicit user opt-in/i);

  // Grant Consent
  defaultPrivacySecurityEngine.grantConsent(10000); // 10s consent

  // Negative Test 2: Attempt capture of Sensitive Blacklisted Window (1Password) -> Must be blocked
  const eval2 = defaultPrivacySecurityEngine.evaluateCapturePermission("1Password - Vault", "1Password.exe");
  assert.equal(eval2.isPermissible, false, "1Password capture must be blocked");
  assert.match(eval2.denialReason, /sensitive data|blocked for privacy/i);

  // Negative Test 3: Attempt capture of Private Browsing Window -> Must be blocked
  const eval3 = defaultPrivacySecurityEngine.evaluateCapturePermission("Google Chrome (Incognito)", "chrome.exe");
  assert.equal(eval3.isPermissible, false, "Incognito browsing capture must be blocked");

  // Positive Test 4: Authorized Developer Window -> Permitted
  const eval4 = defaultPrivacySecurityEngine.evaluateCapturePermission("Visual Studio Code - ultron", "Code.exe");
  assert.equal(eval4.isPermissible, true, "Dev window capture must be permitted");

  // Sensitive Field Masking Test
  const mockLines = [
    { text: "const apiKey = 'sk-proj1234567890abcdef1234567890';", bounds: { x: 100, y: 100, width: 300, height: 20 } },
    { text: "user password: SuperSecretPassword123!", bounds: { x: 100, y: 150, width: 250, height: 20 } },
  ];
  const masks = defaultPrivacySecurityEngine.detectSensitiveFieldMasks(mockLines);
  assert.ok(masks.length >= 2, "Must detect API key and password tokens for masking");
  assert.ok(masks.some((m) => m.category === "api_key"));
  assert.ok(masks.some((m) => m.category === "password"));

  // Revoke Consent immediately
  defaultPrivacySecurityEngine.revokeConsent("Test complete");
  const eval5 = defaultPrivacySecurityEngine.evaluateCapturePermission("Visual Studio Code");
  assert.equal(eval5.isPermissible, false, "Capture must immediately fail closed after revocation");

  // Audit Trail Integrity Check
  const audit = defaultPrivacySecurityEngine.getAuditTrail();
  assert.ok(audit.length >= 3, "Audit trail must record all security decisions");
  assert.ok(audit[audit.length - 1].chainHash.length === 64, "Chain hash must be SHA-256 hex");
});

// ==============================================================================
// MODULE 10: SESSION MANAGEMENT TESTS
// ==============================================================================

test("Module 10: Session Manager enforces lifecycle, single active pipeline, and TTL cleanup", async () => {
  const { ScreenSessionManager } = await import("./lib/screen/sessionManager.ts");
  const sm = new ScreenSessionManager();

  // 1. Create Session
  const sess1 = sm.createSession("display_1", 5000);
  assert.ok(sess1.sessionId.startsWith("screen_sess_"));
  assert.equal(sess1.operationalState, "LIVE");
  assert.equal(sm.getActiveSession()?.sessionId, sess1.sessionId);

  // 2. Single Active Pipeline Rule: Creating session 2 terminates session 1
  const sess2 = sm.createSession("display_1", 5000);
  assert.notEqual(sess2.sessionId, sess1.sessionId);
  assert.equal(sm.getActiveSession()?.sessionId, sess2.sessionId);

  const history = sm.getSessionHistory();
  const archived = history.find((s) => s.sessionId === sess1.sessionId);
  assert.ok(archived, "Session 1 must be cleanly archived in history");
  assert.equal(archived.operationalState, "TERMINATED");
  assert.equal(archived.cleanupCompleted, true);

  // 3. Pause and Resume
  sm.pauseSession(sess2.sessionId);
  assert.equal(sm.getActiveSession()?.operationalState, "PAUSED");

  sm.resumeSession(sess2.sessionId);
  assert.equal(sm.getActiveSession()?.operationalState, "LIVE");

  // 4. Terminate
  sm.terminateSession(sess2.sessionId, "User closed session");
  assert.equal(sm.getActiveSession(), null);
});

// ==============================================================================
// MODULE 11: VISUAL CONTEXT DELIVERY TESTS
// ==============================================================================

test("Module 11: Visual Context Delivery builds token-optimized prompts and suppresses redundant frames", async () => {
  const { defaultVisualContextDeliveryEngine } = await import("./lib/screen/contextDeliveryEngine.ts");
  const { defaultPrivacySecurityEngine } = await import("./lib/screen/privacySecurityEngine.ts");
  const { purgeScreenBuffers } = await import("./lib/screenPrivacyController.ts");

  // 1. Rejects delivery if privacy is OFF
  purgeScreenBuffers();
  const unauthPayload = defaultVisualContextDeliveryEngine.buildContextPayload(
    "sess_1",
    {
      primaryActivity: "Editing code",
      activeWorkflow: "coding",
      activeApplication: "Code.exe",
      windowTitle: "VS Code",
      screenSummary: "Editing code",
      salientTextSnippet: "snippet",
      recentStateDelta: "none",
      contextTimestamp: Date.now(),
      relevanceToCoFounderMission: 1.0,
    },
    { layoutCategory: "ide_code_editor", elements: [], visibleErrors: [], sceneExplanation: "", keyActionPoints: [], confidenceScore: 1, understandingLatencyMs: 1 },
    { fullText: "", lines: [], codeBlocks: [], tables: [], detectedErrors: [], detectedLanguage: "", textToRegionMap: [], tokenCount: 0, ocrLatencyMs: 1 }
  );
  assert.equal(unauthPayload, null, "Context delivery must fail closed when privacy is disabled");

  // 2. Authorized delivery
  defaultPrivacySecurityEngine.grantConsent(10000);
  const payload1 = defaultVisualContextDeliveryEngine.buildContextPayload(
    "sess_1",
    {
      primaryActivity: "Debugging TypeScript error",
      activeWorkflow: "debugging",
      activeApplication: "Code.exe",
      windowTitle: "Visual Studio Code - discoveryEngine.ts",
      screenSummary: "Debugging test failure",
      salientTextSnippet: "SyntaxError",
      recentStateDelta: "New error",
      contextTimestamp: Date.now(),
      relevanceToCoFounderMission: 1.0,
    },
    { layoutCategory: "ide_code_editor", elements: [], visibleErrors: [], sceneExplanation: "", keyActionPoints: ["Fix token"], confidenceScore: 0.95, understandingLatencyMs: 1 },
    {
      fullText: "SyntaxError at 486",
      lines: [{ text: "SyntaxError at 486", tokens: [], bounds: { x: 0, y: 0, width: 100, height: 20 }, isHeading: false, isCodeBlock: false, isErrorMessage: true }],
      codeBlocks: [],
      tables: [],
      detectedErrors: ["SyntaxError at 486"],
      detectedLanguage: "en-US",
      textToRegionMap: [],
      tokenCount: 4,
      ocrLatencyMs: 1,
    },
    "hash_frame_abc"
  );

  assert.ok(payload1 !== null);
  assert.equal(payload1.isRedundantFrame, false);
  assert.match(payload1.formattedPromptContext, /SCREEN AWARENESS CONTEXT/);
  assert.match(payload1.formattedPromptContext, /Active Window.*Visual Studio Code/);
  assert.match(payload1.formattedPromptContext, /Visible Errors:.*SyntaxError at 486/i);

  // 3. Redundant Frame Suppression
  const payload2 = defaultVisualContextDeliveryEngine.buildContextPayload(
    "sess_1",
    payload1,
    { layoutCategory: "ide_code_editor", elements: [], visibleErrors: [], sceneExplanation: "", keyActionPoints: [], confidenceScore: 0.95, understandingLatencyMs: 1 },
    { fullText: "", lines: [], codeBlocks: [], tables: [], detectedErrors: [], detectedLanguage: "", textToRegionMap: [], tokenCount: 0, ocrLatencyMs: 1 },
    "hash_frame_abc" // Identical frame hash
  );
  assert.equal(payload2.isRedundantFrame, true, "Must flag identical frame as redundant to suppress token duplication");

  purgeScreenBuffers();
});

// ==============================================================================
// MODULE 12: DIAGNOSTICS & HEALTH TESTS
// ==============================================================================

test("Module 12: Diagnostics Engine generates health report, profiles latencies, and validates checks", async () => {
  const { defaultScreenDiagnosticsEngine } = await import("./lib/screen/diagnosticsEngine.ts");

  defaultScreenDiagnosticsEngine.recordMetrics(25.4, 12.1, 7.8);
  const report = await defaultScreenDiagnosticsEngine.generateReport();

  assert.ok(report.timestamp > 0);
  assert.ok(["HEALTHY", "DEGRADED", "CRITICAL"].includes(report.overallHealth));
  assert.ok(report.activeDisplays.length >= 1, "Must enumerate active displays");
  assert.ok(report.captureLatencyAvgMs > 0, "Must calculate capture latency average");
  assert.ok(report.ocrLatencyAvgMs > 0, "Must calculate OCR latency average");
  assert.ok(report.vqaLatencyAvgMs > 0, "Must calculate VQA latency average");
  assert.ok(report.diagnosticChecks.length >= 3, "Must run diagnostic check suite");
  assert.ok(report.diagnosticChecks.some((c) => c.name === "Display Monitor Detection" && c.passed));
});
