/**
 * @file lib/computer/index.ts
 * @description Unified Facade & Entry Point for ULTRON Computer Intelligence System (Modules 01 - 11).
 *
 * Subsystem:
 * Computer Intelligence Architecture.
 *
 * Exported Modules & Engines:
 * - Module 01: Screen Awareness System (`lib/screen/index.ts`)
 * - Module 02: Desktop Understanding Engine (`DesktopUnderstandingEngine`, `defaultDesktopEngine`)
 * - Module 03: Application Intelligence (`ApplicationIntelligence`, `defaultApplicationIntelligence`)
 * - Module 04: Mouse & Keyboard Control (`InputController`, `defaultInputController`)
 * - Module 05: Visual Element Recognition & UIA (`VisualElementRecognizer`, `defaultVisualRecognizer`)
 * - Module 06: File System Intelligence (`FileSystemIntelligence`, `defaultFileSystemIntelligence`)
 * - Module 07: Terminal Intelligence (`TerminalIntelligence`, `defaultTerminalIntelligence`)
 * - Module 08: Browser Interaction (`BrowserIntelligence`, `defaultBrowserIntelligence`)
 * - Module 09: Development Environment Intelligence (`DevEnvironmentIntelligence`, `defaultDevEnvironmentIntelligence`)
 * - Module 10: Computer Safety Controls & Emergency Stop (`ComputerSafetyControls`, `defaultSafetyControls`)
 * - Module 11: Task Workflow Orchestration (`ComputerTaskWorkflowOrchestrator`, `defaultComputerWorkflowOrchestrator`)
 */

export * from "./types.ts";
export * from "./pythonBridge.ts";
export * from "./desktopEngine.ts";
export * from "./applicationIntelligence.ts";
export * from "./inputController.ts";
export * from "./visualElementRecognizer.ts";
export * from "./fileSystemIntelligence.ts";
export * from "./terminalIntelligence.ts";
export * from "./browserIntelligence.ts";
export * from "./devEnvironmentIntelligence.ts";
export * from "./safetyControls.ts";
export * from "./workflowOrchestrator.ts";
