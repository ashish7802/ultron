/**
 * @file lib/computer/browserIntelligence.ts
 * @description Module 08: Browser Discovery, Navigation & Web Interaction Supervisor.
 *
 * Subsystem:
 * Computer Intelligence - Web Browsers & Page State Verification.
 *
 * Key Responsibilities:
 * - Detects installed web browsers (Google Chrome, Microsoft Edge, Mozilla Firefox, Brave).
 * - Identifies user default browser for https protocol.
 * - Safely validates URLs and blocks SSRF/cloud metadata targets (`169.254.169.254`).
 * - Navigates browsers to target URLs (opens new tab in active window or starts browser).
 * - Inspects active browser window, tab title, address bar hints, and interactive DOM elements.
 * - Monitors the user's Downloads directory for recent files and active download progress.
 *
 * Architectural Role & Interactions:
 * - Consumed by `workflowOrchestrator.ts` and chat URL navigation intents.
 * - Bridges with `desktopEngine.ts` and `inputController.ts`.
 *
 * Safety / Security Guarantees:
 * - Never bypasses user credentials or browser security boundaries.
 * - SSRF protection enforced prior to navigation.
 */

import { defaultPythonBridge } from "./pythonBridge.ts";
import type {
  BrowserDescriptor,
  BrowserNavigationResult,
  BrowserPageState,
} from "./types.ts";

export class BrowserIntelligence {
  /**
   * Enumerates installed web browsers detected on the local system.
   *
   * @returns Array of browser descriptors.
   */
  public async getInstalledBrowsers(): Promise<BrowserDescriptor[]> {
    const res = await defaultPythonBridge.execute<BrowserDescriptor[]>("browsers");
    if (res.success && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  }

  /**
   * Queries Windows Registry for user's default browser handler for https.
   *
   * @returns BrowserDescriptor.
   */
  public async getDefaultBrowser(): Promise<BrowserDescriptor> {
    const res = await defaultPythonBridge.execute<BrowserDescriptor>("default_browser");
    if (res.success && res.data) {
      return res.data;
    }
    return { id: "default", name: "System Default Browser", exe: "explorer.exe" };
  }

  /**
   * Safely opens or navigates a browser to target URL.
   *
   * @param url - Web URL.
   * @param browser - Optional preferred browser ID ('chrome', 'msedge').
   * @returns BrowserNavigationResult.
   */
  public async navigateToUrl(url: string, browser?: string): Promise<BrowserNavigationResult> {
    const res = await defaultPythonBridge.execute<BrowserNavigationResult>("navigate_url", { url, browser });
    return {
      success: Boolean(res.success),
      url: (res.url as string) || url,
      browserUsed: res.browserUsed as string | undefined,
      targetHwnd: res.targetHwnd as string | undefined,
      message: res.message as string | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Inspects active browser window, tab title, and accessible web controls.
   *
   * @param hwnd - Optional browser window handle.
   * @returns BrowserPageState.
   */
  public async inspectPage(hwnd?: number | string): Promise<BrowserPageState> {
    const parsedHwnd = hwnd ? (typeof hwnd === "string" ? parseInt(hwnd, 16) : hwnd) : undefined;
    const res = await defaultPythonBridge.execute<BrowserPageState>("inspect_browser", { hwnd: parsedHwnd });
    return {
      success: Boolean(res.success),
      hwnd: res.hwnd as string | undefined,
      title: res.title as string | undefined,
      browserName: res.browserName as string | undefined,
      addressBarHint: res.addressBarHint as string | null | undefined,
      elementCount: res.elementCount as number | undefined,
      elements: res.elements as BrowserPageState["elements"],
      error: res.error as string | undefined,
    };
  }

  /**
   * Inspects user's Downloads directory for recent files and active downloads.
   *
   * @param folder - Optional custom folder path.
   * @returns Download status descriptor.
   */
  public async getDownloadStatus(folder?: string): Promise<{
    success: boolean;
    activeDownloadsCount: number;
    recentFilesCount: number;
    recentDownloads: Array<{ name: string; path: string; sizeBytes: number; modifiedAt: number }>;
    activeDownloads: string[];
    error?: string;
  }> {
    const res = await defaultPythonBridge.execute<{
      activeDownloadsCount: number;
      recentFilesCount: number;
      recentDownloads: Array<{ name: string; path: string; sizeBytes: number; modifiedAt: number }>;
      activeDownloads: string[];
    }>("downloads", { downloadsFolder: folder });

    return {
      success: Boolean(res.success),
      activeDownloadsCount: (res.activeDownloadsCount as number) || 0,
      recentFilesCount: (res.recentFilesCount as number) || 0,
      recentDownloads: Array.isArray(res.recentDownloads) ? res.recentDownloads : [],
      activeDownloads: Array.isArray(res.activeDownloads) ? res.activeDownloads : [],
      error: res.error as string | undefined,
    };
  }
}

export const defaultBrowserIntelligence = new BrowserIntelligence();
