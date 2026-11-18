/**
 * @file components/views/ModelManagerView.tsx
 * @description AI Model Manager View for Local Ollama Discovery, Testing & Runtime Switching.
 *
 * Subsystem:
 * Interface Area F — AI Model Manager.
 *
 * Key Responsibilities:
 * - Displays connected LLM provider (`Ollama Local`), truthful connection status (`Connected`,
 *   `Empty`, or `Offline`), measured probe latency, and exact error diagnostics.
 * - Lists discovered local models with parameter size, quantization, disk footprint, and one-click
 *   "Set Active" switching persisted through `POST /api/models`.
 * - Provides validated configuration controls (loopback Ollama endpoint, active model ID,
 *   temperature, request timeout, max context messages, streaming responses) with live
 *   "Test Connection" verification.
 *
 * Architectural Role & Interactions:
 * - Backed by `/api/models`; notifies `UltronWorkspace` to refresh global config/dashboard on change.
 *
 * Safety / Security Guarantees:
 * - Loopback-only endpoint validation enforced server-side (prevents SSRF).
 * - Never fakes an online Ollama state when the local daemon is stopped.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  PlugZap,
  RefreshCw,
  Save,
  Server,
  Terminal,
  XCircle,
} from "lucide-react";
import type { ToastNotice } from "@/components/workspace/types";
import { formatBytes, ultronJson } from "@/components/workspace/apiClient";

interface DiscoveredModel {
  name: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
  parameterSize: string | null;
  quantization: string | null;
  family: string | null;
}

interface ModelsApiResponse {
  ok: boolean;
  provider: string;
  config: {
    provider: "ollama";
    ollamaEndpoint: string;
    activeModel: string;
    temperature: number;
    timeoutMs: number;
    maxContextMessages: number;
    streamResponses: boolean;
  };
  connection: {
    status: "connected" | "empty" | "offline";
    latencyMs: number;
    error: string | null;
    checkedAt: string;
    activeModelInstalled: boolean;
  };
  models: DiscoveredModel[];
}

interface ModelManagerViewProps {
  onConfigChanged: () => void;
  onNotify: (notice: Omit<ToastNotice, "id">) => void;
}

export default function ModelManagerView({ onConfigChanged, onNotify }: ModelManagerViewProps) {
  const [data, setData] = useState<ModelsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    latencyMs: number;
    modelsCount: number;
    error: string | null;
  } | null>(null);

  // Editable configuration form state
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:11434");
  const [activeModel, setActiveModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [maxContextMessages, setMaxContextMessages] = useState(24);
  const [streamResponses, setStreamResponses] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    const res = await ultronJson<ModelsApiResponse>("/api/models");
    if (res.ok && res.data) {
      setData(res.data);
      setEndpoint(res.data.config.ollamaEndpoint);
      setActiveModel(res.data.config.activeModel);
      setTemperature(res.data.config.temperature);
      setTimeoutMs(res.data.config.timeoutMs);
      setMaxContextMessages(res.data.config.maxContextMessages);
      setStreamResponses(res.data.config.streamResponses);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const handleTestConnection = async () => {
    setTesting(true);
    setFormError(null);
    const res = await ultronJson<{
      ok?: boolean;
      error?: string;
      probe?: { status: string; latencyMs: number; models: DiscoveredModel[]; error: string | null };
    }>("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test_connection", endpoint }),
    });
    setTesting(false);

    if (res.ok && res.data?.probe) {
      const p = res.data.probe;
      setTestResult({
        status: p.status,
        latencyMs: p.latencyMs,
        modelsCount: p.models.length,
        error: p.error,
      });
      onNotify({
        tone: p.status === "connected" ? "success" : "warn",
        title:
          p.status === "connected"
            ? `Ollama connected (${p.latencyMs}ms)`
            : p.status === "empty"
              ? "Ollama reachable, no models installed"
              : "Ollama offline",
        detail: p.error || `${p.models.length} local model(s) discovered.`,
      });
    } else {
      setFormError(res.error || "Connection test rejected.");
    }
  };

  const handleSelectModel = async (modelName: string) => {
    const res = await ultronJson("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select_model", model: modelName }),
    });
    if (res.ok) {
      setActiveModel(modelName);
      onNotify({ tone: "success", title: "Active model updated", detail: modelName });
      onConfigChanged();
      void loadModels();
    } else {
      onNotify({ tone: "error", title: "Model switch failed", detail: res.error || undefined });
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const res = await ultronJson("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_config",
        ollamaEndpoint: endpoint,
        activeModel,
        temperature,
        timeoutMs,
        maxContextMessages,
        streamResponses,
      }),
    });
    setSaving(false);

    if (res.ok) {
      onNotify({ tone: "success", title: "AI model configuration saved" });
      onConfigChanged();
      void loadModels();
    } else {
      setFormError(res.error || "Failed to save configuration.");
    }
  };

  const connStatus = data?.connection.status || "offline";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">AI Model Manager</h1>
          <p className="text-sm text-slate-400">
            Inspect local Ollama connectivity, switch active models, and tune inference boundaries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleTestConnection()}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/15 px-3.5 py-2 text-xs font-medium text-blue-200 hover:bg-blue-600/25 disabled:opacity-50"
          >
            <PlugZap className="h-3.5 w-3.5" />
            <span>{testing ? "Testing..." : "Test Connection"}</span>
          </button>
          <button
            type="button"
            onClick={() => void loadModels()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0b101b] px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Provider Status Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>LLM Provider</span>
            <Server className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 font-display text-lg font-semibold text-white">Ollama (Local)</div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">
            {data?.config.ollamaEndpoint || endpoint}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Connection Status</span>
            {connStatus === "connected" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : connStatus === "empty" ? (
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-400" />
            )}
          </div>
          <div
            className={`mt-2 font-mono text-lg font-semibold uppercase ${
              connStatus === "connected"
                ? "text-emerald-400"
                : connStatus === "empty"
                  ? "text-amber-400"
                  : "text-rose-400"
            }`}
          >
            {loading ? "Probing..." : connStatus}
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-500">
            {data ? `Probe latency: ${data.connection.latencyMs}ms` : "Waiting for probe"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Model</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 truncate font-mono text-sm font-semibold text-white" title={data?.config.activeModel}>
            {data?.config.activeModel || activeModel || "Unconfigured"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {data?.connection.status === "connected"
              ? data.connection.activeModelInstalled
                ? "Verified installed in Ollama"
                : "Configured model not yet pulled"
              : "Requires local Ollama daemon"}
          </div>
        </div>
      </div>

      {/* Live Connection Test Banner */}
      {(testResult || data?.connection.error) && (
        <div
          className={`rounded-xl border p-4 text-xs ${
            (testResult?.status || connStatus) === "connected"
              ? "border-emerald-500/35 bg-emerald-950/15 text-emerald-200"
              : "border-amber-500/35 bg-amber-950/15 text-amber-200"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 font-medium">
            <span>
              {testResult
                ? `Probe Result: ${testResult.status.toUpperCase()} (${testResult.latencyMs}ms · ${testResult.modelsCount} models)`
                : data?.connection.error}
            </span>
          </div>
          {testResult?.error && <p className="mt-1 text-amber-300/90">{testResult.error}</p>}
          {connStatus === "offline" && (
            <div className="mt-3 rounded-lg border border-slate-800 bg-[#06090f] p-3 font-mono text-[11px] text-slate-300">
              <div className="mb-1 flex items-center gap-1.5 text-slate-400">
                <Terminal className="h-3.5 w-3.5" />
                <span>Start Ollama locally on your machine:</span>
              </div>
              <div>ollama serve</div>
              <div>ollama pull {activeModel || "qwen2.5:7b-instruct-q4_K_M"}</div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Installed Models List */}
        <section className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-5 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">Installed Local Models</h2>
              <p className="text-xs text-slate-400">Discovered via live `/api/tags` probe</p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-400">
              {data?.models.length ?? 0} available
            </span>
          </div>

          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-800/40" />
              ))}
            </div>
          ) : !data || data.models.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 py-12 text-center">
              <Server className="mx-auto h-6 w-6 text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-300">No local models detected</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                {connStatus === "offline"
                  ? "Ollama is offline or running in a cloud sandbox without a local daemon. Pull models on your local desktop to list them here."
                  : "Ollama is online with zero pulled models. Run `ollama pull qwen2.5:7b-instruct-q4_K_M` locally."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.models.map((m) => {
                const isActive = m.name === data.config.activeModel;
                return (
                  <div
                    key={m.name}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5 ${
                      isActive
                        ? "border-blue-500/45 bg-blue-600/10"
                        : "border-slate-800/80 bg-[#101726]/65"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-medium text-white">{m.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate-400 tabular-nums">
                        {m.parameterSize && <span>{m.parameterSize}</span>}
                        {m.quantization && <span>{m.quantization}</span>}
                        {m.sizeBytes !== null && <span>{formatBytes(m.sizeBytes)}</span>}
                      </div>
                    </div>

                    {isActive ? (
                      <span className="font-mono text-xs font-medium text-cyan-300">Active</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSelectModel(m.name)}
                        className="rounded-md border border-slate-700 bg-[#0b101b] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500/50 hover:text-white"
                      >
                        Set Active
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Model Configuration Form */}
        <form
          onSubmit={handleSaveConfig}
          className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-5 lg:col-span-5"
        >
          <h2 className="font-display text-base font-semibold text-white">Runtime Model Config</h2>
          <p className="text-xs text-slate-400">Changes persist atomically and apply to `/api/chat`</p>

          {formError && (
            <div role="alert" className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/20 p-3 text-xs text-rose-200">
              {formError}
            </div>
          )}

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="ollama-endpoint" className="text-xs font-medium text-slate-300">
                Ollama Loopback Endpoint
              </label>
              <input
                id="ollama-endpoint"
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Restricted strictly to localhost / 127.0.0.1 / [::1] for SSRF defense.
              </p>
            </div>

            <div>
              <label htmlFor="active-model-id" className="text-xs font-medium text-slate-300">
                Active Model Tag
              </label>
              <input
                id="active-model-id"
                type="text"
                value={activeModel}
                onChange={(e) => setActiveModel(e.target.value)}
                placeholder="qwen2.5:7b-instruct-q4_K_M"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="model-temp" className="text-xs font-medium text-slate-300">
                  Temperature ({temperature.toFixed(2)})
                </label>
                <input
                  id="model-temp"
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="mt-2 w-full accent-blue-500"
                />
              </div>

              <div>
                <label htmlFor="model-timeout" className="text-xs font-medium text-slate-300">
                  Timeout (ms)
                </label>
                <input
                  id="model-timeout"
                  type="number"
                  min={3000}
                  max={180000}
                  step={1000}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-1.5 font-mono text-xs text-white tabular-nums focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="model-context" className="text-xs font-medium text-slate-300">
                Max Context Turns
              </label>
              <input
                id="model-context"
                type="number"
                min={4}
                max={80}
                value={maxContextMessages}
                onChange={(e) => setMaxContextMessages(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-1.5 font-mono text-xs text-white tabular-nums focus:border-blue-500 focus:outline-none"
              />
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-800 bg-[#06090f]/70 px-3 py-2.5 text-xs text-slate-200">
              <span>Enable Streaming Responses</span>
              <input
                type="checkbox"
                checked={streamResponses}
                onChange={(e) => setStreamResponses(e.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "Saving..." : "Save Model Configuration"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
