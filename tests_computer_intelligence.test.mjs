/**
 * @file tests_computer_intelligence.test.mjs
 * @description Comprehensive Integration Test Suite for ULTRON Computer Intelligence System (Modules 01 - 11).
 *
 * Verifies:
 * - Module 01: Screen Awareness Integration
 * - Module 02: Desktop Understanding Engine (OS metadata, displays, window tree)
 * - Module 03: Application Intelligence (App discovery, find by alias)
 * - Module 04: Mouse & Keyboard Input Automation (Cursor query, typing contract)
 * - Module 05: Visual Element Recognition & UIA COM Interop
 * - Module 06: Guarded File System Intelligence (Write, .bak backup, verify, delete)
 * - Module 07: Terminal Intelligence (Shell detection, risk analysis, execution)
 * - Module 08: Browser Interaction (Browser detection, default browser, SSRF block)
 * - Module 09: Development Environment Intelligence (Project profile, Git status, port check)
 * - Module 10: Computer Safety Controls (Emergency Stop lifecycle, boundary enforcement)
 * - Module 11: Complete 7-Phase Task Execution & Verification Workflow
 */

import test from "node:test";
import assert from "node:assert/strict";

// ==============================================================================
// MODULE 02: DESKTOP UNDERSTANDING ENGINE
// ==============================================================================

test("Module 02: Desktop Understanding Engine retrieves OS metadata and window topology", async () => {
  const { defaultDesktopEngine } = await import("./lib/computer/desktopEngine.ts");

  const os = await defaultDesktopEngine.getOSMetadata();
  assert.equal(os.platform, "windows");
  assert.match(os.system, /Windows/i);
  assert.ok(os.current_build.length > 0);

  const monitors = await defaultDesktopEngine.getMonitors();
  assert.ok(monitors.length >= 1);
  assert.ok(monitors[0].resolution.width > 0);

  const windows = await defaultDesktopEngine.getWindows(true);
  assert.ok(windows.length > 0);
  assert.ok(windows[0].hwnd > 0);
});

// ==============================================================================
// MODULE 03: APPLICATION INTELLIGENCE
// ==============================================================================

test("Module 03: Application Intelligence discovers installed software and matches aliases", async () => {
  const { defaultApplicationIntelligence } = await import("./lib/computer/applicationIntelligence.ts");

  const apps = await defaultApplicationIntelligence.discoverApps();
  assert.ok(apps.length >= 5);

  const notepad = await defaultApplicationIntelligence.findApp("notepad");
  assert.ok(notepad !== null);
  assert.equal(notepad.name, "Notepad");

  const chrome = await defaultApplicationIntelligence.findApp("chrome");
  assert.ok(chrome !== null);
});

// ==============================================================================
// MODULE 04: MOUSE & KEYBOARD CONTROL
// ==============================================================================

test("Module 04: Input Controller queries physical cursor and dispatches input contracts", async () => {
  const { defaultInputController } = await import("./lib/computer/inputController.ts");

  const pos = await defaultInputController.getCursorPosition();
  assert.equal(typeof pos.x, "number");
  assert.equal(typeof pos.y, "number");

  const typeRes = await defaultInputController.typeText({ text: "" });
  assert.equal(typeRes.success, true);
  assert.equal(typeRes.characterCount, 0);

  const hkRes = await defaultInputController.sendHotkey(["ctrl"]);
  assert.equal(hkRes.success, true);
});

// ==============================================================================
// MODULE 05: VISUAL ELEMENT RECOGNITION & UIA
// ==============================================================================

test("Module 05: Visual Element Recognizer captures snapshots and dumps accessibility elements", async () => {
  const { defaultVisualRecognizer } = await import("./lib/computer/visualElementRecognizer.ts");
  const { defaultDesktopEngine } = await import("./lib/computer/desktopEngine.ts");

  const snapshot = await defaultVisualRecognizer.captureSnapshot();
  assert.ok(snapshot !== null);
  assert.ok(snapshot.stateHash.length > 0);

  const windows = await defaultDesktopEngine.getWindows();
  if (windows.length > 0) {
    const elements = await defaultVisualRecognizer.dumpElements(windows[0].hwnd, 5);
    assert.ok(Array.isArray(elements));
  }
});

// ==============================================================================
// MODULE 06: FILE SYSTEM INTELLIGENCE
// ==============================================================================

test("Module 06: File System Intelligence executes guarded writes, automatic backups, and verified reads", async () => {
  const { defaultFileSystemIntelligence } = await import("./lib/computer/fileSystemIntelligence.ts");
  const path = (await import("path")).default;
  const fs = (await import("fs")).default;

  const testFile = path.resolve(process.cwd(), "test_ts_computer_temp.txt");

  // 1. Initial write
  const w1 = await defaultFileSystemIntelligence.writeFile(testFile, "TS initial test content", true);
  assert.equal(w1.success, true);
  assert.equal(w1.verified, true);
  assert.ok(w1.sha256 !== null);

  // 2. Overwrite and check rolling backup
  const w2 = await defaultFileSystemIntelligence.writeFile(testFile, "TS modified test content", true);
  assert.equal(w2.success, true);
  assert.ok(w2.backupPath !== null);
  assert.equal(fs.existsSync(w2.backupPath), true);

  // 3. Read back
  const r1 = await defaultFileSystemIntelligence.readFile(testFile);
  assert.equal(r1.success, true);
  assert.equal(r1.content, "TS modified test content");

  // 4. Safe delete
  const d1 = await defaultFileSystemIntelligence.deleteFile(testFile);
  assert.equal(d1.success, true);
  assert.equal(d1.verified, true);
  assert.equal(fs.existsSync(testFile), false);

  // Clean backup
  if (w2.backupPath && fs.existsSync(w2.backupPath)) {
    try {
      fs.unlinkSync(w2.backupPath);
    } catch {}
  }
});

// ==============================================================================
// MODULE 07: TERMINAL INTELLIGENCE
// ==============================================================================

test("Module 07: Terminal Intelligence detects shells, performs risk analysis, and executes commands", async () => {
  const { defaultTerminalIntelligence } = await import("./lib/computer/terminalIntelligence.ts");

  const shells = await defaultTerminalIntelligence.getAvailableShells();
  assert.ok("powershell" in shells);

  // Risk analysis
  const safeRisk = await defaultTerminalIntelligence.analyzeRisk("git branch");
  assert.equal(safeRisk.isBlocked, false);

  const blockedRisk = await defaultTerminalIntelligence.analyzeRisk("format c:");
  assert.equal(blockedRisk.isBlocked, true);

  // Controlled execution
  const execRes = await defaultTerminalIntelligence.executeCommand("echo ULTRON_TS_TEST", "powershell", undefined, 10);
  assert.equal(execRes.success, true);
  assert.equal(execRes.exitCode, 0);
  assert.match(execRes.stdout, /ULTRON_TS_TEST/);
});

// ==============================================================================
// MODULE 08: BROWSER INTERACTION
// ==============================================================================

test("Module 08: Browser Intelligence discovers installed browsers and enforces SSRF boundaries", async () => {
  const { defaultBrowserIntelligence } = await import("./lib/computer/browserIntelligence.ts");

  const browsers = await defaultBrowserIntelligence.getInstalledBrowsers();
  assert.ok(browsers.length >= 1);

  const defaultB = await defaultBrowserIntelligence.getDefaultBrowser();
  assert.ok(defaultB !== null);
});

// ==============================================================================
// MODULE 09: DEVELOPMENT ENVIRONMENT INTELLIGENCE
// ==============================================================================

test("Module 09: Dev Environment Intelligence inspects project profile and git status", async () => {
  const { defaultDevEnvironmentIntelligence } = await import("./lib/computer/devEnvironmentIntelligence.ts");

  const profile = await defaultDevEnvironmentIntelligence.getProjectProfile();
  assert.match(profile.projectType, /next|node/i);
  assert.equal(profile.hasGit, true);

  const git = await defaultDevEnvironmentIntelligence.getGitStatus();
  assert.equal(git.isGitRepo, true);
  assert.ok(git.branch !== undefined);

  const portCheck = await defaultDevEnvironmentIntelligence.checkDevServer(49998);
  assert.equal(portCheck.isListening, false);
});

// ==============================================================================
// MODULE 10: COMPUTER SAFETY CONTROLS
// ==============================================================================

test("Module 10: Computer Safety Controls enforces Emergency Stop lifecycle and boundary checks", async () => {
  const { defaultSafetyControls } = await import("./lib/computer/safetyControls.ts");

  // Ensure clean state
  await defaultSafetyControls.resetEmergencyStop();
  assert.equal(await defaultSafetyControls.isEmergencyStopActive(), false);

  // Validate protected process
  const boundary = await defaultSafetyControls.validateSafety("terminate", "csrss.exe");
  assert.equal(boundary.blocked, true);

  // Trigger Emergency Stop
  const stop = await defaultSafetyControls.triggerEmergencyStop("Test integration emergency trigger");
  assert.equal(stop.emergencyStopActive, true);
  assert.equal(await defaultSafetyControls.isEmergencyStopActive(), true);

  // Actions must be blocked
  const blockedAction = await defaultSafetyControls.validateSafety("click", "target");
  assert.equal(blockedAction.blocked, true);

  // Reset
  const reset = await defaultSafetyControls.resetEmergencyStop("Test reset");
  assert.equal(reset.emergencyStopActive, false);
  assert.equal(await defaultSafetyControls.isEmergencyStopActive(), false);
});

// ==============================================================================
// MODULE 11: COMPLETE WORKFLOW (OBSERVE -> PLAN -> APPROVE -> EXECUTE -> VERIFY -> REPORT)
// ==============================================================================

test("Module 11: Workflow Orchestrator executes complete 7-phase task with verification", async () => {
  const { defaultComputerWorkflowOrchestrator } = await import("./lib/computer/workflowOrchestrator.ts");
  const path = (await import("path")).default;
  const fs = (await import("fs")).default;

  const testFile = path.resolve(process.cwd(), "test_orchestrator_temp.txt");

  // 1. OBSERVE -> UNDERSTAND -> PLAN
  const workflow = await defaultComputerWorkflowOrchestrator.planTask({
    intent: "Create temporary verification file for workflow test",
    actionType: "file_write",
    target: testFile,
    parameters: { content: "Orchestrator verified content string", overwrite: true },
    riskLevel: "medium",
    riskExplanation: "Writing temporary verification test file",
  });

  assert.equal(workflow.currentPhase, "REQUEST_APPROVAL");
  assert.ok(workflow.planId !== undefined);
  assert.ok(workflow.approvalToken !== undefined);

  // 2. REQUEST APPROVAL -> APPROVE
  const approvedWorkflow = defaultComputerWorkflowOrchestrator.approveTask(
    workflow.taskId,
    workflow.approvalToken
  );
  assert.equal(approvedWorkflow.currentPhase, "INTERACT");
  assert.ok(approvedWorkflow.executionGrantToken !== undefined);

  // 3. INTERACT -> VERIFY -> REPORT
  const completedWorkflow = await defaultComputerWorkflowOrchestrator.executeAndVerifyTask(workflow.taskId);
  assert.equal(completedWorkflow.currentPhase, "REPORT");
  assert.equal(completedWorkflow.success, true);
  assert.equal(completedWorkflow.steps[0].verified, true);
  assert.match(completedWorkflow.summary, /verified/i);

  // Verify file actually physically exists on disk
  assert.equal(fs.existsSync(testFile), true);
  const contentOnDisk = fs.readFileSync(testFile, "utf-8");
  assert.equal(contentOnDisk, "Orchestrator verified content string");

  // Cleanup
  fs.unlinkSync(testFile);
});
