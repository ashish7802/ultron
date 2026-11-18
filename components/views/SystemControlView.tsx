/**
 * @file components/views/SystemControlView.tsx
 * @description System Control Center View (CPU, RAM, Storage, Services, Diagnostics & Task Orchestration).
 *
 * Subsystem:
 * Interface Area E — System Control Center.
 *
 * Key Responsibilities:
 * - Displays real host CPU utilization, RAM capacity/usage, storage usage, OS metadata,
 *   visible windows count, and service connectivity from `/api/dashboard`.
 * - Explicitly marks unsupported metrics (such as GPU utilization or non-Windows desktop window
 *   inspection) as "Unavailable" instead of inventing values.
 * - Integrates the Task Orchestration workflow list and goal planner backed by `/api/orchestration`
 *   with zero `window.alert`/`window.confirm`.
 *
 * Architectural Role & Interactions:
 * - Consumes `DashboardSnapshot` and queries `/api/orchestration`.
 *
 * Safety / Security Guarantees:
 * - Read-only host telemetry; mutating workflow execution strictly follows backend approval gates.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Cpu,
  HardDrive,
  Layers,
  Monitor,
  Play,
  RefreshCw,
  Server,
} from "lucide-react";
import type { DashboardSnapshot, ToastNotice } from "@/components/workspace/types";
import { formatBytes, formatUptime, ultronJson } from "@/components/workspace/apiClient";

interface SystemControlViewProps {
  dashboard: DashboardSnapshot | null;
  dashboardLoading: boolean;
  onRefreshDashboard: () => void;
  onNotify: (notice: Omit<ToastNotice, "id">) => void;
}

interface WorkflowSummary {
  id: string;
  goal?: string;
  title?: string;
  state: string;
  updatedAt?: string;
  createdAt?: string;
  tasks?: Record<string, { id: string; title: string; status: string }>;
}

export default function SystemControlView({
  dashboard,
  dashboardLoading,
  onRefreshDashboard,
  onNotify,
}: SystemControlViewProps) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [wfLoading, setWfLoading] = useState(true);
  const [goalInput, setGoalInput] = useState("");
  const [planning, setPlanning] = useState(false);

  const loadWorkflows = useCallback(async () => {
    setWfLoading(true);
    const res = await ultronJson<{ ok?: boolean; workflows?: WorkflowSummary[] }>("/api/orchestration?action=list");
    if (res.ok && Array.isArray(res.data?.workflows)) {
      setWorkflows(res.data.workflows);
    } else {
      setWorkflows([]);
    }
    setWfLoading(false);
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const handlePlanGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = goalInput.trim();
    if (!cleaned) return;
    setPlanning(true);
    const res = await ultronJson<{ ok?: boolean; error?: string }>("/api/orchestration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "plan", goal: cleaned }),
    });
    setPlanning(false);
    if (res.ok) {
      setGoalInput("");
      onNotify({ tone: "success", title: "Workflow plan created" });
      void loadWorkflows();
      onRefreshDashboard();
    } else {
      onNotify({ tone: "error", title: "Could not plan workflow", detail: res.error || undefined });
    }
  };

  const cpu = dashboard?.metrics.cpuPercent;
  const mem = dashboard?.metrics.memoryPercent;
  const storage = dashboard?.metrics.storage;
  const gpu = dashboard?.metrics.gpuPercent;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">System Control Center</h1>
          <p className="text-sm text-slate-400">
            Real-time host compute telemetry, service health, and persistent workflow orchestration.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onRefreshDashboard();
            void loadWorkflows();
          }}
          disabled={dashboardLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-[#0b101b] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-slate-700 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${dashboardLoading ? "animate-spin" : ""}`} />
          <span>Sample Now</span>
        </button>
      </div>

      {/* Hardware Telemetry Cards (Truthful Unavailable Handling) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* CPU */}
        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>CPU Utilization</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-white">
            {cpu !== null && cpu !== undefined ? `${cpu}%` : "Unavailable"}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-cyan-400 transition-[width] duration-300"
              style={{ width: `${cpu ?? 0}%` }}
            />
          </div>
          <p className="mt-2 truncate font-mono text-[11px] text-slate-500" title={dashboard?.host.cpuModel || undefined}>
            {dashboard?.host.cpuCores ? `${dashboard.host.cpuCores} cores · ${dashboard.host.cpuModel || ""}` : "Host CPU info unavailable"}
          </p>
        </div>

        {/* RAM */}
        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Memory (RAM)</span>
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-white">
            {mem !== null && mem !== undefined ? `${mem}%` : "Unavailable"}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
              style={{ width: `${mem ?? 0}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] tabular-nums text-slate-500">
            {dashboard?.metrics.memoryTotalBytes
              ? `${formatBytes(dashboard.metrics.memoryFreeBytes)} free of ${formatBytes(dashboard.metrics.memoryTotalBytes)}`
              : "RAM total unavailable"}
          </p>
        </div>

        {/* Storage */}
        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Storage Volume</span>
            <HardDrive className="h-4 w-4 text-slate-300" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-white">
            {storage ? `${storage.usedPercent}%` : "Unavailable"}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-slate-300 transition-[width] duration-300"
              style={{ width: `${storage?.usedPercent ?? 0}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] tabular-nums text-slate-500">
            {storage
              ? `${formatBytes(storage.freeBytes)} free / ${formatBytes(storage.totalBytes)}`
              : "Volume metrics unavailable"}
          </p>
        </div>

        {/* GPU (Explicitly Unavailable when not measured) */}
        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>GPU Telemetry</span>
            <Monitor className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-slate-300">
            {gpu !== null && gpu !== undefined ? `${gpu}%` : "Unavailable"}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/70" />
          <p className="mt-2 text-[11px] text-slate-500">
            GPU counters are not reported by standard Node OS APIs on this host.
          </p>
        </div>
      </div>

      {/* Host Services & Runtime Diagnostics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-5 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-white">Running Services & Host</h2>
          <p className="text-xs text-slate-400">Verified host capabilities and connectivity probes</p>

          <dl className="mt-4 divide-y divide-slate-800/80 text-xs">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-400">Operating System</dt>
              <dd className="font-mono text-slate-200">
                {dashboard ? `${dashboard.host.platform} ${dashboard.host.release}` : "Unavailable"}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-400">Host Uptime</dt>
              <dd className="font-mono tabular-nums text-slate-200">
                {formatUptime(dashboard?.host.uptimeSeconds)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-400">Local Ollama Daemon</dt>
              <dd
                className={`font-mono font-medium ${
                  dashboard?.model.status === "ready" ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {dashboard?.model.status === "ready" ? "Connected" : "Offline / Unavailable"}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-400">Desktop Window Inspection</dt>
              <dd className="font-mono text-slate-200">
                {dashboard?.visibleWindows !== null && dashboard?.visibleWindows !== undefined
                  ? `${dashboard.visibleWindows} windows`
                  : "Unavailable on host"}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-400">Workflow Persistence Store</dt>
              <dd
                className={`font-mono ${
                  dashboard?.diagnostics.workflowStoreAvailable ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {dashboard?.diagnostics.workflowStoreAvailable ? "Available" : "Unavailable"}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-400">Last Telemetry Sample</dt>
              <dd className="font-mono tabular-nums text-slate-400">
                {dashboard?.sampledAt ? new Date(dashboard.sampledAt).toLocaleTimeString() : "—"}
              </dd>
            </div>
          </dl>
        </section>

        {/* Task Orchestration Workflows */}
        <section className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-5 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">Task Orchestration</h2>
              <p className="text-xs text-slate-400">
                Decompose structured operational goals into verified multi-step workflows
              </p>
            </div>
            <Layers className="h-4 w-4 text-blue-400" />
          </div>

          <form onSubmit={handlePlanGoal} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="Enter an operational goal to plan (e.g., Audit workspace security config)..."
              className="flex-1 rounded-lg border border-slate-800 bg-[#06090f] px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={planning || !goalInput.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{planning ? "Planning..." : "Create Plan"}</span>
            </button>
          </form>

          <div className="mt-4 space-y-2.5">
            {wfLoading ? (
              <div className="h-24 animate-pulse rounded-lg bg-slate-800/40" />
            ) : workflows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800 py-8 text-center text-xs text-slate-500">
                <Server className="mx-auto mb-2 h-5 w-5 text-slate-600" />
                No persisted workflows yet. Submit a goal above to generate an orchestration plan.
              </div>
            ) : (
              workflows.slice(0, 6).map((wf) => {
                const taskList = wf.tasks ? Object.values(wf.tasks) : [];
                return (
                  <div
                    key={wf.id}
                    className="rounded-lg border border-slate-800/80 bg-[#101726]/65 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {wf.goal || wf.title || wf.id}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] uppercase text-cyan-300">
                        {wf.state}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-mono tabular-nums">{taskList.length} tasks</span>
                      <span className="font-mono">{wf.id}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
