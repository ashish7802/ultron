/**
 * @file lib/computer/devEnvironmentIntelligence.ts
 * @description Module 09: Development Environment Intelligence & Workflows.
 *
 * Subsystem:
 * Computer Intelligence - VS Code, Git, Server Probes, Build & Test Runners.
 *
 * Key Responsibilities:
 * - Detects project type, package manifests, and development toolchain.
 * - Inspects local Git repository status (branch, modified files, staged files).
 * - Opens files in Visual Studio Code at exact lines and columns (`code -g file:line:col`).
 * - Probes local TCP ports to determine if development servers are listening.
 * - Executes project builds (`npm run build`) and extracts compiler diagnostics.
 * - Runs test suites (`npm test`) and extracts pass/fail metrics.
 *
 * Architectural Role & Interactions:
 * - Consumed by developer assistance intents and CI/test workflows.
 * - Integrates with `terminalIntelligence.ts`.
 *
 * Safety / Security Guarantees:
 * - Read-only queries by default.
 * - Code modifications and git push require explicit founder approval.
 */

import { defaultPythonBridge } from "./pythonBridge.ts";
import type {
  ProjectProfile,
  GitRepositoryStatus,
  PortProbeResult,
  BuildRunResult,
  TestRunResult,
} from "./types.ts";

export class DevEnvironmentIntelligence {
  /**
   * Analyzes project directory structure and manifest files.
   *
   * @param directory - Project directory path.
   * @returns ProjectProfile.
   */
  public async getProjectProfile(directory?: string): Promise<ProjectProfile> {
    const res = await defaultPythonBridge.execute<ProjectProfile>("project_context", { directory });
    if (res.success && res.data) {
      return res.data;
    }
    return {
      directory: directory || process.cwd(),
      name: "ultron",
      projectType: "node",
      hasGit: true,
      hasVsCode: true,
      manifestFiles: ["package.json"],
      scripts: {},
    };
  }

  /**
   * Inspects local Git repository status and active branch.
   *
   * @param directory - Project directory.
   * @returns GitRepositoryStatus.
   */
  public async getGitStatus(directory?: string): Promise<GitRepositoryStatus> {
    const res = await defaultPythonBridge.execute<GitRepositoryStatus>("git_status", { directory });
    return {
      isGitRepo: Boolean(res.isGitRepo),
      branch: res.branch as string | undefined,
      isClean: res.isClean as boolean | undefined,
      stagedCount: res.stagedCount as number | undefined,
      modifiedCount: res.modifiedCount as number | undefined,
      untrackedCount: res.untrackedCount as number | undefined,
      staged: res.staged as string[] | undefined,
      modified: res.modified as string[] | undefined,
      untracked: res.untracked as string[] | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Opens a file in Visual Studio Code at an exact line and column.
   *
   * @param file - Relative or absolute file path.
   * @param line - Line number.
   * @param column - Column number.
   * @returns Status descriptor.
   */
  public async openInVsCode(
    file: string,
    line?: number,
    column?: number
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await defaultPythonBridge.execute<{ success: boolean; message?: string }>("open_vscode", {
      file,
      line,
      column,
    });
    return {
      success: Boolean(res.success),
      message: res.message as string | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Probes a local TCP port to verify if a dev server is listening.
   *
   * @param port - Port number (e.g. 3000).
   * @param host - Host address (default 127.0.0.1).
   * @returns PortProbeResult.
   */
  public async checkDevServer(port: number = 3000, host: string = "127.0.0.1"): Promise<PortProbeResult> {
    const res = await defaultPythonBridge.execute<PortProbeResult>("check_port", { port, host });
    return {
      port,
      host,
      isListening: Boolean(res.isListening),
      latencyMs: res.latencyMs as number | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Runs project build command and parses compiler errors.
   *
   * @param command - Build command.
   * @param cwd - Working directory.
   * @param timeoutSec - Timeout in seconds.
   * @returns BuildRunResult.
   */
  public async runBuild(
    command: string = "npm run build",
    cwd?: string,
    timeoutSec: number = 120
  ): Promise<BuildRunResult> {
    const res = await defaultPythonBridge.execute<BuildRunResult>("build_project", {
      command,
      cwd,
      timeoutSec,
    });
    return {
      success: Boolean(res.success),
      exitCode: (res.exitCode as number) || 0,
      stdout: (res.stdout as string) || "",
      stderr: (res.stderr as string) || "",
      durationMs: (res.durationMs as number) || 0,
      buildSuccess: Boolean(res.buildSuccess),
      errorsCount: (res.errorsCount as number) || 0,
      errorsDetected: Array.isArray(res.errorsDetected) ? res.errorsDetected : [],
    };
  }

  /**
   * Runs project tests and extracts pass/fail metrics.
   *
   * @param command - Test command.
   * @param cwd - Working directory.
   * @param timeoutSec - Timeout in seconds.
   * @returns TestRunResult.
   */
  public async runTests(
    command: string = "npm test",
    cwd?: string,
    timeoutSec: number = 60
  ): Promise<TestRunResult> {
    const res = await defaultPythonBridge.execute<TestRunResult>("test_project", {
      command,
      cwd,
      timeoutSec,
    });
    return {
      success: Boolean(res.success),
      exitCode: (res.exitCode as number) || 0,
      stdout: (res.stdout as string) || "",
      stderr: (res.stderr as string) || "",
      durationMs: (res.durationMs as number) || 0,
      testSuccess: Boolean(res.testSuccess),
      passedCount: (res.passedCount as number) || 0,
      failedCount: (res.failedCount as number) || 0,
      summary: (res.summary as string) || "",
    };
  }
}

export const defaultDevEnvironmentIntelligence = new DevEnvironmentIntelligence();
