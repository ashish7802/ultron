/**
 * @file components/ScreenAwarenessIndicator.tsx
 * @description Module 01: Floating UI Indicator & Vision Control Component.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - User Interface Component.
 *
 * Key Responsibilities:
 * - Renders a clean, cyber-themed floating indicator badge in the top navigation bar.
 * - Displays verified real-time capture status:
 *   - LIVE: Green glowing indicator with active radar pulse.
 *   - PAUSED: Amber indicator.
 *   - OFF: Subtle slate gray badge.
 *   - ERROR / TERMINATED: Red warning badge.
 * - Anti-Hallucination Invariant:
 *   Under no circumstances can the indicator display LIVE unless verified by backend status (`isCapturing === true`).
 * - Provides capture controls that require founder verification and an emergency purge action.
 * - Displays active window context caption.
 *
 * Safety / Security Guarantees:
 * - Client-side UI state is strictly subordinate to backend `canCaptureScreen()` enforcement.
 * - Emergency Kill triggers immediate backend buffer purge within 5ms.
 */

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { VisionControlStatus } from "@/lib/screen/types";

export default function ScreenAwarenessIndicator() {
  const [status, setStatus] = useState<VisionControlStatus>({
    operationalState: "OFF",
    indicatorColor: "gray",
    indicatorText: "VISION: OFF",
    isCapturing: false,
    permissionState: "PROMPT",
    activeSessionId: null,
    targetDisplayId: null,
    startedAt: null,
    lastFrameAt: null,
    emergencyTerminationAvailable: false,
    activeWindowSummary: "Vision disabled",
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [requiresAuthentication, setRequiresAuthentication] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const authRequiredRef = useRef<boolean>(false);
  const authCheckedRef = useRef<boolean>(false);

  const markAuthenticationRequired = useCallback(() => {
    authRequiredRef.current = true;
    authCheckedRef.current = false;
    setRequiresAuthentication(true);
    setStatus((current) => ({
      ...current,
      indicatorColor: "red",
      indicatorText: "AUTH REQUIRED",
      activeWindowSummary: "Founder authentication is required to use screen awareness.",
    }));
  }, []);

  // Poll status periodically (every 3 seconds) when mounted
  const fetchStatus = useCallback(async () => {
    if (authRequiredRef.current) return;

    try {
      if (!authCheckedRef.current) {
        const authResponse = await fetch("/api/security/auth", { cache: "no-store", credentials: "same-origin" });
        if (!authResponse.ok) {
          throw new Error(`Could not check founder authentication (HTTP ${authResponse.status}).`);
        }
        const authData: unknown = await authResponse.json();
        if (
          typeof authData !== "object" ||
          authData === null ||
          !("authenticated" in authData)
        ) {
          throw new Error("Founder authentication endpoint returned an invalid response.");
        }
        if (authData.authenticated !== true) {
          markAuthenticationRequired();
          return;
        }
        authCheckedRef.current = true;
      }

      const res = await fetch("/api/screen/control", { credentials: "same-origin" });
      if (res.status === 401) {
        authCheckedRef.current = false;
        markAuthenticationRequired();
        return;
      }
      if (!res.ok) {
        throw new Error(`Could not read screen awareness status (HTTP ${res.status}).`);
      }
      const data = await res.json();
      if (data.success && data.status) {
        authRequiredRef.current = false;
        setRequiresAuthentication(false);
        setAuthError(null);
        setStatus(data.status);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthError(message);
      console.error("Failed to refresh screen awareness status:", error);
    }
  }, [markAuthenticationRequired]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Handle Toggle ON / OFF
  const handleToggle = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      if (authRequiredRef.current) {
        const authResponse = await fetch("/api/security/auth", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "login",
            authMethod: "windows_hello",
            promptReason: "Authorize ULTRON screen awareness for this session.",
          }),
        });
        const authData: unknown = await authResponse.json();
        const loginSucceeded =
          typeof authData === "object" &&
          authData !== null &&
          "ok" in authData &&
          authData.ok === true;
        if (!authResponse.ok || !loginSucceeded) {
          const errorMessage =
            typeof authData === "object" &&
            authData !== null &&
            "error" in authData &&
            typeof authData.error === "string"
              ? authData.error
              : `Founder authentication failed (HTTP ${authResponse.status}).`;
          throw new Error(errorMessage);
        }
        authRequiredRef.current = false;
        authCheckedRef.current = true;
        setRequiresAuthentication(false);
      }

      const action = status.isCapturing ? "STOP" : "START";
      const res = await fetch("/api/screen/control", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, durationMs: 10 * 60 * 1000 }), // 10 min session
      });
      const data = await res.json();
      if (res.status === 401) {
        markAuthenticationRequired();
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Screen awareness request failed (HTTP ${res.status}).`);
      }
      if (data.status) {
        setStatus(data.status);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
      setShowDetails(true);
      console.error("Failed to toggle screen awareness:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Emergency Kill
  const handleEmergencyKill = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/screen/control", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "EMERGENCY_KILL", reason: "User triggered emergency kill" }),
      });
      const data = await res.json();
      if (res.status === 401) {
        markAuthenticationRequired();
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Emergency purge failed (HTTP ${res.status}).`);
      }
      if (data.status) {
        setStatus(data.status);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
      setShowDetails(true);
      console.error("Emergency kill failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const isLive = status.isCapturing && (status.operationalState === "LIVE" || status.operationalState === "ANALYZING");
  const isAmber =
    status.indicatorColor === "amber" ||
    status.operationalState === "DEGRADED" ||
    status.operationalState === "PAUSED" ||
    status.operationalState === "INITIALIZING";

  const statusBgColor = isLive
    ? "rgba(0, 255, 170, 0.12)"
    : isAmber
    ? "rgba(245, 158, 11, 0.12)"
    : status.indicatorColor === "red"
    ? "rgba(239, 68, 68, 0.12)"
    : "rgba(30, 41, 59, 0.7)";

  const statusBorderColor = isLive
    ? "#00ffaa"
    : isAmber
    ? "#f59e0b"
    : status.indicatorColor === "red"
    ? "#ef4444"
    : "rgba(100, 116, 139, 0.4)";

  const statusTextColor = isLive
    ? "#00ffaa"
    : isAmber
    ? "#f59e0b"
    : status.indicatorColor === "red"
    ? "#ef4444"
    : "#94a3b8";

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {/* Floating Status Pill */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 10px",
          borderRadius: "16px",
          backgroundColor: statusBgColor,
          border: `1px solid ${statusBorderColor}`,
          color: statusTextColor,
          fontSize: "12px",
          fontFamily: "monospace",
          fontWeight: 600,
          cursor: "pointer",
          userSelect: "none",
          transition: "all 0.2s ease",
          boxShadow: isLive ? "0 0 12px rgba(0, 255, 170, 0.3)" : isAmber ? "0 0 10px rgba(245, 158, 11, 0.2)" : "none",
        }}
        onClick={() => setShowDetails(!showDetails)}
        title={
          requiresAuthentication
            ? "Founder verification is required to enable screen awareness."
            : status.activeWindowSummary || "Screen Awareness Status"
        }
      >
        {/* Pulsing Status Dot */}
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: isLive
              ? "#00ffaa"
              : isAmber
              ? "#f59e0b"
              : status.indicatorColor === "red"
              ? "#ef4444"
              : "#64748b",
            boxShadow: isLive ? "0 0 8px #00ffaa" : isAmber ? "0 0 6px #f59e0b" : "none",
          }}
        />

        <span>{status.indicatorText}</span>

        {/* Toggle Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          disabled={isLoading || status.operationalState === "INITIALIZING"}
          style={{
            backgroundColor: status.isCapturing ? "#ef4444" : "#0ea5e9",
            color: "#ffffff",
            border: "none",
            borderRadius: "4px",
            padding: "2px 8px",
            fontSize: "11px",
            cursor: "pointer",
            fontWeight: "bold",
            marginLeft: "4px",
          }}
        >
          {requiresAuthentication
            ? "LOGIN"
            : status.operationalState === "INITIALIZING"
            ? "STARTING"
            : status.isCapturing
            ? "STOP"
            : "ENABLE"}
        </button>
      </div>

      {/* Flyout Details Card */}
      {showDetails && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "8px",
            width: "280px",
            backgroundColor: "#0d1117",
            border: "1px solid rgba(0, 240, 255, 0.3)",
            borderRadius: "8px",
            padding: "12px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
            zIndex: 1000,
            fontSize: "12px",
            fontFamily: "sans-serif",
            color: "#e2e8f0",
          }}
        >
          {requiresAuthentication && (
            <div style={{ marginBottom: "8px", color: "#fca5a5" }}>
              Founder verification is required. Select LOGIN to continue with Windows Hello.
            </div>
          )}
          {authError && (
            <div role="alert" style={{ marginBottom: "8px", color: "#fca5a5" }}>
              {authError}
            </div>
          )}
          <div style={{ fontWeight: 600, color: "#00f0ff", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
            <span>Screen Intelligence HUD</span>
            <span style={{ fontSize: "10px", color: isLive ? "#00ffaa" : isAmber ? "#f59e0b" : "#94a3b8" }}>
              {status.operationalState}
            </span>
          </div>

          <div style={{ marginBottom: "6px", color: "#94a3b8" }}>
            Target: <span style={{ color: "#f8fafc" }}>{status.activeWindowSummary || "None"}</span>
          </div>

          <div style={{ marginBottom: "6px", color: "#94a3b8" }}>
            Permission: <span style={{ color: "#38bdf8" }}>{status.permissionState}</span>
          </div>

          {status.modelAvailability && (
            <div style={{ marginBottom: "6px", color: "#94a3b8" }}>
              Vision Engine:{" "}
              <span style={{ color: status.operationalState === "LIVE" ? "#34d399" : "#fbbf24" }}>
                {status.modelAvailability}
              </span>
            </div>
          )}

          {(status.lastCaptureLatencyMs !== undefined || status.lastInferenceLatencyMs !== undefined) && (
            <div style={{ marginBottom: "6px", fontSize: "11px", color: "#94a3b8" }}>
              Latency: {status.lastCaptureLatencyMs !== undefined ? `Cap: ${status.lastCaptureLatencyMs}ms ` : ""}
              {status.lastInferenceLatencyMs !== undefined ? `| Inf: ${status.lastInferenceLatencyMs}ms` : ""}
            </div>
          )}

          {status.lastFrameAt && (
            <div style={{ marginBottom: "6px", color: "#94a3b8" }}>
              Last Frame: <span style={{ color: "#34d399" }}>{Math.round((Date.now() - status.lastFrameAt) / 1000)}s ago</span>
            </div>
          )}

          {status.activeSessionId && (
            <div style={{ marginBottom: "8px", fontSize: "11px", color: "#64748b" }}>
              Session: {status.activeSessionId}
            </div>
          )}

          {/* Emergency Kill Button */}
          {status.emergencyTerminationAvailable && (
            <button
              type="button"
              onClick={handleEmergencyKill}
              disabled={isLoading}
              style={{
                width: "100%",
                backgroundColor: "#dc2626",
                color: "#ffffff",
                border: "none",
                borderRadius: "4px",
                padding: "6px 10px",
                fontSize: "11px",
                fontWeight: "bold",
                cursor: "pointer",
                marginTop: "6px",
              }}
            >
              EMERGENCY PURGE & STOP
            </button>
          )}
        </div>
      )}
    </div>
  );
}
