/**
 * @file components/UltronWorkspace.tsx
 * @description Unified Operating Environment Shell for ULTRON AI Desktop Assistant.
 *
 * Subsystem:
 * Root Presentation Shell & Navigation Orchestrator.
 *
 * Key Responsibilities:
 * - Bootstraps the desktop HttpOnly loopback session (`/api/auth/session`) on mount.
 * - Coordinates live telemetry (`/api/dashboard`), persisted user settings (`/api/settings`),
 *   and verified authentication state (`/api/security/auth`).
 * - Provides a persistent 248px left rail on desktop and responsive slide-over drawer on mobile
 *   connecting all 9 operational centers:
 *   Command Center, AI Chat, Voice Studio, Memory Center, System Control, AI Models,
 *   Security Center, Settings, and Diagnostics.
 * - Uses `motion/react` compositor-only view transitions respecting reduced-motion preferences.
 * - Provides an accessible, non-blocking toast notification stack (zero `window.alert`/`confirm`).
 *
 * Architectural Role & Interactions:
 * - Mounted by `/app/page.tsx`.
 * - Bridges quick commands and voice transcripts directly into `ChatView`.
 *
 * Safety / Security Guarantees:
 * - Never renders fabricated hardware, biometric, or Ollama online indicators.
 * - Displays an immediate fail-closed banner whenever Emergency Lockdown is active.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Cpu,
  Database,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Mic,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Terminal,
  X,
} from "lucide-react";
import type {
  DashboardSnapshot,
  SessionInfo,
  ToastNotice,
  UltronSettings,
  UltronViewId,
} from "@/components/workspace/types";
import { ensureDesktopSession, ultronJson } from "@/components/workspace/apiClient";
import CommandCenterView from "@/components/views/CommandCenterView";
import ChatView from "@/components/views/ChatView";
import VoiceView from "@/components/views/VoiceView";
import MemoryCenterView from "@/components/views/MemoryCenterView";
import SystemControlView from "@/components/views/SystemControlView";
import ModelManagerView from "@/components/views/ModelManagerView";
import SecurityCenterView from "@/components/views/SecurityCenterView";
import SettingsCenterView from "@/components/views/SettingsCenterView";
import DiagnosticsView from "@/components/views/DiagnosticsView";

interface NavItem {
  id: UltronViewId;
  label: string;
  group: "core" | "system" | "governance";
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "command", label: "Dashboard", group: "core", icon: LayoutDashboard },
  { id: "chat", label: "AI Chat", group: "core", icon: MessageSquare },
  { id: "voice", label: "Voice", group: "core", icon: Mic },
  { id: "memory", label: "Memory", group: "core", icon: Database },
  { id: "system", label: "System Control", group: "system", icon: Cpu },
  { id: "models", label: "AI Models", group: "system", icon: Server },
  { id: "security", label: "Security", group: "governance", icon: ShieldCheck },
  { id: "settings", label: "Settings", group: "governance", icon: Sliders },
  { id: "diagnostics", label: "Diagnostics", group: "governance", icon: Activity },
];

export default function UltronWorkspace() {
  const [activeView, setActiveView] = useState<UltronViewId>("command");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [settings, setSettings] = useState<UltronSettings | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const pushToast = useCallback((notice: Omit<ToastNotice, "id">) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [{ ...notice, id }, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const refreshDashboard = useCallback(async () => {
    setDashboardLoading(true);
    const res = await ultronJson<DashboardSnapshot>("/api/dashboard");
    if (res.ok && res.data) {
      setDashboard(res.data);
    }
    setDashboardLoading(false);
  }, []);

  const refreshSecuritySession = useCallback(async () => {
    const res = await ultronJson<{
      authenticated?: boolean;
      session?: {
        sessionId: string;
        userId: string;
        userRole: string;
        authenticationLevel?: string;
        expiresAt: number;
      } | null;
    }>("/api/security/auth");
    if (res.ok && res.data) {
      setSession({
        authenticated: Boolean(res.data.authenticated),
        sessionId: res.data.session?.sessionId ?? null,
        userId: res.data.session?.userId ?? null,
        userRole: res.data.session?.userRole ?? "guest",
        authenticationLevel: res.data.session?.authenticationLevel ?? (res.data.authenticated ? "CHAT_AUTHENTICATED" : "UNAUTHENTICATED"),
        expiresAt: res.data.session?.expiresAt ?? null,
      });
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    const res = await ultronJson<{ ok?: boolean; settings?: UltronSettings }>("/api/settings");
    if (res.ok && res.data?.settings) {
      setSettings(res.data.settings);
    }
  }, []);

  // Initial session bootstrap & telemetry load
  useEffect(() => {
    let mounted = true;
    (async () => {
      await ensureDesktopSession(true);
      if (!mounted) return;
      await Promise.all([refreshDashboard(), refreshSettings(), refreshSecuritySession()]);
    })();
    return () => {
      mounted = false;
    };
  }, [refreshDashboard, refreshSettings, refreshSecuritySession]);

  // Configurable periodic telemetry refresh (paused when document hidden)
  useEffect(() => {
    const intervalSec = Math.max(5, Math.min(120, settings?.system.telemetryRefreshSeconds ?? 15));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshDashboard();
      }
    }, intervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [settings?.system.telemetryRefreshSeconds, refreshDashboard]);

  const handleNavigate = useCallback((view: UltronViewId) => {
    setActiveView(view);
    setMobileNavOpen(false);
  }, []);

  const handleBridgeToChat = useCallback((prompt: string) => {
    setPendingPrompt(prompt);
    setActiveView("chat");
    setMobileNavOpen(false);
  }, []);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.id === "diagnostics" && settings && !settings.developer.showDiagnosticPanel) {
      return false;
    }
    return true;
  });

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeView) || NAV_ITEMS[0];
  const lockdownActive = Boolean(dashboard?.security.lockdownActive);
  const modelReady = dashboard?.model.status === "ready";
  const reducedMotion = Boolean(settings?.appearance.reducedMotion);

  return (
    <div className="flex min-h-screen w-full bg-[#06090f] text-slate-100">
      {/* Desktop Left Navigation Rail (248px) */}
      <aside
        aria-label="Primary navigation"
        className="hidden w-[248px] shrink-0 flex-col border-r border-slate-800/80 bg-[#080c15] lg:flex"
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-800/80 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-blue-500/40 bg-blue-600/15 text-blue-400">
            <Terminal className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold tracking-wide text-white">
              {settings?.general.assistantName || "ULTRON"}
            </div>
            <div className="font-mono text-[10px] text-slate-500">AI Operating Environment</div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {(["core", "system", "governance"] as const).map((groupKey) => {
            const items = visibleNavItems.filter((i) => i.group === groupKey);
            if (items.length === 0) return null;
            const groupLabel =
              groupKey === "core" ? "Workspace" : groupKey === "system" ? "Compute & Models" : "Governance";
            return (
              <div key={groupKey}>
                <div className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  {groupLabel}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={active ? "page" : undefined}
                        onClick={() => handleNavigate(item.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                          active
                            ? "border border-blue-500/35 bg-blue-600/15 text-white"
                            : "border border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-cyan-300" : "text-slate-500"}`} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom Truthful Host Footer */}
        <div className="border-t border-slate-800/80 p-3.5 text-[11px]">
          <div className="flex items-center justify-between text-slate-400">
            <span>Ollama</span>
            <span className={`font-mono ${modelReady ? "text-emerald-400" : "text-amber-400"}`}>
              {dashboard ? (modelReady ? "Connected" : "Offline") : "Checking"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-slate-400">
            <span>Role</span>
            <span className="font-mono text-slate-200">{session?.userRole || "operator"}</span>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative z-10 flex w-64 flex-col border-r border-slate-800 bg-[#080c15]"
            >
              <div className="flex h-14 items-center justify-between border-b border-slate-800 px-4">
                <span className="font-display text-sm font-semibold text-white">
                  {settings?.general.assistantName || "ULTRON"}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label="Close navigation menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavigate(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium ${
                        active
                          ? "border border-blue-500/35 bg-blue-600/15 text-white"
                          : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Right Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Command Bar (56px) */}
        <header className="ultron-glass sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg border border-slate-800 bg-[#0b101b] p-2 text-slate-300 hover:text-white lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="truncate font-display text-sm font-semibold text-white">
              {activeNavMeta.label}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => handleNavigate("models")}
              className="hidden items-center gap-2 rounded-md border border-slate-800 bg-[#0b101b] px-2.5 py-1.5 font-mono text-[11px] text-slate-300 transition-colors hover:border-slate-700 hover:text-white sm:inline-flex"
            >
              <Server className={`h-3.5 w-3.5 ${modelReady ? "text-emerald-400" : "text-amber-400"}`} />
              <span className="max-w-[180px] truncate">
                {dashboard?.model.model || settings?.ai.activeModel || "No model"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleNavigate("security")}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                lockdownActive
                  ? "border-rose-500/50 bg-rose-950/30 text-rose-300"
                  : "border-slate-800 bg-[#0b101b] text-slate-300 hover:border-slate-700 hover:text-white"
              }`}
            >
              {lockdownActive ? (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                  <span>LOCKDOWN</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">{session?.userRole || "operator"}</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Emergency Lockdown Global Alert Bar */}
        {lockdownActive && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-500/40 bg-rose-950/30 px-4 py-2 text-xs text-rose-200 sm:px-6"
          >
            <span className="font-medium">
              Emergency Lockdown is active. Privileged desktop automation and tool execution are suspended fail-closed.
            </span>
            <button
              type="button"
              onClick={() => handleNavigate("security")}
              className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rose-500"
            >
              Open Security Center
            </button>
          </div>
        )}

        {/* Active View Viewport */}
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: reducedMotion ? 0 : 0.16, ease: "easeOut" }}
            >
              {activeView === "command" && (
                <CommandCenterView
                  dashboard={dashboard}
                  dashboardLoading={dashboardLoading}
                  onRefreshDashboard={() => void refreshDashboard()}
                  session={session}
                  settings={settings}
                  onNavigate={handleNavigate}
                  onQuickPrompt={handleBridgeToChat}
                />
              )}

              {activeView === "chat" && (
                <ChatView
                  dashboard={dashboard}
                  settings={settings}
                  pendingPrompt={pendingPrompt}
                  onConsumePendingPrompt={() => setPendingPrompt(null)}
                  onNavigate={handleNavigate}
                  onNotify={pushToast}
                />
              )}

              {activeView === "voice" && (
                <VoiceView
                  settings={settings}
                  onSendTranscript={handleBridgeToChat}
                  onNotify={pushToast}
                />
              )}

              {activeView === "memory" && <MemoryCenterView onNotify={pushToast} />}

              {activeView === "system" && (
                <SystemControlView
                  dashboard={dashboard}
                  dashboardLoading={dashboardLoading}
                  onRefreshDashboard={() => void refreshDashboard()}
                  onNotify={pushToast}
                />
              )}

              {activeView === "models" && (
                <ModelManagerView
                  onConfigChanged={() => {
                    void refreshSettings();
                    void refreshDashboard();
                  }}
                  onNotify={pushToast}
                />
              )}

              {activeView === "security" && (
                <SecurityCenterView
                  onSecurityChanged={() => {
                    void refreshSecuritySession();
                    void refreshDashboard();
                  }}
                  onNotify={pushToast}
                />
              )}

              {activeView === "settings" && (
                <SettingsCenterView
                  settings={settings}
                  onSettingsSaved={(updated) => {
                    setSettings(updated);
                    void refreshDashboard();
                  }}
                  onNotify={pushToast}
                />
              )}

              {activeView === "diagnostics" && <DiagnosticsView onNotify={pushToast} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Non-Blocking Toast Notification Stack */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed top-16 right-6 z-50 flex w-full max-w-xs flex-col gap-2"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className={`pointer-events-auto flex items-start justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-xs shadow-lg ${
                t.tone === "error"
                  ? "border-rose-500/40 bg-[#180d14] text-rose-100"
                  : t.tone === "warn"
                    ? "border-amber-500/40 bg-[#1a150b] text-amber-100"
                    : t.tone === "success"
                      ? "border-emerald-500/40 bg-[#0b1914] text-emerald-100"
                      : "border-blue-500/40 bg-[#0d1424] text-slate-100"
              }`}
            >
              <div className="min-w-0">
                <div className="font-medium">{t.title}</div>
                {t.detail && <div className="mt-0.5 text-[11px] opacity-80">{t.detail}</div>}
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="rounded p-0.5 opacity-70 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
