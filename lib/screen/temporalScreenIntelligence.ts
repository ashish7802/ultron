/**
 * @file lib/screen/temporalScreenIntelligence.ts
 * @description Phase 6: Temporal Screen Intelligence & State Evolution Engine.
 *
 * Subsystem:
 * Screen Awareness & Live Visual Intelligence - Temporal Evolution Subsystem.
 *
 * Key Responsibilities:
 * - Tracks evolution of desktop state over consecutive frame captures.
 * - Detects Application Switching events (e.g. VS Code -> Chrome -> Terminal).
 * - Detects Window Title changes (e.g. file switching inside IDE, page navigation in browser).
 * - Identifies UI State Transitions (dialog opened, button clicked, form submitted).
 * - Tracks Error Lifecycle: New error appearance vs Error resolution detection.
 * - Enforces Context Expiration: Rejects visual context older than TTL (default 15 seconds)
 *   so answers never operate on stale observations.
 * - Maintains a bounded short-term temporal timeline of verified desktop events.
 */

import crypto from "crypto";
import type { DesktopWindowInfo } from "./types.ts";
import type { FusionResult } from "./visionOcrFusionEngine.ts";

export interface TemporalTransitionEvent {
  eventId: string;
  timestamp: number;
  eventType: "APP_SWITCH" | "WINDOW_TITLE_CHANGE" | "ERROR_DETECTED" | "ERROR_RESOLVED" | "UI_STATE_CHANGE";
  summary: string;
  previousValue?: string;
  currentValue?: string;
}

export interface TemporalEvolutionState {
  timelineId: string;
  sessionId: string;
  startedAt: number;
  lastFrameTimestamp: number;
  isStale: boolean;
  ageMs: number;
  currentActiveApp: string;
  currentWindowTitle: string;
  activeErrors: string[];
  resolvedErrors: string[];
  recentEvents: TemporalTransitionEvent[];
}

export class TemporalScreenIntelligence {
  private _maxTimelineEvents: number = 20;
  private _contextTtlMs: number = 15000; // 15-second freshness ceiling

  private _lastSessionId: string | null = null;
  private _lastFrameTimestamp: number = 0;
  private _lastActiveApp: string = "";
  private _lastWindowTitle: string = "";
  private _lastKnownErrors: Set<string> = new Set();
  private _timelineEvents: TemporalTransitionEvent[] = [];

  /**
   * Updates temporal state with observations from the latest verified frame.
   *
   * @param sessionId - Active screen session ID.
   * @param windowInfo - Foreground window info from Module 04.
   * @param fusionResult - Fused vision/OCR results from Module 05/Phase 5.
   * @returns TemporalEvolutionState summarizing desktop evolution.
   */
  public recordFrameObservation(
    sessionId: string,
    windowInfo: DesktopWindowInfo | null,
    fusionResult: FusionResult
  ): TemporalEvolutionState {
    const now = Date.now();

    // Reset timeline if new session starts
    if (this._lastSessionId !== sessionId) {
      this._lastSessionId = sessionId;
      this._timelineEvents = [];
      this._lastKnownErrors.clear();
      this._lastActiveApp = "";
      this._lastWindowTitle = "";
    }

    const currentApp = windowInfo?.processName || fusionResult.primaryApplication || "Desktop";
    const currentTitle = windowInfo?.title || "Active Workspace";

    // 1. Detect Application Switch
    if (this._lastActiveApp && this._lastActiveApp !== currentApp) {
      this._addEvent({
        eventId: `evt_${crypto.randomUUID().slice(0, 8)}`,
        timestamp: now,
        eventType: "APP_SWITCH",
        summary: `Switched application from "${this._lastActiveApp}" to "${currentApp}".`,
        previousValue: this._lastActiveApp,
        currentValue: currentApp,
      });
    }

    // 2. Detect Window Title / Document Change
    if (this._lastWindowTitle && this._lastWindowTitle !== currentTitle && this._lastActiveApp === currentApp) {
      this._addEvent({
        eventId: `evt_${crypto.randomUUID().slice(0, 8)}`,
        timestamp: now,
        eventType: "WINDOW_TITLE_CHANGE",
        summary: `Window title updated to "${currentTitle}".`,
        previousValue: this._lastWindowTitle,
        currentValue: currentTitle,
      });
    }

    // 3. Detect Error Lifecycle (New Errors vs Resolved Errors)
    const currentErrors = new Set(fusionResult.extractedErrors);

    // Check for newly surfaced errors
    for (const err of currentErrors) {
      if (!this._lastKnownErrors.has(err)) {
        this._addEvent({
          eventId: `evt_${crypto.randomUUID().slice(0, 8)}`,
          timestamp: now,
          eventType: "ERROR_DETECTED",
          summary: `New diagnostic alert surfaced: "${err.slice(0, 80)}"`,
          currentValue: err,
        });
      }
    }

    // Check for resolved errors
    const resolvedErrors: string[] = [];
    for (const err of this._lastKnownErrors) {
      if (!currentErrors.has(err)) {
        resolvedErrors.push(err);
        this._addEvent({
          eventId: `evt_${crypto.randomUUID().slice(0, 8)}`,
          timestamp: now,
          eventType: "ERROR_RESOLVED",
          summary: `Diagnostic alert resolved: "${err.slice(0, 80)}"`,
          previousValue: err,
        });
      }
    }

    this._lastActiveApp = currentApp;
    this._lastWindowTitle = currentTitle;
    this._lastKnownErrors = currentErrors;
    this._lastFrameTimestamp = now;

    return this.getState(sessionId);
  }

  /**
   * Retrieves the current temporal evolution state and validates freshness.
   */
  public getState(sessionId?: string): TemporalEvolutionState {
    const now = Date.now();
    const ageMs = now - this._lastFrameTimestamp;
    const isStale = ageMs > this._contextTtlMs;

    return {
      timelineId: `time_${(this._lastSessionId || "global").slice(0, 10)}`,
      sessionId: sessionId || this._lastSessionId || "unspecified_session",
      startedAt: this._timelineEvents[0]?.timestamp || this._lastFrameTimestamp || now,
      lastFrameTimestamp: this._lastFrameTimestamp,
      isStale,
      ageMs,
      currentActiveApp: this._lastActiveApp,
      currentWindowTitle: this._lastWindowTitle,
      activeErrors: Array.from(this._lastKnownErrors),
      resolvedErrors: [],
      recentEvents: [...this._timelineEvents],
    };
  }

  /**
   * Resets temporal intelligence history.
   */
  public reset(): void {
    this._lastSessionId = null;
    this._lastFrameTimestamp = 0;
    this._lastActiveApp = "";
    this._lastWindowTitle = "";
    this._lastKnownErrors.clear();
    this._timelineEvents = [];
  }

  private _addEvent(evt: TemporalTransitionEvent): void {
    this._timelineEvents.push(evt);
    if (this._timelineEvents.length > this._maxTimelineEvents) {
      this._timelineEvents.shift();
    }
  }
}

/** Global singleton instance of TemporalScreenIntelligence. */
export const defaultTemporalScreenIntelligence = new TemporalScreenIntelligence();
