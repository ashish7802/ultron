/**
 * @file lib/computer/types.ts
 * @description Comprehensive Type Definitions for ULTRON Computer Intelligence System (Modules 01 - 11).
 *
 * Subsystem:
 * Computer Intelligence Architecture (Blueprint Specification).
 *
 * Key Responsibilities:
 * - Module 01: Screen Awareness & Frame Capture Types
 * - Module 02: Desktop Understanding & Window Topology Models
 * - Module 03: Application Intelligence & Lifecycle Types
 * - Module 04: Mouse & Keyboard Hardware Automation Types
 * - Module 05: Semantic UI Automation & Visual Recognition Types
 * - Module 06: File System Intelligence & Guarded Operations
 * - Module 07: Terminal Intelligence & Subprocess Management
 * - Module 08: Browser Interaction & Web State Verification
 * - Module 09: Development Environment Intelligence (VS Code, Git, Server Probes)
 * - Module 10: Computer Safety Controls & Emergency Stop Contracts
 * - Module 11: End-to-End Task Execution & Verification Workflow Types
 *
 * Architectural Role & Safety Guarantees:
 * - Single strongly-typed contract shared across Node.js backend, Electron shell, and UI.
 * - Enforces fail-closed typing: all mutating actions require risk levels and verification tokens.
 */

import type { ActionRiskLevel } from "../permissionGateway.ts";

// ==============================================================================
// 1. MODULE 02: DESKTOP UNDERSTANDING & TOPOLOGY
// ==============================================================================

export interface OSMetadata {
  platform: string;
  system: string;
  release: string;
  version: string;
  machine: string;
  processor: string;
  python_version: string;
  product_name: string;
  display_version: string;
  current_build: string;
  ubr: number;
  edition_id: string;
}

export interface DesktopBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopWindowInfo {
  handle: string;
  hwnd: number;
  title: string;
  processId: number;
  threadId: number;
  processName: string;
  processPath: string;
  bounds: DesktopBounds;
  isVisible: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  isCloaked: boolean;
  isHung: boolean;
}

// ==============================================================================
// 2. MODULE 03: APPLICATION INTELLIGENCE
// ==============================================================================

export interface DiscoveredApplication {
  name: string;
  alias?: string;
  executable?: string;
  path?: string;
  source: string;
  installLocation?: string;
  icon?: string;
}

export interface AppLaunchOutcome {
  success: boolean;
  pid?: number;
  executable?: string;
  message?: string;
  error?: string;
}

export interface AppSwitchOutcome {
  success: boolean;
  hwnd?: string;
  title?: string;
  processName?: string;
  message?: string;
  error?: string;
}

export interface AppTerminateOutcome {
  success: boolean;
  closed?: boolean;
  terminated?: boolean;
  processId?: number;
  blocked?: boolean;
  error?: string;
}

// ==============================================================================
// 3. MODULE 04: MOUSE & KEYBOARD CONTROL
// ==============================================================================

export interface CursorPosition {
  x: number;
  y: number;
}

export interface MouseClickOptions {
  x?: number;
  y?: number;
  button?: "left" | "right" | "middle";
  clickType?: "single" | "double";
}

export interface MouseDragOptions {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs?: number;
}

export interface MouseScrollOptions {
  deltaY: number;
  deltaX?: number;
}

export interface KeyboardTypeOptions {
  text: string;
  delayMs?: number;
}

// ==============================================================================
// 4. MODULE 05: VISUAL ELEMENT RECOGNITION & UIA
// ==============================================================================

export interface UIElementDescriptor {
  name: string;
  controlType: string;
  controlTypeId: number;
  automationId: string;
  className: string;
  isEnabled: boolean;
  isOffscreen: boolean;
  bounds: DesktopBounds | null;
}

export interface UIElementSelector {
  name?: string;
  controlType?: string;
  automationId?: string;
  fallbackCoordinates?: { x: number; y: number };
}

export interface UISnapshot {
  timestamp: number;
  activeWindow: DesktopWindowInfo | null;
  targetWindow: DesktopWindowInfo | null;
  elementCount: number;
  elements: UIElementDescriptor[];
  stateHash: string;
}

export interface UIStateComparison {
  changed: boolean;
  verified: boolean;
  deltas: string[];
  beforeHash: string;
  afterHash: string;
}

// ==============================================================================
// 5. MODULE 06: FILE SYSTEM INTELLIGENCE
// ==============================================================================

export interface FileMetadataDescriptor {
  exists: boolean;
  path: string;
  name?: string;
  isDirectory?: boolean;
  sizeBytes?: number;
  createdAt?: number;
  modifiedAt?: number;
  isReadOnly?: boolean;
  sha256?: string | null;
  error?: string;
}

export interface DirectoryListing {
  success: boolean;
  path: string;
  items: Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    sizeBytes: number;
    modifiedAt: number;
  }>;
  totalCount: number;
  error?: string;
}

export interface FileWriteOutcome {
  success: boolean;
  path: string;
  backupPath?: string | null;
  sha256?: string | null;
  sizeBytes?: number;
  verified: boolean;
  requiresApproval?: boolean;
  message?: string;
  error?: string;
}

// ==============================================================================
// 6. MODULE 07: TERMINAL INTELLIGENCE
// ==============================================================================

export interface TerminalShellDescriptor {
  name: string;
  path: string;
  default?: boolean;
}

export interface CommandRiskAnalysis {
  riskLevel: ActionRiskLevel;
  isBlocked: boolean;
  requiresApproval: boolean;
  reason: string;
}

export interface CommandExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  commandId?: string;
  blocked?: boolean;
  timedOut?: boolean;
  error?: string;
}

export interface BackgroundJobStatus {
  success: boolean;
  jobId: string;
  pid: number;
  command: string;
  isRunning: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  runtimeSeconds: number;
  error?: string;
}

// ==============================================================================
// 7. MODULE 08: BROWSER INTERACTION
// ==============================================================================

export interface BrowserDescriptor {
  id: string;
  name: string;
  exe: string;
}

export interface BrowserNavigationResult {
  success: boolean;
  url: string;
  browserUsed?: string;
  targetHwnd?: string;
  message?: string;
  error?: string;
}

export interface BrowserPageState {
  success: boolean;
  hwnd?: string;
  title?: string;
  browserName?: string;
  addressBarHint?: string | null;
  elementCount?: number;
  elements?: UIElementDescriptor[];
  error?: string;
}

// ==============================================================================
// 8. MODULE 09: DEVELOPMENT ENVIRONMENT INTELLIGENCE
// ==============================================================================

export interface ProjectProfile {
  directory: string;
  name: string;
  projectType: string;
  hasGit: boolean;
  hasVsCode: boolean;
  manifestFiles: string[];
  scripts: Record<string, string>;
  dependenciesCount?: number;
}

export interface GitRepositoryStatus {
  isGitRepo: boolean;
  branch?: string;
  isClean?: boolean;
  stagedCount?: number;
  modifiedCount?: number;
  untrackedCount?: number;
  staged?: string[];
  modified?: string[];
  untracked?: string[];
  error?: string;
}

export interface PortProbeResult {
  port: number;
  host: string;
  isListening: boolean;
  latencyMs?: number;
  error?: string;
}

export interface BuildRunResult extends CommandExecutionResult {
  buildSuccess: boolean;
  errorsCount: number;
  errorsDetected: string[];
}

export interface TestRunResult extends CommandExecutionResult {
  testSuccess: boolean;
  passedCount: number;
  failedCount: number;
  summary: string;
}

// ==============================================================================
// 9. MODULE 10: COMPUTER SAFETY CONTROLS
// ==============================================================================

export interface EmergencyStopState {
  emergencyStopActive: boolean;
  message?: string;
  jobsKilled?: number;
}

export interface SafetyValidationResult {
  allowed: boolean;
  riskLevel: ActionRiskLevel;
  blocked: boolean;
  reason: string;
  requiresApproval: boolean;
}

// ==============================================================================
// 10. MODULE 11: COMPUTER TASK EXECUTION & VERIFICATION WORKFLOW
// ==============================================================================

export type TaskExecutionPhase =
  | "OBSERVE"
  | "UNDERSTAND"
  | "PLAN"
  | "REQUEST_APPROVAL"
  | "INTERACT"
  | "VERIFY"
  | "REPORT";

export interface ComputerTaskStep {
  stepNumber: number;
  phase: TaskExecutionPhase;
  action: string;
  target: string;
  parameters: Record<string, unknown>;
  riskLevel: ActionRiskLevel;
  riskExplanation: string;
  status: "pending" | "approved" | "completed" | "failed" | "rejected";
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  verified: boolean;
  verificationDetails?: string;
}

export interface ComputerTaskWorkflow {
  taskId: string;
  intent: string;
  currentPhase: TaskExecutionPhase;
  steps: ComputerTaskStep[];
  planId?: string;
  approvalToken?: string;
  executionGrantToken?: string;
  success: boolean;
  summary: string;
  completedAt?: number;
}
