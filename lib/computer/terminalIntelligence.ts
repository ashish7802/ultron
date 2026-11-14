/**
 * @file lib/computer/terminalIntelligence.ts
 * @description Module 07: Terminal Intelligence & Controlled Execution Supervisor.
 *
 * Subsystem:
 * Computer Intelligence - Host Shells & Subprocess Supervision.
 *
 * Key Responsibilities:
 * - Identifies installed host shells: Windows PowerShell, PowerShell 7, CMD, Git Bash, WSL.
 * - Performs static risk analysis on shell commands before execution.
 * - Dispatches synchronous commands with strict timeouts and output capture.
 * - Manages long-running background processes (spawning, status polling, graceful kill).
 * - Maintains bounded command execution history.
 * - Blocks destructive commands fail-closed.
 *
 * Architectural Role & Interactions:
 * - Consumed by `workflowOrchestrator.ts` and dev environment workflows.
 * - Gated by Permission Gateway for high-risk operations.
 *
 * Safety / Security Guarantees:
 * - Execution timeouts strictly enforced (default 30s).
 * - Format and core system deletion commands are rejected.
 * - Emergency Stop immediately kills all active background jobs.
 */

import { defaultPythonBridge } from "./pythonBridge.ts";
import type {
  TerminalShellDescriptor,
  CommandRiskAnalysis,
  CommandExecutionResult,
  BackgroundJobStatus,
} from "./types.ts";

export class TerminalIntelligence {
  /**
   * Identifies all available shell emulators on the host.
   *
   * @returns Record mapping shell name to descriptor.
   */
  public async getAvailableShells(): Promise<Record<string, TerminalShellDescriptor>> {
    const res = await defaultPythonBridge.execute<Record<string, TerminalShellDescriptor>>("shells");
    if (res.success && res.data) {
      return res.data;
    }
    return {
      powershell: {
        name: "Windows PowerShell",
        path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        default: true,
      },
    };
  }

  /**
   * Analyzes security risk of a shell command line.
   *
   * @param command - Command string.
   * @returns CommandRiskAnalysis object.
   */
  public async analyzeRisk(command: string): Promise<CommandRiskAnalysis> {
    const res = await defaultPythonBridge.execute<CommandRiskAnalysis>("validate_safety", {
      action: "shell",
      target: command,
    });
    return {
      riskLevel: (res.riskLevel as CommandRiskAnalysis["riskLevel"]) || "low",
      isBlocked: Boolean(res.blocked),
      requiresApproval: Boolean(res.requiresApproval),
      reason: (res.reason as string) || "Standard command",
    };
  }

  /**
   * Executes a shell command synchronously with timeout.
   *
   * @param command - Command string.
   * @param shellName - Target shell ('powershell' | 'cmd' | 'git_bash' | 'pwsh').
   * @param cwd - Working directory.
   * @param timeoutSec - Timeout in seconds (default 30).
   * @returns CommandExecutionResult.
   */
  public async executeCommand(
    command: string,
    shellName: string = "powershell",
    cwd?: string,
    timeoutSec: number = 30,
    approvalGranted?: boolean
  ): Promise<CommandExecutionResult> {
    const res = await defaultPythonBridge.execute<CommandExecutionResult>("exec_cmd", {
      command,
      shell: shellName,
      cwd,
      timeoutSec,
      approvalGranted: Boolean(approvalGranted),
    });
    return {
      success: Boolean(res.success),
      exitCode: typeof res.exitCode === "number" ? res.exitCode : -1,
      stdout: (res.stdout as string) || "",
      stderr: (res.stderr as string) || (res.error as string) || "",
      durationMs: typeof res.durationMs === "number" ? res.durationMs : 0,
      commandId: res.commandId as string | undefined,
      blocked: res.blocked as boolean | undefined,
      timedOut: res.timedOut as boolean | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Starts a long-running process asynchronously in the background.
   *
   * @param command - Command string.
   * @param shellName - Target shell.
   * @param cwd - Working directory.
   * @returns Descriptor with jobId and pid.
   */
  public async startBackgroundJob(
    command: string,
    shellName: string = "powershell",
    cwd?: string,
    approvalGranted?: boolean
  ): Promise<{ success: boolean; jobId?: string; pid?: number; error?: string }> {
    const res = await defaultPythonBridge.execute<{ jobId: string; pid: number }>("start_job", {
      command,
      shell: shellName,
      cwd,
      approvalGranted: Boolean(approvalGranted),
    });
    return {
      success: Boolean(res.success),
      jobId: res.jobId as string | undefined,
      pid: res.pid as number | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Polls the status and output of an active background job.
   *
   * @param jobId - Job identifier.
   * @returns BackgroundJobStatus.
   */
  public async pollJob(jobId: string): Promise<BackgroundJobStatus> {
    const res = await defaultPythonBridge.execute<BackgroundJobStatus>("poll_job", { jobId });
    return {
      success: Boolean(res.success),
      jobId: (res.jobId as string) || jobId,
      pid: (res.pid as number) || 0,
      command: (res.command as string) || "",
      isRunning: Boolean(res.isRunning),
      exitCode: typeof res.exitCode === "number" ? res.exitCode : null,
      stdout: (res.stdout as string) || "",
      stderr: (res.stderr as string) || "",
      runtimeSeconds: (res.runtimeSeconds as number) || 0,
      error: res.error as string | undefined,
    };
  }

  /**
   * Terminates an active background process.
   *
   * @param jobId - Job identifier.
   * @returns Boolean success flag.
   */
  public async terminateJob(jobId: string): Promise<boolean> {
    const res = await defaultPythonBridge.execute<{ success: boolean }>("kill_job", { jobId });
    return Boolean(res.success);
  }
}

export const defaultTerminalIntelligence = new TerminalIntelligence();
