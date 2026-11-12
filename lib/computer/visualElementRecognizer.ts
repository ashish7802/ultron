/**
 * @file lib/computer/visualElementRecognizer.ts
 * @description Module 05: Visual Element Recognition & Semantic Accessibility Interaction.
 *
 * Subsystem:
 * Computer Intelligence - UI Understanding & Accessibility Interaction.
 *
 * Key Responsibilities:
 * - Traverses native Windows UI Automation (UIA) accessibility trees via COM.
 * - Categorizes interactive UI elements (Button, Edit, Menu, Dialog, Tab, CheckBox).
 * - Enforces the strict three-tier interaction priority:
 *   1. Semantic UI automation pattern (InvokePattern, ValuePattern, TogglePattern).
 *   2. Accessibility element bounding-box center click.
 *   3. Coordinate-based interaction as fallback.
 * - Resolves semantic element descriptions to bounding box coordinates.
 * - Captures pre/post interaction UI snapshots and performs state diffs.
 *
 * Architectural Role & Interactions:
 * - Consumed by `workflowOrchestrator.ts` during OBSERVE, INTERACT, and VERIFY phases.
 * - Integrates with `inputController.ts` for coordinate fallbacks.
 *
 * Safety / Security Guarantees:
 * - Read-only tree inspection.
 * - Sensitive window patterns are checked prior to element dump.
 */

import { defaultPythonBridge } from "./pythonBridge.ts";
import type {
  UIElementDescriptor,
  UIElementSelector,
  UISnapshot,
  UIStateComparison,
} from "./types.ts";

export class VisualElementRecognizer {
  /**
   * Dumps interactive UI elements for a window handle.
   *
   * @param hwnd - Window handle.
   * @param maxElements - Upper limit on elements returned.
   * @returns Array of UIElementDescriptor objects.
   */
  public async dumpElements(hwnd: number | string, maxElements: number = 100): Promise<UIElementDescriptor[]> {
    const parsedHwnd = typeof hwnd === "string" ? parseInt(hwnd, 16) : hwnd;
    const res = await defaultPythonBridge.execute<UIElementDescriptor[]>("dump_elements", {
      hwnd: parsedHwnd,
      maxElements,
    });
    if (res.success && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  }

  /**
   * Resolves a semantic target description to a concrete UI element with coordinates.
   *
   * @param hwnd - Window handle.
   * @param description - Target label or search query (e.g. 'Save button').
   * @returns Resolved element descriptor with center coordinates or null.
   */
  public async resolveTarget(
    hwnd: number | string,
    description: string
  ): Promise<UIElementDescriptor | null> {
    const parsedHwnd = typeof hwnd === "string" ? parseInt(hwnd, 16) : hwnd;
    const res = await defaultPythonBridge.execute<UIElementDescriptor>("resolve_target", {
      hwnd: parsedHwnd,
      description,
    });
    if (res.success && res.data) {
      return res.data;
    }
    return null;
  }

  /**
   * Performs semantic element interaction adhering to strict priority:
   * 1. Semantic UIA Pattern -> 2. Accessibility Bounding Box Click -> 3. Coordinate Fallback.
   *
   * @param hwnd - Window handle.
   * @param selector - Selector criteria {name, controlType, automationId, fallbackCoordinates}.
   * @param action - 'click' | 'set_value' | 'type' | 'focus'.
   * @param value - Optional text value if typing or setting value.
   * @returns Interaction outcome.
   */
  public async semanticInteract(
    hwnd: number | string,
    selector: UIElementSelector,
    action: "click" | "set_value" | "type" | "focus" = "click",
    value?: string
  ): Promise<{ success: boolean; methodUsed?: string; message?: string; error?: string }> {
    const parsedHwnd = typeof hwnd === "string" ? parseInt(hwnd, 16) : hwnd;
    const res = await defaultPythonBridge.execute<{ success: boolean; methodUsed?: string; message?: string }>(
      "semantic_interact",
      { hwnd: parsedHwnd, selector, action, value }
    );
    return {
      success: Boolean(res.success),
      methodUsed: res.methodUsed as string | undefined,
      message: res.message as string | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Captures an atomic UI snapshot including active window and interactive elements.
   *
   * @param hwnd - Optional window handle.
   * @returns UISnapshot descriptor.
   */
  public async captureSnapshot(hwnd?: number | string): Promise<UISnapshot | null> {
    const parsedHwnd = hwnd ? (typeof hwnd === "string" ? parseInt(hwnd, 16) : hwnd) : undefined;
    const res = await defaultPythonBridge.execute<UISnapshot>("ui_snapshot", { hwnd: parsedHwnd });
    if (res.success && res.data) {
      return res.data;
    }
    return null;
  }

  /**
   * Compares two UI snapshots to detect visual, layout, or title changes.
   *
   * @param before - Pre-interaction snapshot.
   * @param after - Post-interaction snapshot.
   * @returns UIStateComparison report.
   */
  public async compareSnapshots(before: UISnapshot, after: UISnapshot): Promise<UIStateComparison> {
    const res = await defaultPythonBridge.execute<UIStateComparison>("compare_ui", { before, after });
    if (res.success && res.data) {
      return res.data;
    }
    return {
      changed: false,
      verified: false,
      deltas: [],
      beforeHash: "",
      afterHash: "",
    };
  }
}

export const defaultVisualRecognizer = new VisualElementRecognizer();
