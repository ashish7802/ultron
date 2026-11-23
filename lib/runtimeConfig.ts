/**
 * @file lib/runtimeConfig.ts
 * @description Crash-Safe Persisted Runtime Settings & AI Model Configuration Store for ULTRON.
 *
 * Subsystem:
 * Settings Center & AI Model Manager Persistence Layer.
 *
 * Key Responsibilities:
 * - Persists user configuration across all 9 required Settings categories:
 *   General, Appearance, AI Configuration, Voice Configuration, Memory Settings,
 *   Security Settings, Notifications, System Integration, and Developer Settings.
 * - Exposes validated active AI provider configuration (Ollama loopback endpoint,
 *   active model ID, timeout, temperature, streaming preference) for `/api/chat`,
 *   `/api/models`, and `/api/dashboard`.
 * - Enforces strict loopback host restrictions on Ollama endpoint URLs to prevent SSRF.
 * - Uses atomic vault storage (`readVaultJsonSync` / `writeVaultJsonSync`) stored inside
 *   `<userDataDir>/.ultron_config/settings.json` — strictly isolated from `ultron_memory_vault.json`.
 *
 * Architectural Role & Interactions:
 * - Consumed by `/api/settings`, `/api/models`, `/api/chat`, `/api/dashboard`, and `/api/diagnostics`.
 * - Never writes secrets, recovery keys, or credentials to disk.
 *
 * Safety / Security Guarantees:
 * - Rejects non-loopback Ollama endpoints (only `localhost`, `127.0.0.1`, `[::1]` on `http:`/`https:`).
 * - Clamps numeric bounds (temperature, timeout, speech rate/volume, polling interval).
 * - Never modifies `ultron_memory_vault.json` or `.security_vault/*`.
 */

import path from "path";
import { defaultAppPathService } from "./security/appPathService";
import { readVaultJsonSync, writeVaultJsonSync } from "./security/vaultStorage";

export interface UltronSettings {
  general: {
    assistantName: string;
    preferredLanguage: "auto" | "en" | "hinglish";
    startupView: "command" | "chat" | "briefing" | "explorer" | "voice" | "memory" | "system" | "models" | "security" | "settings" | "diagnostics";
    confirmDestructiveActions: boolean;
  };
  appearance: {
    accentPreset: "electric-blue" | "cyan" | "indigo";
    density: "comfortable" | "compact";
    reducedMotion: boolean;
    showTokenMetadata: boolean;
  };
  ai: {
    provider: "ollama";
    ollamaEndpoint: string;
    activeModel: string;
    temperature: number;
    timeoutMs: number;
    maxContextMessages: number;
    streamResponses: boolean;
  };
  voice: {
    ttsEnabled: boolean;
    speechRate: number;
    speechVolume: number;
    inputMode: "push_to_talk" | "wake_word" | "continuous";
    autoSubmitTranscript: boolean;
  };
  memory: {
    autoMemoryRecall: boolean;
    autoMemoryCapture: boolean;
    defaultCategory: "fact" | "preference" | "project" | "profile" | "instruction";
  };
  security: {
    requireApprovalForDesktopActions: boolean;
    strictLoopbackOnly: boolean;
    auditRetentionLimit: number;
  };
  notifications: {
    showApprovalAlerts: boolean;
    showSystemWarnings: boolean;
    showModelStatusToasts: boolean;
  };
  system: {
    telemetryRefreshSeconds: number;
    enableWindowInspection: boolean;
  };
  developer: {
    verboseLogging: boolean;
    showDiagnosticPanel: boolean;
    logBufferLimit: number;
  };
  updatedAt: string;
}

export type PartialUltronSettings = {
  [K in keyof Omit<UltronSettings, "updatedAt">]?: Partial<UltronSettings[K]>;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Validates that an Ollama endpoint URL uses HTTP(S) and points strictly to a loopback host.
 *
 * WHY: Allowing arbitrary external or RFC-1918 IP addresses would turn ULTRON's server-side
 * model probe/chat routes into an SSRF proxy.
 *
 * @param rawUrl - Candidate endpoint string.
 * @returns Normalized endpoint string without trailing slash, or null if invalid/unsafe.
 */
export function validateLoopbackEndpoint(rawUrl: string): string | null {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * Builds the default ULTRON settings baseline derived from environment defaults.
 *
 * @returns Complete UltronSettings object.
 */
export function getDefaultSettings(): UltronSettings {
  const envEndpoint =
    validateLoopbackEndpoint(process.env.OLLAMA_HOST || "") || "http://127.0.0.1:11434";
  const envModel = (process.env.OLLAMA_MODEL || "").trim() || "qwen2.5:0.5b";

  return {
    general: {
      assistantName: "ULTRON",
      preferredLanguage: "auto",
      startupView: "command",
      confirmDestructiveActions: true,
    },
    appearance: {
      accentPreset: "electric-blue",
      density: "comfortable",
      reducedMotion: false,
      showTokenMetadata: true,
    },
    ai: {
      provider: "ollama",
      ollamaEndpoint: envEndpoint,
      activeModel: envModel,
      temperature: 0.7,
      timeoutMs: 30000,
      maxContextMessages: 24,
      streamResponses: true,
    },
    voice: {
      ttsEnabled: false,
      speechRate: 1.0,
      speechVolume: 90,
      inputMode: "push_to_talk",
      autoSubmitTranscript: false,
    },
    memory: {
      autoMemoryRecall: true,
      autoMemoryCapture: true,
      defaultCategory: "fact",
    },
    security: {
      requireApprovalForDesktopActions: true,
      strictLoopbackOnly: true,
      auditRetentionLimit: 500,
    },
    notifications: {
      showApprovalAlerts: true,
      showSystemWarnings: true,
      showModelStatusToasts: true,
    },
    system: {
      telemetryRefreshSeconds: 15,
      enableWindowInspection: true,
    },
    developer: {
      verboseLogging: false,
      showDiagnosticPanel: true,
      logBufferLimit: 250,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Resolves the isolated JSON settings file path inside ULTRON's user data directory.
 *
 * @returns Absolute filesystem path to `settings.json`.
 */
export function getSettingsFilePath(): string {
  const userDir = defaultAppPathService.getUserDataDir();
  return path.join(userDir, ".ultron_config", "settings.json");
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Merges and validates a partial settings patch against a base configuration object.
 *
 * @param base - Current valid UltronSettings.
 * @param patch - Untrusted partial update payload.
 * @returns Object containing validated merged settings and any validation error message.
 */
export function mergeAndValidateSettings(
  base: UltronSettings,
  patch: PartialUltronSettings,
): { ok: true; settings: UltronSettings } | { ok: false; error: string } {
  const next: UltronSettings = {
    general: { ...base.general },
    appearance: { ...base.appearance },
    ai: { ...base.ai },
    voice: { ...base.voice },
    memory: { ...base.memory },
    security: { ...base.security },
    notifications: { ...base.notifications },
    system: { ...base.system },
    developer: { ...base.developer },
    updatedAt: new Date().toISOString(),
  };

  if (patch.general) {
    if (typeof patch.general.assistantName === "string") {
      const cleaned = patch.general.assistantName.trim().slice(0, 32);
      if (cleaned) next.general.assistantName = cleaned;
    }
    next.general.preferredLanguage = pickEnum(
      patch.general.preferredLanguage,
      ["auto", "en", "hinglish"] as const,
      next.general.preferredLanguage,
    );
    next.general.startupView = pickEnum(
      patch.general.startupView,
      ["command", "chat", "briefing", "explorer", "voice", "memory", "system", "models", "security", "settings", "diagnostics"] as const,
      next.general.startupView,
    );
    if (typeof patch.general.confirmDestructiveActions === "boolean") {
      next.general.confirmDestructiveActions = patch.general.confirmDestructiveActions;
    }
  }

  if (patch.appearance) {
    next.appearance.accentPreset = pickEnum(
      patch.appearance.accentPreset,
      ["electric-blue", "cyan", "indigo"] as const,
      next.appearance.accentPreset,
    );
    next.appearance.density = pickEnum(
      patch.appearance.density,
      ["comfortable", "compact"] as const,
      next.appearance.density,
    );
    if (typeof patch.appearance.reducedMotion === "boolean") {
      next.appearance.reducedMotion = patch.appearance.reducedMotion;
    }
    if (typeof patch.appearance.showTokenMetadata === "boolean") {
      next.appearance.showTokenMetadata = patch.appearance.showTokenMetadata;
    }
  }

  if (patch.ai) {
    if (patch.ai.ollamaEndpoint !== undefined) {
      const safeEndpoint = validateLoopbackEndpoint(patch.ai.ollamaEndpoint);
      if (!safeEndpoint) {
        return {
          ok: false,
          error: "Ollama endpoint must be a valid loopback HTTP/HTTPS URL (localhost, 127.0.0.1, or [::1]).",
        };
      }
      next.ai.ollamaEndpoint = safeEndpoint;
    }
    if (typeof patch.ai.activeModel === "string") {
      const trimmedModel = patch.ai.activeModel.trim().slice(0, 128);
      if (!trimmedModel || !/^[a-zA-Z0-9._:/-]+$/.test(trimmedModel)) {
        return {
          ok: false,
          error: "Model identifier contains unsupported characters or is empty.",
        };
      }
      next.ai.activeModel = trimmedModel;
    }
    if (patch.ai.temperature !== undefined) {
      next.ai.temperature = Number(clampNumber(patch.ai.temperature, 0, 2, next.ai.temperature).toFixed(2));
    }
    if (patch.ai.timeoutMs !== undefined) {
      next.ai.timeoutMs = Math.round(clampNumber(patch.ai.timeoutMs, 3000, 180000, next.ai.timeoutMs));
    }
    if (patch.ai.maxContextMessages !== undefined) {
      next.ai.maxContextMessages = Math.round(
        clampNumber(patch.ai.maxContextMessages, 4, 80, next.ai.maxContextMessages),
      );
    }
    if (typeof patch.ai.streamResponses === "boolean") {
      next.ai.streamResponses = patch.ai.streamResponses;
    }
  }

  if (patch.voice) {
    if (typeof patch.voice.ttsEnabled === "boolean") next.voice.ttsEnabled = patch.voice.ttsEnabled;
    if (patch.voice.speechRate !== undefined) {
      next.voice.speechRate = Number(clampNumber(patch.voice.speechRate, 0.5, 2.0, next.voice.speechRate).toFixed(2));
    }
    if (patch.voice.speechVolume !== undefined) {
      next.voice.speechVolume = Math.round(clampNumber(patch.voice.speechVolume, 0, 100, next.voice.speechVolume));
    }
    next.voice.inputMode = pickEnum(
      patch.voice.inputMode,
      ["push_to_talk", "wake_word", "continuous"] as const,
      next.voice.inputMode,
    );
    if (typeof patch.voice.autoSubmitTranscript === "boolean") {
      next.voice.autoSubmitTranscript = patch.voice.autoSubmitTranscript;
    }
  }

  if (patch.memory) {
    if (typeof patch.memory.autoMemoryRecall === "boolean") {
      next.memory.autoMemoryRecall = patch.memory.autoMemoryRecall;
    }
    if (typeof patch.memory.autoMemoryCapture === "boolean") {
      next.memory.autoMemoryCapture = patch.memory.autoMemoryCapture;
    }
    next.memory.defaultCategory = pickEnum(
      patch.memory.defaultCategory,
      ["fact", "preference", "project", "profile", "instruction"] as const,
      next.memory.defaultCategory,
    );
  }

  if (patch.security) {
    // Security invariants: desktop approval and loopback restriction remain enabled by default;
    // strictLoopbackOnly cannot be disabled from UI settings to preserve fail-closed posture.
    if (typeof patch.security.requireApprovalForDesktopActions === "boolean") {
      next.security.requireApprovalForDesktopActions = patch.security.requireApprovalForDesktopActions;
    }
    next.security.strictLoopbackOnly = true;
    if (patch.security.auditRetentionLimit !== undefined) {
      next.security.auditRetentionLimit = Math.round(
        clampNumber(patch.security.auditRetentionLimit, 100, 5000, next.security.auditRetentionLimit),
      );
    }
  }

  if (patch.notifications) {
    if (typeof patch.notifications.showApprovalAlerts === "boolean") {
      next.notifications.showApprovalAlerts = patch.notifications.showApprovalAlerts;
    }
    if (typeof patch.notifications.showSystemWarnings === "boolean") {
      next.notifications.showSystemWarnings = patch.notifications.showSystemWarnings;
    }
    if (typeof patch.notifications.showModelStatusToasts === "boolean") {
      next.notifications.showModelStatusToasts = patch.notifications.showModelStatusToasts;
    }
  }

  if (patch.system) {
    if (patch.system.telemetryRefreshSeconds !== undefined) {
      next.system.telemetryRefreshSeconds = Math.round(
        clampNumber(patch.system.telemetryRefreshSeconds, 5, 120, next.system.telemetryRefreshSeconds),
      );
    }
    if (typeof patch.system.enableWindowInspection === "boolean") {
      next.system.enableWindowInspection = patch.system.enableWindowInspection;
    }
  }

  if (patch.developer) {
    if (typeof patch.developer.verboseLogging === "boolean") {
      next.developer.verboseLogging = patch.developer.verboseLogging;
    }
    if (typeof patch.developer.showDiagnosticPanel === "boolean") {
      next.developer.showDiagnosticPanel = patch.developer.showDiagnosticPanel;
    }
    if (patch.developer.logBufferLimit !== undefined) {
      next.developer.logBufferLimit = Math.round(
        clampNumber(patch.developer.logBufferLimit, 50, 250, next.developer.logBufferLimit),
      );
    }
  }

  return { ok: true, settings: next };
}

/**
 * Reads persisted ULTRON settings from disk, falling back cleanly to validated defaults.
 *
 * @returns Current UltronSettings object.
 */
export function loadUltronSettings(): UltronSettings {
  const defaults = getDefaultSettings();
  const filePath = getSettingsFilePath();
  const raw = readVaultJsonSync<PartialUltronSettings | null>(filePath, null);
  if (!raw || typeof raw !== "object") {
    return defaults;
  }
  const merged = mergeAndValidateSettings(defaults, raw);
  return merged.ok ? merged.settings : defaults;
}

/**
 * Validates and atomically persists an update to ULTRON settings.
 *
 * Side Effects:
 * Writes to `<userDataDir>/.ultron_config/settings.json` using atomic lockfile swap.
 *
 * @param patch - Partial settings update.
 * @returns Result containing updated settings or validation error.
 */
export function updateUltronSettings(
  patch: PartialUltronSettings,
): { ok: true; settings: UltronSettings } | { ok: false; error: string } {
  const current = loadUltronSettings();
  const merged = mergeAndValidateSettings(current, patch);
  if (!merged.ok) {
    return merged;
  }
  writeVaultJsonSync(getSettingsFilePath(), merged.settings);
  return { ok: true, settings: merged.settings };
}

/**
 * Resets persisted settings back to clean defaults.
 *
 * @returns Fresh default UltronSettings.
 */
export function resetUltronSettings(): UltronSettings {
  const defaults = getDefaultSettings();
  writeVaultJsonSync(getSettingsFilePath(), defaults);
  return defaults;
}

/**
 * Convenience accessor returning the active validated AI configuration for inference routes.
 *
 * @returns Active AI configuration slice.
 */
export function getActiveAiConfig(): UltronSettings["ai"] {
  return loadUltronSettings().ai;
}
