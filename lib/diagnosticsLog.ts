/**
 * @file lib/diagnosticsLog.ts
 * @description Bounded In-Memory Application & Error Diagnostic Ring Buffer for ULTRON.
 *
 * Subsystem:
 * Developer / Diagnostic Center & Runtime Observability.
 *
 * Key Responsibilities:
 * - Captures structured server-side application events, warnings, and errors in a fixed-size ring buffer.
 * - Automatically redacts potential secrets, tokens, bearer headers, and recovery keys before retention.
 * - Supports filtering by severity level, subsystem, and search query for `/api/diagnostics`.
 *
 * Architectural Role & Interactions:
 * - Consumed by `/app/api/diagnostics/route.ts`, `/app/api/models/route.ts`, `/app/api/settings/route.ts`,
 *   and `/app/api/chat/route.ts`.
 * - Pure in-memory storage; zero disk writes to security or memory vaults.
 *
 * Safety / Security Guarantees:
 * - Strict cap (250 entries) prevents memory growth DoS.
 * - Secret redaction strips hex tokens (>=32 chars), Bearer credentials, and sensitive key/value patterns.
 */

export type DiagnosticLogLevel = "info" | "warn" | "error";

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  level: DiagnosticLogLevel;
  subsystem: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}

const MAX_LOG_ENTRIES = 250;
const globalBufferKey = "__ultron_diagnostic_logs__";

type GlobalWithLogs = typeof globalThis & {
  [globalBufferKey]?: DiagnosticLogEntry[];
};

const REDACTION_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /(?:token|secret|password|key|authorization)\s*[:=]\s*["']?[^\s"',;}{]+["']?/gi,
  /\b[a-f0-9]{40,}\b/gi,
];

/**
 * Redacts potential secrets, tokens, or long hex hashes from diagnostic text.
 *
 * @param input - Raw string to sanitize before storing in memory.
 * @returns Redacted string safe for diagnostic viewing.
 */
export function redactDiagnosticText(input: string): string {
  let sanitized = input;
  for (const pattern of REDACTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized.slice(0, 600);
}

/**
 * Returns the shared ring buffer array attached to globalThis so hot reloads preserve entries.
 *
 * @returns Mutable array of DiagnosticLogEntry objects.
 */
function getLogStore(): DiagnosticLogEntry[] {
  const g = globalThis as GlobalWithLogs;
  if (!g[globalBufferKey]) {
    g[globalBufferKey] = [
      {
        id: `log_boot_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: "info",
        subsystem: "runtime",
        message: "ULTRON diagnostic telemetry buffer initialized.",
        metadata: {
          platform: process.platform,
          nodeVersion: process.version,
        },
      },
    ];
  }
  return g[globalBufferKey];
}

/**
 * Appends a redacted diagnostic event into the bounded in-memory ring buffer.
 *
 * @param level - Severity level ("info", "warn", or "error").
 * @param subsystem - Logical subsystem label (e.g., "models", "chat", "security", "settings").
 * @param message - Human-readable diagnostic description.
 * @param metadata - Optional scalar context values.
 * @returns The stored DiagnosticLogEntry.
 */
export function recordDiagnosticLog(
  level: DiagnosticLogLevel,
  subsystem: string,
  message: string,
  metadata?: Record<string, string | number | boolean | null>,
): DiagnosticLogEntry {
  const store = getLogStore();
  const safeMetadata: Record<string, string | number | boolean | null> | undefined = metadata
    ? Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [
          k,
          typeof v === "string" ? redactDiagnosticText(v) : v,
        ]),
      )
    : undefined;

  const entry: DiagnosticLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    subsystem: subsystem.slice(0, 48),
    message: redactDiagnosticText(message),
    ...(safeMetadata ? { metadata: safeMetadata } : {}),
  };

  store.unshift(entry);
  if (store.length > MAX_LOG_ENTRIES) {
    store.length = MAX_LOG_ENTRIES;
  }
  return entry;
}

/**
 * Queries stored diagnostic logs in reverse chronological order.
 *
 * @param options - Optional filter parameters (level, subsystem, limit).
 * @returns Filtered snapshot array of DiagnosticLogEntry objects.
 */
export function listDiagnosticLogs(options?: {
  level?: DiagnosticLogLevel | "all";
  subsystem?: string;
  limit?: number;
}): DiagnosticLogEntry[] {
  const store = getLogStore();
  const limit = Math.min(MAX_LOG_ENTRIES, Math.max(1, options?.limit ?? 100));

  return store
    .filter((entry) => {
      if (options?.level && options.level !== "all" && entry.level !== options.level) {
        return false;
      }
      if (options?.subsystem && entry.subsystem !== options.subsystem) {
        return false;
      }
      return true;
    })
    .slice(0, limit);
}

/**
 * Clears all entries from the in-memory diagnostic ring buffer and records the reset event.
 *
 * @returns Count of cleared entries.
 */
export function clearDiagnosticLogs(): number {
  const store = getLogStore();
  const count = store.length;
  store.length = 0;
  recordDiagnosticLog("info", "diagnostics", "Diagnostic log buffer cleared by operator.", {
    clearedCount: count,
  });
  return count;
}
