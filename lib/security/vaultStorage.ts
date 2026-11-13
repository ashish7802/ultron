/**
 * @file lib/security/vaultStorage.ts
 * @description Centralized Crash-Safe, Concurrency-Locked Persistence Engine for ULTRON Security Vault.
 *
 * Subsystem:
 * Centralized Security Infrastructure — Storage & State Integrity.
 *
 * Key Responsibilities:
 * - Provides cross-process, concurrency-safe atomic file persistence for all `.security_vault/` JSON stores:
 *   * `approvals.json` (Approval requests and decisions)
 *   * `lockdown.json` (Emergency stop state)
 *   * `sessions.json` (Active desktop sessions)
 *   * `policies.json` (Security policy rules)
 *   * `audit_chain.json` (HMAC-SHA256 chained audit ledger)
 * - Implements atomic lockfile acquisition (`fs.openSync` with `O_CREAT | O_EXCL`) with stale lock expiration
 *   and jittered exponential backoff retry to prevent race conditions on Windows.
 * - Enforces atomic file replacement on Windows with transient `EBUSY`/`EPERM` retry loops.
 * - Detects corrupted or truncated JSON data on read, automatically quarantines damaged files to
 *   `<filename>.corrupted.<timestamp>`, and self-heals safely without data destruction.
 * - Strictly avoids recommending or requiring deletion of security vault files for system recovery.
 *
 * Safety / Security Guarantees:
 * - Fail-closed on persistent I/O failure: critical security operations reject rather than proceed with unsaved state.
 * - Windows ACL safe mode: creates security vault directories with restricted access attributes where supported.
 * - Zero plaintext secrets stored in storage telemetry.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

/** Default timeout when waiting to acquire a vault storage lock (3000 ms). */
const LOCK_TIMEOUT_MS = 3000;

/** Maximum age for an orphaned lockfile before it is safely reclaimed as stale (8000 ms). */
const STALE_LOCK_AGE_MS = 8000;

/** Retry delay base for lock acquisition in milliseconds. */
const RETRY_BASE_DELAY_MS = 15;

/** Maximum retries when replacing destination file on Windows during transient file locks. */
const MAX_RENAME_RETRIES = 5;

/**
 * Ensures the security vault storage directory exists with proper permissions.
 *
 * @param dirPath - Directory path to initialize.
 */
export function ensureVaultDirectory(dirPath: string): void {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    }
  } catch (err) {
    console.error(`[VaultStorage] Failed to create storage directory "${dirPath}":`, err);
    throw err;
  }
}

/**
 * Synchronously acquires a process-level cooperative lockfile.
 *
 * Implementation Mechanics:
 * - Uses `fs.openSync(lockPath, 'wx')` which maps directly to atomic file creation flags
 *   (`O_CREAT | O_EXCL`) at the operating system kernel level.
 * - If the lockfile already exists, checks file modification timestamp to reap stale lockfiles
 *   left by abruptly terminated or crashed processes.
 * - Retries with progressive jittered delay until timeout is reached.
 *
 * @param lockPath - Path to the `.lock` file.
 * @param timeoutMs - Maximum wait duration before throwing a lock timeout error.
 * @returns Release callback function to be called in a finally block.
 * @throws Error if lock cannot be acquired within the timeout window.
 */
export function acquireVaultLockSync(
  lockPath: string,
  timeoutMs: number = LOCK_TIMEOUT_MS
): () => void {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      // Atomic exclusive creation
      const fd = fs.openSync(lockPath, "wx");
      // Write acquiring PID and timestamp for diagnostic inspection
      const lockMeta = JSON.stringify({ pid: process.pid, time: Date.now() });
      fs.writeFileSync(fd, lockMeta, "utf-8");
      fs.closeSync(fd);

      // Return idempotent release closure
      let released = false;
      return () => {
        if (!released) {
          released = true;
          try {
            if (fs.existsSync(lockPath)) {
              fs.unlinkSync(lockPath);
            }
          } catch {
            // Ignore unlock cleanup errors
          }
        }
      };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "EEXIST") {
        // Lock exists: check for stale lock left by crashed process
        try {
          const stats = fs.statSync(lockPath);
          const age = Date.now() - stats.mtimeMs;
          if (age > STALE_LOCK_AGE_MS) {
            console.warn(`[VaultStorage] Reclaiming stale lockfile: "${lockPath}" (Age: ${age}ms)`);
            try {
              fs.unlinkSync(lockPath);
            } catch {
              // Another process may have just reaped it
            }
          }
        } catch {
          // Stat failed, file may have been released in the interim
        }

        // Sleep synchronously for jittered delay
        const delay = RETRY_BASE_DELAY_MS + Math.floor(Math.random() * 20);
        const sleepUntil = Date.now() + delay;
        while (Date.now() < sleepUntil) {
          // Busy-wait briefly for atomic sync lock
        }
      } else {
        // Unexpected filesystem error
        console.error(`[VaultStorage] Lock acquisition error on "${lockPath}":`, err);
        throw err;
      }
    }
  }

  throw new Error(
    `[VaultStorage] Lock acquisition timed out after ${timeoutMs}ms on "${lockPath}". Multi-process contention or unreleased lock.`
  );
}

/**
 * Safely writes JSON data to a vault file using temporary file swap and Windows retry semantics.
 *
 * Execution Steps:
 * 1. Acquires cooperative lockfile (`<targetPath>.lock`).
 * 2. Writes formatted JSON payload to unique temp file (`<targetPath>.tmp.<pid>.<time>.<random>`).
 * 3. Flushes and replaces destination file (`fs.renameSync`). On Windows, if transient EBUSY occurs,
 *    retries up to 5 times with micro-sleeps.
 * 4. Releases lockfile in finally block.
 *
 * @param targetPath - Destination file path.
 * @param data - JavaScript object to serialize and persist.
 * @throws Error if persistence fails after retries.
 */
export function writeVaultJsonSync<T>(targetPath: string, data: T): void {
  const dir = path.dirname(targetPath);
  ensureVaultDirectory(dir);

  const lockPath = `${targetPath}.lock`;
  const releaseLock = acquireVaultLockSync(lockPath);

  const randomId = crypto.randomBytes(4).toString("hex");
  const tempPath = `${targetPath}.tmp.${process.pid}.${Date.now()}.${randomId}`;

  try {
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, serialized, "utf-8");

    // Atomic replacement with Windows retry loop
    let renamed = false;
    let renameErr: unknown = null;

    for (let r = 0; r < MAX_RENAME_RETRIES; r++) {
      try {
        fs.renameSync(tempPath, targetPath);
        renamed = true;
        break;
      } catch (err: unknown) {
        renameErr = err;
        const code = (err as { code?: string })?.code;
        // Windows transient locking errors: EPERM or EBUSY
        if (code === "EPERM" || code === "EBUSY") {
          const sleepUntil = Date.now() + (10 * (r + 1));
          while (Date.now() < sleepUntil) {
            // brief spin
          }
        } else {
          throw err;
        }
      }
    }

    if (!renamed) {
      // If renameSync failed after all retries on Windows, fallback to copy + unlink
      try {
        fs.copyFileSync(tempPath, targetPath);
        fs.unlinkSync(tempPath);
      } catch {
        throw renameErr || new Error(`Failed to replace vault file "${targetPath}" after retries.`);
      }
    }
  } finally {
    // Always clean up temp file if still present
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore temp cleanup error
    }
    // Always release process lock
    releaseLock();
  }
}

/**
 * Safely reads and parses a JSON vault file with schema validation and automatic corruption quarantine.
 *
 * If the file is missing: returns default fallback without error.
 * If the file contains invalid/corrupted JSON:
 *   1. Quarantines corrupted file to `<targetPath>.corrupted.<timestamp>`.
 *   2. Logs critical diagnostic warning.
 *   3. Returns fallback default so system can fail closed or operate safely.
 *
 * @param targetPath - File path to read.
 * @param fallback - Default object to return if file is missing or corrupted.
 * @param validator - Optional schema validation predicate.
 * @returns Parsed and validated object, or fallback.
 */
export function readVaultJsonSync<T>(
  targetPath: string,
  fallback: T,
  validator?: (data: unknown) => data is T
): T {
  if (!fs.existsSync(targetPath)) {
    return fallback;
  }

  const lockPath = `${targetPath}.lock`;
  const releaseLock = acquireVaultLockSync(lockPath, 1500);

  try {
    const raw = fs.readFileSync(targetPath, "utf-8");
    if (!raw || raw.trim().length === 0) {
      return fallback;
    }

    const parsed = JSON.parse(raw);

    // Apply schema validator if provided
    if (validator && !validator(parsed)) {
      console.warn(`[VaultStorage] Schema validation failed for "${targetPath}". Quarantining invalid record.`);
      quarantineCorruptedFile(targetPath);
      return fallback;
    }

    return parsed as T;
  } catch (err) {
    console.error(`[VaultStorage] Corrupted or unparseable JSON in "${targetPath}":`, err);
    quarantineCorruptedFile(targetPath);
    return fallback;
  } finally {
    releaseLock();
  }
}

/**
 * Quarantines a corrupted vault file by copying it to a backup path and preserving it for audit.
 *
 * @param targetPath - Path of the corrupted file.
 */
function quarantineCorruptedFile(targetPath: string): void {
  try {
    if (fs.existsSync(targetPath)) {
      const backupPath = `${targetPath}.corrupted.${Date.now()}`;
      fs.copyFileSync(targetPath, backupPath);
      console.warn(`[VaultStorage] Corrupted state preserved in: "${backupPath}"`);
    }
  } catch (err) {
    console.error(`[VaultStorage] Failed to quarantine corrupted file "${targetPath}":`, err);
  }
}
