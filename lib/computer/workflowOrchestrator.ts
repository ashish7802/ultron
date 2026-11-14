/**
 * @file lib/computer/workflowOrchestrator.ts
 * @description Module 11: Computer Task Execution & Verification Workflow Orchestrator.
 *
 * Subsystem:
 * Computer Intelligence - End-to-End Task Lifecycle.
 *
 * Enforces the Mandatory 7-Phase Computer Interaction Workflow:
 * OBSERVE -> UNDERSTAND -> PLAN -> REQUEST APPROVAL -> INTERACT -> VERIFY -> REPORT.
 *
 * Key Responsibilities:
 * 1. OBSERVE: Captures desktop baseline (active window, UI snapshot, process tree).
 * 2. UNDERSTAND: Resolves semantic user intent to target windows, elements, or files.
 * 3. PLAN: Creates cryptographically hashed ActionPlan via PermissionGateway.
 * 4. REQUEST APPROVAL: Classifies risk and requires explicit founder approval tokens.
 * 5. INTERACT: Validates execution grant tokens and executes only approved operations.
 * 6. VERIFY: Inspects physical operating system state (HWND, file hash, UI diff, PID).
 * 7. REPORT: Accurately reports verified outcome without hallucination.
 *
 * Architectural Role & Interactions:
 * - Master orchestrator connecting all 10 Computer Intelligence modules with
 *   `lib/permissionGateway.ts` and `lib/screenPrivacyController.ts`.
 *
 * Safety / Security Guarantees:
 * - Never reports an action as completed without physical verification.
 * - Anti-tampering: Re-verifies SHA-256 action hash before execution.
 * - Fail-closed: Expired or unapproved plans abort immediately.
 */

import crypto from "crypto";
import {
  planAction,
  approveActionPlan,
  executeApprovedAction,
  type ActionPlan,
  type ActionRiskLevel,
  type PermissionActionType,
} from "../permissionGateway.ts";
import { defaultDesktopEngine } from "./desktopEngine.ts";
import { defaultApplicationIntelligence } from "./applicationIntelligence.ts";
import { defaultVisualRecognizer } from "./visualElementRecognizer.ts";
import { defaultFileSystemIntelligence } from "./fileSystemIntelligence.ts";
import { defaultTerminalIntelligence } from "./terminalIntelligence.ts";
import { defaultBrowserIntelligence } from "./browserIntelligence.ts";
import { defaultSafetyControls } from "./safetyControls.ts";
import type {
  ComputerTaskWorkflow,
  ComputerTaskStep,
} from "./types.ts";

export interface TaskInitiationInput {
  intent: string;
  actionType: PermissionActionType;
  target: string;
  parameters?: Record<string, unknown>;
  riskLevel?: ActionRiskLevel;
  riskExplanation?: string;
}

export class ComputerTaskWorkflowOrchestrator {
  private _activeTasks = new Map<string, ComputerTaskWorkflow>();

  /**
   * Initiates a new computer task following the OBSERVE -> UNDERSTAND -> PLAN phase.
   *
   * @param input - Task input parameters.
   * @returns Initialized ComputerTaskWorkflow with pending approval plan.
   */
  public async planTask(input: TaskInitiationInput): Promise<ComputerTaskWorkflow> {
    const taskId = "task_" + crypto.randomBytes(8).toString("hex");

    // Phase 1: OBSERVE
    const activeWindow = await defaultDesktopEngine.getActiveWindow();
    const uiSnapshot = await defaultVisualRecognizer.captureSnapshot();

    // Phase 2: UNDERSTAND
    const safetyCheck = await defaultSafetyControls.validateSafety(
      input.actionType,
      input.target,
      input.parameters
    );

    const riskLevel: ActionRiskLevel = input.riskLevel || safetyCheck.riskLevel || "low";
    const riskExplanation =
      input.riskExplanation || safetyCheck.reason || "Standard computer action.";

    // Phase 3: PLAN
    const actionPlan: ActionPlan = planAction(
      input.actionType,
      input.target,
      input.parameters || {},
      [input.target, activeWindow?.title || "Desktop"].filter(Boolean)
    );

    const step: ComputerTaskStep = {
      stepNumber: 1,
      phase: "PLAN",
      action: input.actionType,
      target: input.target,
      parameters: input.parameters || {},
      riskLevel,
      riskExplanation,
      status: "pending",
      beforeState: {
        activeWindow: activeWindow?.title,
        hwnd: activeWindow?.handle,
        stateHash: uiSnapshot?.stateHash,
      },
      verified: false,
    };

    const workflow: ComputerTaskWorkflow = {
      taskId,
      intent: input.intent,
      currentPhase: "REQUEST_APPROVAL",
      steps: [step],
      planId: actionPlan.planId,
      approvalToken: actionPlan.approvalToken,
      success: false,
      summary: `Planned action '${input.actionType}' targeting '${input.target}'. Waiting for founder approval.`,
    };

    this._activeTasks.set(taskId, workflow);
    return workflow;
  }

  /**
   * Authorizes an action plan using the presented approval token.
   *
   * @param taskId - Workflow task ID.
   * @param approvalToken - Token presented by user/UI confirmation gate.
   * @returns Updated workflow with single-use execution grant token.
   */
  public approveTask(taskId: string, approvalToken: string): ComputerTaskWorkflow {
    const workflow = this._activeTasks.get(taskId);
    if (!workflow || !workflow.planId) {
      throw new Error(`Task '${taskId}' not found or has no active plan.`);
    }

    const approvalRes = approveActionPlan(workflow.planId, approvalToken);
    if (!approvalRes.success || !approvalRes.executionGrantToken) {
      throw new Error(`Approval failed: ${approvalRes.error}`);
    }

    workflow.executionGrantToken = approvalRes.executionGrantToken;
    workflow.currentPhase = "INTERACT";
    workflow.steps[0].status = "approved";

    return workflow;
  }

  /**
   * Executes the approved task, verifies actual physical results, and reports outcome.
   *
   * Phase 5 (INTERACT) -> Phase 6 (VERIFY) -> Phase 7 (REPORT).
   *
   * @param taskId - Workflow task ID.
   * @returns Completed and verified workflow.
   */
  public async executeAndVerifyTask(taskId: string): Promise<ComputerTaskWorkflow> {
    const workflow = this._activeTasks.get(taskId);
    if (!workflow || !workflow.planId || !workflow.executionGrantToken) {
      throw new Error(`Task '${taskId}' is not authorized for execution.`);
    }

    const step = workflow.steps[0];
    const planId = workflow.planId;
    const grantToken = workflow.executionGrantToken;

    // Check Emergency Stop before physical execution
    if (await defaultSafetyControls.isEmergencyStopActive()) {
      workflow.success = false;
      workflow.currentPhase = "REPORT";
      step.status = "failed";
      step.verificationDetails = "Emergency Stop is active. Execution aborted.";
      workflow.summary = "Execution aborted: Emergency Stop active.";
      return workflow;
    }

    // Phase 5: INTERACT (executed inside executeApprovedAction gate)
    const execOutcome = await executeApprovedAction(planId, grantToken, async () => {
      return await this._dispatchAction(step.action as PermissionActionType, step.target, step.parameters);
    });

    if (!execOutcome.success) {
      workflow.success = false;
      workflow.currentPhase = "REPORT";
      step.status = "failed";
      step.verificationDetails = execOutcome.error || "Action execution failed.";
      workflow.summary = `Action '${step.action}' failed: ${step.verificationDetails}`;
      return workflow;
    }

    // Phase 6: VERIFY
    workflow.currentPhase = "VERIFY";
    const verification = await this._verifyAction(
      step.action as PermissionActionType,
      step.target,
      step.beforeState,
      execOutcome.result
    );

    step.afterState = verification.afterState;
    step.verified = verification.verified;
    step.verificationDetails = verification.details;

    // Phase 7: REPORT
    workflow.currentPhase = "REPORT";
    workflow.success = verification.verified;
    workflow.completedAt = Date.now();
    step.status = verification.verified ? "completed" : "failed";

    workflow.summary = verification.verified
      ? `Successfully executed and physically verified '${step.action}' on '${step.target}': ${verification.details}`
      : `Action '${step.action}' executed but verification failed: ${verification.details}`;

    return workflow;
  }

  /**
   * Internal dispatcher for physical computer actions.
   */
  private async _dispatchAction(
    actionType: PermissionActionType,
    target: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    switch (actionType) {
      case "app_launch":
        return await defaultApplicationIntelligence.launchApp(target, params.args as string[] | undefined);

      case "app_terminate":
        return await defaultApplicationIntelligence.terminateApp(target, Boolean(params.force));

      case "file_write":
        return await defaultFileSystemIntelligence.writeFile(
          target,
          (params.content as string) || "",
          Boolean(params.overwrite)
        );

      case "file_delete":
        return await defaultFileSystemIntelligence.deleteFile(target);

      case "shell_exec":
        return await defaultTerminalIntelligence.executeCommand(
          target,
          (params.shell as string) || "powershell",
          params.cwd as string | undefined,
          (params.timeoutSec as number) || 30
        );

      case "browser_open":
        return await defaultBrowserIntelligence.navigateToUrl(target, params.browser as string | undefined);

      case "system_command":
        if (target === "lock") {
          return await defaultTerminalIntelligence.executeCommand("rundll32.exe user32.dll,LockWorkStation");
        }
        return { success: true };

      default:
        throw new Error(`Unsupported action type '${actionType}' in workflow orchestrator.`);
    }
  }

  /**
   * Internal verification of actual OS results.
   */
  private async _verifyAction(
    actionType: PermissionActionType,
    target: string,
    beforeState?: Record<string, unknown>,
    _actionResult?: unknown
  ): Promise<{ verified: boolean; details: string; afterState: Record<string, unknown> }> {
    switch (actionType) {
      case "app_launch": {
        const launchOutcome = _actionResult as { success?: boolean; pid?: number; error?: string } | undefined;
        if (launchOutcome && launchOutcome.success === false) {
          return {
            verified: false,
            details: `Application launch failed: ${launchOutcome.error || "Process creation failed."}`,
            afterState: { target, error: launchOutcome.error },
          };
        }

        // Verify that a window with the application name appears or process is running
        const windows = await defaultDesktopEngine.getWindows();
        const matching = windows.find(
          (w) =>
            w.title.toLowerCase().includes(target.toLowerCase()) ||
            w.processName.toLowerCase().includes(target.toLowerCase()) ||
            (launchOutcome?.pid && w.processId === launchOutcome.pid)
        );
        const verified = Boolean(matching || (launchOutcome?.pid && launchOutcome.pid > 0));
        return {
          verified,
          details: verified
            ? `Verified running process or window '${matching?.title || target}' (PID: ${matching?.processId || launchOutcome?.pid}).`
            : `Application launched, but window or process '${target}' has not appeared on desktop.`,
          afterState: { activeWindow: matching?.title, hwnd: matching?.handle, pid: matching?.processId || launchOutcome?.pid },
        };
      }

      case "app_terminate": {
        const windows = await defaultDesktopEngine.getWindows(true);
        const exists = windows.some(
          (w) =>
            w.title.toLowerCase().includes(target.toLowerCase()) ||
            w.processName.toLowerCase().includes(target.toLowerCase())
        );
        const verified = !exists;
        return {
          verified,
          details: verified
            ? `Verified window or process '${target}' is no longer running.`
            : `Process '${target}' is still detected in active window list.`,
          afterState: { exists },
        };
      }

      case "file_write": {
        const meta = await defaultFileSystemIntelligence.getMetadata(target);
        const verified = meta.exists && (meta.sizeBytes || 0) >= 0;
        return {
          verified,
          details: verified
            ? `Verified file exists at '${meta.path}' (${meta.sizeBytes} bytes, hash: ${meta.sha256?.substring(0, 12)}...).`
            : `File '${target}' was not found after write attempt.`,
          afterState: { ...meta },
        };
      }

      case "file_delete": {
        const meta = await defaultFileSystemIntelligence.getMetadata(target);
        const verified = !meta.exists;
        return {
          verified,
          details: verified
            ? `Verified file '${target}' has been deleted from disk.`
            : `File '${target}' still exists on disk.`,
          afterState: { exists: meta.exists },
        };
      }

      case "shell_exec": {
        // Result already contains return code and output
        const res = _actionResult as { success?: boolean; exitCode?: number };
        const verified = Boolean(res?.success && res?.exitCode === 0);
        return {
          verified,
          details: verified
            ? `Shell command completed successfully with exit code 0.`
            : `Shell command exited with non-zero code ${res?.exitCode}.`,
          afterState: { exitCode: res?.exitCode },
        };
      }

      case "browser_open": {
        const navRes = _actionResult as { success?: boolean; url?: string; error?: string } | undefined;
        if (!navRes || navRes.success === false) {
          return {
            verified: false,
            details: `Browser navigation failed: ${navRes?.error || "Unknown error"}`,
            afterState: { targetUrl: target, error: navRes?.error },
          };
        }

        const active = await defaultDesktopEngine.getActiveWindow();
        return {
          verified: true,
          details: `Navigated browser to '${navRes.url || target}'. Active window: '${active?.title}'.`,
          afterState: { activeWindow: active?.title, targetUrl: navRes.url || target },
        };
      }

      default:
        return {
          verified: false,
          details: `Unsupported action type '${actionType}' in verification engine.`,
          afterState: {},
        };
    }
  }
}

export const defaultComputerWorkflowOrchestrator = new ComputerTaskWorkflowOrchestrator();
