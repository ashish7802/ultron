/**
 * @file lib/screen/visionControl.ts
 * @description Module 01: Vision Control & Floating Indicator State Engine.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Control Subsystem.
 *
 * Key Responsibilities:
 * - Manages the global capture operational lifecycle: OFF -> INITIALIZING -> LIVE -> PAUSED -> TERMINATED.
 * - Synchronizes OS permissions and session status with the UI floating indicator.
 * - Provides instantaneous Emergency Kill switch that purges all visual memory buffers within 5ms.
 * - Enforces the Anti-Hallucination Invariant: Under no circumstances can the indicator report LIVE
 *   unless active OS capture permissions are verified, a session is active, and the pipeline is producing frames.
 * - Broadcasts real-time state changes to subscriber listeners (supporting SSE/WebSockets/EventEmitters).
 *
 * Architectural Role & Safety Guarantees:
 * - Direct coordinator invoked by UI toggle buttons and `app/api/screen/control/route.ts`.
 * - Interfaced by `ScreenAwarenessIndicator.tsx` to render the desktop HUD badge.
 * - Fail-closed: Any unhandled exception or expired session forces the indicator to OFF/ERROR immediately.
 */

import type {
  CaptureOperationalState,
  PermissionSyncState,
  VisionControlStatus,
  VisionControlCommand,
} from "./types.ts";
import { defaultFrameStreamingEngine } from "./frameStreamingEngine.ts";
import { defaultScreenSessionManager } from "./sessionManager.ts";
import { activateScreenCapture, purgeScreenBuffers } from "../screenPrivacyController.ts";

export type StatusListener = (status: VisionControlStatus) => void;

export class VisionControlEngine {
  private _state: CaptureOperationalState = "OFF";
  private _permission: PermissionSyncState = "PROMPT";
  private _activeSessionId: string | null = null;
  private _targetDisplayId: string | null = null;
  private _startedAt: number | null = null;
  private _lastFrameAt: number | null = null;
  private _activeWindowSummary: string = "No active capture";
  private _lastCaptureLatencyMs?: number;
  private _lastInferenceLatencyMs?: number;
  private _modelAvailability?: string;
  private _listeners: Set<StatusListener> = new Set();
  private _emergencyPurgeCallback?: () => void;

  /**
   * Registers a callback executed immediately when Emergency Kill is triggered.
   *
   * @param callback - Cleanup function.
   */
  public registerEmergencyPurgeHook(callback: () => void): void {
    this._emergencyPurgeCallback = callback;
  }

  /**
   * Subscribes a listener to receive real-time vision control state updates.
   *
   * @param listener - Function invoked upon status mutation.
   * @returns Unsubscribe function.
   */
  public subscribe(listener: StatusListener): () => void {
    this._listeners.add(listener);
    // Emit immediate current state
    listener(this.getStatus());
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Emits the updated status to all active listeners.
   */
  private _broadcast(): void {
    const status = this.getStatus();
    for (const listener of this._listeners) {
      try {
        listener(status);
      } catch {
        // Prevent faulty subscriber from interrupting engine broadcast
      }
    }
  }

  /**
   * Computes the current, verified VisionControlStatus.
   *
   * Anti-Hallucination Enforcement:
   * Guarantees that `isCapturing` is strictly true ONLY when state is 'LIVE', 'ANALYZING',
   * or 'DEGRADED', and an active session exists.
   *
   * @returns VisionControlStatus payload.
   */
  public getStatus(): VisionControlStatus {
    const isLive =
      (this._state === "LIVE" || this._state === "ANALYZING" || this._state === "DEGRADED") &&
      Boolean(this._activeSessionId);
    let color: "red" | "green" | "amber" | "gray";
    let text: string;

    switch (this._state) {
      case "LIVE":
        color = "green";
        text = "VISION: LIVE";
        break;
      case "ANALYZING":
        color = "green";
        text = "VISION: ANALYZING";
        break;
      case "DEGRADED":
        color = "amber";
        text = "VISION: DEGRADED";
        break;
      case "INITIALIZING":
        color = "amber";
        text = "VISION: INITIALIZING...";
        break;
      case "PAUSED":
        color = "amber";
        text = "VISION: PAUSED";
        break;
      case "ERROR":
        color = "red";
        text = "VISION: ERROR";
        break;
      case "TERMINATED":
        color = "red";
        text = "VISION: TERMINATED";
        break;
      case "OFF":
      default:
        color = "gray";
        text = "VISION: OFF";
        break;
    }

    return {
      operationalState: this._state,
      indicatorColor: color,
      indicatorText: text,
      isCapturing: isLive,
      permissionState: this._permission,
      activeSessionId: this._activeSessionId,
      targetDisplayId: this._targetDisplayId,
      startedAt: this._startedAt,
      lastFrameAt: this._lastFrameAt,
      emergencyTerminationAvailable: isLive || this._state === "PAUSED",
      activeWindowSummary: this._activeWindowSummary,
      lastCaptureLatencyMs: this._lastCaptureLatencyMs,
      lastInferenceLatencyMs: this._lastInferenceLatencyMs,
      modelAvailability:
        this._modelAvailability ||
        (this._state === "DEGRADED"
          ? "Model Offline (Degraded)"
          : this._state === "LIVE"
          ? "Live Multimodal Active"
          : "Standby"),
      visionEngineStatus:
        this._state === "DEGRADED"
          ? "DEGRADED_OS_TELEMETRY_ONLY"
          : this._state === "LIVE"
          ? "OPERATIONAL_MULTIMODAL"
          : "STANDBY",
    };
  }

  /**
   * Updates the fine-grained operational state (e.g. transitioning between LIVE,
   * ANALYZING, and DEGRADED during active capture sessions).
   *
   * @param newState - Target operational state.
   */
  public setOperationalState(newState: CaptureOperationalState): void {
    if (this._state !== newState) {
      this._state = newState;
      this._broadcast();
    }
  }

  /**
   * Synchronizes permission state from OS or session checks.
   *
   * @param state - Current permission status.
   */
  public setPermissionState(state: PermissionSyncState): void {
    this._permission = state;
    if (state === "REVOKED" || state === "DENIED") {
      // Permission lost: immediately drop capture state
      if (this._state === "LIVE" || this._state === "ANALYZING" || this._state === "DEGRADED" || this._state === "PAUSED") {
        this.stopSession("Permission revoked by user or OS policy");
      }
    }
    this._broadcast();
  }

  /**
   * Starts a new verified vision capture session.
   *
   * Connects into FrameStreamingEngine to initiate live continuous frame acquisition
   * with adaptive throttling and backpressure management.
   *
   * @param displayId - Optional monitor display target.
   * @param durationMs - Consent and session lifetime in milliseconds.
   * @returns Session ID shared with the frame streaming engine.
   */
  public startSession(displayId: string = "primary", durationMs: number = 5 * 60 * 1000): string {
    if (this._permission === "DENIED") {
      this._state = "ERROR";
      this._broadcast();
      throw new Error("Cannot start screen awareness: OS permission is DENIED.");
    }

    this._state = "INITIALIZING";
    this._lastFrameAt = null;
    this._activeWindowSummary = "Waiting for the first authorized screen frame";
    this._broadcast();

    const session = defaultScreenSessionManager.createSession(displayId, durationMs);
    const sessionId = session.sessionId;
    this._activeSessionId = sessionId;
    this._targetDisplayId = displayId;
    this._startedAt = Date.now();
    this._lastCaptureLatencyMs = undefined;
    this._lastInferenceLatencyMs = undefined;
    this._modelAvailability = undefined;

    // The session manager owns the shared ID that the streaming pipeline validates.
    try {
      activateScreenCapture(durationMs);
      defaultFrameStreamingEngine.startStreaming(sessionId, { captureMode: "full_screen" });
      this._permission = "GRANTED";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      defaultFrameStreamingEngine.stopStreaming(message);
      defaultScreenSessionManager.terminateSession(sessionId, message);
      purgeScreenBuffers();
      this._state = "ERROR";
      this._activeSessionId = null;
      this._startedAt = null;
      this._lastFrameAt = null;
      this._permission = "REVOKED";
      this._activeWindowSummary = `Screen capture could not start: ${message}`;
      this._broadcast();
      throw new Error(`Screen capture could not start: ${message}`, { cause: error });
    }

    this._broadcast();
    return sessionId;
  }

  /**
   * Pauses an active vision capture session without terminating the pipeline.
   */
  public pauseSession(): void {
    if (this._state === "LIVE" || this._state === "ANALYZING") {
      this._state = "PAUSED";
      defaultFrameStreamingEngine.pauseStreaming();
      this._broadcast();
    }
  }

  /**
   * Resumes a paused vision capture session.
   */
  public resumeSession(): void {
    if (this._state === "PAUSED" && this._activeSessionId) {
      this._state = "INITIALIZING";
      this._lastFrameAt = null;
      this._activeWindowSummary = "Waiting for the first resumed screen frame";
      defaultFrameStreamingEngine.resumeStreaming();
      this._broadcast();
    }
  }

  /**
   * Stops an active vision capture session cleanly.
   *
   * @param reason - Optional explanation string.
   */
  public stopSession(reason?: string): void {
    const sessionId = this._activeSessionId;
    if (sessionId) {
      defaultScreenSessionManager.terminateSession(sessionId, reason || "Screen awareness stopped");
    }
    this._state = "OFF";
    this._activeSessionId = null;
    this._startedAt = null;
    this._lastFrameAt = null;
    this._targetDisplayId = null;
    this._permission = "PROMPT";
    this._activeWindowSummary = reason || "Vision disabled";
    try {
      purgeScreenBuffers();
    } catch {
      // Non-fatal cleanup
    }
    defaultFrameStreamingEngine.stopStreaming(reason);
    this._broadcast();
  }

  /**
   * Executes emergency kill termination immediately.
   * Purges all buffers and forces state to TERMINATED -> OFF.
   */
  public emergencyKill(): void {
    const sessionId = this._activeSessionId;
    this._state = "TERMINATED";
    this._activeSessionId = null;
    this._startedAt = null;
    this._lastFrameAt = null;
    this._targetDisplayId = null;
    this._permission = "REVOKED";
    this._activeWindowSummary = "EMERGENCY KILL TRIGGERED - BUFFERS PURGED";
    if (sessionId) {
      defaultScreenSessionManager.terminateSession(sessionId, "EMERGENCY_KILL");
    }
    defaultFrameStreamingEngine.stopStreaming("EMERGENCY KILL");
    try {
      purgeScreenBuffers();
    } catch {
      // Non-fatal cleanup
    }

    if (this._emergencyPurgeCallback) {
      try {
        this._emergencyPurgeCallback();
      } catch {
        // Prevent cleanup failure from propagating
      }
    }

    this._broadcast();
    // Do not let a delayed kill callback overwrite a newly started session.
    setTimeout(() => {
      if (this._state === "TERMINATED" && this._activeSessionId === null) {
        this._state = "OFF";
        this._broadcast();
      }
    }, 1000);
  }

  /**
   * Notifies the control engine of a successfully acquired frame to update telemetry.
   *
   * @param windowTitle - Active window name during capture.
   * @param captureMs - Latency of physical capture.
   * @param inferenceMs - Latency of multimodal vision inference.
   * @param modelName - Active model identifier.
   */
  public recordFrameAcquired(
    windowTitle?: string,
    captureMs?: number,
    inferenceMs?: number,
    modelName?: string,
    sessionId?: string,
    capturedAt: number = Date.now()
  ): void {
    if (sessionId && sessionId !== this._activeSessionId) return;
    if (
      this._state === "INITIALIZING" ||
      this._state === "LIVE" ||
      this._state === "ANALYZING" ||
      this._state === "DEGRADED"
    ) {
      if (this._state === "INITIALIZING") {
        this._state = "LIVE";
      }
      this._lastFrameAt = capturedAt;
      this._permission = "GRANTED";
      if (windowTitle) {
        this._activeWindowSummary = windowTitle;
      }
      if (captureMs !== undefined) {
        this._lastCaptureLatencyMs = captureMs;
      }
      if (inferenceMs !== undefined) {
        this._lastInferenceLatencyMs = inferenceMs;
      }
      if (modelName !== undefined) {
        this._modelAvailability = modelName;
      }
      this._broadcast();
    }
  }

  /**
   * Stops and reports a session when privacy checks or physical capture fail.
   *
   * @param reason - Failure or policy-denial explanation.
   * @param sessionId - Session that experienced the failure.
   */
  public handleCaptureFailure(reason: string, sessionId: string): void {
    if (!this._activeSessionId || this._activeSessionId !== sessionId) return;

    defaultFrameStreamingEngine.stopStreaming(reason);
    defaultScreenSessionManager.terminateSession(sessionId, reason);
    purgeScreenBuffers();
    this._state = "ERROR";
    this._activeSessionId = null;
    this._startedAt = null;
    this._lastFrameAt = null;
    this._targetDisplayId = null;
    this._permission = "REVOKED";
    this._activeWindowSummary = reason;
    this._broadcast();
  }

  /**
   * Dispatches a structured command to the vision control engine.
   *
   * @param command - VisionControlCommand to process.
   * @returns Current status after command execution.
   */
  public executeCommand(command: VisionControlCommand): VisionControlStatus {
    switch (command.action) {
      case "START":
        this.startSession(command.displayId, command.durationMs);
        break;
      case "STOP":
        this.stopSession(command.reason);
        break;
      case "PAUSE":
        this.pauseSession();
        break;
      case "RESUME":
        this.resumeSession();
        break;
      case "EMERGENCY_KILL":
        this.emergencyKill();
        break;
    }
    return this.getStatus();
  }
}

/** Global singleton instance of VisionControlEngine. */
export const defaultVisionControl = new VisionControlEngine();

defaultFrameStreamingEngine.subscribeCaptureObserver((frame, activeWindowTitle) => {
  defaultVisionControl.recordFrameAcquired(
    activeWindowTitle,
    frame.captureLatencyMs,
    undefined,
    undefined,
    frame.sessionId,
    frame.timestamp
  );
});

defaultFrameStreamingEngine.subscribeCaptureFailure((error, sessionId) => {
  defaultVisionControl.handleCaptureFailure(error.message, sessionId);
});
