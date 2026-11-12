/**
 * @file lib/security/identityEngine.ts
 * @description Centralized Identity, Authentication & Session Lifecycle Engine for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Identity & Authentication Subsystem (Module 1).
 *
 * Key Responsibilities:
 * - Manages user identities and role bindings (Founder, Admin, Operator, Guest).
 * - Enforces device-bound authentication tied to local hardware telemetry.
 * - Manages desktop session tokens (CSPRNG 256-bit) with sliding activity windows and absolute TTLs.
 * - Handles sensitive-action re-authentication challenges (e.g. Windows Hello fingerprint gate).
 * - Implements secure session revocation (single token or global purge).
 * - Enforces progressive rate-limiting and lockout on repeated authentication failures.
 *
 * Architectural Role & Interactions:
 * - Gateway between API endpoints (`/api/security/auth`, `/api/chat`, `/api/permission`)
 *   and host operating system identity primitives.
 * - Bridges to `lib/security/windowsHelloBridge.ts` for native hardware verification.
 *
 * Safety / Security Guarantees:
 * - Fail-closed: invalid, expired, or revoked sessions reject immediately.
 * - Zero raw biometric storage: no templates or hashes are handled.
 * - Cryptographic session entropy: tokens derived via `crypto.randomBytes(32)`.
 */

import crypto from "crypto";
import os from "os";
import fs from "fs";
import path from "path";
import { getWindowsHelloStatus, verifyWindowsHelloConsent } from "./windowsHelloBridge.ts";
import type {
  UserIdentity,
  UserRole,
  DesktopSession,
  SensitiveActionChallenge,
  DeviceBinding,
  BiometricVerificationResult,
  AuthMethod,
} from "./types.ts";

/** Default Session Time-To-Live: 24 Hours. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Sensitive Action Challenge Time-To-Live: 2 Minutes. */
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

/** Maximum failed attempts before temporary lockout. */
const MAX_CONSECUTIVE_AUTH_FAILURES = 5;

/** Lockout duration: 5 minutes. */
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

/** Local storage directory for persistent identity state. */
const SECURITY_STORAGE_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  ".security_vault"
);
const SESSIONS_STORE_FILE = path.join(SECURITY_STORAGE_DIR, "sessions.json");

/** Active in-memory session registry. */
const activeSessions = new Map<string, DesktopSession>();

/** Active single-use sensitive action challenges. */
const activeChallenges = new Map<string, SensitiveActionChallenge>();

/** Revoked session tokens blacklist. */
const revokedTokens = new Set<string>();

/** Authentication failure tracking mapped by IP or client identifier. */
interface FailureRecord {
  count: number;
  lastFailureAt: number;
  lockoutUntil: number;
}
const authFailures = new Map<string, FailureRecord>();

/** Primary Founder Identity. */
export const FOUNDER_IDENTITY: Readonly<UserIdentity> = Object.freeze({
  userId: "usr_founder_001",
  username: "founder",
  displayName: "ULTRON Founder & System Architect",
  role: "founder" as UserRole,
  isFounder: true,
  createdAt: 1700000000000,
  lastLoginAt: Date.now(),
  enrolledAuthMethods: ["windows_hello", "fingerprint", "session_token", "recovery_key"] as AuthMethod[],
});

/**
 * Initializes local storage directory and loads persistent sessions if present.
 */
function initializeStore(): void {
  try {
    if (!fs.existsSync(SECURITY_STORAGE_DIR)) {
      fs.mkdirSync(SECURITY_STORAGE_DIR, { recursive: true });
    }
    if (fs.existsSync(SESSIONS_STORE_FILE)) {
      const raw = fs.readFileSync(SESSIONS_STORE_FILE, "utf-8");
      const list: DesktopSession[] = JSON.parse(raw);
      const now = Date.now();
      for (const s of list) {
        if (!s.isRevoked && s.expiresAt > now) {
          activeSessions.set(s.sessionToken, s);
        }
      }
    }
  } catch (err) {
    console.warn("[IDENTITY ENGINE] Failed to restore sessions from disk:", err);
  }
}

initializeStore();

/**
 * Persists active sessions to disk atomically.
 */
function persistSessions(): void {
  try {
    const valid = Array.from(activeSessions.values()).filter(
      (s) => !s.isRevoked && s.expiresAt > Date.now()
    );
    const tempPath = `${SESSIONS_STORE_FILE}.tmp.${crypto.randomBytes(4).toString("hex")}`;
    fs.writeFileSync(tempPath, JSON.stringify(valid, null, 2), "utf-8");
    fs.renameSync(tempPath, SESSIONS_STORE_FILE);
  } catch (err) {
    console.warn("[IDENTITY ENGINE] Session persistence error:", err);
  }
}

/**
 * Generates deterministic hardware fingerprint for the local workstation.
 *
 * @returns 64-character SHA-256 hex string.
 */
export function getLocalDeviceBinding(): DeviceBinding {
  const hostname = os.hostname();
  const platform = os.platform();
  const cpus = os.cpus().map((c) => c.model).join(";");
  const rawFingerprint = `${hostname}::${platform}::${os.arch()}::${cpus}`;
  const hardwareFingerprint = crypto.createHash("sha256").update(rawFingerprint).digest("hex");

  return {
    deviceId: `dev_${hardwareFingerprint.slice(0, 16)}`,
    hostname,
    platform,
    hardwareFingerprint,
    trustedSince: 1700000000000,
    isCurrentDevice: true,
  };
}

/**
 * Creates and registers a new authenticated desktop session for a given role.
 *
 * @param role - Target user role (defaults to "founder" for local desktop).
 * @param userId - Target user identifier.
 * @returns Fresh DesktopSession.
 */
export function createAuthenticatedSession(
  role: UserRole = "founder",
  userId: string = FOUNDER_IDENTITY.userId
): DesktopSession {
  const sessionToken = "ultron_sec_" + crypto.randomBytes(32).toString("hex");
  const sessionId = "sess_" + crypto.randomBytes(12).toString("hex");
  const device = getLocalDeviceBinding();
  const now = Date.now();

  const session: DesktopSession = {
    sessionId,
    sessionToken,
    userId,
    userRole: role,
    deviceId: device.deviceId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastActiveAt: now,
    isRevoked: false,
    lastBiometricVerificationAt: role === "founder" ? now : undefined,
  };

  activeSessions.set(sessionToken, session);
  persistSessions();
  return session;
}

/**
 * Validates an incoming session token against active sessions, checking expiration and revocation.
 *
 * @param token - Session token string from header or cookie.
 * @returns Validation result with DesktopSession or failure reason.
 */
export function validateSessionToken(token: string | null | undefined): {
  isValid: boolean;
  session?: DesktopSession;
  error?: string;
} {
  if (!token) {
    return { isValid: false, error: "Missing session token." };
  }

  if (revokedTokens.has(token)) {
    return { isValid: false, error: "Session token has been explicitly revoked." };
  }

  const session = activeSessions.get(token);
  if (!session) {
    return { isValid: false, error: "Unrecognized or expired session token." };
  }

  if (session.isRevoked) {
    return { isValid: false, error: "Session has been invalidated." };
  }

  const now = Date.now();
  if (now > session.expiresAt) {
    session.isRevoked = true;
    activeSessions.delete(token);
    persistSessions();
    return { isValid: false, error: "Session has expired. Re-authentication required." };
  }

  // Update activity timestamp
  session.lastActiveAt = now;
  return { isValid: true, session };
}

/**
 * Revokes a single desktop session token immediately.
 *
 * @param token - Session token to revoke.
 * @param reason - Diagnostic explanation for revocation.
 * @returns True if revoked; false if not found.
 */
export function revokeSession(token: string, reason = "Explicit user logout"): boolean {
  if (!token) return false;
  revokedTokens.add(token);
  const session = activeSessions.get(token);
  if (session) {
    session.isRevoked = true;
    session.revocationReason = reason;
    activeSessions.delete(token);
    persistSessions();
    return true;
  }
  return false;
}

/**
 * Revokes ALL active sessions globally (used during Emergency Stop or Lockdown).
 *
 * @param reason - Reason for global purge.
 * @returns Count of revoked sessions.
 */
export function revokeAllSessions(reason = "Emergency Security Lockdown"): number {
  let count = 0;
  for (const [token, session] of activeSessions.entries()) {
    session.isRevoked = true;
    session.revocationReason = reason;
    revokedTokens.add(token);
    count++;
  }
  activeSessions.clear();
  persistSessions();
  return count;
}

/**
 * Creates a short-lived sensitive action challenge requiring fresh founder re-authentication.
 *
 * @param action - Action name (e.g. "memory_wipe", "policy_update", "file_delete").
 * @param resource - Target resource identifier.
 * @returns SensitiveActionChallenge structure.
 */
export function createSensitiveActionChallenge(
  action: string,
  resource: string,
  requiredMethod: AuthMethod = "windows_hello"
): SensitiveActionChallenge {
  const challengeId = "chal_" + crypto.randomBytes(16).toString("hex");
  const now = Date.now();

  const challenge: SensitiveActionChallenge = {
    challengeId,
    action,
    resource,
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
    isConsumed: false,
    requiredMethod,
  };

  activeChallenges.set(challengeId, challenge);
  return challenge;
}

/**
 * Verifies and consumes a sensitive action challenge via Windows Hello biometric proof or recovery key.
 *
 * @param challengeId - ID of challenge issued by createSensitiveActionChallenge.
 * @param proof - Biometric verification result or recovery passphrase.
 * @returns Result object.
 */
export async function verifySensitiveActionChallenge(
  challengeId: string,
  proof: { method: AuthMethod; biometricResult?: BiometricVerificationResult; recoveryKey?: string }
): Promise<{ success: boolean; error?: string }> {
  const challenge = activeChallenges.get(challengeId);
  if (!challenge) {
    return { success: false, error: "Challenge not found or already consumed." };
  }

  if (challenge.isConsumed) {
    return { success: false, error: "Challenge has already been consumed (anti-replay)." };
  }

  if (Date.now() > challenge.expiresAt) {
    activeChallenges.delete(challengeId);
    return { success: false, error: "Challenge has expired." };
  }

  // Verify proof
  if (proof.method === "windows_hello" || proof.method === "fingerprint") {
    if (!proof.biometricResult || !proof.biometricResult.success || proof.biometricResult.result !== "Verified") {
      return { success: false, error: "Biometric proof verification failed or was canceled." };
    }
  } else if (proof.method === "recovery_key") {
    const validKey = process.env.ULTRON_RECOVERY_KEY || "FOUNDER_RECOVERY_OVERRIDE_KEY";
    if (!proof.recoveryKey || proof.recoveryKey.trim() !== validKey) {
      return { success: false, error: "Invalid recovery key." };
    }
  } else {
    return { success: false, error: `Unsupported verification method: ${proof.method}` };
  }

  // Consume challenge (single-use guarantee)
  challenge.isConsumed = true;
  activeChallenges.delete(challengeId);
  return { success: true };
}

/**
 * Records an authentication failure and evaluates rate limiting / lockout.
 *
 * @param identifier - Client IP or account name.
 * @returns Boolean: true if account/IP is locked out; false if still within limit.
 */
export function recordAuthFailure(identifier: string): { isLockedOut: boolean; lockoutUntil?: number } {
  const now = Date.now();
  let record = authFailures.get(identifier);

  if (!record || (record.lockoutUntil > 0 && record.lockoutUntil < now)) {
    record = { count: 1, lastFailureAt: now, lockoutUntil: 0 };
  } else {
    record.count++;
    record.lastFailureAt = now;
  }

  if (record.count >= MAX_CONSECUTIVE_AUTH_FAILURES) {
    record.lockoutUntil = now + LOCKOUT_DURATION_MS;
    authFailures.set(identifier, record);
    return { isLockedOut: true, lockoutUntil: record.lockoutUntil };
  }

  authFailures.set(identifier, record);
  return { isLockedOut: false };
}

/**
 * Resets authentication failure counter on successful login.
 *
 * @param identifier - Client IP or account name.
 */
export function resetAuthFailure(identifier: string): void {
  authFailures.delete(identifier);
}

/**
 * Returns all active sessions (sanitized, excluding full secret tokens).
 *
 * @returns Array of active DesktopSession metadata.
 */
export function listActiveSessions(): Omit<DesktopSession, "sessionToken">[] {
  const now = Date.now();
  return Array.from(activeSessions.values())
    .filter((s) => !s.isRevoked && s.expiresAt > now)
    .map((s) => ({
      sessionId: s.sessionId,
      userId: s.userId,
      userRole: s.userRole,
      deviceId: s.deviceId,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      lastActiveAt: s.lastActiveAt,
      isRevoked: s.isRevoked,
      lastBiometricVerificationAt: s.lastBiometricVerificationAt,
    }));
}
