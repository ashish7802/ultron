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
import { defaultAppPathService } from "./appPathService.ts";
import { defaultDpapiBridge } from "./dpapiBridge.ts";

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

/** Cached recovery key in memory */
let cachedRecoveryKey: string | null = null;

/**
 * Initializes and retrieves the effective founder recovery key.
 *
 * Why & How:
 * 1. Checks `process.env.ULTRON_RECOVERY_KEY`. If set, non-empty, and not a known prohibited default,
 *    it takes top precedence.
 * 2. If not set, checks for a persisted key via `defaultAppPathService.getRecoveryKeyPath()`.
 *    - Priority 2a: Checks for DPAPI-protected recovery key (`recovery.key.dpapi`) and unprotects it.
 *    - Priority 2b: Checks for plaintext `recovery.key`, unprotects/loads, and opportunistically creates `recovery.key.dpapi`.
 * 3. If no key file exists, generates a high-entropy 256-bit random hex secret via `crypto.randomBytes(32)`,
 *    persists it securely (with DPAPI protection on Windows), and returns it.
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
  const isWindows = process.platform === "win32";
  const isProd = process.env.NODE_ENV === "production";
  const isPackaged = defaultAppPathService.isPackaged();
  const recoveryKeyFile = defaultAppPathService.getRecoveryKeyPath();
  const dpapiRecoveryFile = `${recoveryKeyFile}.dpapi`;
  const vaultDir = path.dirname(recoveryKeyFile);

  if (!fs.existsSync(vaultDir)) {
    try {
      fs.mkdirSync(vaultDir, { recursive: true, mode: 0o700 });
    } catch (mkdirErr) {
      throw new Error(`Security Invariant Violation: Could not create security vault directory: ${mkdirErr}`, { cause: mkdirErr });
    }
  }

  // 2a. Primary on Windows: Read DPAPI-protected recovery key exclusively
  if (fs.existsSync(dpapiRecoveryFile)) {
    const encBlob = fs.readFileSync(dpapiRecoveryFile, "utf-8").trim();
    if (encBlob.length > 0) {
      const unwrapped = defaultDpapiBridge.unprotectSecret(encBlob);
      if (unwrapped && unwrapped.length >= 32 && !PROHIBITED_DEFAULTS.has(unwrapped.toUpperCase())) {
        cachedRecoveryKey = unwrapped;
        return unwrapped;
      }
      // Existing DPAPI recovery key cannot be decrypted -> FAIL CLOSED
      throw new Error(
        "Security Invariant Violation: Failed to decrypt existing DPAPI-protected recovery key. Refusing to regenerate recovery key silently."
      );
    } else {
      throw new Error(
        "Security Invariant Violation: Existing DPAPI recovery key file is empty or corrupted."
      );
    }
  }

  // 2b. Migration: If plaintext recovery.key exists on Windows, migrate to DPAPI read-only
  if (fs.existsSync(recoveryKeyFile)) {
    const stored = fs.readFileSync(recoveryKeyFile, "utf-8").trim();
    if (stored.length >= 32 && !PROHIBITED_DEFAULTS.has(stored.toUpperCase())) {
      if (isWindows) {
        if (defaultDpapiBridge.isAvailable()) {
          const protectedBlob = defaultDpapiBridge.protectSecret(stored, "Ultron Founder Recovery Key");
          if (!protectedBlob || (isProd && protectedBlob.startsWith("DEV_CI_NON_WINDOWS_FALLBACK:"))) {
            throw new Error("Security Invariant Violation: DPAPI protection failed during recovery key migration in production.");
          }
          const tmpDpapi = `${dpapiRecoveryFile}.tmp.${Date.now()}`;
          fs.writeFileSync(tmpDpapi, protectedBlob, { encoding: "utf-8", mode: 0o600 });
          fs.renameSync(tmpDpapi, dpapiRecoveryFile);

          const verifyCheck = defaultDpapiBridge.unprotectSecret(fs.readFileSync(dpapiRecoveryFile, "utf-8").trim());
          if (verifyCheck === stored) {
            cachedRecoveryKey = stored;
            return stored;
          } else {
            throw new Error("Security Invariant Violation: DPAPI verification round-trip failed during recovery key migration.");
          }
        } else if (isProd) {
          throw new Error("Security Invariant Violation: Windows DPAPI is unavailable for recovery key custody in production.");
        }
      } else {
        // Non-Windows dev/CI environment fallback
        cachedRecoveryKey = stored;
        return stored;
      }
    } else if (stored.length > 0) {
      throw new Error("Security Invariant Violation: Existing recovery key in storage is invalid or matches prohibited defaults.");
    }
  }

  // 2c. Packaged production check: if recovery key is missing, fail closed without creating empty keys
  if (isPackaged) {
    throw new Error(
      "Security Invariant Violation: Required Founder recovery key is missing in packaged production environment."
    );
  }

  // 3. Generate fresh cryptographically secure random key (development / initial onboarding only)
  const generated = crypto.randomBytes(32).toString("hex");

  if (isWindows) {
    if (defaultDpapiBridge.isAvailable()) {
      const protectedBlob = defaultDpapiBridge.protectSecret(generated, "Ultron Founder Recovery Key");
      if (!protectedBlob || (isProd && protectedBlob.startsWith("DEV_CI_NON_WINDOWS_FALLBACK:"))) {
        throw new Error("Security Invariant Violation: DPAPI protection failed for newly generated recovery key.");
      }
      const tmpDpapi = `${dpapiRecoveryFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpDpapi, protectedBlob, { encoding: "utf-8", mode: 0o600 });
      fs.renameSync(tmpDpapi, dpapiRecoveryFile);

      const verifyCheck = defaultDpapiBridge.unprotectSecret(fs.readFileSync(dpapiRecoveryFile, "utf-8").trim());
      if (verifyCheck !== generated) {
        throw new Error("Security Invariant Violation: DPAPI verification round-trip failed for newly generated recovery key.");
      }
      // Invariant: Never write plaintext recovery.key on Windows
    } else if (isProd) {
      throw new Error("Security Invariant Violation: Windows DPAPI is unavailable for recovery key custody in production.");
    }
  } else {
    // Non-Windows dev/CI mode fallback
    fs.writeFileSync(recoveryKeyFile, generated, { encoding: "utf-8", mode: 0o600 });
  }

  console.info(
    "[SECURITY] Initialized local single-user Founder Recovery Key in persistent DPAPI custody."
  );
  cachedRecoveryKey = generated;
  return generated;
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
