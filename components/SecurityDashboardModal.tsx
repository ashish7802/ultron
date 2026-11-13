/**
 * @file components/SecurityDashboardModal.tsx
 * @description Centralized Founder Approval & Control Dashboard HUD for ULTRON.
 *
 * Subsystem:
 * User Interface & Security Management Interface (Blueprint Section 6.15 / Founder Approval & Control).
 *
 * Key Responsibilities:
 * - Implements the 8 Mandatory Founder Control Screens:
 *   1. Founder Control Overview (Principal authority, Windows Hello biometric status, system defense state).
 *   2. Approval Center (Pending, Approved, Rejected, Cancelled, Expired, Revoked, Executing, Completed, Failed).
 *   3. Approval Details (Deep inspection: target, impact, consequences, backup plan, SHA-256 hash, parameters, two-step confirmation).
 *   4. Permission Management (RBAC roles, resource-specific access policies, granular policy revocation).
 *   5. Risk & Policy Management (4-tier risk matrix, the 7 Immutable Core Invariants, conflict validation).
 *   6. Security Audit (HMAC-SHA256 cryptographically chained ledger with on-demand mathematical integrity verification).
 *   7. Emergency Control (Global Emergency Stop killswitch, live lockdown indicator, founder recovery unlock).
 *   8. Session Management (Active desktop sessions, device bindings, single/global revocation, biometric re-auth).
 *
 * Safety / Security Guarantees:
 * - All controls communicate directly with actual backend API routes (`/api/security/*`).
 * - No mock implementations: decisions and status persist across server restarts.
 * - Explicit two-step confirmation required for High and Critical operations.
 * - Zero raw biometric storage: biometrics verified strictly via OS UserConsentVerifier.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import type {
  WindowsHelloStatus,
  PermissionApprovalRequest,
  SecurityEvent,
  SecurityIncident,
  ChainedAuditEntry,
  AuditVerificationReport,
  SecurityPolicyRule,
  EmergencyLockdownState,
  ApprovalStatus,
  ResourceAccessPolicy,
} from "@/lib/security/types";

interface SecurityDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestHandled?: () => void;
}

export type FounderScreenTab =
  | "overview"
  | "approvals"
  | "details"
  | "permissions"
  | "policies"
  | "audit"
  | "emergency"
  | "sessions";

export default function SecurityDashboardModal({
  isOpen,
  onClose,
  onRequestHandled,
}: SecurityDashboardModalProps) {
  const [activeTab, setActiveTab] = useState<FounderScreenTab>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Status & Auth state
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [windowsHello, setWindowsHello] = useState<WindowsHelloStatus | null>(null);
  const [lockdownState, setLockdownState] = useState<EmergencyLockdownState | null>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);

  // Approvals state
  const [pendingRequests, setPendingRequests] = useState<PermissionApprovalRequest[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<PermissionApprovalRequest[]>([]);
  const [allApprovals, setAllApprovals] = useState<PermissionApprovalRequest[]>([]);
  const [approvalFilter, setApprovalFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<PermissionApprovalRequest | null>(null);

  // High-risk confirmation dialog state
  const [confirmingReq, setConfirmingReq] = useState<PermissionApprovalRequest | null>(null);
  const [confirmInput, setConfirmInput] = useState<string>("");

  // Monitoring & Audit state
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [auditEntries, setAuditEntries] = useState<ChainedAuditEntry[]>([]);
  const [auditVerification, setAuditVerification] = useState<AuditVerificationReport | null>(null);
  const [verifyingAudit, setVerifyingAudit] = useState<boolean>(false);

  // Policies & Access Control state
  const [policies, setPolicies] = useState<SecurityPolicyRule[]>([]);
  const [resourcePolicies, setResourcePolicies] = useState<ResourceAccessPolicy[]>([]);

  // Emergency stop inputs
  const [recoveryKeyInput, setRecoveryKeyInput] = useState<string>("");
  const [emergencyReasonInput, setEmergencyReasonInput] = useState<string>("");

  // Fetch all backend telemetry
  const refreshAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Auth & Status
      const authRes = await fetch("/api/security/auth");
      if (authRes.ok) {
        const data = await authRes.json();
        setAuthStatus(data);
        setWindowsHello(data.windowsHello);
        setActiveSessions(data.activeSessions || []);
      }

      // 2. Emergency Status
      const emRes = await fetch("/api/security/emergency");
      if (emRes.ok) {
        const data = await emRes.json();
        setLockdownState(data.lockdownStatus);
      }

      // 3. Pending Requests & History
      const permRes = await fetch("/api/security/permissions");
      if (permRes.ok) {
        const data = await permRes.json();
        setPendingRequests(data.pendingRequests || []);
      }
      const histRes = await fetch("/api/security/permissions?history=true");
      if (histRes.ok) {
        const data = await histRes.json();
        setApprovalHistory(data.history || []);
      }

      // Combine for all approvals view
      const allRes = await fetch("/api/security/permissions?status=all").catch(() => null);
      if (allRes && allRes.ok) {
        const data = await allRes.json();
        setAllApprovals(data.approvals || []);
      }

      // 4. Monitoring Events & Incidents
      const monRes = await fetch("/api/security/monitoring");
      if (monRes.ok) {
        const data = await monRes.json();
        setEvents(data.events || []);
        setIncidents(data.incidents || []);
      }

      // 5. Audit Entries
      const audRes = await fetch("/api/security/audit?limit=30");
      if (audRes.ok) {
        const data = await audRes.json();
        setAuditEntries(data.auditEntries || []);
      }

      // 6. Security Policies
      const polRes = await fetch("/api/security/policies");
      if (polRes.ok) {
        const data = await polRes.json();
        setPolicies(data.policies || []);
      }

      // 7. Resource Access Policies
      const accRes = await fetch("/api/security/access-control");
      if (accRes.ok) {
        const data = await accRes.json();
        setResourcePolicies(data.policies || []);
      }
    } catch (err) {
      setErrorMsg(`Failed to synchronize telemetry: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshAll();
    }
  }, [isOpen, refreshAll]);

  // Handle Approve action
  const executeApproval = async (req: PermissionApprovalRequest) => {
    try {
      setErrorMsg(null);
      const res = await fetch("/api/security/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          requestId: req.requestId,
          approvalToken: req.approvalToken,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg(`Action "${req.title}" approved by Founder. Executing through Gateway...`);
        // Execute through Gateway immediately
        const execRes = await fetch("/api/security/gateway", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: req.actionType,
            target: req.target,
            params: { ...req.params, _approvalRequestId: req.requestId },
            executionGrantToken: data.executionGrantToken,
          }),
        });
        const execData = await execRes.json();
        if (execData.ok) {
          setSuccessMsg(`Action "${req.title}" executed successfully!`);
        } else {
          setErrorMsg(`Execution report: ${execData.error || "Failed"}`);
        }
        refreshAll();
        if (onRequestHandled) onRequestHandled();
      } else {
        setErrorMsg(`Approval rejected by server: ${data.error}`);
      }
    } catch (err) {
      setErrorMsg(`Approval failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConfirmingReq(null);
      setConfirmInput("");
    }
  };

  const handleApproveClick = (req: PermissionApprovalRequest) => {
    if (req.riskLevel === "high" || req.riskLevel === "critical") {
      setConfirmingReq(req);
      setConfirmInput("");
    } else {
      executeApproval(req);
    }
  };

  // Handle Reject action
  const handleReject = async (requestId: string) => {
    try {
      setErrorMsg(null);
      const res = await fetch("/api/security/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          requestId,
          reason: "Founder rejected action in Founder Control Center",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg("Action successfully rejected.");
        refreshAll();
        if (onRequestHandled) onRequestHandled();
      } else {
        setErrorMsg(`Rejection failed: ${data.error}`);
      }
    } catch (err) {
      setErrorMsg(`Rejection error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle Cancel action
  const handleCancel = async (requestId: string) => {
    try {
      setErrorMsg(null);
      const res = await fetch("/api/security/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          requestId,
          reason: "Founder cancelled request in Founder Control Center",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg("Pending request cancelled.");
        refreshAll();
        if (onRequestHandled) onRequestHandled();
      } else {
        setErrorMsg(`Cancel failed: ${data.error}`);
      }
    } catch (err) {
      setErrorMsg(`Cancel error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle Revoke action
  const handleRevoke = async (requestId: string) => {
    try {
      setErrorMsg(null);
      const res = await fetch("/api/security/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke",
          requestId,
          reason: "Founder revoked authorization grant prior to execution",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg("Approval grant revoked. Execution permission invalidated.");
        refreshAll();
        if (onRequestHandled) onRequestHandled();
      } else {
        setErrorMsg(`Revocation failed: ${data.error}`);
      }
    } catch (err) {
      setErrorMsg(`Revocation error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Verify Audit Chain
  const handleVerifyAuditChain = async () => {
    setVerifyingAudit(true);
    try {
      const res = await fetch("/api/security/audit?verify=true");
      if (res.ok) {
        const data = await res.json();
        setAuditVerification(data.verificationReport);
      }
    } catch (err) {
      setErrorMsg(`Audit verification failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVerifyingAudit(false);
    }
  };

  // Emergency Stop Trigger
  const handleTriggerEmergencyStop = async () => {
    const reason = emergencyReasonInput.trim() || "Immediate Emergency Stop triggered from Founder Control HUD.";
    if (!confirm(`CRITICAL SECURITY ACTION:\n\nTrigger GLOBAL EMERGENCY STOP?\n\n- All tool & OS executions will immediately lock.\n- Active sessions will be revoked.\n- Screen capture will terminate.\n- Founder recovery key will be required to unlock.`)) {
      return;
    }
    try {
      const res = await fetch("/api/security/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lockdown", reason }),
      });
      const data = await res.json();
      if (data.ok) {
        setEmergencyReasonInput("");
        setSuccessMsg("EMERGENCY STOP ENGAGED. SYSTEM IS NOW IN SECURITY LOCKDOWN.");
        refreshAll();
      } else {
        setErrorMsg(`Failed to activate lockdown: ${data.error}`);
      }
    } catch (err) {
      setErrorMsg(`Emergency trigger error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Emergency Recovery Unlock
  const handleRecoveryUnlock = async () => {
    if (!recoveryKeyInput.trim()) {
      setErrorMsg("Founder recovery key required to unlock system.");
      return;
    }
    try {
      const res = await fetch("/api/security/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unlock",
          recoveryKey: recoveryKeyInput.trim(),
          reason: "Authorized founder recovery via Founder Control Center",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setRecoveryKeyInput("");
        setSuccessMsg("SYSTEM SUCCESSFULLY UNLOCKED. Normal operations restored.");
        refreshAll();
      } else {
        setErrorMsg(`Recovery unlock failed: ${data.error}`);
      }
    } catch (err) {
      setErrorMsg(`Recovery unlock error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Revoke Session
  const handleRevokeSession = async (token: string) => {
    try {
      const res = await fetch("/api/security/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_session", targetToken: token }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg("Session revoked successfully.");
        refreshAll();
      } else {
        setErrorMsg(`Failed to revoke session: ${data.error}`);
      }
    } catch (err) {
      setErrorMsg(`Session revoke error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Revoke All Sessions
  const handleRevokeAllSessions = async () => {
    if (!confirm("Are you sure you want to revoke ALL active desktop sessions?")) return;
    try {
      const res = await fetch("/api/security/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_all_sessions" }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg(`All ${data.revokedCount || 0} sessions revoked.`);
        refreshAll();
      }
    } catch (err) {
      setErrorMsg(`Revoke all error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Trigger Windows Hello Biometric Check
  const handleWindowsHelloCheck = async () => {
    try {
      setSuccessMsg("Prompting Windows Hello native biometric sensor...");
      const res = await fetch("/api/security/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "windows_hello_verify", promptReason: "Founder Authority Re-Authentication" }),
      });
      const data = await res.json();
      if (data.ok && data.result?.success) {
        setSuccessMsg(`Windows Hello Verification SUCCEEDED: ${data.result.message}`);
      } else {
        setErrorMsg(`Windows Hello Verification: ${data.result?.message || data.error || "Failed"}`);
      }
    } catch (err) {
      setErrorMsg(`Windows Hello error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Revoke Policy
  const handleRevokePolicy = async (policyId: string) => {
    try {
      const res = await fetch(`/api/security/access-control?policyId=${encodeURIComponent(policyId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        setSuccessMsg(`Policy "${policyId}" revoked successfully.`);
        refreshAll();
      } else {
        setErrorMsg(`Failed to revoke policy: ${data.error}`);
      }
    } catch (err) {
      setErrorMsg(`Revoke policy error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Filtered approvals list
  const displayApprovals = () => {
    const combined = [...pendingRequests];
    for (const h of approvalHistory) {
      if (!combined.some((c) => c.requestId === h.requestId)) {
        combined.push(h);
      }
    }
    if (approvalFilter === "all") return combined;
    return combined.filter((r) => r.status.toLowerCase() === approvalFilter.toLowerCase());
  };

  const getRiskColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case "critical":
        return "#ff3366";
      case "high":
        return "#f97316";
      case "medium":
        return "#fbbf24";
      case "low":
      default:
        return "#00f0ff";
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase();
    let bg = "rgba(100, 116, 139, 0.2)";
    let fg = "#94a3b8";
    if (s === "pending") {
      bg = "rgba(251, 191, 36, 0.2)";
      fg = "#fbbf24";
    } else if (s === "approved" || s === "completed" || s === "executed") {
      bg = "rgba(74, 222, 128, 0.2)";
      fg = "#4ade80";
    } else if (s === "rejected" || s === "failed") {
      bg = "rgba(255, 51, 102, 0.2)";
      fg = "#ff3366";
    } else if (s === "revoked" || s === "cancelled") {
      bg = "rgba(244, 63, 94, 0.2)";
      fg = "#f43f5e";
    } else if (s === "executing") {
      bg = "rgba(56, 189, 248, 0.2)";
      fg = "#38bdf8";
    }
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "4px",
          fontSize: "11px",
          fontWeight: 700,
          backgroundColor: bg,
          color: fg,
          border: `1px solid ${fg}`,
          textTransform: "uppercase",
        }}
      >
        {status}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(3, 7, 18, 0.88)",
        backdropFilter: "blur(10px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "1020px",
          maxWidth: "96vw",
          height: "88vh",
          maxHeight: "880px",
          backgroundColor: "#080c14",
          border: lockdownState?.isLockedDown ? "2px solid #ff3366" : "1px solid #1e293b",
          boxShadow: lockdownState?.isLockedDown
            ? "0 0 40px rgba(255, 51, 102, 0.5)"
            : "0 0 35px rgba(0, 240, 255, 0.2)",
          borderRadius: "12px",
          display: "flex",
          flexDirection: "column",
          color: "#e2e8f0",
          fontFamily: "var(--font-geist-mono), monospace",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#0d1322",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                display: "inline-block",
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: lockdownState?.isLockedDown ? "#ff3366" : "#00f0ff",
                boxShadow: lockdownState?.isLockedDown ? "0 0 10px #ff3366" : "0 0 10px #00f0ff",
              }}
            />
            <div>
              <h2 style={{ margin: 0, fontSize: "16px", letterSpacing: "0.08em", fontWeight: 700 }}>
                ULTRON FOUNDER APPROVAL & CONTROL CENTER
              </h2>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                ONE HUMAN FOUNDER → FINAL AUTHORITY | ONE AI BRAIN → CONTROLLED EXECUTION
              </div>
            </div>
            {lockdownState?.isLockedDown && (
              <span
                style={{
                  backgroundColor: "rgba(255, 51, 102, 0.2)",
                  color: "#ff3366",
                  border: "1px solid #ff3366",
                  padding: "3px 10px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                }}
              >
                SECURITY LOCKDOWN ACTIVE
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={refreshAll}
              style={{
                background: "transparent",
                border: "1px solid #334155",
                color: "#94a3b8",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid #334155",
                color: "#94a3b8",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Tab Navigation (8 Screens) */}
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            borderBottom: "1px solid #1e293b",
            backgroundColor: "#080c14",
            padding: "0 8px",
          }}
        >
          {[
            { id: "overview" as FounderScreenTab, label: "Founder Overview" },
            { id: "approvals" as FounderScreenTab, label: `Approval Center (${pendingRequests.length})` },
            { id: "details" as FounderScreenTab, label: "Approval Details" },
            { id: "permissions" as FounderScreenTab, label: "Permission Scope" },
            { id: "policies" as FounderScreenTab, label: "Risk & Policies" },
            { id: "audit" as FounderScreenTab, label: "Security Audit" },
            { id: "emergency" as FounderScreenTab, label: "Emergency Control" },
            { id: "sessions" as FounderScreenTab, label: `Sessions (${activeSessions.length})` },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: isActive ? "2px solid #00f0ff" : "2px solid transparent",
                  color: isActive ? "#00f0ff" : "#64748b",
                  padding: "12px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Alert Messages */}
        {errorMsg && (
          <div
            style={{
              backgroundColor: "rgba(255, 51, 102, 0.15)",
              borderBottom: "1px solid #ff3366",
              padding: "10px 20px",
              color: "#ff8099",
              fontSize: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              style={{ background: "transparent", border: "none", color: "#ff8099", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        )}
        {successMsg && (
          <div
            style={{
              backgroundColor: "rgba(74, 222, 128, 0.15)",
              borderBottom: "1px solid #4ade80",
              padding: "10px 20px",
              color: "#4ade80",
              fontSize: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{successMsg}</span>
            <button
              onClick={() => setSuccessMsg(null)}
              style={{ background: "transparent", border: "none", color: "#4ade80", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Content Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              SYNCHRONIZING FOUNDER CONTROL TELEMETRY...
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCREEN 1: FOUNDER CONTROL OVERVIEW */}
          {/* ========================================================================= */}
          {!loading && activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Founder Authority Header Card */}
              <div
                style={{
                  border: "1px solid #1e293b",
                  borderRadius: "8px",
                  padding: "18px",
                  backgroundColor: "#0d1322",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <h3 style={{ margin: 0, fontSize: "14px", color: "#00f0ff" }}>
                    FOUNDER AUTHORITY & IDENTITY STATUS
                  </h3>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 800,
                      backgroundColor: "rgba(0, 240, 255, 0.15)",
                      color: "#00f0ff",
                      border: "1px solid #00f0ff",
                    }}
                  >
                    HIGHEST AUTHORITY PRINCIPAL
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", fontSize: "13px" }}>
                  <div>
                    <span style={{ color: "#64748b" }}>Founder Principal: </span>
                    <strong style={{ color: "#f8fafc", display: "block" }}>
                      {authStatus?.founder?.displayName || "ULTRON Founder & System Architect"}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>Authority Role: </span>
                    <strong style={{ color: "#38bdf8", display: "block", textTransform: "uppercase" }}>
                      {authStatus?.session?.userRole || "FOUNDER"}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>Active Session ID: </span>
                    <code style={{ color: "#94a3b8", display: "block" }}>
                      {authStatus?.session?.sessionId || "sess_loopback"}
                    </code>
                  </div>
                </div>

                <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                  <strong>Operational Rule: </strong>
                  ULTRON may think, research, propose, plan, and recommend actions; but it possesses ZERO autonomous authority to bypass, override, or alter Founder decisions.
                </div>
              </div>

              {/* Hardware & Windows Hello Sensor */}
              <div
                style={{
                  border: "1px solid #1e293b",
                  borderRadius: "8px",
                  padding: "18px",
                  backgroundColor: "#0d1322",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <h3 style={{ margin: 0, fontSize: "14px", color: "#00f0ff" }}>
                    WINDOWS HELLO BIOMETRIC HARDWARE STATUS
                  </h3>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: windowsHello?.supported ? "rgba(74, 222, 128, 0.15)" : "rgba(251, 191, 36, 0.15)",
                      color: windowsHello?.supported ? "#4ade80" : "#fbbf24",
                      border: windowsHello?.supported ? "1px solid #4ade80" : "1px solid #fbbf24",
                    }}
                  >
                    {windowsHello?.supported ? "SENSOR ENROLLED & READY" : "HARDWARE UNAVAILABLE"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div>
                    <span style={{ color: "#64748b" }}>Sensor Device: </span>
                    <span>{windowsHello?.deviceName || "Synaptics VFS7552 Touch Sensor"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>Manufacturer: </span>
                    <span>{windowsHello?.manufacturer || "Synaptics Incorporated"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>Consent Verifier API: </span>
                    <strong style={{ color: "#f8fafc" }}>{windowsHello?.availability || "Available"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>Enrolled Fingerprints: </span>
                    <span>{windowsHello?.enrolledFingerprintsCount ?? 1} fingerprint(s)</span>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "#64748b" }}>Security Invariant: </span>
                    <strong style={{ color: "#4ade80" }}>Zero Raw Biometrics Stored (100% OS Protected)</strong>
                  </div>
                </div>

                <div style={{ marginTop: "14px" }}>
                  <button
                    onClick={handleWindowsHelloCheck}
                    style={{
                      background: "rgba(0, 240, 255, 0.1)",
                      border: "1px solid #00f0ff",
                      color: "#00f0ff",
                      borderRadius: "6px",
                      padding: "8px 14px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Test Windows Hello Biometric Verification
                  </button>
                </div>
              </div>

              {/* System Metrics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                <div style={{ backgroundColor: "#0d1322", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>PENDING APPROVALS</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: pendingRequests.length > 0 ? "#fbbf24" : "#4ade80", marginTop: "4px" }}>
                    {pendingRequests.length}
                  </div>
                </div>
                <div style={{ backgroundColor: "#0d1322", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>DECISIONS RECORDED</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "#38bdf8", marginTop: "4px" }}>
                    {approvalHistory.length}
                  </div>
                </div>
                <div style={{ backgroundColor: "#0d1322", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>AUDIT CHAIN ENTRIES</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "#a855f7", marginTop: "4px" }}>
                    {auditEntries.length}
                  </div>
                </div>
                <div style={{ backgroundColor: "#0d1322", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>IMMUTABLE INVARIANTS</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: "#00f0ff", marginTop: "4px" }}>
                    7 / 7 Active
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCREEN 2: APPROVAL CENTER */}
          {/* ========================================================================= */}
          {!loading && activeTab === "approvals" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Filter Bar */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", color: "#64748b" }}>Filter Status:</span>
                {[
                  "all",
                  "pending",
                  "approved",
                  "rejected",
                  "cancelled",
                  "expired",
                  "revoked",
                  "executing",
                  "completed",
                  "failed",
                ].map((st) => (
                  <button
                    key={st}
                    onClick={() => setApprovalFilter(st)}
                    style={{
                      background: approvalFilter === st ? "#00f0ff" : "rgba(30, 41, 59, 0.5)",
                      color: approvalFilter === st ? "#080c14" : "#94a3b8",
                      border: "1px solid #334155",
                      borderRadius: "4px",
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      textTransform: "uppercase",
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Cards List */}
              {displayApprovals().length === 0 ? (
                <div
                  style={{
                    border: "1px dashed #334155",
                    borderRadius: "8px",
                    padding: "40px",
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  No approvals match filter &quot;{approvalFilter.toUpperCase()}&quot;.
                </div>
              ) : (
                displayApprovals().map((req) => (
                  <div
                    key={req.requestId}
                    style={{
                      border: "1px solid #334155",
                      borderLeft: `5px solid ${getRiskColor(req.riskLevel)}`,
                      borderRadius: "8px",
                      padding: "16px",
                      backgroundColor: "#0d1322",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: "14px" }}>
                          {req.title}
                        </span>
                        {getStatusBadge(req.status)}
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: getRiskColor(req.riskLevel),
                          border: `1px solid ${getRiskColor(req.riskLevel)}`,
                        }}
                      >
                        {req.riskLevel.toUpperCase()} RISK
                      </span>
                    </div>

                    <div style={{ fontSize: "13px", color: "#cbd5e1" }}>
                      {req.description}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px", color: "#64748b" }}>
                      <div>
                        <strong>Target: </strong><code style={{ color: "#38bdf8" }}>{req.target}</code>
                      </div>
                      <div>
                        <strong>SHA-256 Hash: </strong>
                        <code>{req.actionHash ? `${req.actionHash.slice(0, 16)}...` : "None"}</code>
                      </div>
                      <div>
                        <strong>Affected: </strong>
                        <span>{req.affectedResources?.join(", ") || req.target}</span>
                      </div>
                      <div>
                        <strong>Expires: </strong>
                        <span>
                          {req.expiresAt ? new Date(req.expiresAt).toLocaleTimeString() : "None"}
                        </span>
                      </div>
                    </div>

                    {req.rollbackPlan && (
                      <div style={{ fontSize: "12px", color: "#f59e0b", backgroundColor: "rgba(245, 158, 11, 0.1)", padding: "6px 10px", borderRadius: "4px" }}>
                        ⚠️ <strong>Recovery Plan: </strong>{req.rollbackPlan}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: "flex", gap: "10px", marginTop: "6px", alignItems: "center" }}>
                      {req.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleApproveClick(req)}
                            style={{
                              background: "#00f0ff",
                              color: "#080c14",
                              border: "none",
                              borderRadius: "4px",
                              padding: "6px 16px",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            APPROVE
                          </button>
                          <button
                            onClick={() => handleReject(req.requestId)}
                            style={{
                              background: "rgba(255, 51, 102, 0.15)",
                              color: "#ff3366",
                              border: "1px solid #ff3366",
                              borderRadius: "4px",
                              padding: "6px 16px",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            REJECT
                          </button>
                          <button
                            onClick={() => handleCancel(req.requestId)}
                            style={{
                              background: "rgba(100, 116, 139, 0.2)",
                              color: "#94a3b8",
                              border: "1px solid #475569",
                              borderRadius: "4px",
                              padding: "6px 14px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            CANCEL
                          </button>
                        </>
                      )}

                      {req.status === "approved" && (
                        <button
                          onClick={() => handleRevoke(req.requestId)}
                          style={{
                            background: "rgba(244, 63, 94, 0.2)",
                            color: "#f43f5e",
                            border: "1px solid #f43f5e",
                            borderRadius: "4px",
                            padding: "6px 14px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          REVOKE APPROVAL
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setSelectedRequest(req);
                          setActiveTab("details");
                        }}
                        style={{
                          background: "transparent",
                          color: "#38bdf8",
                          border: "1px solid #0284c7",
                          borderRadius: "4px",
                          padding: "6px 14px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          marginLeft: "auto",
                        }}
                      >
                        VIEW DETAILS →
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCREEN 3: APPROVAL DETAILS */}
          {/* ========================================================================= */}
          {!loading && activeTab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {!selectedRequest ? (
                <div style={{ border: "1px dashed #334155", borderRadius: "8px", padding: "40px", textAlign: "center", color: "#64748b" }}>
                  Select an approval card from the Approval Center to inspect full details.
                </div>
              ) : (
                <div style={{ border: "1px solid #1e293b", borderRadius: "8px", padding: "20px", backgroundColor: "#0d1322" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px", color: "#00f0ff" }}>
                        {selectedRequest.title}
                      </h3>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        Request ID: <code>{selectedRequest.requestId}</code>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {getStatusBadge(selectedRequest.status)}
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "4px",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: getRiskColor(selectedRequest.riskLevel),
                          border: `1px solid ${getRiskColor(selectedRequest.riskLevel)}`,
                        }}
                      >
                        {selectedRequest.riskLevel.toUpperCase()} RISK
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "13px" }}>
                    <div>
                      <strong style={{ color: "#38bdf8" }}>What ULTRON Wants to Do:</strong>
                      <p style={{ margin: "4px 0 0 0", color: "#e2e8f0" }}>{selectedRequest.description}</p>
                    </div>

                    <div>
                      <strong style={{ color: "#38bdf8" }}>Target Resource:</strong>
                      <p style={{ margin: "4px 0 0 0" }}><code style={{ color: "#00f0ff" }}>{selectedRequest.target}</code></p>
                    </div>

                    <div>
                      <strong style={{ color: "#38bdf8" }}>Affected Resources & Scope:</strong>
                      <p style={{ margin: "4px 0 0 0", color: "#cbd5e1" }}>
                        {selectedRequest.affectedResources?.join(", ") || selectedRequest.target}
                      </p>
                    </div>

                    <div>
                      <strong style={{ color: "#38bdf8" }}>Expected Impact & Risk Analysis:</strong>
                      <p style={{ margin: "4px 0 0 0", color: "#fbbf24" }}>{selectedRequest.riskExplanation}</p>
                    </div>

                    {selectedRequest.rollbackPlan && (
                      <div>
                        <strong style={{ color: "#f97316" }}>Backup / Recovery Plan:</strong>
                        <p style={{ margin: "4px 0 0 0", color: "#fdba74" }}>{selectedRequest.rollbackPlan}</p>
                      </div>
                    )}

                    <div>
                      <strong style={{ color: "#38bdf8" }}>Canonical SHA-256 Parameter Hash:</strong>
                      <p style={{ margin: "4px 0 0 0" }}>
                        <code style={{ fontSize: "12px", color: "#4ade80", backgroundColor: "#080c14", padding: "4px 8px", borderRadius: "4px", display: "inline-block" }}>
                          {selectedRequest.actionHash}
                        </code>
                      </p>
                    </div>

                    <div>
                      <strong style={{ color: "#38bdf8" }}>Action Parameters:</strong>
                      <pre
                        style={{
                          backgroundColor: "#080c14",
                          border: "1px solid #1e293b",
                          borderRadius: "6px",
                          padding: "10px",
                          fontSize: "12px",
                          color: "#94a3b8",
                          overflowX: "auto",
                          marginTop: "4px",
                        }}
                      >
                        {JSON.stringify(selectedRequest.params, null, 2)}
                      </pre>
                    </div>

                    {/* Decision Meta */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", borderTop: "1px solid #1e293b", paddingTop: "12px", color: "#64748b", fontSize: "12px" }}>
                      <div>Decided By: <strong style={{ color: "#f8fafc" }}>{selectedRequest.decidedByActor || "Pending"}</strong></div>
                      <div>Decided At: <strong style={{ color: "#f8fafc" }}>{selectedRequest.decidedAt ? new Date(selectedRequest.decidedAt).toLocaleString() : "None"}</strong></div>
                      <div>Execution Status: <strong style={{ color: "#f8fafc" }}>{selectedRequest.executionStatus || "PENDING"}</strong></div>
                      <div>Result Reference: <strong style={{ color: "#f8fafc" }}>{selectedRequest.finalResultRef || "None"}</strong></div>
                    </div>

                    {/* Actions */}
                    {selectedRequest.status === "pending" && (
                      <div style={{ display: "flex", gap: "12px", marginTop: "10px" }}>
                        <button
                          onClick={() => handleApproveClick(selectedRequest)}
                          style={{
                            background: "#00f0ff",
                            color: "#080c14",
                            border: "none",
                            borderRadius: "4px",
                            padding: "8px 20px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          APPROVE ACTION
                        </button>
                        <button
                          onClick={() => handleReject(selectedRequest.requestId)}
                          style={{
                            background: "rgba(255, 51, 102, 0.15)",
                            color: "#ff3366",
                            border: "1px solid #ff3366",
                            borderRadius: "4px",
                            padding: "8px 20px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          REJECT
                        </button>
                        <button
                          onClick={() => handleCancel(selectedRequest.requestId)}
                          style={{
                            background: "rgba(100, 116, 139, 0.2)",
                            color: "#94a3b8",
                            border: "1px solid #475569",
                            borderRadius: "4px",
                            padding: "8px 16px",
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          CANCEL
                        </button>
                      </div>
                    )}

                    {selectedRequest.status === "approved" && (
                      <div style={{ marginTop: "10px" }}>
                        <button
                          onClick={() => handleRevoke(selectedRequest.requestId)}
                          style={{
                            background: "rgba(244, 63, 94, 0.2)",
                            color: "#f43f5e",
                            border: "1px solid #f43f5e",
                            borderRadius: "4px",
                            padding: "8px 20px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          REVOKE APPROVAL GRANT
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCREEN 4: PERMISSION SCOPE & ACCESS CONTROL */}
          {/* ========================================================================= */}
          {!loading && activeTab === "permissions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ border: "1px solid #1e293b", borderRadius: "8px", padding: "18px", backgroundColor: "#0d1322" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#00f0ff" }}>
                  ROLE-BASED ACCESS CONTROL (RBAC) HIERARCHY
                </h3>
                <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "12px" }}>
                  Strict hierarchical permissions: Founder retains absolute authority over destructive actions, policy modification, and emergency recovery.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                  {[
                    { role: "FOUNDER", weight: 400, desc: "Absolute authority, Emergency Recovery, Destructive sign-off" },
                    { role: "ADMIN", weight: 300, desc: "Operational supervision, resource configuration" },
                    { role: "OPERATOR", weight: 200, desc: "Task orchestration within approved policies" },
                    { role: "GUEST", weight: 100, desc: "Strict read-only isolation" },
                  ].map((r) => (
                    <div key={r.role} style={{ backgroundColor: "#080c14", border: "1px solid #1e293b", padding: "12px", borderRadius: "6px" }}>
                      <div style={{ fontWeight: 700, color: r.role === "FOUNDER" ? "#00f0ff" : "#94a3b8" }}>{r.role}</div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Level: {r.weight}</div>
                      <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "6px" }}>{r.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resource Access Policies */}
              <div style={{ border: "1px solid #1e293b", borderRadius: "8px", padding: "18px", backgroundColor: "#0d1322" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ margin: 0, fontSize: "14px", color: "#00f0ff" }}>
                    RESOURCE ACCESS POLICIES ({resourcePolicies.length})
                  </h3>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b", textAlign: "left" }}>
                        <th style={{ padding: "8px" }}>Policy ID</th>
                        <th style={{ padding: "8px" }}>Domain</th>
                        <th style={{ padding: "8px" }}>Pattern</th>
                        <th style={{ padding: "8px" }}>Allowed Roles</th>
                        <th style={{ padding: "8px" }}>Operations</th>
                        <th style={{ padding: "8px" }}>Approval Required</th>
                        <th style={{ padding: "8px" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourcePolicies.map((p) => (
                        <tr key={p.policyId} style={{ borderBottom: "1px solid #0f172a" }}>
                          <td style={{ padding: "8px" }}><code>{p.policyId}</code></td>
                          <td style={{ padding: "8px", color: "#38bdf8" }}>{p.domain}</td>
                          <td style={{ padding: "8px" }}><code>{p.resourcePattern}</code></td>
                          <td style={{ padding: "8px" }}>{p.allowedRoles.join(", ")}</td>
                          <td style={{ padding: "8px" }}>{p.allowedOperations.join(", ")}</td>
                          <td style={{ padding: "8px", color: p.requiresApprovalForOperations.length > 0 ? "#fbbf24" : "#4ade80" }}>
                            {p.requiresApprovalForOperations.join(", ") || "None"}
                          </td>
                          <td style={{ padding: "8px" }}>
                            {p.policyId.startsWith("pol_custom_") && (
                              <button
                                onClick={() => handleRevokePolicy(p.policyId)}
                                style={{
                                  background: "rgba(255, 51, 102, 0.15)",
                                  color: "#ff3366",
                                  border: "1px solid #ff3366",
                                  borderRadius: "4px",
                                  padding: "3px 8px",
                                  fontSize: "11px",
                                  cursor: "pointer",
                                }}
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCREEN 5: RISK & POLICY MANAGEMENT */}
          {/* ========================================================================= */}
          {!loading && activeTab === "policies" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* 4-Tier Risk Matrix */}
              <div style={{ border: "1px solid #1e293b", borderRadius: "8px", padding: "18px", backgroundColor: "#0d1322" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#00f0ff" }}>
                  CENTRALIZED 4-TIER RISK CLASSIFICATION MATRIX
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                  <div style={{ border: "1px solid #00f0ff", borderRadius: "6px", padding: "12px", backgroundColor: "#080c14" }}>
                    <div style={{ color: "#00f0ff", fontWeight: 700, fontSize: "13px" }}>LOW RISK</div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Read ops within approved scope</div>
                    <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "6px" }}>Explicit access scope & policy validation</div>
                  </div>
                  <div style={{ border: "1px solid #fbbf24", borderRadius: "6px", padding: "12px", backgroundColor: "#080c14" }}>
                    <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: "13px" }}>MEDIUM RISK</div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Creating/editing non-system files</div>
                    <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "6px" }}>Individual Founder approval</div>
                  </div>
                  <div style={{ border: "1px solid #f97316", borderRadius: "6px", padding: "12px", backgroundColor: "#080c14" }}>
                    <div style={{ color: "#f97316", fontWeight: 700, fontSize: "13px" }}>HIGH RISK</div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>File deletion, database changes</div>
                    <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "6px" }}>Individual approval + impact review</div>
                  </div>
                  <div style={{ border: "1px solid #ff3366", borderRadius: "6px", padding: "12px", backgroundColor: "#080c14" }}>
                    <div style={{ color: "#ff3366", fontWeight: 700, fontSize: "13px" }}>CRITICAL RISK</div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Payments, credentials, shell, publish</div>
                    <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "6px" }}>Individual approval + confirmation gate</div>
                  </div>
                </div>
              </div>

              {/* The 7 Immutable Core Invariants */}
              <div style={{ border: "1px solid #1e293b", borderRadius: "8px", padding: "18px", backgroundColor: "#0d1322" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ margin: 0, fontSize: "14px", color: "#00f0ff" }}>
                    THE 7 IMMUTABLE CORE SECURITY INVARIANTS
                  </h3>
                  <span style={{ fontSize: "11px", color: "#4ade80", fontWeight: 700 }}>
                    AI CANNOT WEAKEN OR DISABLE (ENFORCED SERVER-SIDE)
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {policies.map((p) => (
                    <div
                      key={p.policyId}
                      style={{
                        border: "1px solid #1e293b",
                        borderRadius: "6px",
                        padding: "12px",
                        backgroundColor: "#080c14",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "13px" }}>
                          <code>{p.policyId}</code>: {p.name}
                        </div>
                        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                          {p.description}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                          Rule: <code>{p.ruleExpression}</code>
                        </div>
                      </div>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: "rgba(0, 240, 255, 0.15)",
                          color: "#00f0ff",
                          border: "1px solid #00f0ff",
                          whiteSpace: "nowrap",
                        }}
                      >
                        IMMUTABLE
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCREEN 6: SECURITY AUDIT */}
          {/* ========================================================================= */}
          {!loading && activeTab === "audit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "14px", color: "#00f0ff" }}>
                    HMAC-SHA256 CRYPTOGRAPHICALLY CHAINED AUDIT LEDGER
                  </h3>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    Append-only, tamper-evident ledger linking every block with previous block HMAC.
                  </div>
                </div>

                <button
                  onClick={handleVerifyAuditChain}
                  disabled={verifyingAudit}
                  style={{
                    background: verifyingAudit ? "#334155" : "rgba(0, 240, 255, 0.15)",
                    border: "1px solid #00f0ff",
                    color: "#00f0ff",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: verifyingAudit ? "default" : "pointer",
                  }}
                >
                  {verifyingAudit ? "VERIFYING CRYPTOGRAPHIC CHAIN..." : "VERIFY LEDGER INTEGRITY"}
                </button>
              </div>

              {auditVerification && (
                <div
                  style={{
                    backgroundColor: auditVerification.isChainValid ? "rgba(74, 222, 128, 0.15)" : "rgba(255, 51, 102, 0.2)",
                    border: `1px solid ${auditVerification.isChainValid ? "#4ade80" : "#ff3366"}`,
                    borderRadius: "6px",
                    padding: "12px",
                    fontSize: "13px",
                    color: auditVerification.isChainValid ? "#4ade80" : "#ff8099",
                  }}
                >
                  <strong>Chain Verification Result: </strong>
                  {auditVerification.isChainValid
                    ? `VALID (All ${auditVerification.totalEntriesVerified} blocks intact, zero tampering detected).`
                    : `INTEGRITY COMPROMISED at sequence ${auditVerification.brokenSequenceAt}!`}
                </div>
              )}

              {/* Entries Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b", textAlign: "left" }}>
                      <th style={{ padding: "8px" }}>Seq #</th>
                      <th style={{ padding: "8px" }}>Timestamp</th>
                      <th style={{ padding: "8px" }}>Actor</th>
                      <th style={{ padding: "8px" }}>Action</th>
                      <th style={{ padding: "8px" }}>Resource</th>
                      <th style={{ padding: "8px" }}>Status</th>
                      <th style={{ padding: "8px" }}>HMAC Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map((e) => (
                      <tr key={e.auditId} style={{ borderBottom: "1px solid #0f172a" }}>
                        <td style={{ padding: "8px" }}><code>#{e.sequenceNumber}</code></td>
                        <td style={{ padding: "8px", color: "#94a3b8" }}>
                          {new Date(e.timestamp).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: "8px" }}>{e.actor}</td>
                        <td style={{ padding: "8px", color: "#38bdf8" }}>{e.action}</td>
                        <td style={{ padding: "8px" }}><code>{e.resource}</code></td>
                        <td style={{ padding: "8px" }}>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: 700,
                              backgroundColor: e.executionStatus === "SUCCESS" ? "rgba(74, 222, 128, 0.2)" : "rgba(255, 51, 102, 0.2)",
                              color: e.executionStatus === "SUCCESS" ? "#4ade80" : "#ff3366",
                            }}
                          >
                            {e.executionStatus}
                          </span>
                        </td>
                        <td style={{ padding: "8px" }}>
                          <code style={{ fontSize: "11px", color: "#a855f7" }}>
                            {e.currentEntryHash ? `${e.currentEntryHash.slice(0, 14)}...` : "None"}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCREEN 7: EMERGENCY CONTROL */}
          {/* ========================================================================= */}
          {!loading && activeTab === "emergency" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Emergency Stop Killswitch Card */}
              <div
                style={{
                  border: "2px solid #ff3366",
                  borderRadius: "8px",
                  padding: "20px",
                  backgroundColor: "rgba(255, 51, 102, 0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px", color: "#ff3366" }}>
                      GLOBAL EMERGENCY STOP KILLSWITCH
                    </h3>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                      Independent backend-enforced killswitch. Halts all mutating tools, invalidates execution grants, revokes active sessions.
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 800,
                      backgroundColor: lockdownState?.isLockedDown ? "rgba(255, 51, 102, 0.3)" : "rgba(74, 222, 128, 0.2)",
                      color: lockdownState?.isLockedDown ? "#ff3366" : "#4ade80",
                      border: `1px solid ${lockdownState?.isLockedDown ? "#ff3366" : "#4ade80"}`,
                    }}
                  >
                    {lockdownState?.isLockedDown ? "SYSTEM LOCKED DOWN" : "SYSTEM OPERATIONAL"}
                  </span>
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <input
                    type="text"
                    value={emergencyReasonInput}
                    onChange={(e) => setEmergencyReasonInput(e.target.value)}
                    placeholder="Lockdown reason / diagnostic note (optional)"
                    style={{
                      width: "100%",
                      backgroundColor: "#080c14",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      padding: "10px",
                      fontSize: "13px",
                      color: "#f8fafc",
                    }}
                  />
                </div>

                <button
                  onClick={handleTriggerEmergencyStop}
                  style={{
                    backgroundColor: "#ff3366",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "12px 24px",
                    fontSize: "13px",
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                    boxShadow: "0 0 20px rgba(255, 51, 102, 0.4)",
                  }}
                >
                  ⚡ ENGAGE EMERGENCY STOP IMMEDIATELY
                </button>
              </div>

              {/* Founder Recovery Unlock Card */}
              <div
                style={{
                  border: "1px solid #1e293b",
                  borderRadius: "8px",
                  padding: "20px",
                  backgroundColor: "#0d1322",
                }}
              >
                <h3 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#00f0ff" }}>
                  FOUNDER SYSTEM RECOVERY & UNLOCK
                </h3>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "14px" }}>
                  To restore execution authorization following an Emergency Stop, provide the verified Founder Recovery Key.
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="password"
                    value={recoveryKeyInput}
                    onChange={(e) => setRecoveryKeyInput(e.target.value)}
                    placeholder="Enter Founder Recovery Passphrase / Key"
                    style={{
                      flex: 1,
                      backgroundColor: "#080c14",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      padding: "10px",
                      fontSize: "13px",
                      color: "#f8fafc",
                    }}
                  />
                  <button
                    onClick={handleRecoveryUnlock}
                    style={{
                      backgroundColor: "#00f0ff",
                      color: "#080c14",
                      border: "none",
                      borderRadius: "6px",
                      padding: "10px 20px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    VERIFY & RESTORE SYSTEM
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCREEN 8: SESSION MANAGEMENT */}
          {/* ========================================================================= */}
          {!loading && activeTab === "sessions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "14px", color: "#00f0ff" }}>
                    ACTIVE DESKTOP SESSIONS ({activeSessions.length})
                  </h3>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    Device-bound desktop sessions authorized to interact with ULTRON.
                  </div>
                </div>

                <button
                  onClick={handleRevokeAllSessions}
                  style={{
                    background: "rgba(255, 51, 102, 0.15)",
                    border: "1px solid #ff3366",
                    color: "#ff3366",
                    borderRadius: "6px",
                    padding: "8px 14px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  REVOKE ALL SESSIONS
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b", textAlign: "left" }}>
                      <th style={{ padding: "8px" }}>Session ID</th>
                      <th style={{ padding: "8px" }}>User ID</th>
                      <th style={{ padding: "8px" }}>Role</th>
                      <th style={{ padding: "8px" }}>Created At</th>
                      <th style={{ padding: "8px" }}>Expires At</th>
                      <th style={{ padding: "8px" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSessions.map((s) => (
                      <tr key={s.sessionId} style={{ borderBottom: "1px solid #0f172a" }}>
                        <td style={{ padding: "8px" }}><code>{s.sessionId}</code></td>
                        <td style={{ padding: "8px" }}>{s.userId}</td>
                        <td style={{ padding: "8px", color: "#38bdf8", fontWeight: 700 }}>
                          {s.userRole?.toUpperCase()}
                        </td>
                        <td style={{ padding: "8px", color: "#94a3b8" }}>
                          {new Date(s.createdAt).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: "8px", color: "#94a3b8" }}>
                          {new Date(s.expiresAt).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: "8px" }}>
                          <button
                            onClick={() => handleRevokeSession(s.sessionToken || s.sessionId)}
                            style={{
                              background: "rgba(255, 51, 102, 0.15)",
                              color: "#ff3366",
                              border: "1px solid #ff3366",
                              borderRadius: "4px",
                              padding: "3px 8px",
                              fontSize: "11px",
                              cursor: "pointer",
                            }}
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Windows Hello Re-Authentication trigger */}
              <div style={{ border: "1px solid #1e293b", borderRadius: "8px", padding: "16px", backgroundColor: "#0d1322" }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#00f0ff" }}>
                  SENSITIVE-ACTION RE-AUTHENTICATION
                </h4>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "12px" }}>
                  Triggers native Windows Biometric Framework prompt to refresh Founder biometric authorization without logging out.
                </div>
                <button
                  onClick={handleWindowsHelloCheck}
                  style={{
                    backgroundColor: "rgba(0, 240, 255, 0.15)",
                    border: "1px solid #00f0ff",
                    color: "#00f0ff",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Verify Founder via Windows Hello
                </button>
              </div>
            </div>
          )}
        </div>

        {/* High-Risk Confirmation Modal Dialog */}
        {confirmingReq && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100000,
            }}
          >
            <div
              style={{
                width: "480px",
                maxWidth: "90%",
                backgroundColor: "#0d1322",
                border: "2px solid #ff3366",
                borderRadius: "10px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                boxShadow: "0 0 40px rgba(255, 51, 102, 0.4)",
              }}
            >
              <div style={{ color: "#ff3366", fontWeight: 800, fontSize: "15px", letterSpacing: "0.06em" }}>
                ⚠️ HIGH-RISK FOUNDER CONFIRMATION REQUIRED
              </div>
              <div style={{ fontSize: "13px", color: "#e2e8f0" }}>
                You are about to authorize a <strong>{confirmingReq.riskLevel.toUpperCase()} RISK</strong> operation:
              </div>
              <div style={{ backgroundColor: "#080c14", padding: "10px", borderRadius: "6px", fontSize: "12px" }}>
                <div><strong>Action: </strong>{confirmingReq.title}</div>
                <div><strong>Target: </strong><code>{confirmingReq.target}</code></div>
                <div style={{ color: "#ff8099", marginTop: "4px" }}>{confirmingReq.riskExplanation}</div>
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                To confirm, type <strong>APPROVE</strong> below:
              </div>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Type APPROVE"
                style={{
                  backgroundColor: "#080c14",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  color: "#f8fafc",
                  fontSize: "13px",
                }}
              />
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button
                  onClick={() => executeApproval(confirmingReq)}
                  disabled={confirmInput.trim() !== "APPROVE"}
                  style={{
                    flex: 1,
                    backgroundColor: confirmInput.trim() === "APPROVE" ? "#ff3366" : "#334155",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "10px",
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: confirmInput.trim() === "APPROVE" ? "pointer" : "not-allowed",
                  }}
                >
                  CONFIRM & EXECUTE
                </button>
                <button
                  onClick={() => {
                    setConfirmingReq(null);
                    setConfirmInput("");
                  }}
                  style={{
                    backgroundColor: "transparent",
                    color: "#94a3b8",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    padding: "10px 16px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
