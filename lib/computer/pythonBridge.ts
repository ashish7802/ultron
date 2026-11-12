/**
 * @file lib/computer/pythonBridge.ts
 * @description Native Subprocess Bridge to Python Computer Intelligence Subsystem.
 *
 * Subsystem:
 * Computer Intelligence Architecture - Subprocess Communication Bridge.
 *
 * Key Responsibilities:
 * - Executes commands against `ultron_engine.computer.computer_intelligence_cli`.
 * - Serializes parameters into structured JSON command line arguments.
 * - Handles execution timeouts, process failures, and error deserialization.
 * - Enforces fail-closed error handling: returns structured error results rather than throwing.
 *
 * Architectural Role & Interactions:
 * - Low-level bridge used by all `lib/computer/` TypeScript engines.
 *
 * Safety / Security Guarantees:
 * - Windows hidden window flag enabled (`windowsHide: true`).
 * - No shell is invoked (`execFile` with direct argument array prevents shell injection).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export class PythonComputerBridge {
  private static _instance: PythonComputerBridge | null = null;

  public static getInstance(): PythonComputerBridge {
    if (!this._instance) {
      this._instance = new PythonComputerBridge();
    }
    return this._instance;
  }

  /**
   * Resolves the Python executable path.
   */
  private _resolvePython(): string {
    return process.env.PYTHON_PATH || "python";
  }

  /**
   * Dispatches a command and payload to the native Python Computer Intelligence CLI.
   *
   * @param command - Command string matching CLI dispatcher.
   * @param payload - JSON-serializable parameters.
   * @param timeoutMs - Subprocess timeout in milliseconds (default 30s).
   * @returns Deserialized result object.
   */
  public async execute<T>(
    command: string,
    payload: Record<string, unknown> = {},
    timeoutMs: number = 30000
  ): Promise<{ success: boolean; data?: T; error?: string; [key: string]: unknown }> {
    const python = this._resolvePython();
    const payloadJson = JSON.stringify(payload);

    try {
      const { stdout } = await execFileAsync(
        python,
        ["-m", "ultron_engine.computer.computer_intelligence_cli", command, payloadJson],
        {
          cwd: process.cwd(),
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        }
      );

      const parsed = JSON.parse(stdout.trim());
      return parsed;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Python Computer Bridge Error (${command}): ${errorMsg}`,
      };
    }
  }
}

export const defaultPythonBridge = PythonComputerBridge.getInstance();
