/**
 * @file components/TaskOrchestrationModal.tsx
 * @description Centralized Task Orchestration & Workflow HUD Modal for ULTRON.
 *
 * Subsystem:
 * Task Orchestration Engine - Presentation & Founder HUD (Section 7).
 *
 * Key Responsibilities:
 * - Displays active and historical multi-step workflows with real-time status and progress percentage.
 * - Visualizes decomposed task hierarchies, dependencies, milestones, and wave execution stages.
 * - Surfaces pending approval queues with immediate 1-click Approve / Reject action buttons.
 * - Displays independently verified deliverables with verifiable SHA-256 evidence hashes.
 * - Allows manual triggering of goal orchestration, workflow cancellations, and restart recovery.
 *
 * Safety / Security Guarantees:
 * - Interacts exclusively with authenticated Next.js backend `/api/orchestration`.
 * - Zero fabricated progress: shows actual verified task states.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import type {
  WorkflowInstance,
  WorkflowProgressReport,
  ApprovalRequestRecord,
  TaskReportingSummary,
} from "@/lib/orchestration/types";

interface TaskOrchestrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "workflows" | "approvals" | "new_goal" | "deliverables";

export default function TaskOrchestrationModal({
  isOpen,
  onClose,
}: TaskOrchestrationModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("workflows");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [workflows, setWorkflows] = useState<Array<{
    id: string;
    title: string;
    category: string;
    state: string;
    taskCount: number;
    completedCount: number;
    version: number;
    updatedAt: number;
  }>>([]);

  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowInstance | null>(null);
  const [selectedProgress, setSelectedProgress] = useState<WorkflowProgressReport | null>(null);
  const [selectedReport, setSelectedReport] = useState<TaskReportingSummary | null>(null);

  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequestRecord[]>([]);

  // New Goal Input
  const [newGoalPrompt, setNewGoalPrompt] = useState<string>("");
  const [submittingGoal, setSubmittingGoal] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    try {
      setErrorMsg(null);

      // 1. Fetch workflows list
      const wfRes = await fetch("/api/orchestration");
      const wfData = await wfRes.json();
      if (wfData.success) {
        setWorkflows(wfData.workflows || []);
        if (wfData.workflows?.length > 0 && !selectedWorkflow) {
          // Auto-select first workflow
          await inspectWorkflow(wfData.workflows[0].id);
        }
      }

      // 2. Fetch pending approvals
      const apprRes = await fetch("/api/orchestration?action=pending_approvals");
      const apprData = await apprRes.json();
      if (apprData.success) {
        setPendingApprovals(apprData.pending || []);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [selectedWorkflow]);

  const inspectWorkflow = async (workflowId: string) => {
    try {
      const res = await fetch(`/api/orchestration?id=${encodeURIComponent(workflowId)}`);
      const data = await res.json();
      if (data.success) {
        setSelectedWorkflow(data.workflow);
        setSelectedProgress(data.progress);
        setSelectedReport(data.report);
      }
    } catch (err) {
      console.error("Failed to inspect workflow:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handleResolveApproval = async (taskId: string, approved: boolean) => {
    try {
      const res = await fetch("/api/orchestration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve_approval",
          taskId,
          approved,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchData();
        if (selectedWorkflow) {
          await inspectWorkflow(selectedWorkflow.id);
        }
      } else {
        alert(`Approval resolution failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Error resolving approval: ${err}`);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalPrompt.trim()) return;

    try {
      setSubmittingGoal(true);
      const res = await fetch("/api/orchestration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: newGoalPrompt }),
      });
      const data = await res.json();
      if (data.success) {
        setNewGoalPrompt("");
        setActiveTab("workflows");
        await fetchData();
        if (data.workflow) {
          await inspectWorkflow(data.workflow.id);
        }
      } else {
        alert(`Goal orchestration failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Error creating goal: ${err}`);
    } finally {
      setSubmittingGoal(false);
    }
  };

  const handleRecover = async () => {
    try {
      const res = await fetch("/api/orchestration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recover" }),
      });
      const data = await res.json();
      alert(`Recovery complete: ${data.recoveredCount} workflow(s) restored.`);
      await fetchData();
    } catch (err) {
      alert(`Recovery failed: ${err}`);
    }
  };

  const handleCancelWorkflow = async (workflowId: string) => {
    if (!confirm("Are you sure you want to abort and cancel this workflow?")) return;
    try {
      const res = await fetch("/api/orchestration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", workflowId, reason: "Cancelled by founder via HUD modal." }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchData();
        await inspectWorkflow(workflowId);
      } else {
        alert(`Failed to cancel workflow: ${data.error}`);
      }
    } catch (err) {
      alert(`Error cancelling workflow: ${err}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1000px",
          height: "85vh",
          backgroundColor: "#080c14",
          border: "1px solid #00f0ff",
          borderRadius: "8px",
          boxShadow: "0 0 30px rgba(0, 240, 255, 0.25)",
          display: "flex",
          flexDirection: "column",
          color: "#e2e8f0",
          fontFamily: "monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(90deg, #09131f 0%, #080c14 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>⚡</span>
            <div>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: "#00f0ff", letterSpacing: "1px" }}>
                ULTRON TASK ORCHESTRATION ENGINE
              </h2>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Section 7 — Autonomous Co-Founder Workflow & Verification Core
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={handleRecover}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                backgroundColor: "#1e293b",
                border: "1px solid #38bdf8",
                color: "#38bdf8",
                borderRadius: "4px",
                cursor: "pointer",
              }}
              title="Scan and recover interrupted workflows"
            >
              🔄 Recover Interrupted
            </button>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: "18px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #1e293b",
            background: "#0b121e",
          }}
        >
          {[
            { id: "workflows", label: `Workflows (${workflows.length})` },
            { id: "approvals", label: `Approvals (${pendingApprovals.length})`, highlight: pendingApprovals.length > 0 },
            { id: "new_goal", label: "+ New Goal" },
            { id: "deliverables", label: "Deliverables & Artifacts" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              style={{
                padding: "10px 18px",
                fontSize: "12px",
                background: activeTab === tab.id ? "#131f30" : "transparent",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #00f0ff" : "2px solid transparent",
                color: tab.highlight ? "#f59e0b" : activeTab === tab.id ? "#00f0ff" : "#94a3b8",
                fontWeight: activeTab === tab.id ? "bold" : "normal",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {errorMsg && (
            <div style={{ padding: "10px", background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", borderRadius: "4px", marginBottom: "12px", fontSize: "12px" }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* TAB 1: WORKFLOWS */}
          {activeTab === "workflows" && (
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "16px", height: "100%" }}>
              {/* Left Column: Workflow List */}
              <div style={{ borderRight: "1px solid #1e293b", paddingRight: "12px", overflowY: "auto" }}>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px", textTransform: "uppercase" }}>
                  Active & Historical Workflows
                </div>
                {workflows.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#64748b", padding: "10px 0" }}>No workflows recorded.</div>
                ) : (
                  workflows.map((wf) => (
                    <div
                      key={wf.id}
                      onClick={() => inspectWorkflow(wf.id)}
                      style={{
                        padding: "10px",
                        marginBottom: "6px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        backgroundColor: selectedWorkflow?.id === wf.id ? "#132338" : "#0d1522",
                        border: selectedWorkflow?.id === wf.id ? "1px solid #00f0ff" : "1px solid #1e293b",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: "bold", color: "#f1f5f9", marginBottom: "4px" }}>
                        {wf.title}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#94a3b8" }}>
                        <span style={{ color: wf.state === "COMPLETED" ? "#10b981" : wf.state === "RUNNING" ? "#38bdf8" : "#f59e0b" }}>
                          ● {wf.state}
                        </span>
                        <span>{wf.completedCount}/{wf.taskCount} tasks</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Right Column: Workflow Details */}
              <div style={{ overflowY: "auto", paddingLeft: "4px" }}>
                {selectedWorkflow ? (
                  <div>
                    {/* Header info */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                      <div>
                        <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", color: "#00f0ff" }}>
                          {selectedWorkflow.goal.title}
                        </h3>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          Category: <span style={{ color: "#38bdf8" }}>{selectedWorkflow.goal.category}</span> | ID: <code>{selectedWorkflow.id}</code>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "12px" }}>
                        {(selectedWorkflow.state === "RUNNING" || selectedWorkflow.state === "PENDING_APPROVAL" || selectedWorkflow.state === "PAUSED") && (
                          <button
                            onClick={() => handleCancelWorkflow(selectedWorkflow.id)}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "rgba(239, 68, 68, 0.2)",
                              border: "1px solid #ef4444",
                              color: "#ef4444",
                              borderRadius: "4px",
                              fontSize: "11px",
                              cursor: "pointer",
                            }}
                          >
                            🛑 Abort Workflow
                          </button>
                        )}
                        <div>
                          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#10b981" }}>
                            {selectedProgress?.overallPercentage || 0}%
                          </div>
                          <div style={{ fontSize: "10px", color: "#64748b" }}>Progress</div>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ height: "6px", backgroundColor: "#1e293b", borderRadius: "3px", overflow: "hidden", marginBottom: "16px" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${selectedProgress?.overallPercentage || 0}%`,
                          backgroundColor: "#00f0ff",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>

                    {/* Tasks Table */}
                    <div style={{ fontSize: "12px", fontWeight: "bold", color: "#94a3b8", marginBottom: "8px" }}>
                      Decomposed Task Graph ({Object.keys(selectedWorkflow.tasks).length} Tasks)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
                      {Object.values(selectedWorkflow.tasks).map((task) => (
                        <div
                          key={task.id}
                          style={{
                            padding: "8px 12px",
                            backgroundColor: "#0d1522",
                            border: "1px solid #1e293b",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: "bold", color: "#e2e8f0" }}>
                              {task.title}
                            </div>
                            <div style={{ fontSize: "10px", color: "#64748b" }}>
                              Tools: {task.requiredTools.join(", ")} | Complexity: {task.complexity}/10
                              {task.dependencies.length > 0 && ` | Depends on: [${task.dependencies.join(", ")}]`}
                            </div>
                          </div>
                          <div>
                            <span
                              style={{
                                padding: "2px 8px",
                                fontSize: "10px",
                                borderRadius: "4px",
                                fontWeight: "bold",
                                backgroundColor:
                                  task.status === "VERIFIED"
                                    ? "rgba(16, 185, 129, 0.2)"
                                    : task.status === "RUNNING"
                                    ? "rgba(56, 189, 248, 0.2)"
                                    : task.status === "AWAITING_APPROVAL"
                                    ? "rgba(245, 158, 11, 0.2)"
                                    : task.status === "FAILED"
                                    ? "rgba(239, 68, 68, 0.2)"
                                    : "rgba(100, 116, 139, 0.2)",
                                color:
                                  task.status === "VERIFIED"
                                    ? "#10b981"
                                    : task.status === "RUNNING"
                                    ? "#38bdf8"
                                    : task.status === "AWAITING_APPROVAL"
                                    ? "#f59e0b"
                                    : task.status === "FAILED"
                                    ? "#ef4444"
                                    : "#94a3b8",
                                border: "1px solid currentColor",
                              }}
                            >
                              {task.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Executive Summary Brief */}
                    {selectedReport && (
                      <div style={{ backgroundColor: "#09131f", padding: "12px", borderRadius: "6px", border: "1px solid #1e293b" }}>
                        <div style={{ fontSize: "11px", color: "#00f0ff", textTransform: "uppercase", marginBottom: "4px" }}>
                          Founder Executive Brief
                        </div>
                        <p style={{ fontSize: "12px", color: "#cbd5e1", margin: 0, lineHeight: 1.5 }}>
                          {selectedReport.founderExecutiveBrief}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: "#64748b", fontSize: "12px", padding: "40px", textAlign: "center" }}>
                    Select a workflow on the left to inspect execution state.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PENDING APPROVALS */}
          {activeTab === "approvals" && (
            <div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "12px" }}>
                Founder Authorization Gate — Review and approve sensitive system actions.
              </div>
              {pendingApprovals.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#10b981", fontSize: "13px" }}>
                  ✅ No pending approval requests. All tasks are authorized or non-sensitive.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {pendingApprovals.map((req) => (
                    <div
                      key={req.requestId}
                      style={{
                        padding: "14px",
                        backgroundColor: "#0d1522",
                        border: "1px solid #f59e0b",
                        borderRadius: "6px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "bold", color: "#f59e0b" }}>
                          ⚠️ {req.title}
                        </span>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>
                          Risk: <b style={{ color: "#ef4444" }}>{req.riskLevel.toUpperCase()}</b>
                        </span>
                      </div>
                      <p style={{ fontSize: "12px", color: "#cbd5e1", margin: "0 0 8px 0" }}>
                        {req.riskExplanation}
                      </p>
                      <div style={{ fontSize: "10px", color: "#64748b", marginBottom: "12px" }}>
                        Action Hash: <code>{req.actionHash.slice(0, 24)}...</code>
                      </div>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button
                          onClick={() => handleResolveApproval(req.taskId, true)}
                          style={{
                            padding: "6px 14px",
                            backgroundColor: "#059669",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            cursor: "pointer",
                          }}
                        >
                          ✓ Authorize Execution
                        </button>
                        <button
                          onClick={() => handleResolveApproval(req.taskId, false)}
                          style={{
                            padding: "6px 14px",
                            backgroundColor: "#dc2626",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            cursor: "pointer",
                          }}
                        >
                          ✕ Reject Action
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: NEW GOAL */}
          {activeTab === "new_goal" && (
            <form onSubmit={handleCreateGoal} style={{ maxWidth: "600px", margin: "0 auto" }}>
              <div style={{ fontSize: "13px", fontWeight: "bold", color: "#00f0ff", marginBottom: "8px" }}>
                Initiate New Autonomous Goal
              </div>
              <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "16px" }}>
                State your high-level objective in plain English. ULTRON will parse requirements, decompose tasks, analyze dependencies, and stage verified execution.
              </p>
              <textarea
                value={newGoalPrompt}
                onChange={(e) => setNewGoalPrompt(e.target.value)}
                placeholder="e.g. Implement a production rate-limiting middleware for all REST API endpoints and verify with unit tests."
                rows={5}
                style={{
                  width: "100%",
                  padding: "10px",
                  backgroundColor: "#0d1522",
                  border: "1px solid #1e293b",
                  borderRadius: "4px",
                  color: "#e2e8f0",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  marginBottom: "12px",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={submittingGoal || !newGoalPrompt.trim()}
                style={{
                  padding: "8px 20px",
                  backgroundColor: submittingGoal ? "#334155" : "#0284c7",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: submittingGoal ? "not-allowed" : "pointer",
                }}
              >
                {submittingGoal ? "Orchestrating..." : "⚡ Decompose & Execute"}
              </button>
            </form>
          )}

          {/* TAB 4: DELIVERABLES */}
          {activeTab === "deliverables" && (
            <div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "12px" }}>
                Cryptographically Attested Deliverables & Verification Evidence
              </div>
              {selectedReport?.verifiedDeliverables && selectedReport.verifiedDeliverables.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {selectedReport.verifiedDeliverables.map((d, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "10px 14px",
                        backgroundColor: "#0d1522",
                        border: "1px solid #1e293b",
                        borderRadius: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: "12px", color: "#f1f5f9" }}>📄 {d.name}</span>
                      <span style={{ fontSize: "10px", color: "#10b981", fontFamily: "monospace" }}>
                        SHA-256: {d.hash.slice(0, 20)}...
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#64748b", fontSize: "12px", padding: "40px", textAlign: "center" }}>
                  No deliverables recorded for the selected workflow.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
