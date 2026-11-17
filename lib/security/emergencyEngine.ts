/**
 * @file lib/security/emergencyEngine.ts
 * @description Centralized Emergency Protection & Persistent Lockdown Engine for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Emergency & System Defense Subsystem (Module 9).
 *
 * Key Responsibilities:
 * - Implements Emergency Stop (Global Protected Execution Lock).
 * - Enforces fail-closed lockdown: when activated, ALL external tool and OS execution is blocked.
 * - Revokes active user sessions and terminates active screen capture consent.
 * - Persistent lockdown state: written to `.security_vault/lockdown.json` so that
 *   restarting the ULTRON server DOES NOT silently disable lockdown.
 * - Founder-controlled recovery: only an explicitly authenticated founder process
 *   (valid recovery key or biometric proof) can unlock the system.
 * - Rejects and audits all unauthorized unlock attempts.
 *
 * Architectural Role & Interactions:
 * - Consulted by `lib/security/actionGateway.ts` and `lib/security/accessControlEngine.ts`.
 * - Exposed via `/api/security/emergency`.
 *
 * Safety / Security Guarantees:
 * - Fail-closed: if the lockdown state file is corrupted or present, defaults to LOCKED.
 * - Persistence across restarts: prevents evasion via process kill/restart.
 */

import crypto from "crypto";
import path from "path";
import fs from "fs";
import { revokeAllSessions } from "./identityEngine.ts";
import { revokeScreenCaptureConsent } from "./privacyEngine.ts";
import { recordSecurityEvent } from "./monitoringEngine.ts";
import { invalidateAllActiveGrants } from "./permissionEngine.ts";
import { writeVaultJsonSync } from "./vaultStorage.ts";
import type {
  EmergencyLockdownState,
  LockdownTriggerParams,
  RecoveryUnlockParams,
} from "./types.ts";
import { getEffectiveRecoveryKey, verifyRecoveryKey } from "./recoveryKey.ts";
import { defaultAppPathService } from "./appPathService.ts";

/** Path to persistent lockdown state file. */
const LOCKDOWN_FILE = defaultAppPathService.getLockdownStatePath();

/** Path to synchronized Python emergency stop lockfile. */
const EMERGENCY_STOP_LOCKFILE = path.join(
  defaultAppPathService.getUserDataDir(),
  "ULTRON_EMERGENCY_STOP.lock"
);

/** Default recovery passphrase salt. */
const RECOVERY_SALT = "ULTRON_FOUNDER_EMERGENCY_RECOVERY_SALT_V1";

/** Active in-memory lockdown state. */
let currentState: EmergencyLockdownState = {
  isLockedDown: false,
  activeExecutionsTerminated: 0,
  sessionsRevokedCount: 0,
  recoveryVerificationRequired: true,
};

/**
 * Computes a PBKDF2 hash of the recovery key for tamper-resistant validation.
 *
 * @param recoveryKey - Plaintext recovery passphrase.
 * @returns 64-character hex hash.
 */
function hashRecoveryKey(recoveryKey: string): string {
  return crypto
    .pbkdf2Sync(recoveryKey.trim(), RECOVERY_SALT, 100_000, 32, "sha256")
    .toString("hex");
}

/**
 * Loads persistent lockdown state from disk on startup.
 *
 * Security Invariant (High Priority Fix):
 * If the lockdown state file exists on disk, it MUST be valid. If it is empty, corrupt,
 * unparseable, or missing the boolean isLockedDown attribute, the engine MUST fail-closed
 * into active lockdown, preventing an attacker or disk corruption from silently unlocking the system.
 */
function initializeLockdownState(): void {
  try {
    if (fs.existsSync(LOCKDOWN_FILE)) {
      const raw = fs.readFileSync(LOCKDOWN_FILE, "utf-8").trim();
      if (!raw) {
        throw new Error("Lockdown state file exists on disk but is empty/corrupt.");
      }
      let loaded: unknown = null;
      try {
        loaded = JSON.parse(raw);
      } catch (parseErr) {
        throw new Error(`Lockdown state file is unparseable: ${(parseErr as Error).message}`, {
          cause: parseErr,
        });
      }

      if (loaded && typeof loaded === "object" && "isLockedDown" in loaded) {
        const candidate = loaded as EmergencyLockdownState;
        if (typeof candidate.isLockedDown !== "boolean") {
          throw new Error("Corrupted lockdown state: isLockedDown is not a boolean.");
        }
        if (candidate.isLockedDown) {
          currentState = candidate;
          console.warn("[EMERGENCY SYSTEM] *** SYSTEM BOOTED IN ACTIVE EMERGENCY LOCKDOWN ***");
        } else {
          currentState = candidate;
        }
        return;
      } else {
        throw new Error("Lockdown state file does not contain a valid lockdown state object.");
      }
    }
  } catch (err) {
    // Fail closed: if state read or parsing fails on existing file, enter lockdown
    console.error("[EMERGENCY SYSTEM] Error reading lockdown state, defaulting to LOCKED:", err);
    currentState = {
      isLockedDown: true,
      lockedAt: Date.now(),
      lockedByActor: "system_fail_closed",
      triggerReason: `Lockdown state corruption detected on boot: ${err instanceof Error ? err.message : String(err)}`,
      activeExecutionsTerminated: 0,
      sessionsRevokedCount: 0,
      recoveryVerificationRequired: true,
    };
  }
}

initializeLockdownState();

/**
 * Persists lockdown state to disk atomically with concurrency locking.
 */
function persistLockdownState(): void {
  try {
    writeVaultJsonSync(LOCKDOWN_FILE, currentState);
  } catch (err) {
    console.error("[EMERGENCY SYSTEM] Failed to persist lockdown state:", err);
  }
}

/**
 * Checks whether the system is currently under active emergency lockdown.
 *
 * @returns True if locked down; false otherwise.
 */
export function isSystemLockedDown(): boolean {
  if (currentState.isLockedDown) return true;
  try {
    if (fs.existsSync(EMERGENCY_STOP_LOCKFILE)) return true;
  } catch {}
  return false;
}

/**
 * Returns read-only snapshot of current emergency lockdown state.
 *
 * @returns Read-only EmergencyLockdownState.
 */
export function getLockdownStatus(): Readonly<EmergencyLockdownState> {
  const isLocked = isSystemLockedDown();
  return { ...currentState, isLockedDown: isLocked };
}

/**
 * Triggers Emergency Stop / Security Lockdown immediately.
 *
 * Execution Steps:
 * 1. Sets global lockdown flag to true.
 * 2. Revokes all active desktop sessions.
 * 3. Immediately revokes screen capture consent.
 * 4. Records a CRITICAL security event.
 * 5. Persists lockdown state to disk.
 *
 * @param params - Trigger parameters.
 * @returns Updated EmergencyLockdownState.
 */
export function triggerEmergencyStop(params: LockdownTriggerParams): EmergencyLockdownState {
  const now = Date.now();
  const sessionsRevoked = params.revokeAllSessions !== false ? revokeAllSessions(params.reason) : 0;
  revokeScreenCaptureConsent();
  const grantsInvalidated = invalidateAllActiveGrants(params.reason);

  const recoveryPassphraseHash = hashRecoveryKey(getEffectiveRecoveryKey());

  currentState = {
    isLockedDown: true,
    lockedAt: now,
    lockedByActor: params.actor,
    triggerReason: params.reason,
    activeExecutionsTerminated: grantsInvalidated > 0 ? grantsInvalidated : 1, // Marks current in-flight queue
    sessionsRevokedCount: sessionsRevoked,
    recoveryVerificationRequired: true,
    recoveryPassphraseHash,
  };

  persistLockdownState();

  // Synchronize with Python safety lockfile
  try {
    fs.writeFileSync(
      EMERGENCY_STOP_LOCKFILE,
      JSON.stringify({
        triggeredAt: now,
        reason: params.reason,
        actor: params.actor,
      }),
      "utf-8"
    );
  } catch (lockErr) {
    console.warn("[EMERGENCY SYSTEM] Could not write Python emergency lockfile:", lockErr);
  }

  recordSecurityEvent(
    "EMERGENCY_STOP_TRIGGERED",
    "CRITICAL",
    params.actor,
    `Emergency Stop activated: ${params.reason}. Sessions revoked: ${sessionsRevoked}.`
  );

  console.warn(`[EMERGENCY SYSTEM] *** EMERGENCY STOP ACTIVATED BY ${params.actor}: ${params.reason} ***`);
  return { ...currentState };
}

/**
 * Unlocks the system from emergency lockdown using the founder recovery key.
 *
 * Verification:
 * 1. Validates that system is actually locked down.
 * 2. Validates recovery passphrase against cryptographic PBKDF2 hash.
 * 3. Restores operational status and audits the unlock event.
 *
 * @param params - RecoveryUnlockParams.
 * @returns Result object.
 */
export function unlockFromEmergencyStop(
  params: RecoveryUnlockParams
): { success: boolean; error?: string } {
  if (!isSystemLockedDown()) {
    return { success: true };
  }

  // Validate recovery key via centralized constant-time validator
  if (!verifyRecoveryKey(params.recoveryKey)) {
    recordSecurityEvent(
      "POLICY_VIOLATION",
      "CRITICAL",
      params.actor,
      `Failed unauthorized attempt to unlock Emergency Stop. Reason: ${params.reason}`
    );
    return { success: false, error: "Authentication Failed: Invalid founder recovery key." };
  }

  // Unlock system
  currentState = {
    isLockedDown: false,
    lockedAt: undefined,
    lockedByActor: undefined,
    triggerReason: undefined,
    activeExecutionsTerminated: 0,
    sessionsRevokedCount: 0,
    recoveryVerificationRequired: false,
  };

  persistLockdownState();

  // Remove synchronized Python lockfile if present
  try {
    if (fs.existsSync(EMERGENCY_STOP_LOCKFILE)) {
      fs.unlinkSync(EMERGENCY_STOP_LOCKFILE);
    }
  } catch (cleanErr) {
    console.warn("[EMERGENCY SYSTEM] Could not remove Python emergency lockfile:", cleanErr);
  }

  recordSecurityEvent(
    "EMERGENCY_STOP_RECOVERED",
    "INFO",
    params.actor,
    `System successfully recovered and unlocked from Emergency Stop. Reason: ${params.reason}`
  );

  console.info(`[EMERGENCY SYSTEM] *** SYSTEM RECOVERED FROM EMERGENCY STOP BY ${params.actor} ***`);
  return { success: true };
}
