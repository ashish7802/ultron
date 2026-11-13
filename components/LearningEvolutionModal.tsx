/**
 * @file components/LearningEvolutionModal.tsx
 * @description Centralized Learning & Evolution Engine HUD Modal for ULTRON.
 *
 * Subsystem:
 * Learning & Evolution Engine - Presentation & Founder HUD (Section 8).
 *
 * Key Responsibilities:
 * - Real-time dashboard visualizing continuous learning metrics, capability versions, and benchmark trends.
 * - Displays experience history, verified lessons, and strategy comparisons.
 * - Displays founder feedback history, learned preferences, and communication style profiles.
 * - Displays mistake patterns, 5-Why root cause diagnoses, and installed regression guards.
 * - Full Skill Library explorer with version tags, parameters, and interactive test validation.
 * - Displays self-improvement proposals, capability gaps, and interactive approval/rollback workflow.
 *
 * Safety / Security Guarantees:
 * - Backed exclusively by `/api/learning`.
 * - Zero fabricated metrics: displays real empirical telemetry from disk and memory vaults.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import type {
  ContinuousLearningStats,
  TaskExperience,
  ReusableLesson,
  FounderFeedback,
  LearnedPreference,
  CommunicationStyleProfile,
  FailureRecord,
  RegressionGuard,
  SkillDefinition,
  StrategyMetricRecord,
  SystemPerformanceReport,
  ImprovementProposal,
  EvolutionRecord,
} from "@/lib/learning/types";

interface LearningEvolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType =
  | "overview"
  | "experiences"
  | "feedback"
  | "mistakes"
  | "skills"
  | "strategies"
  | "benchmarks"
  | "proposals"
  | "evolution";

export default function LearningEvolutionModal({
  isOpen,
  onClose,
}: LearningEvolutionModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // State slices
  const [currentVersion, setCurrentVersion] = useState<string>("v1.0.0");
  const [stats, setStats] = useState<ContinuousLearningStats | null>(null);
  const [latestBenchmark, setLatestBenchmark] = useState<SystemPerformanceReport | null>(null);
  const [communicationProfile, setCommunicationProfile] = useState<CommunicationStyleProfile | null>(null);

  const [experiences, setExperiences] = useState<TaskExperience[]>([]);
  const [lessons, setLessons] = useState<ReusableLesson[]>([]);

  const [feedbackList, setFeedbackList] = useState<FounderFeedback[]>([]);
  const [preferences, setPreferences] = useState<LearnedPreference[]>([]);

  const [failures, setFailures] = useState<FailureRecord[]>([]);
  const [guards, setGuards] = useState<RegressionGuard[]>([]);

  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [strategyMetrics, setStrategyMetrics] = useState<StrategyMetricRecord[]>([]);
  const [benchmarkReports, setBenchmarkReports] = useState<SystemPerformanceReport[]>([]);

  const [proposals, setProposals] = useState<ImprovementProposal[]>([]);
  const [evolutions, setEvolutions] = useState<EvolutionRecord[]>([]);

  const [runningBenchmark, setRunningBenchmark] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchTabContent = useCallback(async (tab: TabType) => {
    try {
      setLoading(true);
      setErrorMsg(null);

      if (tab === "overview") {
        const res = await fetch("/api/learning?action=overview");
        const data = await res.json();
        if (data.success) {
          setCurrentVersion(data.currentVersion);
          setStats(data.stats);
          setLatestBenchmark(data.latestBenchmark);
          setCommunicationProfile(data.communicationProfile);
        }
      } else if (tab === "experiences") {
        const res = await fetch("/api/learning?action=experiences");
        const data = await res.json();
        if (data.success) {
          setExperiences(data.experiences || []);
          setLessons(data.lessons || []);
        }
      } else if (tab === "feedback") {
        const res = await fetch("/api/learning?action=feedback");
        const data = await res.json();
        if (data.success) {
          setFeedbackList(data.feedbackList || []);
          setPreferences(data.preferences || []);
          setCommunicationProfile(data.profile);
        }
      } else if (tab === "mistakes") {
        const res = await fetch("/api/learning?action=mistakes");
        const data = await res.json();
        if (data.success) {
          setFailures(data.failures || []);
          setGuards(data.guards || []);
        }
      } else if (tab === "skills") {
        const res = await fetch("/api/learning?action=skills");
        const data = await res.json();
        if (data.success) {
          setSkills(data.skills || []);
        }
      } else if (tab === "strategies") {
        const res = await fetch("/api/learning?action=strategies");
        const data = await res.json();
        if (data.success) {
          setStrategyMetrics(data.metrics || []);
        }
      } else if (tab === "benchmarks") {
        const res = await fetch("/api/learning?action=benchmarks");
        const data = await res.json();
        if (data.success) {
          setBenchmarkReports(data.reports || []);
          setLatestBenchmark(data.latest);
        }
      } else if (tab === "proposals") {
        const res = await fetch("/api/learning?action=proposals");
        const data = await res.json();
        if (data.success) {
          setProposals(data.proposals || []);
        }
      } else if (tab === "evolution") {
        const res = await fetch("/api/learning?action=evolution");
        const data = await res.json();
        if (data.success) {
          setEvolutions(data.evolutions || []);
          setCurrentVersion(data.currentVersion);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to load ${tab}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTabContent(activeTab);
    }
  }, [isOpen, activeTab, fetchTabContent]);

  const handleRunBenchmark = async () => {
    try {
      setRunningBenchmark(true);
      setActionSuccessMsg(null);
      const res = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_benchmark" }),
      });
      const data = await res.json();
      if (data.success) {
        setLatestBenchmark(data.report);
        setActionSuccessMsg(`Benchmark completed! Overall Score: ${data.report.overallScore}%`);
        fetchTabContent(activeTab);
      } else {
        setErrorMsg(data.error || "Benchmark run failed.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Benchmark execution error: ${msg}`);
    } finally {
      setRunningBenchmark(false);
    }
  };

  const handleTestSkill = async (skillId: string) => {
    try {
      const res = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_skill", skillId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccessMsg(data.result.message);
        fetchTabContent("skills");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Test failed: ${msg}`);
    }
  };

  const handleRollback = async (evolutionId: string) => {
    try {
      const reason = window.prompt("Enter rollback rationale:") || "Manual founder rollback";
      const res = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback_evolution", evolutionId, reason }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccessMsg(`Evolution ${evolutionId} successfully rolled back.`);
        fetchTabContent("evolution");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Rollback error: ${msg}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 7, 18, 0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1150px",
          height: "85vh",
          backgroundColor: "#080c14",
          border: "1px solid rgba(0, 240, 255, 0.3)",
          borderRadius: "12px",
          boxShadow: "0 0 40px rgba(0, 240, 255, 0.15)",
          display: "flex",
          flexDirection: "column",
          color: "#e2e8f0",
          fontFamily: "monospace",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid rgba(0, 240, 255, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(90deg, rgba(0, 240, 255, 0.05) 0%, rgba(138, 43, 226, 0.05) 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "1.4rem" }}>🧠</span>
            <div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#00f0ff", letterSpacing: "0.08em" }}>
                ULTRON LEARNING & EVOLUTION ENGINE
              </div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Continuous Self-Improvement, Skill Synthesis & Capability Evolution • Active Version:{" "}
                <span style={{ color: "#38bdf8", fontWeight: 600 }}>{currentVersion}</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={handleRunBenchmark}
              disabled={runningBenchmark}
              style={{
                backgroundColor: runningBenchmark ? "rgba(56, 189, 248, 0.2)" : "rgba(0, 240, 255, 0.15)",
                border: "1px solid #00f0ff",
                color: "#00f0ff",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                cursor: runningBenchmark ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {runningBenchmark ? "RUNNING BENCHMARKS..." : "⚡ RUN BENCHMARK BATTERY"}
            </button>
            <button
              onClick={onClose}
              style={{
                backgroundColor: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: "1.3rem",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              ✕
            </button>
          </div>
        </header>

        {/* Notifications Bar */}
        {actionSuccessMsg && (
          <div style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", borderBottom: "1px solid #10b981", padding: "8px 16px", color: "#34d399", fontSize: "0.85rem" }}>
            ✓ {actionSuccessMsg}
          </div>
        )}
        {errorMsg && (
          <div style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", borderBottom: "1px solid #ef4444", padding: "8px 16px", color: "#f87171", fontSize: "0.85rem" }}>
            ⚠ {errorMsg}
          </div>
        )}

        {/* Navigation Tabs */}
        <nav
          style={{
            display: "flex",
            gap: "4px",
            padding: "8px 16px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            overflowX: "auto",
          }}
        >
          {[
            { id: "overview", label: "Overview" },
            { id: "experiences", label: "Experiences & Lessons" },
            { id: "feedback", label: "Founder Feedback" },
            { id: "mistakes", label: "Failures & Guards" },
            { id: "skills", label: "Skill Library" },
            { id: "strategies", label: "Strategies" },
            { id: "benchmarks", label: "Benchmarks" },
            { id: "proposals", label: "Improvement Proposals" },
            { id: "evolution", label: "Evolution History" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              style={{
                backgroundColor: activeTab === tab.id ? "rgba(0, 240, 255, 0.15)" : "transparent",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #00f0ff" : "2px solid transparent",
                color: activeTab === tab.id ? "#00f0ff" : "#94a3b8",
                padding: "8px 14px",
                fontSize: "0.82rem",
                cursor: "pointer",
                fontWeight: activeTab === tab.id ? 600 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#00f0ff" }}>
              RETRIEVING EMPIRICAL LEARNING DATA...
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
                    <div style={{ backgroundColor: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(0, 240, 255, 0.2)", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ color: "#94a3b8", fontSize: "0.75rem" }}>TOTAL EXPERIENCES</div>
                      <div style={{ color: "#00f0ff", fontSize: "1.8rem", fontWeight: 700, marginTop: "4px" }}>{stats?.totalExperiencesProcessed ?? 0}</div>
                      <div style={{ color: "#64748b", fontSize: "0.7rem", marginTop: "4px" }}>Multi-turn task executions</div>
                    </div>
                    <div style={{ backgroundColor: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ color: "#94a3b8", fontSize: "0.75rem" }}>VERIFIED LESSONS</div>
                      <div style={{ color: "#10b981", fontSize: "1.8rem", fontWeight: 700, marginTop: "4px" }}>{stats?.verifiedLessonsCount ?? 0}</div>
                      <div style={{ color: "#64748b", fontSize: "0.7rem", marginTop: "4px" }}>Ground-truth verified heuristics</div>
                    </div>
                    <div style={{ backgroundColor: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(168, 85, 247, 0.2)", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ color: "#94a3b8", fontSize: "0.75rem" }}>ACTIVE SKILLS</div>
                      <div style={{ color: "#a855f7", fontSize: "1.8rem", fontWeight: 700, marginTop: "4px" }}>{stats?.activeSkillsCount ?? 0}</div>
                      <div style={{ color: "#64748b", fontSize: "0.7rem", marginTop: "4px" }}>Synthesized reusable workflows</div>
                    </div>
                    <div style={{ backgroundColor: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ color: "#94a3b8", fontSize: "0.75rem" }}>REGRESSION GUARDS</div>
                      <div style={{ color: "#f87171", fontSize: "1.8rem", fontWeight: 700, marginTop: "4px" }}>{stats?.activeGuardsCount ?? 0}</div>
                      <div style={{ color: "#64748b", fontSize: "0.7rem", marginTop: "4px" }}>Active failure prevention barriers</div>
                    </div>
                  </div>

                  {/* Benchmark Performance Card */}
                  {latestBenchmark && (
                    <div style={{ backgroundColor: "rgba(0, 240, 255, 0.03)", border: "1px solid rgba(0, 240, 255, 0.25)", borderRadius: "8px", padding: "18px", marginBottom: "24px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 600, color: "#00f0ff" }}>LATEST SYSTEM BENCHMARK</div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 700, color: latestBenchmark.overallScore >= 80 ? "#10b981" : "#f59e0b" }}>
                          {latestBenchmark.overallScore}%
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginTop: "16px", fontSize: "0.8rem" }}>
                        <div>Reasoning: <span style={{ color: "#38bdf8" }}>{(latestBenchmark.reasoningBenchmarkScore * 100).toFixed(0)}%</span></div>
                        <div>Retrieval: <span style={{ color: "#38bdf8" }}>{(latestBenchmark.retrievalAccuracyScore * 100).toFixed(0)}%</span></div>
                        <div>Tool Accuracy: <span style={{ color: "#38bdf8" }}>{(latestBenchmark.toolExecutionAccuracy * 100).toFixed(0)}%</span></div>
                        <div>Mean Latency: <span style={{ color: "#38bdf8" }}>{latestBenchmark.meanLatencyMs}ms</span></div>
                      </div>
                    </div>
                  )}

                  {/* Communication Profile */}
                  {communicationProfile && (
                    <div style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", padding: "18px" }}>
                      <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: "8px" }}>COMMUNICATION STYLE PROFILE</div>
                      <div style={{ fontSize: "0.82rem", color: "#94a3b8", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                        <div>Verbosity: <span style={{ color: "#00f0ff" }}>{communicationProfile.verbosityLevel}</span></div>
                        <div>Formality: <span style={{ color: "#00f0ff" }}>{communicationProfile.formalityLevel}</span></div>
                        <div>Code Comments: <span style={{ color: "#00f0ff" }}>{communicationProfile.codeCommentPreference}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: EXPERIENCES */}
              {activeTab === "experiences" && (
                <div>
                  <h3 style={{ color: "#00f0ff", fontSize: "1rem", marginBottom: "12px" }}>VERIFIED REUSABLE LESSONS ({lessons.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
                    {lessons.map((lsn) => (
                      <div key={lsn.lessonId} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "6px", padding: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 600, color: "#34d399" }}>
                          <div>{lsn.title}</div>
                          <div>Confidence: {(lsn.confidenceScore * 100).toFixed(0)}%</div>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "6px" }}>{lsn.recommendedAction}</div>
                        {lsn.pitfallToAvoid && (
                          <div style={{ fontSize: "0.75rem", color: "#f87171", marginTop: "4px" }}>⚠ Avoid: {lsn.pitfallToAvoid}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  <h3 style={{ color: "#00f0ff", fontSize: "1rem", marginBottom: "12px" }}>TASK EXPERIENCES ({experiences.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {experiences.map((exp) => (
                      <div key={exp.experienceId} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "6px", padding: "10px", fontSize: "0.8rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{exp.goal}</span>
                          <span style={{ color: exp.outcome === "SUCCESS" ? "#10b981" : "#f87171" }}>{exp.outcome}</span>
                        </div>
                        <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: "4px" }}>
                          Strategy: {exp.strategyUsed} • Duration: {exp.executionDurationMs}ms • Verified: {exp.verifiedByTest ? "YES" : "NO"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: FEEDBACK */}
              {activeTab === "feedback" && (
                <div>
                  <h3 style={{ color: "#00f0ff", fontSize: "1rem", marginBottom: "12px" }}>FOUNDER FEEDBACK & DIRECTIVES ({feedbackList.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                    {feedbackList.map((fb) => (
                      <div key={fb.feedbackId} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "6px", padding: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                          <span style={{ color: fb.polarity === "POSITIVE" ? "#10b981" : fb.polarity === "CORRECTION" ? "#38bdf8" : "#f87171", fontWeight: 600 }}>
                            [{fb.polarity}] {fb.category}
                          </span>
                          <span style={{ color: fb.isExplicitInstruction ? "#f59e0b" : "#64748b" }}>
                            {fb.isExplicitInstruction ? "EXPLICIT DIRECTIVE" : "INFERRED"}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#e2e8f0", marginTop: "6px" }}>"{fb.rawText}"</div>
                        {fb.correctedResponse && (
                          <div style={{ fontSize: "0.78rem", color: "#38bdf8", marginTop: "6px" }}>Correction: {fb.correctedResponse}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  <h3 style={{ color: "#00f0ff", fontSize: "1rem", marginBottom: "12px" }}>LEARNED PREFERENCES ({preferences.length})</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
                    {preferences.map((p) => (
                      <div key={p.preferenceId} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "6px", padding: "12px" }}>
                        <div style={{ color: "#38bdf8", fontSize: "0.8rem", fontWeight: 600 }}>{p.key}</div>
                        <div style={{ color: "#e2e8f0", fontSize: "0.85rem", marginTop: "4px" }}>{String(p.value)}</div>
                        <div style={{ color: "#64748b", fontSize: "0.7rem", marginTop: "6px" }}>Confidence: {(p.confidence * 100).toFixed(0)}% • Hard Rule: {p.isHardRule ? "YES" : "NO"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: MISTAKES & GUARDS */}
              {activeTab === "mistakes" && (
                <div>
                  <h3 style={{ color: "#f87171", fontSize: "1rem", marginBottom: "12px" }}>ACTIVE REGRESSION GUARDS ({guards.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                    {guards.map((g) => (
                      <div key={g.guardId} style={{ backgroundColor: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", padding: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#f87171", fontWeight: 600, fontSize: "0.85rem" }}>
                          <div>🛡 {g.name}</div>
                          <div>Triggered: {g.triggeredCount} times</div>
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "4px" }}>Pattern: <code>{g.conditionPattern}</code></div>
                        <div style={{ color: "#34d399", fontSize: "0.78rem", marginTop: "4px" }}>Remedy: {g.remediationAdvice}</div>
                      </div>
                    ))}
                  </div>

                  <h3 style={{ color: "#e2e8f0", fontSize: "1rem", marginBottom: "12px" }}>RECORDED FAILURES ({failures.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {failures.map((f) => (
                      <div key={f.failureId} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "6px", padding: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                          <span style={{ color: "#f87171", fontWeight: 600 }}>[{f.taxonomy}] Recurrence: {f.recurrenceCount}</span>
                          <span style={{ color: f.recoverySuccessful ? "#10b981" : "#f59e0b" }}>{f.recoverySuccessful ? "RECOVERED" : "UNRESOLVED"}</span>
                        </div>
                        <div style={{ color: "#e2e8f0", fontSize: "0.85rem", marginTop: "6px" }}>{f.rawErrorMessage}</div>
                        {f.rootCauseAnalysis && (
                          <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginTop: "6px", fontStyle: "italic" }}>
                            {f.rootCauseAnalysis.rootCauseSummary}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: SKILLS */}
              {activeTab === "skills" && (
                <div>
                  <h3 style={{ color: "#00f0ff", fontSize: "1rem", marginBottom: "12px" }}>CENTRALIZED SKILL LIBRARY ({skills.length})</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
                    {skills.map((s) => (
                      <div key={s.skillId} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(0, 240, 255, 0.25)", borderRadius: "8px", padding: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ color: "#00f0ff", fontWeight: 600, fontSize: "0.95rem" }}>{s.name}</div>
                            <div style={{ color: "#64748b", fontSize: "0.72rem" }}>Version: {s.version} • {s.category}</div>
                          </div>
                          <span style={{ color: s.status === "ACTIVE" ? "#10b981" : "#f59e0b", fontSize: "0.75rem", fontWeight: 600 }}>
                            {s.status}
                          </span>
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "8px" }}>{s.description}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", fontSize: "0.75rem", color: "#64748b" }}>
                          <div>Runs: {s.executionCount}</div>
                          <div>Win Rate: {(s.successRate * 100).toFixed(0)}%</div>
                          <div>Avg: {s.averageDurationMs}ms</div>
                        </div>
                        <button
                          onClick={() => handleTestSkill(s.skillId)}
                          style={{
                            marginTop: "12px",
                            width: "100%",
                            backgroundColor: "rgba(0, 240, 255, 0.1)",
                            border: "1px solid #00f0ff",
                            color: "#00f0ff",
                            padding: "6px",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          TEST SKILL HARNESS
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 6: STRATEGIES */}
              {activeTab === "strategies" && (
                <div>
                  <h3 style={{ color: "#00f0ff", fontSize: "1rem", marginBottom: "12px" }}>STRATEGY PERFORMANCE COMPARISONS ({strategyMetrics.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {strategyMetrics.map((sm, i) => (
                      <div key={i} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "6px", padding: "14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: "0.85rem" }}>
                          <span style={{ color: "#00f0ff" }}>{sm.strategyName}</span>
                          <span style={{ color: sm.successRate >= 0.7 ? "#10b981" : "#f59e0b" }}>
                            Win Rate: {(sm.successRate * 100).toFixed(1)}% ({sm.successCount}/{sm.sampleCount})
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "8px", fontSize: "0.78rem", color: "#94a3b8" }}>
                          <div>Category: {sm.taskCategory}</div>
                          <div>Avg Latency: {sm.averageDurationMs}ms</div>
                          <div>Avg Tokens: {sm.averageTokens}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 7: BENCHMARKS */}
              {activeTab === "benchmarks" && (
                <div>
                  <h3 style={{ color: "#00f0ff", fontSize: "1rem", marginBottom: "12px" }}>HISTORICAL BENCHMARK REPORTS ({benchmarkReports.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {benchmarkReports.map((rep) => (
                      <div key={rep.reportId} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(0, 240, 255, 0.2)", borderRadius: "6px", padding: "14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "#38bdf8", fontWeight: 600, fontSize: "0.9rem" }}>{rep.reportId}</span>
                          <span style={{ color: rep.overallScore >= 80 ? "#10b981" : "#f59e0b", fontWeight: 700, fontSize: "1.2rem" }}>
                            {rep.overallScore}%
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "10px", fontSize: "0.78rem", color: "#94a3b8" }}>
                          <div>Reasoning: {(rep.reasoningBenchmarkScore * 100).toFixed(0)}%</div>
                          <div>Retrieval: {(rep.retrievalAccuracyScore * 100).toFixed(0)}%</div>
                          <div>Tool Acc: {(rep.toolExecutionAccuracy * 100).toFixed(0)}%</div>
                          <div>Latency: {rep.meanLatencyMs}ms</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 8: PROPOSALS */}
              {activeTab === "proposals" && (
                <div>
                  <h3 style={{ color: "#00f0ff", fontSize: "1rem", marginBottom: "12px" }}>IMPROVEMENT PROPOSALS ({proposals.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {proposals.map((prop) => (
                      <div key={prop.proposalId} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(138, 43, 226, 0.3)", borderRadius: "8px", padding: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ color: "#c084fc", fontWeight: 600, fontSize: "0.95rem" }}>{prop.title}</div>
                            <div style={{ color: "#64748b", fontSize: "0.75rem" }}>Type: {prop.type} • Risk: {prop.riskAssessment.riskLevel}</div>
                          </div>
                          <span style={{ color: prop.status === "APPROVED" || prop.status === "APPLIED" ? "#10b981" : "#f59e0b", fontSize: "0.8rem", fontWeight: 600 }}>
                            {prop.status}
                          </span>
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginTop: "8px" }}>{prop.description}</div>
                        <div style={{ color: "#38bdf8", fontSize: "0.78rem", marginTop: "6px" }}>Motivation: {prop.motivation}</div>
                        <div style={{ color: "#10b981", fontSize: "0.75rem", marginTop: "4px" }}>Expected Impact: +{prop.expectedImprovementDelta}% {prop.expectedImpactMetric}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 9: EVOLUTION */}
              {activeTab === "evolution" && (
                <div>
                  <h3 style={{ color: "#00f0ff", fontSize: "1rem", marginBottom: "12px" }}>SYSTEM EVOLUTION HISTORY & ROLLBACK ({evolutions.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {evolutions.map((evo) => (
                      <div key={evo.evolutionId} style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(0, 240, 255, 0.2)", borderRadius: "8px", padding: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <span style={{ color: "#00f0ff", fontWeight: 700, fontSize: "1rem" }}>{evo.capabilityVersion}</span>
                            <span style={{ color: "#e2e8f0", fontWeight: 600, marginLeft: "12px" }}>{evo.title}</span>
                          </div>
                          <span style={{ color: evo.state === "ACTIVE" ? "#10b981" : evo.state === "REVERTED" ? "#f87171" : "#f59e0b", fontWeight: 600, fontSize: "0.85rem" }}>
                            {evo.state}
                          </span>
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "8px" }}>{evo.description}</div>
                        <div style={{ display: "flex", gap: "16px", marginTop: "12px", fontSize: "0.75rem", color: "#64748b" }}>
                          <div>Pre-Benchmark: {evo.preBenchmarkReportId}</div>
                          <div>Regressions Passed: {evo.regressionTestPassed ? "YES" : "NO"}</div>
                        </div>

                        {evo.state === "ACTIVE" && (
                          <button
                            onClick={() => handleRollback(evo.evolutionId)}
                            style={{
                              marginTop: "12px",
                              backgroundColor: "rgba(239, 68, 68, 0.15)",
                              border: "1px solid #ef4444",
                              color: "#f87171",
                              padding: "6px 14px",
                              borderRadius: "4px",
                              fontSize: "0.78rem",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            ↺ TRIGGER INSTANT ROLLBACK
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
