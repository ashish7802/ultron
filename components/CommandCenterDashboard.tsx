/**
 * @file components/CommandCenterDashboard.tsx
 * @description Command-center workspace backed by ULTRON's existing chat and local services.
 *
 * Responsibilities:
 * - Presents live host, workflow, security, and model-service status with explicit unavailable states.
 * - Reuses the active persisted conversation for its compact chat panel.
 * - Routes task, memory, security, desktop, and voice actions to existing application services.
 *
 * Architectural Role & Interactions:
 * - Rendered by `UltronChat`, which remains the owner of persisted conversation state and chat requests.
 * - Reads authenticated telemetry from `/api/dashboard` and delegates voice control to `UltronOrb`.
 *
 * Safety / Security Guarantees:
 * - Does not simulate unsupported hardware data or claim that a prompt has been executed.
 * - Requests for desktop actions continue through the existing permission-aware chat/API flow.
 */

"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, Conversation } from "./UltronChat";
import MarkdownRenderer from "./MarkdownRenderer";
import UltronOrb from "./UltronOrb";

declare global {
  interface Window {
    ultronAPI?: {
      getVersion(): Promise<string>;
      minimizeWindow(): Promise<void>;
      toggleMaximizeWindow(): Promise<boolean>;
      closeWindow(): Promise<void>;
      isWindowMaximized(): Promise<boolean>;
    };
  }
}

type DashboardSection = "command" | "system" | "agents" | "tools" | "settings";
type VoiceStatus = { active: boolean; label: string; assistantState: string; error: string | null };

interface DashboardSnapshot {
  sampledAt: number;
  host: {
    platform: string;
    release: string;
    cpuModel: string | null;
    cpuCores: number | null;
  };
  metrics: {
    cpuPercent: number | null;
    memoryPercent: number | null;
    memoryTotalBytes: number | null;
    memoryFreeBytes: number | null;
    storage: { totalBytes: number; freeBytes: number; usedPercent: number } | null;
    gpuPercent: number | null;
  };
  model: { status: "ready" | "unavailable"; model: string | null };
  workflows: { total: number; active: number; openTasks: number } | null;
  visibleWindows: number | null;
  security: { recentEventCount: number; activeIncidentCount: number };
}

interface CommandCenterDashboardProps {
  activeConversation: Conversation | null;
  isGenerating: boolean;
  liveStatus: { message: string; progress: number } | null;
  onSendMessage: (prompt: string) => Promise<void>;
  onOpenChat: (prefill?: string) => void;
  onNewChat: () => void;
  onOpenMemory: () => void;
  onOpenTasks: () => void;
  onOpenSecurity: () => void;
}

const NAV_ITEMS: Array<{ label: string; symbol: string; section?: DashboardSection; action?: string }> = [
  { label: "Dashboard", symbol: "⌂", section: "command" },
  { label: "Chat", symbol: "◌", action: "chat" },
  { label: "Voice", symbol: "◖", action: "voice" },
  { label: "Tasks", symbol: "▤", action: "tasks" },
  { label: "Computer Control", symbol: "▦", action: "computer" },
  { label: "System Monitor", symbol: "⌁", section: "system" },
  { label: "Memory", symbol: "◇", action: "memory" },
  { label: "Security", symbol: "⬡", action: "security" },
  { label: "Tools", symbol: "⚙", section: "tools" },
  { label: "Settings", symbol: "☷", section: "settings" },
];

/**
 * Formats a byte count for display without substituting a value when it is unknown.
 *
 * @param bytes - Measured storage or memory capacity.
 * @returns A compact binary-unit value or the explicit unavailable label.
 */
function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "Unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Displays one measured utilization value and its supporting detail.
 *
 * @param props - Metric label, optional percentage, and measurement context.
 * @returns Accessible utilization gauge.
 */
function MetricGauge({ label, value, detail }: { label: string; value: number | null; detail?: string }) {
  const available = value !== null;
  return (
    <div className="cc-metric">
      <div className="cc-metric-heading">
        <span>{label}</span>
        <strong>{available ? `${value}%` : "N/A"}</strong>
      </div>
      <div className="cc-gauge" aria-label={`${label}: ${available ? `${value}%` : "unavailable"}`}>
        <span style={{ width: available ? `${Math.max(0, Math.min(100, value))}%` : "0%" }} />
      </div>
      {detail && <div className="cc-metric-detail">{detail}</div>}
    </div>
  );
}

/**
 * Shows the current readiness state reported by the connected service.
 *
 * @param props - Module label, state detail, and availability state.
 * @returns A compact service status row.
 */
function ModuleStatus({ name, detail, state }: { name: string; detail: string; state: "online" | "idle" | "offline" }) {
  return (
    <div className="cc-module-row">
      <span className={`cc-status-light ${state}`} aria-hidden="true" />
      <div className="cc-module-copy">
        <strong>{name}</strong>
        <span>{detail}</span>
      </div>
      <span className={`cc-module-state ${state}`}>{state === "online" ? "READY" : state === "idle" ? "STANDBY" : "N/A"}</span>
    </div>
  );
}

/**
 * Displays the selected conversation and forwards new turns to the owning chat component.
 *
 * @param props - Active conversation, draft controls, generation status, and chat callbacks.
 * @returns Compact, history-backed chat panel.
 */
function MiniChat({
  conversation,
  draft,
  setDraft,
  isGenerating,
  liveStatus,
  onSendMessage,
  onExpand,
}: {
  conversation: Conversation | null;
  draft: string;
  setDraft: (value: string) => void;
  isGenerating: boolean;
  liveStatus: { message: string; progress: number } | null;
  onSendMessage: (prompt: string) => Promise<void>;
  onExpand: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const messages = conversation?.messages.filter((message) => message.role !== "system") ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content, isGenerating]);

  const send = async () => {
    const prompt = draft.trim();
    if (!prompt || isGenerating || sendingRef.current) return;
    sendingRef.current = true;
    setDraft("");
    try {
      await onSendMessage(prompt);
    } finally {
      sendingRef.current = false;
    }
  };

  if (collapsed) {
    return (
      <button className="cc-chat-launcher" type="button" onClick={() => setCollapsed(false)} aria-label="Open ULTRON chat">
        <span>◌</span>
        <span>ULTRON CHAT</span>
      </button>
    );
  }

  return (
    <section className="cc-mini-chat" aria-label="Conversation">
      <header className="cc-mini-chat-header">
        <div>
          <span className="cc-mini-chat-indicator" />
          <strong>ULTRON</strong>
          <span className="cc-mini-chat-subtitle">{conversation?.title ?? "Conversation"}</span>
        </div>
        <div className="cc-mini-chat-actions">
          <button type="button" onClick={onExpand} title="Open full chat" aria-label="Open full chat">↗</button>
          <button type="button" onClick={() => setCollapsed(true)} title="Minimize chat" aria-label="Minimize chat">−</button>
        </div>
      </header>

      <div className="cc-mini-chat-messages" aria-live="polite">
        {!conversation && <div className="cc-chat-empty">Loading the active conversation…</div>}
        {conversation && messages.length === 0 && (
          <div className="cc-chat-empty">Your conversation is ready. Ask ULTRON to continue.</div>
        )}
        {messages.slice(-40).map((message: ChatMessage) => (
          <article className={`cc-chat-message ${message.role}`} key={message.id}>
            <div className="cc-chat-message-role">{message.role === "assistant" ? "ULTRON" : "YOU"}</div>
            <div className="cc-chat-message-content">
              {message.role === "assistant" ? (
                <MarkdownRenderer content={message.content} />
              ) : (
                message.content
              )}
            </div>
          </article>
        ))}
        {isGenerating && (
          <div className="cc-chat-thinking" role="status">
            <span className="cc-typing-dots"><i /><i /><i /></span>
            <span>{liveStatus?.message || "ULTRON is thinking…"}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="cc-mini-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="Message ULTRON"
          placeholder="Message ULTRON…"
          value={draft}
          disabled={isGenerating}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" disabled={!draft.trim() || isGenerating} aria-label="Send message">
          {isGenerating ? "…" : "↑"}
        </button>
      </form>
    </section>
  );
}

/**
 * Renders live command-center data and delegates all actions to existing ULTRON services.
 *
 * @param props - Shared conversation state and callbacks owned by `UltronChat`.
 * @returns Responsive command-center dashboard.
 */
export default function CommandCenterDashboard({
  activeConversation,
  isGenerating,
  liveStatus,
  onSendMessage,
  onOpenChat,
  onNewChat,
  onOpenMemory,
  onOpenTasks,
  onOpenSecurity,
}: CommandCenterDashboardProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [section, setSection] = useState<DashboardSection>("command");
  const [draft, setDraft] = useState("");
  const [voiceToggleRequest, setVoiceToggleRequest] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({
    active: false,
    label: "VOICE OFF",
    assistantState: "idle",
    error: null,
  });
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);

  const refreshTelemetry = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) throw new Error(`Telemetry request failed (HTTP ${response.status}).`);
      const payload = await response.json();
      if (!payload?.ok) throw new Error("Telemetry service returned an invalid response.");
      setSnapshot(payload as DashboardSnapshot);
      setTelemetryError(null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setTelemetryError(error instanceof Error ? error.message : "Telemetry is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshTelemetry(controller.signal);
    const interval = window.setInterval(() => void refreshTelemetry(), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refreshTelemetry]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    if (!window.ultronAPI) return;
    void Promise.all([window.ultronAPI.getVersion(), window.ultronAPI.isWindowMaximized()])
      .then(([version, maximized]) => {
        if (active) {
          setDesktopVersion(version);
          setIsMaximized(maximized);
        }
      })
      .catch(() => {
        if (active) setWindowError("Desktop window controls are unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  const handleVoiceStatusChange = useCallback((status: VoiceStatus) => {
    setVoiceStatus(status);
  }, []);

  /**
   * Routes native window controls through the isolated Electron preload bridge.
   *
   * @param action - Requested operation for ULTRON's own desktop window.
   * @returns Resolves after the main process handles the request.
   */
  const performWindowAction = async (action: "minimize" | "maximize" | "close") => {
    const api = window.ultronAPI;
    if (!api) return;
    setWindowError(null);
    try {
      if (action === "minimize") {
        await api.minimizeWindow();
      } else if (action === "maximize") {
        setIsMaximized(await api.toggleMaximizeWindow());
      } else {
        await api.closeWindow();
      }
    } catch {
      setWindowError("The desktop window action failed.");
    }
  };

  /**
   * Prefills the shared chat composer; it does not execute the suggested action.
   *
   * @param prompt - Prompt template to place in the mini-chat composer.
   */
  const preparePrompt = (prompt: string) => {
    setSection("command");
    setDraft(prompt);
  };

  /**
   * Maps sidebar actions to implemented pages or protected application modals.
   *
   * @param action - Navigation action identifier.
   */
  const handleNavAction = (action: string) => {
    switch (action) {
      case "chat":
        onOpenChat();
        break;
      case "voice":
        setVoiceToggleRequest((request) => request + 1);
        break;
      case "tasks":
        onOpenTasks();
        break;
      case "computer":
        onOpenChat("Inspect the currently available desktop controls and explain which actions require approval.");
        break;
      case "memory":
        onOpenMemory();
        break;
      case "security":
        onOpenSecurity();
        break;
    }
  };

  const modelState = snapshot?.model.status === "ready" ? "online" : "offline";
  const workflowState = snapshot?.workflows ? "online" : "offline";
  const visibleWindowText =
    snapshot?.visibleWindows === null || snapshot?.visibleWindows === undefined
      ? "Unavailable"
      : String(snapshot.visibleWindows);

  return (
    <div className="cc-shell">
      <header className="cc-topbar">
        <button className="cc-brand" type="button" onClick={() => setSection("command")} aria-label="ULTRON command center">
          <span className="cc-brand-mark">U</span>
          <span className="cc-brand-copy">
            <strong>ULTRON</strong>
            <small>INTELLIGENCE SYSTEM</small>
          </span>
        </button>

        <nav className="cc-top-nav" aria-label="Primary navigation">
          {(["command", "system", "agents"] as DashboardSection[]).map((item) => (
            <button
              key={item}
              type="button"
              className={section === item ? "active" : ""}
              onClick={() => setSection(item)}
              aria-current={section === item ? "page" : undefined}
            >
              {item === "command" ? "COMMAND" : item.toUpperCase()}
            </button>
          ))}
          <button type="button" onClick={onOpenMemory}>MEMORY</button>
          <button type="button" onClick={onOpenSecurity}>SECURITY</button>
        </nav>

        <div className="cc-topbar-right">
          <span className="cc-system-chip"><i /> SESSION SECURE</span>
          <span className="cc-clock" aria-label="Local time">{now.toLocaleTimeString([], { hour12: false })}</span>
          <div className="cc-window-controls" aria-label="Window controls">
            <button
              type="button"
              onClick={() => void performWindowAction("minimize")}
              disabled={!window.ultronAPI}
              title={window.ultronAPI ? "Minimize" : "Available in the desktop app"}
              aria-label="Minimize window"
            >−</button>
            <button
              type="button"
              onClick={() => void performWindowAction("maximize")}
              disabled={!window.ultronAPI}
              title={window.ultronAPI ? (isMaximized ? "Restore" : "Maximize") : "Available in the desktop app"}
              aria-label={isMaximized ? "Restore window" : "Maximize window"}
            >{isMaximized ? "❐" : "□"}</button>
            <button
              type="button"
              className="cc-window-close"
              onClick={() => void performWindowAction("close")}
              disabled={!window.ultronAPI}
              title={window.ultronAPI ? "Close ULTRON" : "Available in the desktop app"}
              aria-label="Close window"
            >×</button>
          </div>
        </div>
      </header>

      <div className="cc-body">
        <aside className="cc-sidebar" aria-label="Command center navigation">
          <button type="button" className="cc-sidebar-new" onClick={onNewChat}>
            <span>+</span><span>NEW CHAT</span>
          </button>
          <nav className="cc-side-nav">
            {NAV_ITEMS.map((item) => {
              const active = item.section === section;
              return (
                <button
                  type="button"
                  key={item.label}
                  className={active ? "active" : ""}
                  onClick={() => item.section ? setSection(item.section) : handleNavAction(item.action!)}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                >
                  <span className="cc-nav-symbol" aria-hidden="true">{item.symbol}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="cc-sidebar-footer">
            <span className="cc-sidebar-core-dot" />
            <div>
              <strong>ULTRON CORE</strong>
              <span>{desktopVersion ? `DESKTOP v${desktopVersion}` : "LOCAL CLIENT"}</span>
            </div>
          </div>
        </aside>

        <main className="cc-dashboard">
          <div className="cc-dashboard-heading">
            <div>
              <span className="cc-eyebrow">COMMAND INTERFACE / {section.toUpperCase()}</span>
              <h1>{section === "command" ? "Good to see you." : section === "system" ? "System monitor" : section === "agents" ? "Agent operations" : section === "tools" ? "Available tools" : "Settings"}</h1>
              <p>{section === "command" ? "Your local intelligence workspace is ready." : section === "system" ? "Live host metrics and service availability." : section === "agents" ? "Current orchestration state and supported capabilities." : section === "tools" ? "Tools are accessed through permission-checked workflows." : "Settings are not available in this build."}</p>
            </div>
            <div className="cc-heading-status">
              <span className={`cc-live-indicator ${telemetryError ? "warning" : ""}`} />
              <span>{loading ? "CONNECTING" : telemetryError ? "PARTIAL DATA" : "LIVE STATUS"}</span>
            </div>
          </div>

          <div className="cc-grid">
            <div className="cc-left-column">
              <section className="cc-panel cc-system-panel">
                <div className="cc-panel-heading">
                  <div><span className="cc-section-kicker">01 / HARDWARE</span><h2>System status</h2></div>
                  <span className="cc-heading-symbol">⌁</span>
                </div>
                <MetricGauge label="CPU LOAD" value={snapshot?.metrics.cpuPercent ?? null} detail={snapshot?.host.cpuModel ?? "Model unavailable"} />
                <MetricGauge
                  label="MEMORY"
                  value={snapshot?.metrics.memoryPercent ?? null}
                  detail={snapshot?.metrics.memoryTotalBytes ? `${formatBytes(snapshot.metrics.memoryTotalBytes - (snapshot.metrics.memoryFreeBytes ?? 0))} / ${formatBytes(snapshot.metrics.memoryTotalBytes)}` : undefined}
                />
                <MetricGauge
                  label="STORAGE"
                  value={snapshot?.metrics.storage?.usedPercent ?? null}
                  detail={snapshot?.metrics.storage ? `${formatBytes(snapshot.metrics.storage.totalBytes - snapshot.metrics.storage.freeBytes)} used / ${formatBytes(snapshot.metrics.storage.totalBytes)}` : "Unavailable"}
                />
                <MetricGauge label="GPU LOAD" value={snapshot?.metrics.gpuPercent ?? null} detail="Not exposed by this build" />
              </section>

              <section className="cc-panel cc-modules-panel">
                <div className="cc-panel-heading">
                  <div><span className="cc-section-kicker">02 / SERVICES</span><h2>Active modules</h2></div>
                  <span className="cc-module-count">05</span>
                </div>
                <div className="cc-module-list">
                  <ModuleStatus
                    name="AI CORE"
                    detail={snapshot?.model.model ?? "Model service"}
                    state={modelState === "online" ? "online" : "offline"}
                  />
                  <ModuleStatus name="VOICE ENGINE" detail={voiceStatus.label} state={voiceStatus.active ? "online" : "idle"} />
                  <ModuleStatus name="SYSTEM ACCESS" detail="Authenticated local session" state="online" />
                  <ModuleStatus
                    name="TASK ORCHESTRATOR"
                    detail={snapshot?.workflows ? `${snapshot.workflows.active} active workflow(s)` : "State unavailable"}
                    state={workflowState}
                  />
                  <ModuleStatus name="SECURITY SHIELD" detail={`${snapshot?.security.activeIncidentCount ?? 0} active incident(s)`} state="online" />
                </div>
              </section>
            </div>

            <section className={`cc-center-panel ${section !== "command" ? "cc-center-information" : ""}`}>
              {section === "command" ? (
                <>
                  <div className="cc-center-topline">
                    <span><i /> CENTRAL INTELLIGENCE</span>
                    <span>{voiceStatus.active ? voiceStatus.label : "STANDBY"}</span>
                  </div>
                  <div className={`cc-hologram ${voiceStatus.active ? "voice-active" : ""}`}>
                    <div className="cc-holo-ring cc-holo-ring-outer" />
                    <div className="cc-holo-ring cc-holo-ring-inner" />
                    <div className="cc-holo-grid" />
                    <div className="cc-holo-image">
                      <Image src="/ultron_logo.png" alt="ULTRON holographic core" width={1024} height={1024} priority />
                    </div>
                    <span className="cc-holo-label cc-holo-label-left">CORE / 01</span>
                    <span className="cc-holo-label cc-holo-label-right">LOCAL AI</span>
                    <span className="cc-holo-label cc-holo-label-bottom">NEURAL SYSTEM {snapshot?.model.status === "ready" ? "READY" : "STANDBY"}</span>
                  </div>
                  <div className="cc-core-caption">
                    <span className="cc-core-state-dot" />
                    <div><strong>ULTRON</strong><span>MASTER INTELLIGENCE / LOCAL SESSION</span></div>
                  </div>
                  <div className="cc-core-bottomline">
                    <span>CPU {snapshot?.metrics.cpuPercent === null || snapshot?.metrics.cpuPercent === undefined ? "N/A" : `${snapshot.metrics.cpuPercent}%`}</span>
                    <span>RAM {snapshot?.metrics.memoryPercent === null || snapshot?.metrics.memoryPercent === undefined ? "N/A" : `${snapshot.metrics.memoryPercent}%`}</span>
                    <span>OPEN WINDOWS {visibleWindowText}</span>
                  </div>
                </>
              ) : (
                <div className="cc-info-content">
                  <span className="cc-section-kicker">ULTRON / {section.toUpperCase()}</span>
                  {section === "system" && (
                    <>
                      <h2>Host telemetry</h2>
                      <p>Values are sampled from this machine. GPU utilization is not provided by the current system service.</p>
                      <dl>
                        <div><dt>Platform</dt><dd>{snapshot?.host.platform ?? "Unavailable"} {snapshot?.host.release ?? ""}</dd></div>
                        <div><dt>Processor</dt><dd>{snapshot?.host.cpuModel ?? "Unavailable"}</dd></div>
                        <div><dt>Logical cores</dt><dd>{snapshot?.host.cpuCores ?? "Unavailable"}</dd></div>
                        <div><dt>GPU utilization</dt><dd>Not available</dd></div>
                        <div><dt>Visible windows</dt><dd>{visibleWindowText}</dd></div>
                        <div><dt>Last sample</dt><dd>{snapshot?.sampledAt ? new Date(snapshot.sampledAt).toLocaleTimeString() : "Unavailable"}</dd></div>
                      </dl>
                      <button type="button" className="cc-outline-button" onClick={() => void refreshTelemetry()}>REFRESH TELEMETRY</button>
                    </>
                  )}
                  {section === "agents" && (
                    <>
                      <h2>Orchestration overview</h2>
                      <p>This build exposes persisted workflows and approval-gated actions. It does not expose a live specialist-agent registry.</p>
                      <dl>
                        <div><dt>Persisted workflows</dt><dd>{snapshot?.workflows?.total ?? "Unavailable"}</dd></div>
                        <div><dt>Active workflows</dt><dd>{snapshot?.workflows?.active ?? "Unavailable"}</dd></div>
                        <div><dt>Open tasks</dt><dd>{snapshot?.workflows?.openTasks ?? "Unavailable"}</dd></div>
                      </dl>
                      <button type="button" className="cc-outline-button" onClick={onOpenTasks}>OPEN TASK ORCHESTRATOR</button>
                    </>
                  )}
                  {section === "tools" && (
                    <>
                      <h2>Permission-aware actions</h2>
                      <p>Desktop, research, and workflow actions are requested in chat. ULTRON will ask for approval when an action requires it.</p>
                      <button type="button" className="cc-outline-button" onClick={() => onOpenChat("What desktop and research tools are currently available, and which actions require approval?")}>ASK ULTRON ABOUT TOOLS</button>
                    </>
                  )}
                  {section === "settings" && (
                    <>
                      <h2>Settings unavailable</h2>
                      <p>A settings screen is not implemented in this build. No controls are shown here that would imply configuration changes have been applied.</p>
                    </>
                  )}
                </div>
              )}
            </section>

            <div className="cc-right-widgets">
              <section className="cc-panel cc-quick-panel">
                <div className="cc-panel-heading">
                  <div><span className="cc-section-kicker">03 / CONTROL</span><h2>Quick actions</h2></div>
                </div>
                <div className="cc-quick-grid">
                  <button type="button" onClick={onOpenTasks}><span>▤</span><strong>Run Task</strong></button>
                  <button type="button" onClick={() => preparePrompt("Analyze the current conversation and identify the next useful step.")}><span>⌕</span><strong>Analyze</strong></button>
                  <button type="button" onClick={() => preparePrompt("Open app: ")}><span>▣</span><strong>Open App</strong></button>
                  <button type="button" onClick={() => preparePrompt("Search the web for: ")}><span>⌕</span><strong>Search</strong></button>
                  <button type="button" onClick={() => preparePrompt("Help me generate: ")}><span>✧</span><strong>Generate</strong></button>
                  <button type="button" onClick={onOpenTasks}><span>⟳</span><strong>Automate</strong></button>
                </div>
              </section>

              <section className="cc-panel cc-intelligence-panel">
                <div className="cc-panel-heading">
                  <div><span className="cc-section-kicker">04 / LIVE</span><h2>Live intelligence</h2></div>
                  <span className="cc-live-pill"><i /> LIVE</span>
                </div>
                <div className="cc-intel-list">
                  <div><span className="cc-intel-symbol">▤</span><span>Open tasks</span><strong>{snapshot?.workflows?.openTasks ?? "—"}</strong></div>
                  <div><span className="cc-intel-symbol">▣</span><span>Visible windows</span><strong>{visibleWindowText}</strong></div>
                  <div><span className="cc-intel-symbol">⬡</span><span>Security events</span><strong>{snapshot?.security.recentEventCount ?? "—"}</strong></div>
                  <div><span className="cc-intel-symbol">!</span><span>Active incidents</span><strong>{snapshot?.security.activeIncidentCount ?? "—"}</strong></div>
                </div>
                <button type="button" className="cc-panel-link" onClick={onOpenSecurity}>OPEN SECURITY CENTER <span>↗</span></button>
              </section>
            </div>

            <MiniChat
              conversation={activeConversation}
              draft={draft}
              setDraft={setDraft}
              isGenerating={isGenerating}
              liveStatus={liveStatus}
              onSendMessage={onSendMessage}
              onExpand={() => onOpenChat()}
            />
          </div>

          <footer className="cc-voice-bar">
            <div className="cc-voice-title">
              <span className={`cc-voice-pulse ${voiceStatus.active ? "active" : ""}`} />
              <div><strong>VOICE INTERFACE</strong><span>{voiceStatus.active ? voiceStatus.label : "Ready when you are"}</span></div>
            </div>
            <div className="cc-voice-wave" aria-hidden="true">
              {Array.from({ length: 30 }, (_, index) => <i key={index} className={voiceStatus.active ? "active" : ""} style={{ "--wave-index": index } as React.CSSProperties} />)}
            </div>
            <button
              type="button"
              className={`cc-voice-button ${voiceStatus.active ? "active" : ""}`}
              onClick={() => setVoiceToggleRequest((request) => request + 1)}
              aria-pressed={voiceStatus.active}
              title={voiceStatus.active ? "Turn voice input off" : "Enable voice input"}
            >
              <span>{voiceStatus.active ? "Ⅱ" : "◖"}</span>
              <strong>{voiceStatus.active ? "STOP VOICE" : "START VOICE"}</strong>
            </button>
            <span className="cc-voice-footnote">Microphone permission may be requested</span>
            {voiceStatus.error && <span className="cc-voice-error" role="status">{voiceStatus.error}</span>}
          </footer>
        </main>
      </div>
      <div className="cc-window-error" role="status">{windowError}</div>
      <div className="cc-telemetry-error" role="status">{telemetryError && !snapshot ? telemetryError : ""}</div>
      {loading && !snapshot && <div className="cc-loading-cover" role="status">CONNECTING TO LOCAL SYSTEMS…</div>}
      <div className="cc-hidden-voice-engine" aria-hidden="true">
        <UltronOrb
          compact
          wakeWordEnabled={false}
          voiceToggleRequest={voiceToggleRequest}
          onVoiceStateChange={handleVoiceStatusChange}
        />
      </div>
    </div>
  );
}
