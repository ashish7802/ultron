/**
 * @file lib/computer/toolRegistry.ts
 * @description Central Computer Execution Tool Registry for ULTRON.
 *
 * Subsystem:
 * Computer Intelligence Architecture & Execution Subsystem (Module 12 / Milestone 2).
 *
 * Key Responsibilities:
 * - Maintains a strongly-typed registry of available computer automation tools.
 * - Bridges tool discovery and execution with the Central Permission Gateway and Action Gateway.
 * - Enforces the Non-Negotiable Principle: Real execution with zero synthetic success responses.
 * - Handles tool execution across:
 *   - Application lifecycle (launch, terminate, inspect)
 *   - File system management (read, write, delete, search, duplicate analysis)
 *   - Terminal command execution (safe shells with exit code & timeout monitoring)
 *   - Browser control (navigation, URL inspection)
 * - Feeds physical execution outputs directly into LLM reasoning loops.
 *
 * Architectural Role & Safety Guarantees:
 * - Consumed by `app/api/chat/route.ts` and `lib/orchestration/orchestrator.ts`.
 * - Validates execution authorization with `PermissionGateway` before invoking physical drivers.
 * - Verifies side effects independently through OS inspection.
 * - Strict adherence to ULTRON AGENTS.md documentation standards.
 */

import {
  planAction,
  approveActionPlan,
  executeApprovedAction,
  type ActionPlan,
  type ActionRiskLevel,
  type PermissionActionType,
} from "../permissionGateway.ts";
import { defaultApplicationIntelligence } from "./applicationIntelligence.ts";
import { defaultFileSystemIntelligence } from "./fileSystemIntelligence.ts";
import { defaultTerminalIntelligence } from "./terminalIntelligence.ts";
import { defaultBrowserIntelligence } from "./browserIntelligence.ts";
import { defaultDesktopEngine } from "./desktopEngine.ts";
import { defaultSafetyControls } from "./safetyControls.ts";

/**
 * Definition of a parameter accepted by a registered tool.
 */
export interface ToolParameterDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  default?: unknown;
}

/**
 * Metadata and execution signature for a registered computer tool.
 */
export interface ComputerToolDefinition {
  name: string;
  category: "app" | "filesystem" | "terminal" | "browser" | "system";
  actionType: PermissionActionType;
  description: string;
  riskLevel: ActionRiskLevel;
  parameters: ToolParameterDefinition[];
  execute: (params: Record<string, unknown>, context?: ToolExecutionContext) => Promise<ToolExecutionResult>;
}

/**
 * Context provided to tool execution (authorization tokens, caller info).
 */
export interface ToolExecutionContext {
  planId?: string;
  executionGrantToken?: string;
  userId?: string;
  tenantId?: string;
  approvalGranted?: boolean;
}

/**
 * Standardized result returned by tool execution.
 */
export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  actionType: PermissionActionType;
  target: string;
  output?: string;
  data?: Record<string, unknown>;
  error?: string;
  exitCode?: number;
  durationMs: number;
  verified: boolean;
  verificationDetails?: string;
  permissionPlan?: ActionPlan;
}

export class ComputerToolRegistry {
  private _tools = new Map<string, ComputerToolDefinition>();

  constructor() {
    this._registerDefaultTools();
  }

  /**
   * Registers a new tool in the central registry.
   *
   * @param tool - Tool definition object.
   */
  public registerTool(tool: ComputerToolDefinition): void {
    this._tools.set(tool.name, tool);
  }

  /**
   * Retrieves a registered tool by its unique name.
   *
   * @param name - Tool identifier.
   * @returns Tool definition or undefined if not registered.
   */
  public getTool(name: string): ComputerToolDefinition | undefined {
    return this._tools.get(name);
  }

  /**
   * Returns all registered computer tools.
   *
   * @returns Array of registered tool definitions.
   */
  public getAllTools(): ComputerToolDefinition[] {
    return Array.from(this._tools.values());
  }

  /**
   * Formats tool signatures into a concise prompt for LLM decision making.
   *
   * @returns Formatted markdown description of available tools.
   */
  public getToolsPromptDescription(): string {
    const lines: string[] = [
      "### AVAILABLE COMPUTER EXECUTION TOOLS:",
      "To perform operational tasks, invoke one of the following registered tools with valid parameters:",
    ];

    for (const tool of this._tools.values()) {
      const paramsDesc = tool.parameters
        .map((p) => `${p.name} (${p.type}${p.required ? ", required" : ", optional"}): ${p.description}`)
        .join("; ");
      lines.push(`- **${tool.name}** [Risk: ${tool.riskLevel.toUpperCase()}]: ${tool.description}. Parameters: { ${paramsDesc} }`);
    }

    return lines.join("\n");
  }

  /**
   * Executes a registered tool safely through authorization checks and physical drivers.
   *
   * Execution Pipeline:
   * 1. Validates Emergency Stop (fails closed if active).
   * 2. Evaluates action risk and verifies approval requirement.
   * 3. If approval is required and no grant token is provided, returns pending `permissionPlan`.
   * 4. Executes physical operation through the appropriate driver.
   * 5. Performs independent verification of side effects.
   *
   * @param name - Name of registered tool.
   * @param params - Parameters for the tool.
   * @param context - Execution context with optional authorization tokens.
   * @returns Standardized ToolExecutionResult.
   */
  public async executeTool(
    name: string,
    params: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const tool = this._tools.get(name);
    if (!tool) {
      return {
        success: false,
        toolName: name,
        actionType: "system_command",
        target: name,
        error: `Tool "${name}" is not registered in the Computer Tool Registry.`,
        durationMs: Date.now() - startTime,
        verified: false,
      };
    }

    // 1. Emergency Stop Check
    const emActive = await defaultSafetyControls.isEmergencyStopActive();
    if (emActive) {
      return {
        success: false,
        toolName: name,
        actionType: tool.actionType,
        target: String(params.target || name),
        error: "Execution blocked: Emergency Stop is currently active.",
        durationMs: Date.now() - startTime,
        verified: false,
      };
    }

    // 2. High-Risk / Mutating Operations Require Approval Gate
    const target = String(params.target || params.appName || params.path || params.command || params.url || name);
    const requiresPlan = tool.riskLevel === "high" || tool.riskLevel === "critical" || tool.actionType === "shell_exec" || tool.actionType === "file_delete";

    if (requiresPlan && (!context?.planId || !context?.executionGrantToken)) {
      // Create and return an ActionPlan requiring approval
      const plan = planAction(
        tool.actionType,
        target,
        params,
        [target, "Desktop Session"].filter(Boolean)
      );

      return {
        success: false,
        toolName: name,
        actionType: tool.actionType,
        target,
        error: `Action "${tool.name}" requires explicit user approval before execution.`,
        durationMs: Date.now() - startTime,
        verified: false,
        permissionPlan: plan,
      };
    }

    // 3. Authorized or Low-Risk Execution
    try {
      if (context?.planId && context?.executionGrantToken) {
        // Execute inside approved action gate
        const outcome = await executeApprovedAction(
          context.planId,
          context.executionGrantToken,
          async () => await tool.execute(params, context)
        );

        if (!outcome.success) {
          return {
            success: false,
            toolName: name,
            actionType: tool.actionType,
            target,
            error: outcome.error || "Action execution failed in authorization gateway.",
            durationMs: Date.now() - startTime,
            verified: false,
          };
        }
        return outcome.result as ToolExecutionResult;
      }

      // Direct execution for read-only / low-risk tools
      return await tool.execute(params, context);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        toolName: name,
        actionType: tool.actionType,
        target,
        error: errMsg,
        durationMs: Date.now() - startTime,
        verified: false,
      };
    }
  }

  /**
   * Registers default computer tools into the registry.
   */
  private _registerDefaultTools(): void {
    // ── 1. App Launch Tool ────────────────────────────────────────────────
    this.registerTool({
      name: "launch_application",
      category: "app",
      actionType: "app_launch",
      description: "Launches a desktop application by name or executable path",
      riskLevel: "medium",
      parameters: [
        { name: "appName", type: "string", description: "Name or executable path of the application (e.g., 'notepad', 'calc')", required: true },
        { name: "args", type: "array", description: "Optional command line arguments to pass to the process", required: false },
      ],
      execute: async (params) => {
        const startTime = Date.now();
        const appName = String(params.appName || "");
        const args = Array.isArray(params.args) ? (params.args as string[]) : undefined;

        const launchRes = await defaultApplicationIntelligence.launchApp(appName, args);
        if (!launchRes.success) {
          return {
            success: false,
            toolName: "launch_application",
            actionType: "app_launch",
            target: appName,
            error: launchRes.error || `Failed to launch ${appName}`,
            durationMs: Date.now() - startTime,
            verified: false,
          };
        }

        // Verify window existence on desktop
        const windows = await defaultDesktopEngine.getWindows();
        const found = windows.find((w) =>
          w.title.toLowerCase().includes(appName.toLowerCase()) ||
          w.processName.toLowerCase().includes(appName.toLowerCase())
        );

        return {
          success: true,
          toolName: "launch_application",
          actionType: "app_launch",
          target: appName,
          output: `Launched ${appName} successfully (PID: ${launchRes.processId || found?.processId || "active"}).`,
          data: { processId: launchRes.processId, windowTitle: found?.title },
          durationMs: Date.now() - startTime,
          verified: Boolean(found || launchRes.processId),
          verificationDetails: found ? `Verified running window "${found.title}"` : "Process launched via OS handle.",
        };
      },
    });

    // ── 2. File Write Tool ────────────────────────────────────────────────
    this.registerTool({
      name: "write_file",
      category: "filesystem",
      actionType: "file_write",
      description: "Writes or creates a text file on the local file system",
      riskLevel: "medium",
      parameters: [
        { name: "path", type: "string", description: "Target file path", required: true },
        { name: "content", type: "string", description: "Text content to write to the file", required: true },
        { name: "overwrite", type: "boolean", description: "Whether to overwrite if file already exists", required: false, default: true },
      ],
      execute: async (params) => {
        const startTime = Date.now();
        const filePath = String(params.path || "");
        const content = String(params.content || "");
        const overwrite = params.overwrite !== false;

        const writeRes = await defaultFileSystemIntelligence.writeFile(filePath, content, overwrite);
        if (!writeRes.success) {
          return {
            success: false,
            toolName: "write_file",
            actionType: "file_write",
            target: filePath,
            error: writeRes.error || "Failed to write file.",
            durationMs: Date.now() - startTime,
            verified: false,
          };
        }

        // Verify file on disk
        const meta = await defaultFileSystemIntelligence.getMetadata(filePath);
        const verified = meta.exists && (meta.sizeBytes || 0) >= 0;

        return {
          success: verified,
          toolName: "write_file",
          actionType: "file_write",
          target: filePath,
          output: `Wrote ${content.length} characters to ${filePath}. File size: ${meta.sizeBytes} bytes.`,
          data: { path: meta.path, sizeBytes: meta.sizeBytes, sha256: meta.sha256 },
          durationMs: Date.now() - startTime,
          verified,
          verificationDetails: verified ? `Verified physical file exists (${meta.sizeBytes} bytes, SHA256: ${meta.sha256?.substring(0, 8)})` : "File not found on disk after write.",
        };
      },
    });

    // ── 3. File Read Tool ────────────────────────────────────────────────
    this.registerTool({
      name: "read_file",
      category: "filesystem",
      actionType: "file_read",
      description: "Reads the content of a file from the local file system",
      riskLevel: "low",
      parameters: [
        { name: "path", type: "string", description: "Path to file to read", required: true },
        { name: "maxLines", type: "number", description: "Maximum lines to read", required: false, default: 200 },
      ],
      execute: async (params) => {
        const startTime = Date.now();
        const filePath = String(params.path || "");
        const maxLines = typeof params.maxLines === "number" ? params.maxLines : 200;

        const readRes = await defaultFileSystemIntelligence.readFile(filePath, maxLines);
        if (!readRes.success) {
          return {
            success: false,
            toolName: "read_file",
            actionType: "file_read",
            target: filePath,
            error: readRes.error || "Failed to read file.",
            durationMs: Date.now() - startTime,
            verified: false,
          };
        }

        return {
          success: true,
          toolName: "read_file",
          actionType: "file_read",
          target: filePath,
          output: readRes.content,
          data: { lineCount: readRes.lineCount, truncated: readRes.truncated },
          durationMs: Date.now() - startTime,
          verified: true,
          verificationDetails: `Successfully read ${readRes.lineCount} lines from ${filePath}.`,
        };
      },
    });

    // ── 4. File Delete Tool ──────────────────────────────────────────────
    this.registerTool({
      name: "delete_file",
      category: "filesystem",
      actionType: "file_delete",
      description: "Deletes a file from the local file system",
      riskLevel: "high",
      parameters: [
        { name: "path", type: "string", description: "Target file path to delete", required: true },
      ],
      execute: async (params) => {
        const startTime = Date.now();
        const filePath = String(params.path || "");

        const delRes = await defaultFileSystemIntelligence.deleteFile(filePath);
        if (!delRes.success) {
          return {
            success: false,
            toolName: "delete_file",
            actionType: "file_delete",
            target: filePath,
            error: delRes.error || "Failed to delete file.",
            durationMs: Date.now() - startTime,
            verified: false,
          };
        }

        // Verify file no longer exists
        const meta = await defaultFileSystemIntelligence.getMetadata(filePath);
        const verified = !meta.exists;

        return {
          success: verified,
          toolName: "delete_file",
          actionType: "file_delete",
          target: filePath,
          output: `Deleted file ${filePath}.`,
          durationMs: Date.now() - startTime,
          verified,
          verificationDetails: verified ? `Verified file ${filePath} no longer exists on disk.` : "File still present after deletion call.",
        };
      },
    });

    // ── 5. File Search Tool ──────────────────────────────────────────────
    this.registerTool({
      name: "search_files",
      category: "filesystem",
      actionType: "file_read",
      description: "Searches for files matching a pattern within a directory",
      riskLevel: "low",
      parameters: [
        { name: "directory", type: "string", description: "Root directory to search", required: true },
        { name: "pattern", type: "string", description: "Search pattern or glob (e.g., '*.ts', 'test*')", required: true },
      ],
      execute: async (params) => {
        const startTime = Date.now();
        const dir = String(params.directory || ".");
        const pattern = String(params.pattern || "*");

        const matches = await defaultFileSystemIntelligence.searchFiles(pattern, dir);
        const filePaths = matches.map((m) => m.path);
        return {
          success: true,
          toolName: "search_files",
          actionType: "file_read",
          target: `${dir}/${pattern}`,
          output: filePaths.length > 0 ? filePaths.join("\n") : "No matching files found.",
          data: { files: filePaths, matchCount: filePaths.length },
          durationMs: Date.now() - startTime,
          verified: true,
          verificationDetails: `Discovered ${filePaths.length} matching entries.`,
        };
      },
    });

    // ── 6. Shell Command Tool ────────────────────────────────────────────
    this.registerTool({
      name: "run_shell_command",
      category: "terminal",
      actionType: "shell_exec",
      description: "Executes a shell command in PowerShell or cmd with output capture and exit code validation",
      riskLevel: "high",
      parameters: [
        { name: "command", type: "string", description: "The shell command to execute", required: true },
        { name: "shell", type: "string", description: "Shell to use: 'powershell' or 'cmd'", required: false, default: "powershell" },
        { name: "cwd", type: "string", description: "Working directory for command execution", required: false },
        { name: "timeoutSec", type: "number", description: "Timeout in seconds", required: false, default: 30 },
      ],
      execute: async (params, context) => {
        const startTime = Date.now();
        const command = String(params.command || "");
        const shell = (params.shell as "powershell" | "cmd" | "pwsh" | "bash") || "powershell";
        const cwd = params.cwd as string | undefined;
        const timeoutSec = typeof params.timeoutSec === "number" ? params.timeoutSec : 30;

        const cmdRes = await defaultTerminalIntelligence.executeCommand(
          command,
          shell,
          cwd,
          timeoutSec,
          undefined,
          Boolean(context?.approvalGranted)
        );

        const verified = cmdRes.success && cmdRes.exitCode === 0;

        return {
          success: cmdRes.success,
          toolName: "run_shell_command",
          actionType: "shell_exec",
          target: command,
          output: (cmdRes.stdout || cmdRes.stderr || "").trim(),
          error: cmdRes.exitCode !== 0 ? (cmdRes.error || cmdRes.stderr || `Command exited with code ${cmdRes.exitCode}`) : undefined,
          exitCode: cmdRes.exitCode,
          durationMs: Date.now() - startTime,
          verified,
          verificationDetails: verified ? `Command exited with exitCode 0 in ${cmdRes.durationMs}ms.` : `Command exited with non-zero code ${cmdRes.exitCode}.`,
        };
      },
    });

    // ── 7. Browser Open Tool ────────────────────────────────────────────
    this.registerTool({
      name: "open_browser_url",
      category: "browser",
      actionType: "browser_open",
      description: "Navigates the default web browser to a validated URL",
      riskLevel: "low",
      parameters: [
        { name: "url", type: "string", description: "Target web URL to navigate to", required: true },
      ],
      execute: async (params) => {
        const startTime = Date.now();
        const url = String(params.url || "");

        const navRes = await defaultBrowserIntelligence.navigateToUrl(url);
        return {
          success: navRes.success,
          toolName: "open_browser_url",
          actionType: "browser_open",
          target: url,
          output: navRes.success ? `Opened ${url} in default browser.` : `Failed to open browser URL: ${navRes.error}`,
          error: navRes.error,
          durationMs: Date.now() - startTime,
          verified: navRes.success,
          verificationDetails: navRes.success ? `Browser process invoked for ${url}.` : "Navigation call failed.",
        };
      },
    });
  }
}

/** Global default computer tool registry singleton */
export const defaultComputerToolRegistry = new ComputerToolRegistry();
