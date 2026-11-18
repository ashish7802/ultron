/**
 * @file components/workspace/apiClient.ts
 * @description Authenticated Loopback API Client for the ULTRON Frontend.
 *
 * Subsystem:
 * Frontend Networking & Session Bootstrap.
 *
 * Key Responsibilities:
 * - Bootstraps the desktop HttpOnly session cookie via `GET /api/auth/session` once per page lifecycle.
 * - Retries transparently on HTTP 401 by refreshing the loopback session cookie once.
 * - Provides typed helpers (`apiGet`, `apiPost`, `apiDelete`) and byte/duration formatting utilities.
 *
 * Architectural Role & Interactions:
 * - Used by `UltronWorkspace.tsx` and every view under `components/views/` so all routes
 *   (including newly hardened `/api/tts`, `/api/transcribe`, `/api/wakeword`, `/api/models`,
 *   `/api/settings`, `/api/diagnostics`) receive valid session credentials automatically.
 *
 * Safety / Security Guarantees:
 * - Always uses `credentials: "include"` on same-origin loopback endpoints.
 * - Never stores secrets or recovery keys in `localStorage`.
 */

let sessionBootstrapPromise: Promise<string | null> | null = null;
let cachedSessionToken: string | null = null;

/**
 * Ensures the browser holds a valid loopback ULTRON desktop session cookie.
 *
 * @param forceRefresh - If true, re-fetches `/api/auth/session` even if already initialized.
 * @returns Optional session token string if returned by the bootstrap endpoint.
 */
export async function ensureDesktopSession(forceRefresh: boolean = false): Promise<string | null> {
  if (!forceRefresh && sessionBootstrapPromise) {
    return sessionBootstrapPromise;
  }

  sessionBootstrapPromise = (async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (data && typeof data.sessionToken === "string" && data.sessionToken.trim()) {
        cachedSessionToken = data.sessionToken.trim();
        return cachedSessionToken;
      }
      return cachedSessionToken;
    } catch {
      return null;
    }
  })();

  return sessionBootstrapPromise;
}

/**
 * Performs an authenticated same-origin fetch against ULTRON Next.js API routes.
 *
 * @param url - Relative API URL (e.g., `/api/dashboard`).
 * @param init - Standard RequestInit options.
 * @returns Raw Fetch Response object.
 */
export async function ultronFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await ensureDesktopSession(false);

  const buildHeaders = (sessionTok: string | null): Headers => {
    const headers = new Headers(init.headers || {});
    if (sessionTok && !headers.has("x-ultron-session-token")) {
      headers.set("x-ultron-session-token", sessionTok);
    }
    return headers;
  };

  let response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: buildHeaders(token),
  });

  if (response.status === 401) {
    const refreshed = await ensureDesktopSession(true);
    response = await fetch(url, {
      ...init,
      credentials: "include",
      headers: buildHeaders(refreshed),
    });
  }

  return response;
}

/**
 * Parses a JSON API response safely and returns structured ok/status/data fields.
 */
export async function ultronJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  try {
    const res = await ultronFetch(url, init);
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
      const errMsg =
        data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : `Request failed with HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: errMsg };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: isAbort ? "Request cancelled." : err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Formats a byte count into human-readable units (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return "Unavailable";
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let val = bytes / 1024;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[idx]}`;
}

/**
 * Formats seconds into a compact human-readable uptime string.
 */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "Unavailable";
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
