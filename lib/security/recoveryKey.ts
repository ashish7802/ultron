/**
 * @file lib/security/recoveryKey.ts
 * @description Centralized Founder Recovery Key Manager & Validator for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Identity & Emergency Subsystem (Module 1 & 9).
 *
 * Key Responsibilities:
 * - Resolves the active founder recovery secret from environment or secure local storage.
 * - Prohibits known insecure static default fallback strings (e.g. "FOUNDER_RECOVERY_OVERRIDE_KEY").
 * - Validates candidate recovery passphrases using constant-time comparison (`crypto.timingSafeEqual`)
 *   to mitigate timing side-channel attacks.
 * - Manages cryptographically secure random key generation for zero-configuration local setups.
 *
 * Architectural Role & Interactions:
 * - Central authority consumed by `identityEngine.ts`, `emergencyEngine.ts`, and API routes
 *   (`/api/computer`, `/api/security/auth`, `/api/security/emergency`).
 *
 * Safety / Security Guarantees:
 * - Zero Default Override: Static known constants never grant privileged access.
 * - Constant-Time Verification: String comparison is time-independent.
 * - Local Vault Protection: Generated recovery secret is saved with restricted file permissions.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

/** List of known insecure static strings that must NEVER grant recovery access */
const PROHIBITED_DEFAULTS = new Set([
  "FOUNDER_RECOVERY_OVERRIDE_KEY",
  "TEST_RECOVERY_KEY_ULTRON_FOUNDER",
  "TEST_RECOVERY_KEY",
  "RECOVERY_KEY",
  "DEFAULT_RECOVERY_KEY",
  "ADMIN",
  "PASSWORD",
  "12345678",
]);

/** Path to securely persisted local recovery secret */
const SECURITY_STORAGE_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  ".security_vault"
);
const RECOVERY_KEY_FILE = path.join(SECURITY_STORAGE_DIR, "recovery.key");

/** Cached recovery key in memory */
let cachedRecoveryKey: string | null = null;

/**
 * Initializes and retrieves the effective founder recovery key.
 *
 * Why & How:
 * 1. Checks `process.env.ULTRON_RECOVERY_KEY`. If set, non-empty, and not a known prohibited default,
 *    it takes top precedence.
 * 2. If not set, checks for a persisted key in `.security_vault/recovery.key`.
 * 3. If no key file exists, generates a high-entropy 256-bit random hex secret via `crypto.randomBytes(32)`,
 *    persists it with restricted mode (0600), and returns it.
 * 4. Rejects any prohibited fallback strings with an explicit error.
 *
 * @returns 256-bit hexadecimal recovery key string.
 * @throws Error if configured key matches a known insecure default.
 */
export function getEffectiveRecoveryKey(): string {
  if (cachedRecoveryKey) {
    return cachedRecoveryKey;
  }

  // 1. Check environment variable
  const envKey = (process.env.ULTRON_RECOVERY_KEY || "").trim();
  if (envKey) {
    if (PROHIBITED_DEFAULTS.has(envKey.toUpperCase())) {
      console.error(
        "[SECURITY CRITICAL] ULTRON_RECOVERY_KEY is set to a prohibited default value. Access denied."
      );
      throw new Error(
        "Security Invariant Violation: Prohibited default recovery key detected in environment."
      );
    }
    cachedRecoveryKey = envKey;
    return envKey;
  }

  // 2. Check local secure storage
  try {
    if (!fs.existsSync(SECURITY_STORAGE_DIR)) {
      fs.mkdirSync(SECURITY_STORAGE_DIR, { recursive: true, mode: 0o700 });
    }

    if (fs.existsSync(RECOVERY_KEY_FILE)) {
      const stored = fs.readFileSync(RECOVERY_KEY_FILE, "utf-8").trim();
      if (stored.length >= 32 && !PROHIBITED_DEFAULTS.has(stored.toUpperCase())) {
        cachedRecoveryKey = stored;
        return stored;
      }
    }

    // 3. Generate fresh cryptographically secure random key
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(RECOVERY_KEY_FILE, generated, { encoding: "utf-8", mode: 0o600 });
    console.info(
      "[SECURITY] Initialized local single-user Founder Recovery Key in .security_vault/recovery.key"
    );
    cachedRecoveryKey = generated;
    return generated;
  } catch (err) {
    console.warn("[SECURITY] Could not persist recovery key to disk:", err);
    // Ephemeral in-memory fallback
    cachedRecoveryKey = crypto.randomBytes(32).toString("hex");
    return cachedRecoveryKey;
  }
}

/**
 * Computes a standardized cryptographic hash of the recovery key using SHA-256.
 *
 * @param key - Raw recovery key string.
 * @returns 64-character hexadecimal SHA-256 hash.
 */
export function hashRecoveryKey(key: string): string {
  return crypto.createHash("sha256").update(key.trim()).digest("hex");
}

/**
 * Verifies a candidate recovery key against the active authorized key in constant time.
 *
 * Why & How:
 * 1. Checks that candidate is non-empty and not in the prohibited defaults blocklist.
 * 2. Hashes both candidate and authorized key using SHA-256 to ensure fixed-length buffers.
 * 3. Uses `crypto.timingSafeEqual` to prevent timing analysis attacks.
 *
 * @param candidate - User-submitted recovery passphrase or key.
 * @returns Boolean indicating whether candidate matches the active recovery key.
 */
export function verifyRecoveryKey(candidate: string | null | undefined): boolean {
  if (!candidate || typeof candidate !== "string") {
    return false;
  }

  const clean = candidate.trim();
  if (clean.length === 0 || PROHIBITED_DEFAULTS.has(clean.toUpperCase())) {
    return false;
  }

  try {
    const activeKey = getEffectiveRecoveryKey();
    const candidateHash = hashRecoveryKey(clean);
    const activeHash = hashRecoveryKey(activeKey);

    return (
      candidateHash.length === activeHash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(activeHash))
    );
  } catch {
    return false;
  }
}
