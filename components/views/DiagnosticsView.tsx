/**
 * @file components/views/DiagnosticsView.tsx
 * @description Developer & Diagnostic Center View (Logs, Runtime Health, API Probes, Vault & Model Checks).
 *
 * Subsystem:
 * Interface Area I — Developer / Diagnostic Center.
 *
 * Key Responsibilities:
 * - Displays real Node.js runtime telemetry (version, platform, uptime, RSS/Heap memory, PID).
 * - Displays real vault health (file presence, size, AES-256-GCM status, backup snapshot) and
 *   security posture (DPAPI, Windows Hello, audit chain integrity).
 * - Runs live HTTP connectivity checks across core ULTRON API endpoints and reports exact
 *   HTTP status codes and response latency.
 * - Renders filterable, secret-redacted application and error logs from `/api/diagnostics` with
 *   Clear Logs and downloadable JSON Diagnostic Bundle export.
 *
 * Architectural Role & Interactions:
 * - Consumes `/api/diagnostics` and probes live API routes via `ultronFetch`.
 *
 * Safety / Security Guarantees:
 * - Read-only on vaults; exported diagnostic JSON contains zero keys, tokens, or plaintext memories.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Download,
  Play,
  RefreshCw,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import type { ToastNotice } from "@/components/workspace/types";
import { formatBytes, formatUptime, ultronFetch, ultronJson } from "@/components/workspace/apiClient";

interface DiagnosticLogRow {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  subsystem: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}

interface DiagnosticsPayload {
  ok: boolean;
  generatedAt: string;
  runtime: {
    nodeVersion: string;
    platform: string;
    arch: string;
    osRelease: string;
    uptimeSeconds: number;
    pid: number;
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    executionMode: string;
  };
  vault: {
    exists: boolean;
    sizeBytes: number;
    modifiedAt: string | null;
    backupSnapshotPresent: boolean;
    memoryCount: number | null;
    encryption?: {
      encrypted?: boolean;
      cipher?: string;
      status?: string;
    };
  };
  security: {
    dpapiAvailable: boolean;
    dpapiReason: string;
    windowsHelloSupported: boolean;
    windowsHelloStatus: string;
    lockdownActive: boolean;
    auditChainValid: boolean;
    auditEntriesChecked: number;
  };
  model: {
    provider: string;
    endpoint: string;
    activeModel: string;
    timeoutMs: number;
    reachable: boolean;
    latencyMs: number;
    modelCount: number;
    error: string | null;
  };
  logs: DiagnosticLogRow[];
}

interface EndpointProbe {
  path: string;
  status: number;
  ok: boolean;
  latencyMs: number;
}

interface DiagnosticsViewProps {
  onNotify: (notice: Omit<ToastNotice, "id">) => void;
}

const ENDPOINTS_TO_PROBE = [
  "/api/auth/session",
  "/api/dashboard",
  "/api/memory",
  "/api/models",
  "/api/settings",
  "/api/security/auth",
  "/api/diagnostics",
];

export default function DiagnosticsView({ onNotify }: DiagnosticsViewProps) {
  const [data, setData] = useState<DiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<"all" | "info" | "warn" | "error">("all");
  const [probes, setProbes] = useState<EndpointProbe[]>([]);
  const [probing, setProbing] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    const res = await ultronJson<DiagnosticsPayload>(`/api/diagnostics?level=${levelFilter}&limit=120`);
    if (res.ok && res.data) {
      setData(res.data);
    }
    setLoading(false);
  }, [levelFilter]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const runApiConnectivityCheck = async () => {
    setProbing(true);
    const results: EndpointProbe[] = [];
    for (const ep of ENDPOINTS_TO_PROBE) {
      const start = performance.now();
      try {
        const res = await ultronFetch(ep, { method: "GET", cache: "no-store" });
        results.push({
          path: ep,
          status: res.status,
          ok: res.ok,
          latencyMs: Math.max(1, Math.round(performance.now() - start)),
        });
      } catch {
        results.push({
          path: ep,
          status: 0,
          ok: false,
          latencyMs: Math.max(1, Math.round(performance.now() - start)),
        });
      }
    }
    setProbes(results);
    setProbing(false);
    const passed = results.filter((r) => r.ok).length;
    onNotify({
      tone: passed === results.length ? "success" : "warn",
      title: `API connectivity check: ${passed}/${results.length} reachable`,
    });
  };

  const handleClearLogs = async () => {
    const res = await ultronJson("/api/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_logs" }),
    });
    if (res.ok) {
      onNotify({ tone: "info", title: "Diagnostic log buffer cleared" });
      void loadDiagnostics();
    }
  };

  const handleExportReport = () => {
    if (!data) return;
    const bundle = {
      exportedAt: new Date().toISOString(),
      diagnostics: data,
      apiConnectivityProbes: probes,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ultron-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify({ tone: "success", title: "Diagnostic report exported" });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Developer & Diagnostics</h1>
          <p className="text-sm text-slate-400">
            Live runtime metrics, API endpoint probes, encrypted vault health, and redacted server logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runApiConnectivityCheck()}
            disabled={probing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{probing ? "Probing APIs..." : "Run API Probes"}</span>
          </button>

          <button
            type="button"
            onClick={handleExportReport}
            disabled={!data}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0b101b] px-3 py-2 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={() => void loadDiagnostics()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0b101b] px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Runtime / Vault / Model Summary Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Node.js Runtime</span>
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <dl className="mt-3 space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-500">Runtime</dt>
              <dd className="text-slate-200">{data?.runtime.nodeVersion || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Platform</dt>
              <dd className="text-slate-200">{data ? `${data.runtime.platform}/${data.runtime.arch}` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Process Uptime</dt>
              <dd className="tabular-nums text-slate-200">{formatUptime(data?.runtime.uptimeSeconds)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Heap / RSS</dt>
              <dd className="tabular-nums text-slate-200">
                {data ? `${formatBytes(data.runtime.heapUsedBytes)} / ${formatBytes(data.runtime.rssBytes)}` : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Database & Vault Health</span>
            <CheckCircle2 className={`h-4 w-4 ${data?.vault.exists ? "text-emerald-400" : "text-amber-400"}`} />
          </div>
          <dl className="mt-3 space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-500">Vault File</dt>
              <dd className="tabular-nums text-slate-200">
                {data?.vault.exists ? formatBytes(data.vault.sizeBytes) : "Missing"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Records</dt>
              <dd className="tabular-nums text-slate-200">{data?.vault.memoryCount ?? "Unavailable"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Encryption</dt>
              <dd className={data?.vault.encryption?.encrypted ? "text-emerald-400" : "text-amber-400"}>
                {data?.vault.encryption?.encrypted ? "AES-256-GCM" : "Unverified"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Audit Chain</dt>
              <dd className={data?.security.auditChainValid ? "text-emerald-400" : "text-rose-400"}>
                {data ? (data.security.auditChainValid ? `Valid (${data.security.auditEntriesChecked})` : "Invalid") : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Model Connectivity</span>
            {data?.model.reachable ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <XCircle className="h-4 w-4 text-amber-400" />
            )}
          </div>
          <dl className="mt-3 space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-500">Endpoint</dt>
              <dd className="truncate text-slate-200">{data?.model.endpoint || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Status</dt>
              <dd className={data?.model.reachable ? "text-emerald-400" : "text-amber-400"}>
                {data ? (data.model.reachable ? `Reachable (${data.model.latencyMs}ms)` : "Offline") : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Models Found</dt>
              <dd className="tabular-nums text-slate-200">{data?.model.modelCount ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">DPAPI / Hello</dt>
              <dd className="text-slate-300">
                {data
                  ? `${data.security.dpapiAvailable ? "DPAPI OK" : "No DPAPI"} · ${data.security.windowsHelloSupported ? "Hello OK" : "No Hello"}`
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Live API Connectivity Matrix */}
      {probes.length > 0 && (
        <section className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-5">
          <h2 className="font-display text-base font-semibold text-white">API Connectivity Probe Results</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {probes.map((p) => (
              <div
                key={p.path}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#06090f]/80 px-3 py-2 font-mono text-xs"
              >
                <span className="truncate text-slate-200">{p.path}</span>
                <span className={`ml-2 shrink-0 tabular-nums ${p.ok ? "text-emerald-400" : "text-rose-400"}`}>
                  {p.status || "ERR"} · {p.latencyMs}ms
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Redacted Server & Error Log Viewer */}
      <section className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-blue-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-white">Application & Error Logs</h2>
              <p className="text-xs text-slate-400">Secret-redacted ring buffer (max 250 entries)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(["all", "info", "warn", "error"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] uppercase ${
                  levelFilter === lvl
                    ? "bg-blue-600 text-white"
                    : "border border-slate-800 bg-[#101726] text-slate-400 hover:text-white"
                }`}
              >
                {lvl}
              </button>
            ))}

            <button
              type="button"
              onClick={() => void handleClearLogs()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-800 px-2.5 py-1 text-xs text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        <div className="mt-4 max-h-[380px] space-y-1.5 overflow-y-auto rounded-lg border border-slate-800/90 bg-[#06090f] p-3 font-mono text-xs">
          {!data?.logs || data.logs.length === 0 ? (
            <div className="py-8 text-center text-slate-500">No log entries matching filter.</div>
          ) : (
            data.logs.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-baseline gap-2 border-b border-slate-900 pb-1.5 last:border-b-0"
              >
                <span className="text-[11px] tabular-nums text-slate-500">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`w-12 text-[11px] font-semibold uppercase ${
                    entry.level === "error"
                      ? "text-rose-400"
                      : entry.level === "warn"
                        ? "text-amber-400"
                        : "text-cyan-400"
                  }`}
                >
                  {entry.level}
                </span>
                <span className="text-[11px] text-blue-400">[{entry.subsystem}]</span>
                <span className="flex-1 break-words text-slate-200">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
