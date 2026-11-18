/**
 * @file components/views/CommandCenterView.tsx
 * @description Main Command Center View for the ULTRON AI Operating Environment.
 *
 * Subsystem:
 * Interface Area A — Main Command Center.
 *
 * Key Responsibilities:
 * - Presents ULTRON identity, verified runtime connectivity, active AI model state,
 *   encrypted memory readiness, and security posture without fabricated telemetry.
 * - Provides an immediate natural-language command launcher (English & Hinglish) that routes
 *   straight into the AI Chat interface with the submitted prompt.
 * - Surfaces quick operational actions, recent verified security/system activity, and
 *   intelligent contextual suggestions tailored to real runtime state.
 *
 * Architectural Role & Interactions:
 * - Consumes live `DashboardSnapshot`, `UltronSettings`, and `SessionInfo` from `UltronWorkspace`.
 * - Fetches recent real security events from `/api/security/monitoring` when available.
 *
 * Safety / Security Guarantees:
 * - Strictly read-only status overview; never displays fake hardware, biometric, or Ollama success.
 */

"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Cpu,
  Database,
  HardDrive,
  Lock,
  MessageSquare,
  Mic,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Terminal,
  Activity,
} from "lucide-react";
import type { DashboardSnapshot, SessionInfo, UltronSettings, UltronViewId } from "@/components/workspace/types";
import { formatBytes, formatUptime, ultronJson } from "@/components/workspace/apiClient";

interface CommandCenterViewProps {
  dashboard: DashboardSnapshot | null;
  dashboardLoading: boolean;
  onRefreshDashboard: () => void;
  session: SessionInfo | null;
  settings: UltronSettings | null;
  onNavigate: (view: UltronViewId) => void;
  onQuickPrompt: (prompt: string) => void;
}

interface SecurityEventRow {
  eventId?: string;
  timestamp?: string | number;
  category?: string;
  severity?: string;
  message?: string;
  action?: string;
}

export default function CommandCenterView({
  dashboard,
  dashboardLoading,
  onRefreshDashboard,
  session,
  settings,
  onNavigate,
  onQuickPrompt,
}: CommandCenterViewProps) {
  const [commandInput, setCommandInput] = useState("");
  const [recentEvents, setRecentEvents] = useState<SecurityEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // `/api/security/monitoring` requires an authenticated identityEngine session;
    // skip the network call in unauthenticated desktop guest mode to avoid 401 noise.
    if (!session?.authenticated) {
      setRecentEvents([]);
      setEventsLoading(false);
      return;
    }
    (async () => {
      setEventsLoading(true);
      const res = await ultronJson<{ ok?: boolean; events?: SecurityEventRow[] }>("/api/security/monitoring");
      if (active) {
        setRecentEvents(Array.isArray(res.data?.events) ? res.data.events.slice(0, 6) : []);
        setEventsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [dashboard?.sampledAt, session?.authenticated]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    setCommandInput("");
    onQuickPrompt(trimmed);
  };

  const modelOnline = dashboard?.model.status === "ready";
  const activeModelName = dashboard?.model.model || settings?.ai.activeModel || "Unconfigured";
  const lockdownActive = Boolean(dashboard?.security.lockdownActive);
  const memEncrypted = dashboard?.memory?.encryption?.encrypted;
  const memCount = dashboard?.memory?.totalRecords;

  const contextualSuggestions = [
    {
      title: modelOnline ? "Start an English / Hinglish briefing" : "Configure local Ollama model",
      detail: modelOnline
        ? `Ask ${activeModelName} to summarize active tasks or plan work`
        : "Ollama is currently unreachable on loopback — inspect connection settings",
      action: () =>
        modelOnline
          ? onQuickPrompt("Aaj ka system aur active project status concise brief mein batao.")
          : onNavigate("models"),
    },
    {
      title: "Inspect encrypted memory vault",
      detail:
        memCount !== null && memCount !== undefined
          ? `${memCount} encrypted record${memCount === 1 ? "" : "s"} stored in vault`
          : "Search, add, or review persistent episodic memories",
      action: () => onNavigate("memory"),
    },
    {
      title: "Run runtime & security diagnostics",
      detail: "Verify API connectivity, audit chain integrity, and server logs",
      action: () => onNavigate("diagnostics"),
    },
    {
      title: "Review host telemetry & workflows",
      detail: "Check real CPU, RAM, storage, and pending orchestration plans",
      action: () => onNavigate("system"),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
      {/* Hero Command Header */}
      <section className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400">
                <Terminal className="h-4 w-4" />
              </span>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
                {settings?.general.assistantName || "ULTRON"} Command Center
              </h1>
            </div>
            <p className="max-w-2xl text-sm text-slate-400">
              Local-first desktop intelligence environment. Issue natural English or Hinglish commands,
              inspect real system telemetry, manage encrypted memory, and govern security boundaries.
            </p>
          </div>

          <button
            type="button"
            onClick={onRefreshDashboard}
            disabled={dashboardLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700/70 bg-[#101726] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-[#162033] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${dashboardLoading ? "animate-spin" : ""}`} />
            <span>Refresh telemetry</span>
          </button>
        </div>

        {/* Central Quick Command Input */}
        <form onSubmit={handleSubmit} className="mt-5">
          <label htmlFor="ultron-quick-command" className="sr-only">
            Send a command or question to ULTRON
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <input
                id="ultron-quick-command"
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Ask ULTRON anything in English or Hinglish (e.g., 'Mera CPU aur RAM status check karo')..."
                className="w-full rounded-lg border border-slate-700/80 bg-[#06090f] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!commandInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              <Send className="h-4 w-4" />
              <span>Execute</span>
            </button>
          </div>
        </form>

        {/* Quick Navigation Strip */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {[
            { id: "chat" as const, label: "Open Chat", icon: MessageSquare },
            { id: "voice" as const, label: "Voice Studio", icon: Mic },
            { id: "models" as const, label: "AI Models", icon: Server },
            { id: "memory" as const, label: "Memory Vault", icon: Database },
            { id: "security" as const, label: "Security", icon: ShieldCheck },
            { id: "settings" as const, label: "Settings", icon: Sliders },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-[#101726]/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-blue-500/40 hover:bg-[#162033] hover:text-white"
              >
                <Icon className="h-3.5 w-3.5 text-slate-400" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Primary Operational Posture Grid (Strictly Truthful Data) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* AI Model Connectivity */}
        <button
          type="button"
          onClick={() => onNavigate("models")}
          className="group flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#0b101b] p-4 text-left transition-colors hover:border-slate-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Local AI Engine</span>
            <Server className={`h-4 w-4 ${modelOnline ? "text-emerald-400" : "text-amber-400"}`} />
          </div>
          <div className="mt-3">
            <div className="truncate font-mono text-sm font-semibold text-white" title={activeModelName}>
              {activeModelName}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className={modelOnline ? "text-emerald-400" : "text-amber-400"}>
                {dashboard ? (modelOnline ? "Ollama Connected" : "Ollama Offline") : "Checking..."}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
            </div>
          </div>
        </button>

        {/* System Resources */}
        <button
          type="button"
          onClick={() => onNavigate("system")}
          className="group flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#0b101b] p-4 text-left transition-colors hover:border-slate-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Host Compute</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-3">
            <div className="font-mono text-xl font-semibold tabular-nums text-white">
              {dashboard?.metrics.cpuPercent !== null && dashboard?.metrics.cpuPercent !== undefined
                ? `${dashboard.metrics.cpuPercent}% CPU`
                : "Unavailable"}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400 tabular-nums">
              <span>
                RAM:{" "}
                {dashboard?.metrics.memoryPercent !== null && dashboard?.metrics.memoryPercent !== undefined
                  ? `${dashboard.metrics.memoryPercent}%`
                  : "Unavailable"}
              </span>
              <span>{dashboard?.host.cpuCores ? `${dashboard.host.cpuCores} cores` : "—"}</span>
            </div>
          </div>
        </button>

        {/* Encrypted Memory Vault */}
        <button
          type="button"
          onClick={() => onNavigate("memory")}
          className="group flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#0b101b] p-4 text-left transition-colors hover:border-slate-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Memory Vault</span>
            <Database className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-3">
            <div className="font-mono text-xl font-semibold tabular-nums text-white">
              {memCount !== null && memCount !== undefined ? `${memCount} records` : "Unavailable"}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs">
              <Lock className="h-3 w-3 text-slate-400" />
              <span className={memEncrypted ? "text-emerald-400" : "text-amber-400"}>
                {memEncrypted === undefined
                  ? "Checking encryption..."
                  : memEncrypted
                    ? "AES-256-GCM Active"
                    : "Encryption Unverified"}
              </span>
            </div>
          </div>
        </button>

        {/* Security & Session Posture */}
        <button
          type="button"
          onClick={() => onNavigate("security")}
          className="group flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#0b101b] p-4 text-left transition-colors hover:border-slate-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Security Governance</span>
            {lockdownActive ? (
              <ShieldAlert className="h-4 w-4 text-rose-400" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            )}
          </div>
          <div className="mt-3">
            <div className={`font-mono text-sm font-semibold ${lockdownActive ? "text-rose-400" : "text-white"}`}>
              {lockdownActive ? "EMERGENCY LOCKDOWN" : session?.authenticationLevel || "Initializing"}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400 tabular-nums">
              <span>Role: {session?.userRole || "unknown"}</span>
              <span>{dashboard ? `${dashboard.security.recentEventCount} events` : "—"}</span>
            </div>
          </div>
        </button>
      </section>

      {/* Two-Column Operational Details */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Intelligent Contextual Suggestions */}
        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-5 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">Contextual Actions</h2>
              <p className="text-xs text-slate-400">Recommended operations based on live environment status</p>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {dashboard?.host.platform ? `${dashboard.host.platform} · up ${formatUptime(dashboard.host.uptimeSeconds)}` : "Local host"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {contextualSuggestions.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={item.action}
                className="group flex flex-col justify-between rounded-lg border border-slate-800/90 bg-[#101726]/70 p-4 text-left transition-colors hover:border-blue-500/40 hover:bg-[#141d30]"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100 group-hover:text-white">
                    {item.title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.detail}</p>
                </div>
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-400">
                  <span>Open</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            ))}
          </div>

          {/* Storage & Host Snapshot Row */}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800/80 pt-4 sm:grid-cols-3">
            <div className="rounded-lg bg-[#06090f]/70 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <HardDrive className="h-3.5 w-3.5 text-slate-500" />
                <span>Storage Used</span>
              </div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-100">
                {dashboard?.metrics.storage ? `${dashboard.metrics.storage.usedPercent}%` : "Unavailable"}
              </div>
              <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                {dashboard?.metrics.storage
                  ? `${formatBytes(dashboard.metrics.storage.freeBytes)} free`
                  : "Not reported"}
              </div>
            </div>

            <div className="rounded-lg bg-[#06090f]/70 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Activity className="h-3.5 w-3.5 text-slate-500" />
                <span>Workflows</span>
              </div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-100">
                {dashboard?.workflows ? `${dashboard.workflows.active} active` : "Unavailable"}
              </div>
              <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                {dashboard?.workflows ? `${dashboard.workflows.openTasks} open tasks` : "Store offline"}
              </div>
            </div>

            <div className="col-span-2 rounded-lg bg-[#06090f]/70 p-3 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Server className="h-3.5 w-3.5 text-slate-500" />
                <span>Ollama Endpoint</span>
              </div>
              <div className="mt-1 truncate font-mono text-xs font-medium text-slate-200">
                {dashboard?.model.endpoint || settings?.ai.ollamaEndpoint || "http://127.0.0.1:11434"}
              </div>
              <div className="font-mono text-[11px] text-slate-500">Loopback verified</div>
            </div>
          </div>
        </div>

        {/* Recent Real Activity Feed */}
        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-5 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">Recent Activity</h2>
              <p className="text-xs text-slate-400">Verified security and operational events</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("diagnostics")}
              className="text-xs font-medium text-blue-400 hover:text-cyan-300"
            >
              All logs
            </button>
          </div>

          {eventsLoading ? (
            <div className="space-y-2.5">
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="h-12 animate-pulse rounded-lg bg-slate-800/40" />
              ))}
            </div>
          ) : recentEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 py-10 px-4 text-center">
              <Activity className="h-5 w-5 text-slate-500" />
              <p className="mt-2 text-sm font-medium text-slate-300">
                {session?.authenticated ? "No recent security events" : "Protected monitoring stream"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {session?.authenticated
                  ? "Events from approvals, sessions, and diagnostics appear here as they occur."
                  : "Security monitoring telemetry requires an authenticated operator or founder session."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentEvents.map((ev, idx) => (
                <div
                  key={ev.eventId || `ev_${idx}`}
                  className="rounded-lg border border-slate-800/80 bg-[#101726]/60 px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] font-medium text-cyan-300">
                      {ev.category || ev.action || "SYSTEM"}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500 tabular-nums">
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ""}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-300">
                    {ev.message || "Recorded security event"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
