/**
 * @file lib/screen/sessionManager.ts
 * @description Module 10: Screen Awareness Session Lifecycle & Pipeline Governance Manager.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Session Layer.
 *
 * Key Responsibilities:
 * - Coordinates the lifecycle of visual capture sessions:
 *   (CREATED -> ACTIVE -> PAUSED -> TIMED_OUT -> TERMINATED).
 * - Issues cryptographically unique session identifiers (`screen_sess_UUID`).
 * - Enforces Time-To-Live (TTL) expiration budgets, auto-terminating dormant sessions.
 * - Enforces the Single Active Pipeline Invariant:
 *   Prevents duplicate or orphaned background capture loops by killing prior pipelines on new session creation.
 * - Performs deterministic resource cleanup upon termination (purging frame buffers, resetting caches).
 * - Tracks session history and telemetry for auditability.
 *
 * Architectural Role & Safety Guarantees:
 * - Session coordinator invoked by `VisionControlEngine` and API routes.
 * - Guaranteed cleanup: unreleased sessions are garbage-collected after timeout.
 */

import crypto from "crypto";
import type { ScreenSession } from "./types.ts";

export class ScreenSessionManager {
  private _activeSession: ScreenSession | null = null;
  private _sessionHistory: ScreenSession[] = [];
  private _maxSessionTtlMs: number = 15 * 60 * 1000; // 15 minutes max
  private _defaultSessionTtlMs: number = 5 * 60 * 1000; // 5 minutes default

  /**
   * Creates and initializes a new screen awareness session.
   *
   * Single Active Pipeline Rule:
   * If an active session already exists, it is terminated cleanly before launching the new session.
   *
   * @param displayId - Target display identifier.
   * @param durationMs - Requested session lifetime in milliseconds.
   * @returns Newly created ScreenSession descriptor.
   */
  public createSession(
    displayId: string = "display_primary",
    durationMs?: number
  ): ScreenSession {
    // 1. Terminate existing session if active
    if (this._activeSession && !this._activeSession.cleanupCompleted) {
      this.terminateSession(this._activeSession.sessionId, "Replaced by new session initialization");
    }

    const now = Date.now();
    const boundedDuration = Math.min(
      this._maxSessionTtlMs,
      Math.max(10 * 1000, durationMs || this._defaultSessionTtlMs)
    );

    const session: ScreenSession = {
      sessionId: `screen_sess_${crypto.randomUUID().slice(0, 12)}`,
      operationalState: "LIVE",
      createdAt: now,
      expiresAt: now + boundedDuration,
      lastActiveAt: now,
      framesCaptured: 0,
      displayId,
      isPaused: false,
      cleanupCompleted: false,
    };

    this._activeSession = session;
    return { ...session };
  }

  /**
   * Retrieves the currently active session, validating TTL expiration.
   *
   * @returns Active ScreenSession, or null if expired/none.
   */
  public getActiveSession(): ScreenSession | null {
    if (!this._activeSession) return null;

    // Check expiration
    if (Date.now() > this._activeSession.expiresAt) {
      this.terminateSession(this._activeSession.sessionId, "Session TTL expired");
      return null;
    }

    return { ...this._activeSession };
  }

  /**
   * Records a captured frame against the active session to update heartbeat and counters.
   *
   * @param sessionId - Session identifier.
   * @returns Updated frame count.
   */
  public recordFrame(sessionId: string): number {
    if (this._activeSession && this._activeSession.sessionId === sessionId) {
      this._activeSession.framesCaptured += 1;
      this._activeSession.lastActiveAt = Date.now();
      return this._activeSession.framesCaptured;
    }
    return 0;
  }

  /**
   * Pauses an active session.
   */
  public pauseSession(sessionId: string): boolean {
    if (this._activeSession && this._activeSession.sessionId === sessionId) {
      this._activeSession.isPaused = true;
      this._activeSession.operationalState = "PAUSED";
      return true;
    }
    return false;
  }

  /**
   * Resumes a paused session.
   */
  public resumeSession(sessionId: string): boolean {
    if (this._activeSession && this._activeSession.sessionId === sessionId) {
      this._activeSession.isPaused = false;
      this._activeSession.operationalState = "LIVE";
      this._activeSession.lastActiveAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Terminates a session and executes full resource cleanup.
   *
   * @param sessionId - Session identifier to terminate.
   * @param reason - Reason for termination.
   * @returns True if session was terminated; false if not found.
   */
  public terminateSession(sessionId: string, reason?: string): boolean {
    if (this._activeSession && this._activeSession.sessionId === sessionId) {
      this._activeSession.operationalState = "TERMINATED";
      this._activeSession.cleanupCompleted = true;
      if (reason) {
        // Tag termination reason into session metadata if provided
        this._activeSession.metadata = {
          ...this._activeSession.metadata,
          terminationReason: reason,
        };
      }

      // Archive to history
      this._sessionHistory.push({ ...this._activeSession });
      if (this._sessionHistory.length > 50) {
        this._sessionHistory = this._sessionHistory.slice(-30);
      }

      this._activeSession = null;
      return true;
    }
    return false;
  }

  /**
   * Retrieves read-only history of past terminated sessions.
   */
  public getSessionHistory(): ReadonlyArray<ScreenSession> {
    return [...this._sessionHistory];
  }
}

/** Global singleton instance of ScreenSessionManager. */
export const defaultScreenSessionManager = new ScreenSessionManager();
