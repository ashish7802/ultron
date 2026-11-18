/**
 * @file components/views/SettingsCenterView.tsx
 * @description Complete 9-Section Settings Center View backed by atomic `/api/settings` persistence.
 *
 * Subsystem:
 * Interface Area H — Settings Center.
 *
 * Key Responsibilities:
 * - Replaces the legacy dead stub ("Settings are not available in this build.") with full,
 *   persisted, validated controls across all 9 required sections:
 *   1. General
 *   2. Appearance
 *   3. AI Configuration
 *   4. Voice Configuration
 *   5. Memory Settings
 *   6. Security Settings
 *   7. Notifications
 *   8. System Integration
 *   9. Developer Settings
 * - Tracks unsaved changes, surfaces server validation errors cleanly, and uses inline confirmation
 *   for Reset to Defaults (zero `window.confirm`).
 *
 * Architectural Role & Interactions:
 * - Syncs directly with `GET`/`POST /api/settings` and notifies `UltronWorkspace` on save.
 *
 * Safety / Security Guarantees:
 * - `strictLoopbackOnly` security invariant is locked read-only (enabled) to prevent accidental downgrade.
 */

"use client";

import React, { useEffect, useState } from "react";
import {
  Bell,
  Code2,
  Cpu,
  Database,
  Mic,
  Palette,
  RotateCcw,
  Save,
  Server,
  Shield,
  Sliders,
} from "lucide-react";
import type { ToastNotice, UltronSettings } from "@/components/workspace/types";
import { ultronJson } from "@/components/workspace/apiClient";

interface SettingsCenterViewProps {
  settings: UltronSettings | null;
  onSettingsSaved: (updated: UltronSettings) => void;
  onNotify: (notice: Omit<ToastNotice, "id">) => void;
}

type SettingsSectionId =
  | "general"
  | "appearance"
  | "ai"
  | "voice"
  | "memory"
  | "security"
  | "notifications"
  | "system"
  | "developer";

const SECTIONS: Array<{ id: SettingsSectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "general", label: "General", icon: Sliders },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "ai", label: "AI Configuration", icon: Server },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "memory", label: "Memory", icon: Database },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "system", label: "System Integration", icon: Cpu },
  { id: "developer", label: "Developer", icon: Code2 },
];

export default function SettingsCenterView({
  settings,
  onSettingsSaved,
  onNotify,
}: SettingsCenterViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const [draft, setDraft] = useState<UltronSettings | null>(settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !dirty) {
      setDraft(settings);
    }
  }, [settings, dirty]);

  const patchSection = <K extends SettingsSectionId>(section: K, patch: Partial<UltronSettings[K]>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [section]: {
          ...prev[section],
          ...patch,
        },
      };
    });
    setDirty(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await ultronJson<{ ok?: boolean; settings?: UltronSettings; error?: string }>("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: draft }),
    });
    setSaving(false);

    if (res.ok && res.data?.settings) {
      setDraft(res.data.settings);
      setDirty(false);
      onSettingsSaved(res.data.settings);
      onNotify({ tone: "success", title: "Settings persisted to local configuration" });
    } else {
      setError(res.error || "Failed to save settings.");
      onNotify({ tone: "error", title: "Validation error", detail: res.error || undefined });
    }
  };

  const handleReset = async () => {
    setSaving(true);
    const res = await ultronJson<{ ok?: boolean; settings?: UltronSettings }>("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    setSaving(false);
    setConfirmReset(false);

    if (res.ok && res.data?.settings) {
      setDraft(res.data.settings);
      setDirty(false);
      onSettingsSaved(res.data.settings);
      onNotify({ tone: "info", title: "Settings restored to defaults" });
    }
  };

  if (!draft) {
    return (
      <div className="mx-auto max-w-5xl py-10 text-center text-sm text-slate-400">
        Loading persisted configuration...
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Settings Center</h1>
          <p className="text-sm text-slate-400">
            Configure ULTRON&apos;s workspace, AI engine, voice, memory, security, and developer behavior.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {confirmReset ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleReset()}
                className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-500"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0b101b] px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Defaults</span>
            </button>
          )}

          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3.5 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Section Navigation */}
        <nav aria-label="Settings categories" className="space-y-1 lg:col-span-3">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                  active
                    ? "border border-blue-500/40 bg-blue-600/15 text-white"
                    : "border border-transparent text-slate-400 hover:bg-[#0b101b] hover:text-slate-200"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-blue-400" : "text-slate-500"}`} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Form Panel */}
        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-6 lg:col-span-9">
          {activeSection === "general" && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-white">General Settings</h2>
              <div>
                <label htmlFor="set-name" className="block text-xs font-medium text-slate-300">Assistant Display Name</label>
                <input
                  id="set-name"
                  type="text"
                  value={draft.general.assistantName}
                  onChange={(e) => patchSection("general", { assistantName: e.target.value })}
                  className="mt-1 w-full max-w-md rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-lang" className="block text-xs font-medium text-slate-300">Preferred Language</label>
                  <select
                    id="set-lang"
                    value={draft.general.preferredLanguage}
                    onChange={(e) =>
                      patchSection("general", {
                        preferredLanguage: e.target.value as UltronSettings["general"]["preferredLanguage"],
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="auto">Auto (English & Hinglish)</option>
                    <option value="en">English</option>
                    <option value="hinglish">Hinglish</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="set-startup" className="block text-xs font-medium text-slate-300">Default Startup View</label>
                  <select
                    id="set-startup"
                    value={draft.general.startupView}
                    onChange={(e) =>
                      patchSection("general", {
                        startupView: e.target.value as UltronSettings["general"]["startupView"],
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="command">Command Center</option>
                    <option value="chat">AI Chat</option>
                    <option value="system">System Control</option>
                    <option value="models">AI Model Manager</option>
                    <option value="security">Security Center</option>
                  </select>
                </div>
              </div>
              <ToggleRow
                label="Require inline confirmation before destructive actions"
                checked={draft.general.confirmDestructiveActions}
                onChange={(v) => patchSection("general", { confirmDestructiveActions: v })}
              />
            </div>
          )}

          {activeSection === "appearance" && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-white">Appearance</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-accent" className="block text-xs font-medium text-slate-300">Accent Profile</label>
                  <select
                    id="set-accent"
                    value={draft.appearance.accentPreset}
                    onChange={(e) =>
                      patchSection("appearance", {
                        accentPreset: e.target.value as UltronSettings["appearance"]["accentPreset"],
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 text-sm text-white"
                  >
                    <option value="electric-blue">Electric Blue (Default)</option>
                    <option value="cyan">Cyan Telemetry</option>
                    <option value="indigo">Deep Indigo</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="set-density" className="block text-xs font-medium text-slate-300">Interface Density</label>
                  <select
                    id="set-density"
                    value={draft.appearance.density}
                    onChange={(e) =>
                      patchSection("appearance", {
                        density: e.target.value as UltronSettings["appearance"]["density"],
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 text-sm text-white"
                  >
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </select>
                </div>
              </div>
              <ToggleRow
                label="Reduced motion mode (disables UI view transitions)"
                checked={draft.appearance.reducedMotion}
                onChange={(v) => patchSection("appearance", { reducedMotion: v })}
              />
              <ToggleRow
                label="Display active model & memory metadata on chat replies"
                checked={draft.appearance.showTokenMetadata}
                onChange={(v) => patchSection("appearance", { showTokenMetadata: v })}
              />
            </div>
          )}

          {activeSection === "ai" && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-white">AI Configuration</h2>
              <div>
                <label htmlFor="set-ollama" className="block text-xs font-medium text-slate-300">Ollama Loopback Endpoint</label>
                <input
                  id="set-ollama"
                  type="text"
                  value={draft.ai.ollamaEndpoint}
                  onChange={(e) => patchSection("ai", { ollamaEndpoint: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 font-mono text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-model" className="block text-xs font-medium text-slate-300">Active Model Tag</label>
                  <input
                    id="set-model"
                    type="text"
                    value={draft.ai.activeModel}
                    onChange={(e) => patchSection("ai", { activeModel: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 font-mono text-xs text-white"
                  />
                </div>
                <div>
                  <label htmlFor="set-timeout" className="block text-xs font-medium text-slate-300">Inference Timeout (ms)</label>
                  <input
                    id="set-timeout"
                    type="number"
                    min={3000}
                    max={180000}
                    step={1000}
                    value={draft.ai.timeoutMs}
                    onChange={(e) => patchSection("ai", { timeoutMs: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 font-mono text-xs text-white tabular-nums"
                  />
                </div>
              </div>
              <ToggleRow
                label="Stream LLM responses incrementally when supported"
                checked={draft.ai.streamResponses}
                onChange={(v) => patchSection("ai", { streamResponses: v })}
              />
            </div>
          )}

          {activeSection === "voice" && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-white">Voice Configuration</h2>
              <ToggleRow
                label="Enable automatic speech output (TTS) for assistant replies"
                checked={draft.voice.ttsEnabled}
                onChange={(v) => patchSection("voice", { ttsEnabled: v })}
              />
              <ToggleRow
                label="Auto-submit verified voice transcript to chat"
                checked={draft.voice.autoSubmitTranscript}
                onChange={(v) => patchSection("voice", { autoSubmitTranscript: v })}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-rate" className="block text-xs font-medium text-slate-300">
                    Speech Rate ({draft.voice.speechRate.toFixed(1)}x)
                  </label>
                  <input
                    id="set-rate"
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={draft.voice.speechRate}
                    onChange={(e) => patchSection("voice", { speechRate: Number(e.target.value) })}
                    className="mt-2 w-full accent-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="set-vol" className="block text-xs font-medium text-slate-300">
                    Speech Volume ({draft.voice.speechVolume}%)
                  </label>
                  <input
                    id="set-vol"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={draft.voice.speechVolume}
                    onChange={(e) => patchSection("voice", { speechVolume: Number(e.target.value) })}
                    className="mt-2 w-full accent-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "memory" && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-white">Memory Settings</h2>
              <ToggleRow
                label="Automatically recall relevant encrypted memories during chat"
                checked={draft.memory.autoMemoryRecall}
                onChange={(v) => patchSection("memory", { autoMemoryRecall: v })}
              />
              <ToggleRow
                label="Allow automatic memory capture when explicitly asked ('Remember that...')"
                checked={draft.memory.autoMemoryCapture}
                onChange={(v) => patchSection("memory", { autoMemoryCapture: v })}
              />
              <div>
                <label htmlFor="set-mem-cat" className="block text-xs font-medium text-slate-300">Default Memory Category</label>
                <select
                  id="set-mem-cat"
                  value={draft.memory.defaultCategory}
                  onChange={(e) =>
                    patchSection("memory", {
                      defaultCategory: e.target.value as UltronSettings["memory"]["defaultCategory"],
                    })
                  }
                  className="mt-1 w-full max-w-xs rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 text-sm text-white"
                >
                  <option value="fact">Fact</option>
                  <option value="preference">Preference</option>
                  <option value="project">Project</option>
                  <option value="profile">Profile</option>
                  <option value="instruction">Instruction</option>
                </select>
              </div>
            </div>
          )}

          {activeSection === "security" && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-white">Security Settings</h2>
              <ToggleRow
                label="Require explicit operator approval before desktop actions execute"
                checked={draft.security.requireApprovalForDesktopActions}
                onChange={(v) => patchSection("security", { requireApprovalForDesktopActions: v })}
              />
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#06090f]/70 px-3.5 py-3 text-xs">
                <div>
                  <div className="font-medium text-slate-200">Strict Loopback-Only API Enforcement</div>
                  <div className="text-[11px] text-slate-500">Immutable security invariant — cannot be disabled</div>
                </div>
                <span className="font-mono text-emerald-400">LOCKED ON</span>
              </div>
              <div>
                <label htmlFor="set-audit-limit" className="block text-xs font-medium text-slate-300">
                  Audit Query Retention Window (entries)
                </label>
                <input
                  id="set-audit-limit"
                  type="number"
                  min={100}
                  max={5000}
                  step={50}
                  value={draft.security.auditRetentionLimit}
                  onChange={(e) => patchSection("security", { auditRetentionLimit: Number(e.target.value) })}
                  className="mt-1 w-full max-w-xs rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 font-mono text-xs text-white tabular-nums"
                />
              </div>
            </div>
          )}

          {activeSection === "notifications" && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-white">Notifications</h2>
              <ToggleRow
                label="Alert when desktop actions await permission approval"
                checked={draft.notifications.showApprovalAlerts}
                onChange={(v) => patchSection("notifications", { showApprovalAlerts: v })}
              />
              <ToggleRow
                label="Display system warnings and security lockdown alerts"
                checked={draft.notifications.showSystemWarnings}
                onChange={(v) => patchSection("notifications", { showSystemWarnings: v })}
              />
              <ToggleRow
                label="Show toast notifications for Ollama model connectivity changes"
                checked={draft.notifications.showModelStatusToasts}
                onChange={(v) => patchSection("notifications", { showModelStatusToasts: v })}
              />
            </div>
          )}

          {activeSection === "system" && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-white">System Integration</h2>
              <div>
                <label htmlFor="set-refresh" className="block text-xs font-medium text-slate-300">
                  Telemetry Refresh Interval (seconds)
                </label>
                <input
                  id="set-refresh"
                  type="number"
                  min={5}
                  max={120}
                  value={draft.system.telemetryRefreshSeconds}
                  onChange={(e) => patchSection("system", { telemetryRefreshSeconds: Number(e.target.value) })}
                  className="mt-1 w-full max-w-xs rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 font-mono text-xs text-white tabular-nums"
                />
              </div>
              <ToggleRow
                label="Enable read-only desktop window count inspection (Windows hosts)"
                checked={draft.system.enableWindowInspection}
                onChange={(v) => patchSection("system", { enableWindowInspection: v })}
              />
            </div>
          )}

          {activeSection === "developer" && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-white">Developer Settings</h2>
              <ToggleRow
                label="Enable verbose diagnostic logging in memory ring buffer"
                checked={draft.developer.verboseLogging}
                onChange={(v) => patchSection("developer", { verboseLogging: v })}
              />
              <ToggleRow
                label="Show Developer / Diagnostic Center in primary navigation"
                checked={draft.developer.showDiagnosticPanel}
                onChange={(v) => patchSection("developer", { showDiagnosticPanel: v })}
              />
              <div>
                <label htmlFor="set-log-limit" className="block text-xs font-medium text-slate-300">
                  In-Memory Log Buffer Size
                </label>
                <input
                  id="set-log-limit"
                  type="number"
                  min={50}
                  max={250}
                  value={draft.developer.logBufferLimit}
                  onChange={(e) => patchSection("developer", { logBufferLimit: Number(e.target.value) })}
                  className="mt-1 w-full max-w-xs rounded-lg border border-slate-800 bg-[#06090f] px-3 py-2 font-mono text-xs text-white tabular-nums"
                />
              </div>
              <div className="border-t border-slate-800/80 pt-3 font-mono text-[11px] text-slate-500">
                Last persisted: {new Date(draft.updatedAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-800 bg-[#06090f]/70 px-3.5 py-3 text-xs text-slate-200 transition-colors hover:border-slate-700">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-blue-500"
      />
    </label>
  );
}
