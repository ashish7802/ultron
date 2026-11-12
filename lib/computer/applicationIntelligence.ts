/**
 * @file lib/computer/applicationIntelligence.ts
 * @description Module 03: Application Intelligence & Lifecycle Supervisor.
 *
 * Subsystem:
 * Computer Intelligence - Application Discovery, Launching & Coordination.
 *
 * Key Responsibilities:
 * - Discovers installed applications across Windows Registry (32 & 64-bit), Start Menu,
 *   Desktop shortcuts, and built-in utilities.
 * - Safely launches allowlisted applications and returns process IDs.
 * - Switches to running applications by focusing their foreground HWNDs.
 * - Enforces protected system process boundaries: blocks termination of core services.
 * - Closes and terminates applications gracefully or forcefully.
 *
 * Architectural Role & Interactions:
 * - Consumed by `workflowOrchestrator.ts` and permission-gated execution flows.
 * - Interacts with `desktopEngine.ts` for window focus.
 *
 * Safety / Security Guarantees:
 * - Fails closed if application is protected or unrecognized.
 * - No shell is used during process execution; arguments are passed as discrete vectors.
 */

import { defaultPythonBridge } from "./pythonBridge.ts";
import type {
  DiscoveredApplication,
  AppLaunchOutcome,
  AppSwitchOutcome,
  AppTerminateOutcome,
} from "./types.ts";

export class ApplicationIntelligence {
  /**
   * Discovers all installed applications on the Windows desktop.
   *
   * @param forceRefresh - If true, bypasses in-memory cache.
   * @returns Array of application descriptors.
   */
  public async discoverApps(forceRefresh: boolean = false): Promise<DiscoveredApplication[]> {
    const res = await defaultPythonBridge.execute<DiscoveredApplication[]>("discover_apps", { forceRefresh });
    if (res.success && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  }

  /**
   * Finds the best matching application by name or keyword.
   *
   * @param query - App name or alias.
   * @returns Best matching application or null.
   */
  public async findApp(query: string): Promise<DiscoveredApplication | null> {
    const res = await defaultPythonBridge.execute<DiscoveredApplication>("find_app", { query });
    if (res.success && res.data) {
      return res.data;
    }
    return null;
  }

  /**
   * Launches an application safely.
   *
   * @param app - App name, alias, executable, or shortcut path.
   * @param args - Optional command-line arguments.
   * @returns Launch outcome with PID.
   */
  public async launchApp(app: string, args?: string[]): Promise<AppLaunchOutcome> {
    const res = await defaultPythonBridge.execute<AppLaunchOutcome>("launch_app", { app, args });
    return {
      success: Boolean(res.success),
      pid: res.pid as number | undefined,
      executable: res.executable as string | undefined,
      message: res.message as string | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Switches to an already running application window.
   *
   * @param target - App name or PID.
   * @returns Switch outcome.
   */
  public async switchToApp(target: string | number): Promise<AppSwitchOutcome> {
    const res = await defaultPythonBridge.execute<AppSwitchOutcome>("switch_app", { target });
    return {
      success: Boolean(res.success),
      hwnd: res.hwnd as string | undefined,
      title: res.title as string | undefined,
      processName: res.processName as string | undefined,
      message: res.message as string | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Closes or terminates an application window or process with safety validation.
   *
   * @param target - App name or PID.
   * @param force - If true, terminates process if window does not close.
   * @returns Termination outcome.
   */
  public async terminateApp(target: string | number, force: boolean = false): Promise<AppTerminateOutcome> {
    const res = await defaultPythonBridge.execute<AppTerminateOutcome>("terminate_app", { target, force });
    return {
      success: Boolean(res.success),
      closed: res.closed as boolean | undefined,
      terminated: res.terminated as boolean | undefined,
      processId: res.processId as number | undefined,
      blocked: res.blocked as boolean | undefined,
      error: res.error as string | undefined,
    };
  }
}

export const defaultApplicationIntelligence = new ApplicationIntelligence();
