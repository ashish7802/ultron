/**
 * @file lib/computer/desktopEngine.ts
 * @description Module 02: Desktop Understanding Engine.
 *
 * Subsystem:
 * Computer Intelligence - Desktop Introspection & Window Management.
 *
 * Key Responsibilities:
 * - Queries deep physical operating system metadata (Windows edition, build, UBR).
 * - Enumerate connected displays, multi-monitor topologies, and per-monitor DPI scaling.
 * - Enumerates visible and hidden top-level desktop windows with pixel-perfect coordinates.
 * - Tracks foreground active window and detects minimized, maximized, and hung states.
 * - Controls windows: set foreground (with focus-lock breaking), state change, move, and close.
 *
 * Architectural Role & Interactions:
 * - Consumed by `workflowOrchestrator.ts` during OBSERVE and UNDERSTAND phases.
 * - Delegates to native Win32 APIs via `PythonComputerBridge`.
 *
 * Safety / Security Guarantees:
 * - Read-only queries by default.
 * - Window closure verified via PID and window handle polling.
 */

import { defaultPythonBridge } from "./pythonBridge.ts";
import type {
  OSMetadata,
  DesktopWindowInfo,
} from "./types.ts";
import type { DisplayMonitor } from "../screen/types.ts";

export class DesktopUnderstandingEngine {
  private _cachedOS: OSMetadata | null = null;

  /**
   * Retrieves host operating system metadata.
   *
   * @returns OS metadata object.
   */
  public async getOSMetadata(): Promise<OSMetadata> {
    if (this._cachedOS) {
      return { ...this._cachedOS };
    }
    const res = await defaultPythonBridge.execute<OSMetadata>("os_info");
    if (res.success && res.data) {
      this._cachedOS = res.data;
      return res.data;
    }
    // Fallback descriptor
    return {
      platform: process.platform,
      system: "Windows",
      release: "11",
      version: "10.0",
      machine: process.arch,
      processor: "Generic x64",
      python_version: "3.12",
      product_name: "Windows 11",
      display_version: "26H2",
      current_build: "26300",
      ubr: 0,
      edition_id: "Professional",
    };
  }

  /**
   * Enumerates connected displays and multi-monitor topologies.
   *
   * @returns Array of DisplayMonitor descriptors.
   */
  public async getMonitors(): Promise<DisplayMonitor[]> {
    const res = await defaultPythonBridge.execute<DisplayMonitor[]>("monitors");
    if (res.success && Array.isArray(res.data)) {
      return res.data;
    }
    return [
      {
        id: "display_1",
        name: "Display 1 (Primary)",
        isPrimary: true,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1.0,
        resolution: { width: 1920, height: 1080 },
      },
    ];
  }

  /**
   * Enumerates live top-level desktop windows.
   *
   * @param includeHidden - If true, includes invisible windows.
   * @returns List of active window descriptors.
   */
  public async getWindows(includeHidden: boolean = false): Promise<DesktopWindowInfo[]> {
    const res = await defaultPythonBridge.execute<DesktopWindowInfo[]>("windows", { includeHidden });
    if (res.success && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  }

  /**
   * Retrieves the current foreground active window.
   *
   * @returns Active window descriptor or null.
   */
  public async getActiveWindow(): Promise<DesktopWindowInfo | null> {
    const res = await defaultPythonBridge.execute<DesktopWindowInfo>("active_window");
    if (res.success && res.data) {
      return res.data;
    }
    return null;
  }

  /**
   * Brings a target window to the foreground, bypassing Windows focus locks.
   *
   * @param hwnd - Window handle (integer or hex string).
   * @returns Boolean indicating whether window is now foreground.
   */
  public async setForegroundWindow(hwnd: number | string): Promise<boolean> {
    const parsedHwnd = typeof hwnd === "string" ? parseInt(hwnd, 16) : hwnd;
    const res = await defaultPythonBridge.execute<{ success: boolean }>("focus_window", { hwnd: parsedHwnd });
    return res.success;
  }

  /**
   * Minimizes, maximizes, restores, or hides a window.
   *
   * @param hwnd - Window handle.
   * @param state - 'minimize' | 'maximize' | 'restore' | 'hide' | 'show'.
   * @returns Boolean success flag.
   */
  public async setWindowState(
    hwnd: number | string,
    state: "minimize" | "maximize" | "restore" | "hide" | "show"
  ): Promise<boolean> {
    const parsedHwnd = typeof hwnd === "string" ? parseInt(hwnd, 16) : hwnd;
    const res = await defaultPythonBridge.execute<{ success: boolean }>("window_state", { hwnd: parsedHwnd, state });
    return res.success;
  }

  /**
   * Moves and resizes a window to exact desktop pixel coordinates.
   *
   * @param hwnd - Window handle.
   * @param x - X coordinate.
   * @param y - Y coordinate.
   * @param width - Width in pixels.
   * @param height - Height in pixels.
   * @returns Boolean success flag.
   */
  public async moveWindow(
    hwnd: number | string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<boolean> {
    const parsedHwnd = typeof hwnd === "string" ? parseInt(hwnd, 16) : hwnd;
    const res = await defaultPythonBridge.execute<{ success: boolean }>("move_window", {
      hwnd: parsedHwnd,
      x,
      y,
      width,
      height,
    });
    return res.success;
  }

  /**
   * Closes a window gracefully using WM_CLOSE, with optional force termination.
   *
   * @param hwnd - Window handle.
   * @param force - Force terminate process if window does not close.
   * @returns Outcome details.
   */
  public async closeWindow(
    hwnd: number | string,
    force: boolean = false
  ): Promise<{ success: boolean; closed?: boolean; terminated?: boolean; error?: string }> {
    const parsedHwnd = typeof hwnd === "string" ? parseInt(hwnd, 16) : hwnd;
    const res = await defaultPythonBridge.execute<{ success: boolean; closed?: boolean; terminated?: boolean }>(
      "close_window",
      { hwnd: parsedHwnd, force }
    );
    return res;
  }
}

export const defaultDesktopEngine = new DesktopUnderstandingEngine();
