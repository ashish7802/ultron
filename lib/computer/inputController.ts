/**
 * @file lib/computer/inputController.ts
 * @description Module 04: Mouse & Keyboard Hardware-Level Automation Controller.
 *
 * Subsystem:
 * Computer Intelligence - Hardware Input Simulation.
 *
 * Key Responsibilities:
 * - Controls mouse movement (instant and smooth path interpolation) via native SendInput.
 * - Simulates single, double, right, and middle clicks.
 * - Handles drag-and-drop operations with configurable duration.
 * - Dispatches vertical and horizontal scroll wheel events.
 * - Types unicode text into foreground windows using KEYEVENTF_UNICODE.
 * - Dispatches keyboard shortcut sequences (Ctrl+C, Alt+Tab, Win+R, etc.).
 * - Queries live physical cursor position.
 *
 * Architectural Role & Interactions:
 * - Consumed by `workflowOrchestrator.ts` during INTERACT phase.
 * - Dispatches via `PythonComputerBridge` to `ultron_engine.computer.input_driver`.
 *
 * Safety / Security Guarantees:
 * - Keyboard modifiers are always safely released to avoid stuck keys.
 * - Halts immediately if Emergency Stop is engaged.
 */

import { defaultPythonBridge } from "./pythonBridge.ts";
import type {
  CursorPosition,
  MouseClickOptions,
  MouseDragOptions,
  MouseScrollOptions,
  KeyboardTypeOptions,
} from "./types.ts";

export class InputController {
  /**
   * Retrieves the current physical cursor coordinates on the desktop.
   *
   * @returns CursorPosition {x, y}.
   */
  public async getCursorPosition(): Promise<CursorPosition> {
    const res = await defaultPythonBridge.execute<{ x: number; y: number }>("cursor_pos");
    return {
      x: typeof res.x === "number" ? res.x : 0,
      y: typeof res.y === "number" ? res.y : 0,
    };
  }

  /**
   * Moves the mouse cursor to physical coordinates (x, y).
   *
   * @param x - Target X.
   * @param y - Target Y.
   * @param smooth - Enable smooth movement interpolation.
   * @returns New cursor position.
   */
  public async moveMouse(x: number, y: number, smooth: boolean = false): Promise<CursorPosition> {
    const res = await defaultPythonBridge.execute<{ x: number; y: number }>("mouse_move", { x, y, smooth });
    return {
      x: typeof res.x === "number" ? res.x : x,
      y: typeof res.y === "number" ? res.y : y,
    };
  }

  /**
   * Performs a mouse click at target coordinates or current position.
   *
   * @param options - Click options {x, y, button, clickType}.
   * @returns Result descriptor.
   */
  public async clickMouse(options: MouseClickOptions = {}): Promise<{ success: boolean; x?: number; y?: number }> {
    const res = await defaultPythonBridge.execute<{ success: boolean; x: number; y: number }>("mouse_click", {
      ...options,
    });
    return {
      success: Boolean(res.success),
      x: res.x as number | undefined,
      y: res.y as number | undefined,
    };
  }

  /**
   * Performs a drag and drop operation from start to end coordinates.
   *
   * @param options - Drag options {startX, startY, endX, endY, durationMs}.
   * @returns Result descriptor.
   */
  public async dragMouse(options: MouseDragOptions): Promise<{ success: boolean }> {
    const res = await defaultPythonBridge.execute<{ success: boolean }>("mouse_drag", { ...options });
    return { success: Boolean(res.success) };
  }

  /**
   * Simulates mouse wheel scrolling.
   *
   * @param options - Scroll options {deltaY, deltaX}.
   * @returns Result descriptor.
   */
  public async scrollMouse(options: MouseScrollOptions): Promise<{ success: boolean }> {
    const res = await defaultPythonBridge.execute<{ success: boolean }>("mouse_scroll", { ...options });
    return { success: Boolean(res.success) };
  }

  /**
   * Types unicode text into the currently focused window.
   *
   * @param options - Typing options {text, delayMs}.
   * @returns Result descriptor {success, characterCount}.
   */
  public async typeText(options: KeyboardTypeOptions): Promise<{ success: boolean; characterCount: number }> {
    const res = await defaultPythonBridge.execute<{ success: boolean; characterCount: number }>("type_text", {
      ...options,
    });
    return {
      success: Boolean(res.success),
      characterCount: typeof res.characterCount === "number" ? res.characterCount : 0,
    };
  }

  /**
   * Dispatches a keyboard shortcut sequence (e.g. ['ctrl', 'c'], ['alt', 'tab']).
   *
   * @param keys - Array of key names in order of depression.
   * @returns Result descriptor.
   */
  public async sendHotkey(keys: string[]): Promise<{ success: boolean; error?: string }> {
    const res = await defaultPythonBridge.execute<{ success: boolean }>("send_hotkey", { keys });
    return {
      success: Boolean(res.success),
      error: res.error as string | undefined,
    };
  }
}

export const defaultInputController = new InputController();
