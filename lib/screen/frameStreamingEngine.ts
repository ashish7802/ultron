/**
 * @file lib/screen/frameStreamingEngine.ts
 * @description Phase 2: Live Frame Streaming & Real-Time Orchestration Engine.
 *
 * Subsystem:
 * Screen Awareness & Live Visual Intelligence - Streaming Subsystem.
 *
 * Key Responsibilities:
 * - Continuous authorized screen observation with configurable capture interval (default 1000ms).
 * - Adaptive capture frequency: dynamically throttles capture rate when desktop is static, accelerates on high motion.
 * - Non-blocking frame queue with backpressure handling (drops stale frames if consumer lags).
 * - Monotonically increasing sequence numbers, millisecond timestamps, and dropped-frame detection.
 * - Thread-safe single-stream lifecycle: startStreaming, pauseStreaming, resumeStreaming, stopStreaming.
 * - Strict authorization sync: automatically halts capture if session expires, terminates, or enters privacy blackout.
 * - Ephemeral in-memory circular buffer (keeps last N frames only; zero disk leak).
 *
 * Safety & Security Guarantees:
 * - Fail-closed: Cannot stream in OFF, PAUSED, TERMINATED, or unauthenticated states.
 * - Does not simulate streaming via CSS or frontend animation; executes actual physical frame cycles.
 */

import { defaultScreenCaptureEngine, ScreenCaptureEngine } from "./screenCaptureEngine.ts";
import { defaultPrivacySecurityEngine, PrivacySecurityEngine } from "./privacySecurityEngine.ts";
import { defaultScreenSessionManager, ScreenSessionManager } from "./sessionManager.ts";
import { defaultWindowDetectionEngine, WindowDetectionEngine } from "./windowDetectionEngine.ts";
import type { CapturedFrame, CaptureOptions } from "./types.ts";

export type FrameConsumer = (frame: CapturedFrame) => Promise<void> | void;
export type FrameCaptureObserver = (frame: CapturedFrame, activeWindowTitle?: string) => void;
export type FrameCaptureFailureObserver = (error: Error, sessionId: string) => void;

export interface FrameStreamStats {
  isStreaming: boolean;
  sessionId: string | null;
  targetIntervalMs: number;
  currentIntervalMs: number;
  totalCaptured: number;
  totalDelivered: number;
  totalDropped: number;
  lastSequenceNumber: number;
  lastCaptureLatencyMs: number;
  consecutiveStaticFrames: number;
  consumerErrorsCount: number;
  lastConsumerError?: string;
}

export class FrameStreamingEngine {
  private _captureEngine: ScreenCaptureEngine;
  private _privacyEngine: PrivacySecurityEngine;
  private _sessionManager: ScreenSessionManager;
  private _windowEngine: WindowDetectionEngine;

  private _isStreaming: boolean = false;
  private _isPaused: boolean = false;
  private _sessionId: string | null = null;
  private _streamTimer: NodeJS.Timeout | null = null;

  // Configuration & Adaptive parameters
  private _baseIntervalMs: number = 1000;
  private _minIntervalMs: number = 400;
  private _maxIntervalMs: number = 3000;
  private _currentIntervalMs: number = 1000;

  // Queue & Backpressure
  private _consumers: Set<FrameConsumer> = new Set();
  private _captureObservers: Set<FrameCaptureObserver> = new Set();
  private _captureFailureObservers: Set<FrameCaptureFailureObserver> = new Set();
  private _isProcessingFrame: boolean = false;
  private _recentFrames: CapturedFrame[] = [];
  private _maxRecentFrames: number = 5;

  // Telemetry metrics
  private _totalCaptured: number = 0;
  private _totalDelivered: number = 0;
  private _totalDropped: number = 0;
  private _lastSequenceNumber: number = 0;
  private _lastCaptureLatencyMs: number = 0;
  private _consecutiveStaticFrames: number = 0;
  private _consumerErrorsCount: number = 0;
  private _lastConsumerError?: string;

  constructor(
    captureEngine?: ScreenCaptureEngine,
    privacyEngine?: PrivacySecurityEngine,
    sessionManager?: ScreenSessionManager,
    windowEngine?: WindowDetectionEngine
  ) {
    this._captureEngine = captureEngine || defaultScreenCaptureEngine;
    this._privacyEngine = privacyEngine || defaultPrivacySecurityEngine;
    this._sessionManager = sessionManager || defaultScreenSessionManager;
    this._windowEngine = windowEngine || defaultWindowDetectionEngine;

    // Connect the frame streaming engine directly into the visual context delivery pipeline
    this.subscribe(async (frame) => {
      try {
        const { defaultVisualContextDeliveryEngine } = await import("./contextDeliveryEngine.ts");
        await defaultVisualContextDeliveryEngine.processStreamingFrame(frame);
      } catch (err) {
        console.warn("[FRAME STREAMING] Context delivery subscriber error:", err);
      }
    });
  }

  /**
   * Starts a continuous live frame streaming loop bound to an active session.
   *
   * @param sessionId - Active screen session identifier.
   * @param options - Initial capture options and interval configuration.
   * @returns boolean - True if streaming started successfully.
   */
  public startStreaming(
    sessionId: string,
    options: {
      intervalMs?: number;
      captureMode?: CaptureOptions["mode"];
      allowSyntheticFallback?: boolean;
    } = {}
  ): boolean {
    if (this._isStreaming) {
      if (this._sessionId === sessionId) return true;
      this.stopStreaming("Switching to new session stream");
    }

    const session = this._sessionManager.getSession(sessionId);
    if (!session || session.operationalState !== "LIVE" || session.cleanupCompleted) {
      throw new Error(`Cannot start streaming: session ${sessionId} is not in LIVE state`);
    }

    this._sessionId = sessionId;
    this._isStreaming = true;
    this._isPaused = false;
    this._baseIntervalMs = options.intervalMs || 1000;
    this._currentIntervalMs = this._baseIntervalMs;
    this._isProcessingFrame = false;

    this._scheduleNextTick(options.captureMode || "full_screen", options.allowSyntheticFallback ?? false);
    return true;
  }

  /**
   * Pauses continuous streaming without terminating the session or clearing buffers.
   */
  public pauseStreaming(): void {
    this._isPaused = true;
    if (this._streamTimer) {
      clearTimeout(this._streamTimer);
      this._streamTimer = null;
    }
  }

  /**
   * Resumes continuous streaming from paused state.
   */
  public resumeStreaming(captureMode: CaptureOptions["mode"] = "full_screen"): void {
    if (!this._isStreaming || !this._isPaused || !this._sessionId) return;
    this._isPaused = false;
    this._scheduleNextTick(captureMode, false);
  }

  /**
   * Stops streaming, cancels pending timers, and purges in-flight frame buffers.
   */
  public stopStreaming(reason?: string): void {
    this._isStreaming = false;
    this._isPaused = false;
    this._sessionId = null;

    if (this._streamTimer) {
      clearTimeout(this._streamTimer);
      this._streamTimer = null;
    }

    this._recentFrames = [];
    this._isProcessingFrame = false;

    if (reason) {
      // Optional logging or auditing
    }
  }

  /**
   * Registers a frame consumer to receive fresh live desktop frames.
   */
  public subscribe(consumer: FrameConsumer): () => void {
    this._consumers.add(consumer);
    return () => {
      this._consumers.delete(consumer);
    };
  }

  /**
   * Registers a synchronous observer for each successfully acquired physical frame.
   */
  public subscribeCaptureObserver(observer: FrameCaptureObserver): () => void {
    this._captureObservers.add(observer);
    return () => {
      this._captureObservers.delete(observer);
    };
  }

  /**
   * Registers a listener for capture blocks and physical frame failures.
   */
  public subscribeCaptureFailure(observer: FrameCaptureFailureObserver): () => void {
    this._captureFailureObservers.add(observer);
    return () => {
      this._captureFailureObservers.delete(observer);
    };
  }

  private _notifyCaptureFailure(error: Error, sessionId: string): void {
    for (const observer of this._captureFailureObservers) {
      try {
        observer(error, sessionId);
      } catch (observerError) {
        console.error("[FRAME STREAMING] Capture failure observer error:", observerError);
      }
    }
    this.stopStreaming(error.message);
  }

  /**
   * Returns current streaming health, adaptive intervals, and drop metrics.
   */
  public getStats(): FrameStreamStats {
    return {
      isStreaming: this._isStreaming,
      sessionId: this._sessionId,
      targetIntervalMs: this._baseIntervalMs,
      currentIntervalMs: this._currentIntervalMs,
      totalCaptured: this._totalCaptured,
      totalDelivered: this._totalDelivered,
      totalDropped: this._totalDropped,
      lastSequenceNumber: this._lastSequenceNumber,
      lastCaptureLatencyMs: this._lastCaptureLatencyMs,
      consecutiveStaticFrames: this._consecutiveStaticFrames,
      consumerErrorsCount: this._consumerErrorsCount,
      lastConsumerError: this._lastConsumerError,
    };
  }

  /**
   * Retrieves the most recent authorized frame from the circular stream buffer.
   */
  public getLatestFrame(): CapturedFrame | null {
    if (this._recentFrames.length === 0) return null;
    return this._recentFrames[this._recentFrames.length - 1];
  }

  /**
   * Internal scheduler tick enforcing non-blocking backpressure and adaptive frequency.
   */
  private _scheduleNextTick(
    mode: CaptureOptions["mode"],
    allowSyntheticFallback: boolean
  ): void {
    if (!this._isStreaming || this._isPaused) return;

    this._streamTimer = setTimeout(async () => {
      await this._executeStreamCycle(mode, allowSyntheticFallback);
      this._scheduleNextTick(mode, allowSyntheticFallback);
    }, this._currentIntervalMs);
  }

  /**
   * Executes a single atomic capture, evaluation, and delivery cycle.
   */
  private async _executeStreamCycle(
    mode: CaptureOptions["mode"],
    allowSyntheticFallback: boolean
  ): Promise<void> {
    if (!this._isStreaming || this._isPaused || !this._sessionId) return;
    const sessionId = this._sessionId;

    // 1. Session verification gate
    const session = this._sessionManager.getSession(sessionId);
    if (!session || session.operationalState !== "LIVE") {
      this._notifyCaptureFailure(new Error("Session invalidated or expired"), sessionId);
      return;
    }

    // 2. Backpressure handling: If previous frame is still being processed by slow consumers, drop tick
    if (this._isProcessingFrame) {
      this._totalDropped++;
      return;
    }

    this._isProcessingFrame = true;

    try {
      // 3. Privacy Policy Pre-Check
      const winInfo = await this._windowEngine.detectActiveWindows();
      const privacy = this._privacyEngine.evaluateCapturePermission(
        winInfo.activeWindow?.title,
        winInfo.activeWindow?.processName,
        sessionId
      );

      if (!privacy.isPermissible) {
        this._notifyCaptureFailure(
          new Error(privacy.denialReason || "Screen capture was blocked by the privacy policy."),
          sessionId
        );
        this._totalDropped++;
        return;
      }

      // 4. Execute physical capture
      const frame = await this._captureEngine.captureFrame(
        { mode },
        sessionId,
        allowSyntheticFallback
      );

      this._totalCaptured++;
      this._lastSequenceNumber = frame.sequenceNumber;
      this._lastCaptureLatencyMs = frame.captureLatencyMs;
      this._sessionManager.recordFrameCapture(sessionId);

      for (const observer of this._captureObservers) {
        try {
          observer(frame, winInfo.activeWindow?.title);
        } catch (observerError) {
          console.error("[FRAME STREAMING] Capture observer error:", observerError);
        }
      }

      // 5. Adaptive capture frequency calculation
      if (!frame.changeDetected) {
        this._consecutiveStaticFrames++;
        if (this._consecutiveStaticFrames > 3) {
          // Progressively throttle down capture frequency to conserve CPU
          this._currentIntervalMs = Math.min(this._maxIntervalMs, this._currentIntervalMs + 300);
        }
      } else {
        this._consecutiveStaticFrames = 0;
        // Acceleration on detected screen change
        this._currentIntervalMs = Math.max(this._minIntervalMs, this._baseIntervalMs);
      }

      // 6. Push to circular recent buffer
      this._recentFrames.push(frame);
      if (this._recentFrames.length > this._maxRecentFrames) {
        this._recentFrames.shift();
      }

      // 7. Dispatch to registered consumers and await each consumer
      for (const consumer of this._consumers) {
        try {
          await consumer(frame);
          this._totalDelivered++;
        } catch (err) {
          this._consumerErrorsCount++;
          this._lastConsumerError = err instanceof Error ? err.message : String(err);
          console.warn("[FRAME STREAMING] Consumer error:", err);
        }
      }
    } catch (err) {
      this._totalDropped++;
      const error = err instanceof Error ? err : new Error(String(err));
      this._notifyCaptureFailure(error, sessionId);
      console.error("[FRAME STREAMING] Frame cycle failed:", error);
    } finally {
      this._isProcessingFrame = false;
    }
  }
}

/** Global singleton instance of FrameStreamingEngine. */
export const defaultFrameStreamingEngine = new FrameStreamingEngine();
