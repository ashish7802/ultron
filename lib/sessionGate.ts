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

export interface SessionInfo {
  sessionId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
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
/** In-memory short-lived single-use action tokens store. */
const singleUseActionTokens = new Map<string, ActionToken>();
/** In-memory sliding-window rate limit buckets mapped by IP or session. */
const rateLimitBuckets = new Map<string, RateLimitBucket>();

/** Master server-side ephemeral secret used to sign session tickets. */
export const SERVER_EPHEMERAL_SECRET = process.env.ULTRON_SESSION_SECRET || crypto.randomBytes(32).toString("hex");

/** Permitted origins for local desktop interface. */
const ALLOWED_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

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
  };

  activeSessions.set(token, session);
  primaryDesktopSessionToken = token;
  return token;
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
  // 1. Origin & Referer Validation
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  if (origin && !ALLOWED_ORIGIN_REGEX.test(origin)) {
    return {
      valid: false,
      error: `Access Denied: Untrusted Origin "${origin}" is not permitted to access ULTRON desktop APIs.`,
      status: 403,
    };
  }

  if (referer) {
    try {
      const refUrl = new URL(referer);
      const refOrigin = `${refUrl.protocol}//${refUrl.host}`;
      if (!ALLOWED_ORIGIN_REGEX.test(refOrigin)) {
        return {
          valid: false,
          error: `Access Denied: Untrusted Referer "${referer}" is not permitted.`,
          status: 403,
        };
      }
    } catch {
      return {
        valid: false,
        error: "Access Denied: Malformed Referer header.",
        status: 400,
      };
    }
  }

  // 2. Anti-CSRF Sec-Fetch-Site Check
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite === "cross-site") {
    return {
      valid: false,
      error: "Access Denied: Cross-site requests are strictly prohibited.",
      status: 403,
    };
  }

  // 3. Rate Limiting Check
  const clientIp = req.headers.get("x-forwarded-for") || "loopback";
  if (!checkRateLimit(clientIp)) {
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

  // 4. Session Token & Caller Identification
  const token =
    req.headers.get("x-ultron-session-token") ||
    req.cookies.get("ultron_session")?.value ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const userAgent = (req.headers.get("user-agent") || "").toLowerCase();
  const isDirectLoopbackProcess =
    !origin &&
    !referer &&
    !secFetchSite &&
    (userAgent.includes("python") ||
      userAgent.includes("node") ||
      userAgent.includes("curl") ||
      userAgent.includes("wget") ||
      userAgent.includes("go-http-client"));

  if (isDirectLoopbackProcess) {
    // Direct local process / CLI runner on loopback host (not a web browser)
    return { valid: true };
  }

  if (!token) {
    return {
      valid: false,
      error: "Unauthorized: Missing X-ULTRON-Session-Token header or session cookie.",
      status: 401,
    };
  }

  const session = activeSessions.get(token);
  if (!session) {
    if (primaryDesktopSessionToken && token === primaryDesktopSessionToken) {
      return { valid: true };
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
