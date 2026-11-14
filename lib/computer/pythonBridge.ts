/**
 * @file lib/computer/pythonBridge.ts
 * @description Native Subprocess Bridge to Python Computer Intelligence Subsystem.
 *
 * Subsystem:
 * Computer Intelligence Architecture - Subprocess Communication Bridge.
 *
 * Key Responsibilities:
 * - Executes commands against `ultron_engine.computer.computer_intelligence_cli`.
 * - Uses standard Python executable resolution via `resolvePythonExecutable()`.
 * - Supports robust stdin-based JSON payload transport to handle large payloads.
 * - Handles execution timeouts, process failures, malformed JSON, and missing Python runtimes.
 * - Enforces fail-closed error handling: returns structured error results rather than throwing.
 *
 * Architectural Role & Interactions:
 * - Low-level bridge used by all `lib/computer/` TypeScript engines.
 *
 * Safety / Security Guarantees:
 * - Windows hidden window flag enabled (`windowsHide: true`).
 * - No shell is invoked (`spawn` with direct argument array prevents shell injection).
 * - Bridge failures never report success.
 */

import { spawn } from "child_process";
import { resolvePythonExecutable } from "../pythonRuntime.ts";

export class PythonComputerBridge {
  private static _instance: PythonComputerBridge | null = null;

  public static getInstance(): PythonComputerBridge {
    if (!this._instance) {
      this._instance = new PythonComputerBridge();
    }
    return this._instance;
  }

  /**
   * Resolves the Python executable path using the shared runtime resolver.
   */
  private _resolvePython(): string {
    return resolvePythonExecutable();
  }

  /**
   * Dispatches a command and payload to the native Python Computer Intelligence CLI via stdin.
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
  ): Promise<{ success: boolean; data?: T; error?: string; exitCode?: number; [key: string]: unknown }> {
    const python = this._resolvePython();
    const payloadJson = JSON.stringify(payload);

    return new Promise((resolve) => {
      let childProcess: ReturnType<typeof spawn>;
      try {
        childProcess = spawn(
          python,
          ["-m", "ultron_engine.computer.computer_intelligence_cli", command, "--stdin"],
          {
            cwd: process.cwd(),
            windowsHide: true,
            env: {
              ...process.env,
              PYTHONIOENCODING: "utf-8",
            },
          }
        );
      } catch (spawnErr: unknown) {
        const msg = spawnErr instanceof Error ? spawnErr.message : String(spawnErr);
        return resolve({
          success: false,
          exitCode: -1,
          error: `Failed to spawn Python runtime (${python}): ${msg}`,
        });
      }

      let stdoutData = "";
      let stderrData = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          childProcess.kill("SIGKILL");
        } catch {}
        resolve({
          success: false,
          exitCode: -1,
          error: `Python Bridge Timeout: Command "${command}" exceeded ${timeoutMs}ms limit.`,
        });
      }, timeoutMs);

      childProcess.stdout.on("data", (chunk) => {
        stdoutData += chunk.toString("utf-8");
      });

      childProcess.stderr.on("data", (chunk) => {
        stderrData += chunk.toString("utf-8");
      });

      childProcess.on("error", (err) => {
        if (timedOut) return;
        clearTimeout(timer);
        resolve({
          success: false,
          exitCode: -1,
          error: `Python Bridge Process Error (${command}): ${err.message}`,
        });
      });

      childProcess.on("close", (exitCode) => {
        if (timedOut) return;
        clearTimeout(timer);

        if (exitCode !== 0 && !stdoutData.trim()) {
          return resolve({
            success: false,
            exitCode: exitCode ?? -1,
            error: `Python process exited with code ${exitCode}. Stderr: ${stderrData.trim() || "(empty)"}`,
          });
        }

        try {
          const parsed = JSON.parse(stdoutData.trim());
          if (exitCode !== 0 && parsed.success !== false) {
            parsed.success = false;
            parsed.exitCode = exitCode;
          }
          resolve(parsed);
        } catch (jsonErr: unknown) {
          resolve({
            success: false,
            exitCode: exitCode ?? -1,
            error: `Failed to parse Python response JSON: ${stdoutData.slice(0, 200)}... Stderr: ${stderrData.trim()}`,
          });
        }
      });

      // Write payload to stdin and close pipe
      try {
        childProcess.stdin.write(payloadJson);
        childProcess.stdin.end();
      } catch (writeErr: unknown) {
        clearTimeout(timer);
        const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
        resolve({
          success: false,
          exitCode: -1,
          error: `Failed to write payload to Python stdin: ${msg}`,
        });
      }
    });
  }
}

export const defaultPythonBridge = PythonComputerBridge.getInstance();
