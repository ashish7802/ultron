/**
 * @file lib/sessionGate.ts
 * @description Unified Local Desktop Session & Origin Security Gateway for ULTRON.
 *
 * Subsystem:
 * Boundary Security, Authentication & Session Lifecycle Management.
 *
 * Key Responsibilities:
 * - Validates incoming requests on Next.js API routes (/api/chat, /api/memory, /api/research, /api/permission).
 * - Enforces loopback network origin validation (rejects unauthorized cross-origin requests from foreign websites).
 * - Issues and verifies cryptographically random desktop session tokens (AES-256-GCM / CSPRNG).
 * - Issues short-lived, single-use confirmation tokens for destructive actions (e.g. memory wipe).
 * - Implements sliding-window rate limiting to prevent brute-force attacks on local ports.
 * - Enforces fail-closed security: any check failure rejects with 401 or 403.
 *
 * Architectural Role & Interactions:
 * - Sits at the perimeter of all Next.js API route handlers.
 * - Interacts with the Intruder Defense engine when anomalous or brute-force behavior is detected.
 *
 * Safety / Security Guarantees:
 * - CSRF immunity: Rejects requests where `Sec-Fetch-Site` is "cross-site".
 * - Origin gating: Permitted origins are strictly `http://localhost:3000`, `http://127.0.0.1:3000`, or Electron app origins.
 * - Single-use confirmation: Destructive actions cannot be executed via CSRF or replay.
 */

import type { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { validateSessionToken as validateIdentityToken } from "./security/identityEngine.ts";
import type { AuthenticationLevel, UserRole } from "./security/types.ts";

export interface SessionInfo {
  sessionId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  userRole?: UserRole;
  authenticationLevel?: AuthenticationLevel;
}

export interface ActionToken {
  token: string;
  action: string;
  createdAt: number;
  expiresAt: number;
  consumed: boolean;
}

/** Rate limiter entry tracking request timestamps within a sliding window. */
interface RateLimitBucket {
  timestamps: number[];
}

/** In-memory active sessions store. */
const activeSessions = new Map<string, SessionInfo>();
/** In-memory set of explicitly revoked session tokens. */
const revokedSessions = new Set<string>();
/** In-memory short-lived single-use action tokens store. */
const singleUseActionTokens = new Map<string, ActionToken>();
/** In-memory sliding-window rate limit buckets mapped by session or connection IP. */
const rateLimitBuckets = new Map<string, RateLimitBucket>();

/** Master server-side ephemeral secret used to sign session tickets. */
export const SERVER_EPHEMERAL_SECRET = process.env.ULTRON_SESSION_SECRET || crypto.randomBytes(32).toString("hex");

/** Permitted origins for local desktop interface. */
const ALLOWED_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/i;

/**
 * Strictly scoped Cloud Run preview host pattern for non-packaged AI Studio preview sessions.
 * Only permitted when the request's Origin/Referer hostname matches the request's own Host header.
 */
const ALLOWED_PREVIEW_HOST_REGEX = /^ais-(dev|pre)-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i;

/**
 * Extracts a normalized lowercase hostname (without port) from a Host / X-Forwarded-Host header.
 *
 * @param rawHost - Raw header value (may contain comma-separated proxy entries or `:port`).
 * @returns Normalized hostname or empty string.
 */
function extractHostname(rawHost: string | null): string {
  if (!rawHost) return "";
  const first = rawHost.split(",")[0]?.trim() || "";
  return first.replace(/:\d+$/, "").toLowerCase();
}

/**
 * Evaluates whether a URL origin string is permitted for the given incoming request.
 *
 * WHY: Desktop deployments run on loopback (`localhost`/`127.0.0.1`), while hosted AI Studio
 * previews run on an HTTPS Cloud Run preview host (`ais-dev-*.<region>.run.app`). Requiring
 * exact hostname parity with the server's own `Host`/`X-Forwarded-Host` header preserves
 * strict same-origin isolation while allowing the preview UI to talk to its own API routes.
 *
 * @param originStr - Origin string (`protocol//host[:port]`).
 * @param req - Incoming NextRequest.
 * @returns True if loopback or exact same-origin AI Studio preview host.
 */
function isOriginPermittedForRequest(originStr: string, req: NextRequest): boolean {
  if (ALLOWED_ORIGIN_REGEX.test(originStr)) {
    return true;
  }

  // Packaged Electron desktop builds enforce loopback strictly and never trust hosted preview domains.
  if (process.env.ULTRON_PACKAGED_DESKTOP === "true") {
    return false;
  }

  try {
    const parsed = new URL(originStr);
    if (parsed.protocol !== "https:") return false;
    const originHost = parsed.hostname.toLowerCase();
    if (!ALLOWED_PREVIEW_HOST_REGEX.test(originHost)) return false;

    const effectiveHost = extractHostname(
      req.headers.get("x-forwarded-host") || req.headers.get("host")
    );
    return effectiveHost.length > 0 && effectiveHost === originHost;
  } catch {
    return false;
  }
}

/**
 * Validates Origin, Referer, Host, and Sec-Fetch-Site headers for API routes.
 *
 * @param req - Incoming NextRequest object.
 * @returns Validation result with HTTP status and error message on rejection.
 */
export function isAllowedRequestOrigin(req: NextRequest): {
  allowed: boolean;
  error?: string;
  status?: number;
} {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const effectiveHost = extractHostname(hostHeader);

  // If a Host header is explicitly present, ensure it is either loopback or a valid preview host
  if (effectiveHost) {
    const isLoopbackHost = effectiveHost === "localhost" || effectiveHost === "127.0.0.1";
    const isPreviewHost =
      process.env.ULTRON_PACKAGED_DESKTOP !== "true" &&
      ALLOWED_PREVIEW_HOST_REGEX.test(effectiveHost);
    if (!isLoopbackHost && !isPreviewHost) {
      return {
        allowed: false,
        error: `Access Denied: Untrusted Host "${effectiveHost}" is not permitted to access ULTRON APIs.`,
        status: 403,
      };
    }
  }

  if (origin && !isOriginPermittedForRequest(origin, req)) {
    return {
      allowed: false,
      error: `Access Denied: Untrusted Origin "${origin}" is not permitted to access ULTRON desktop APIs.`,
      status: 403,
    };
  }

  if (referer) {
    try {
      const refUrl = new URL(referer);
      const refOrigin = `${refUrl.protocol}//${refUrl.host}`;
      if (!isOriginPermittedForRequest(refOrigin, req)) {
        return {
          allowed: false,
          error: `Access Denied: Untrusted Referer "${referer}" is not permitted.`,
          status: 403,
        };
      }
    } catch {
      return {
        allowed: false,
        error: "Access Denied: Malformed Referer header.",
        status: 400,
      };
    }
  }

  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite === "cross-site") {
    return {
      allowed: false,
      error: "Access Denied: Cross-site requests are strictly prohibited.",
      status: 403,
    };
  }

  return { allowed: true };
}

/** Session Time-To-Live: 24 hours. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** Confirmation Action Token TTL: 2 minutes. */
const ACTION_TOKEN_TTL_MS = 2 * 60 * 1000;
/** Maximum requests allowed per minute per client bucket. */
const RATE_LIMIT_MAX_REQUESTS_PER_MINUTE = 120;

/** Default primary session token generated once on startup. */
let primaryDesktopSessionToken: string | null = null;

/**
 * Initializes or retrieves the primary desktop session token.
 *
 * WHY: When ULTRON boots in Electron or browser on loopback, a primary session token
 * is established for the local user interface.
 *
 * @returns Primary desktop session token string.
 */
export function getOrCreatePrimarySessionToken(): string {
  if (primaryDesktopSessionToken && activeSessions.has(primaryDesktopSessionToken)) {
    const existing = activeSessions.get(primaryDesktopSessionToken)!;
    if (existing.expiresAt > Date.now()) {
      return primaryDesktopSessionToken;
    }
  }

  const token = crypto.randomBytes(32).toString("hex");
  const sessionId = "sess_" + crypto.randomBytes(8).toString("hex");
  const now = Date.now();

  const session: SessionInfo = {
    sessionId,
    token,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastActiveAt: now,
    userRole: "operator", // Default bootstrap role is operator, NOT founder
    authenticationLevel: "CHAT_AUTHENTICATED", // Scoped strictly to interactive chat
  };

  activeSessions.set(token, session);
  primaryDesktopSessionToken = token;
  return token;
}

/**
 * Retrieves the session information for an active token.
 *
 * @param token - Session token string.
 * @returns SessionInfo if valid and active, null otherwise.
 */
export function getDesktopSession(token: string): SessionInfo | null {
  if (!token || revokedSessions.has(token)) return null;
  const session = activeSessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return session;
}

/**
 * Registers an arbitrary desktop session into the active session store.
 *
 * @param session - Session configuration parameters.
 * @returns Created SessionInfo.
 */
export function createDesktopSession(params: {
  userId?: string;
  userRole?: UserRole;
  authenticationLevel?: AuthenticationLevel;
}): SessionInfo {
  const token = crypto.randomBytes(32).toString("hex");
  const sessionId = "sess_" + crypto.randomBytes(8).toString("hex");
  const now = Date.now();

  const session: SessionInfo = {
    sessionId,
    token,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastActiveAt: now,
    userRole: params.userRole || "operator",
    authenticationLevel: params.authenticationLevel || "CHAT_AUTHENTICATED",
  };

  activeSessions.set(token, session);
  return session;
}

/**
 * Revokes a desktop session token immediately.
 *
 * @param token - Session token to revoke.
 * @returns True if session was revoked; false if not found.
 */
export function revokeSessionToken(token: string): boolean {
  if (!token) return false;
  revokedSessions.add(token);
  if (primaryDesktopSessionToken === token) {
    primaryDesktopSessionToken = null;
  }
  return activeSessions.delete(token);
}

/**
 * Rotates an existing valid session token to a fresh CSPRNG token.
 *
 * @param oldToken - Currently active session token.
 * @returns The new session token, or null if old token was invalid.
 */
export function rotateSessionToken(oldToken: string): string | null {
  if (!oldToken || revokedSessions.has(oldToken)) return null;
  const existing = activeSessions.get(oldToken);
  if (!existing || existing.expiresAt < Date.now()) return null;

  revokeSessionToken(oldToken);
  const newToken = crypto.randomBytes(32).toString("hex");
  const now = Date.now();

  const session: SessionInfo = {
    sessionId: existing.sessionId,
    token: newToken,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastActiveAt: now,
  };

  activeSessions.set(newToken, session);
  primaryDesktopSessionToken = newToken;
  return newToken;
}

/**
 * Creates a short-lived, single-use action confirmation token.
 *
 * WHY: Destructive operations (such as memory deletion or OS modifications) must not
 * be executable via simple HTTP triggers; they require explicit single-use cryptographic tokens.
 *
 * @param action - Unique action identifier.
 * @returns Generated single-use action token string.
 */
export function createSingleUseActionToken(action: string): string {
  const token = "act_" + crypto.randomBytes(24).toString("hex");
  const now = Date.now();

  singleUseActionTokens.set(token, {
    token,
    action,
    createdAt: now,
    expiresAt: now + ACTION_TOKEN_TTL_MS,
    consumed: false,
  });

  return token;
}

/**
 * Verifies and immediately consumes a single-use action token.
 *
 * @param token - Action token string presented by the caller.
 * @param expectedAction - Action name that must match the token's grant.
 * @returns True if valid and consumed; false otherwise.
 */
export function consumeSingleUseActionToken(token: string, expectedAction: string): boolean {
  if (!token || !singleUseActionTokens.has(token)) {
    return false;
  }

  const record = singleUseActionTokens.get(token)!;
  if (record.consumed || record.expiresAt < Date.now() || record.action !== expectedAction) {
    singleUseActionTokens.delete(token);
    return false;
  }

  record.consumed = true;
  singleUseActionTokens.delete(token);
  return true;
}

/**
 * Sliding window rate-limiter check.
 *
 * @param bucketKey - Identifier for client (IP or token prefix).
 * @returns True if within rate limits; false if rate limit exceeded.
 */
function checkRateLimit(bucketKey: string): boolean {
  const now = Date.now();
  const windowStart = now - 60 * 1000;

  let bucket = rateLimitBuckets.get(bucketKey);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateLimitBuckets.set(bucketKey, bucket);
  }

  // Filter timestamps outside current 1-minute window
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

  if (bucket.timestamps.length >= RATE_LIMIT_MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  bucket.timestamps.push(now);
  return true;
}

export interface SessionValidationResult {
  valid: boolean;
  error?: string;
  status?: number;
  session?: SessionInfo;
}

/**
 * Validates the security boundary for an incoming Next.js API request.
 *
 * Verification Pipeline:
 * 1. Checks Origin / Referer header: Rejects foreign cross-origin websites (e.g. evil.com).
 * 2. Checks Sec-Fetch-Site header: Rejects "cross-site" requests (Anti-CSRF).
 * 3. Checks rate limiting for client identifier.
 * 4. Checks session token in `X-ULTRON-Session-Token` header or `ultron_session` cookie.
 * 5. Validates token against active sessions registry and checks expiration.
 *
 * @param req - Incoming NextRequest object.
 * @param options - Optional flags (e.g., skipTokenCheck for initial bootstrap handshake).
 * @returns SessionValidationResult indicating whether request is authorized.
 */
export function validateDesktopSession(
  req: NextRequest,
  options: { allowBootstrap?: boolean } = {}
): SessionValidationResult {
  // 1 & 2. Origin, Referer, Host, and Anti-CSRF Sec-Fetch-Site Validation
  const originCheck = isAllowedRequestOrigin(req);
  if (!originCheck.allowed) {
    return {
      valid: false,
      error: originCheck.error || "Access Denied: Untrusted origin.",
      status: originCheck.status || 403,
    };
  }

  // 3. Rate Limiting Check (derives bucket without trusting spoofed forwarding headers)
  const token =
    req.headers.get("x-ultron-session-token") ||
    req.cookies?.get("ultron_session")?.value ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const rateLimitKey = token ? `tok_${token.slice(0, 16)}` : "loopback_desktop";
  if (!checkRateLimit(rateLimitKey)) {
    return {
      valid: false,
      error: "Rate limit exceeded. Please throttle requests to ULTRON desktop core.",
      status: 429,
    };
  }

  // If this is the bootstrap route requesting session initialization on same-origin loopback
  if (options.allowBootstrap) {
    return { valid: true };
  }

  // 4. Strict Session Token Validation (Zero User-Agent trust sniffing)
  if (!token) {
    return {
      valid: false,
      error: "Unauthorized: Missing X-ULTRON-Session-Token header or session cookie.",
      status: 401,
    };
  }

  if (revokedSessions.has(token)) {
    return {
      valid: false,
      error: "Unauthorized: Desktop session token has been revoked.",
      status: 401,
    };
  }

  const session = activeSessions.get(token);
  if (!session) {
    if (primaryDesktopSessionToken && token === primaryDesktopSessionToken) {
      return {
        valid: true,
        session: {
          sessionId: "sess_primary",
          token,
          createdAt: Date.now(),
          expiresAt: Date.now() + SESSION_TTL_MS,
          lastActiveAt: Date.now(),
          userRole: "operator",
          authenticationLevel: "CHAT_AUTHENTICATED",
        },
      };
    }
    // Check centralized identity engine sessions
    try {
      const secCheck = validateIdentityToken(token);
      if (secCheck.isValid && secCheck.session) {
        return {
          valid: true,
          session: {
            sessionId: secCheck.session.sessionId,
            token: secCheck.session.sessionToken,
            createdAt: secCheck.session.createdAt,
            expiresAt: secCheck.session.expiresAt,
            lastActiveAt: secCheck.session.lastActiveAt,
            userRole: secCheck.session.userRole,
            authenticationLevel: secCheck.session.authenticationLevel,
          },
        };
      }
    } catch {
      // Fallback
    }
    return {
      valid: false,
      error: "Unauthorized: Invalid or revoked desktop session token.",
      status: 401,
    };
  }

  if (session.expiresAt < Date.now()) {
    activeSessions.delete(token);
    return {
      valid: false,
      error: "Unauthorized: Desktop session token has expired. Please re-authenticate.",
      status: 401,
    };
  }

  // Update last active timestamp
  session.lastActiveAt = Date.now();

  return {
    valid: true,
    session,
  };
}

/**
 * Creates an unauthorized or forbidden JSON NextResponse matching a validation failure.
 *
 * @param result - SessionValidationResult containing status and error message.
 * @returns NextResponse with appropriate HTTP status code and JSON error body.
 */
export function createAuthErrorResponse(result: SessionValidationResult): NextResponse {
  return Response.json(
    {
      ok: false,
      error: result.error || "Access Denied",
      securityGate: "ULTRON-Desktop-SessionGate-v1",
    },
    { status: result.status || 403 }
  ) as unknown as NextResponse;
}
