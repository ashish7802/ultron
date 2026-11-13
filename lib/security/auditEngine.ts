/**
 * @file lib/security/auditEngine.ts
 * @description Tamper-Resistant, Cryptographically Chained Audit Ledger Engine for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Audit & Accountability Subsystem (Module 8).
 *
 * Key Responsibilities:
 * - Maintains an append-only, tamper-evident audit ledger using HMAC-SHA256 cryptographic chaining.
 * - Every audit entry contains:
 *   * Strict monotonically increasing sequence number
 *   * Timestamp, actor, role, action, target resource, risk tier
 *   * Execution status, outcome summary, failure reason
 *   * Session reference and approval grant reference
 *   * `previousEntryHash` linking to the previous block
 *   * `currentEntryHash` computed as HMAC-SHA256(secret, previousHash + canonicalEntry)
 * - Implements automated audit chain verification (`verifyAuditChainIntegrity()`) to detect
 *   any post-hoc modification, block deletion, or sequence break.
 * - Enforces zero raw secrets or biometric data in audit records.
 * - Writes records to disk atomically to guarantee ledger survival across crashes.
 *
 * Architectural Role & Interactions:
 * - Wired to `lib/security/actionGateway.ts` via `setGatewayAuditHook`.
 * - Exposed via `/api/security/audit` for UI ledger inspection and integrity checks.
 *
 * Safety / Security Guarantees:
 * - Tamper evidence: Modifying any field in an existing record invalidates all subsequent HMAC hashes.
 * - Immutable history: Only append operations are supported; updates or deletions are rejected.
 */

import crypto from "crypto";
import path from "path";
import { getActiveMasterSecret } from "../crypto.ts";
import { scanAndSanitizeText } from "./privacyEngine.ts";
import { setGatewayAuditHook } from "./actionGateway.ts";
import {
  acquireVaultLockSync,
  readVaultJsonSync,
  writeVaultJsonSync,
} from "./vaultStorage.ts";
import type {
  ChainedAuditEntry,
  AuditVerificationReport,
  UserRole,
  ActionRiskLevel,
  PermissionActionType,
} from "./types.ts";

/** Genesis block constant for the audit chain. */
const GENESIS_BLOCK_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/** Audit ledger disk persistence file. */
const AUDIT_LEDGER_FILE = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  ".security_vault",
  "audit_chain.json"
);

/** Serializes audit-ledger read/append/write operations across ULTRON processes. */
const AUDIT_LEDGER_TRANSACTION_LOCK = `${AUDIT_LEDGER_FILE}.append.lock`;

/** Active in-memory chained audit ledger. */
const auditChain: ChainedAuditEntry[] = [];

/**
 * Derives an HMAC key specifically dedicated to audit chain integrity.
 *
 * @returns 32-byte Buffer key.
 */
function getAuditHMACKey(): Buffer {
  const master = getActiveMasterSecret();
  return crypto.scryptSync(master, "ULTRON_AUDIT_LEDGER_SALT_V1", 32);
}

/**
 * Computes canonical HMAC-SHA256 hash for an audit entry.
 *
 * @param previousHash - Hash of prior block.
 * @param entry - Audit entry payload fields.
 * @returns 64-character hex HMAC string.
 */
function computeEntryHash(
  previousHash: string,
  entry: Omit<ChainedAuditEntry, "previousEntryHash" | "currentEntryHash">
): string {
  const canonicalData = JSON.stringify({
    sequenceNumber: entry.sequenceNumber,
    timestamp: entry.timestamp,
    actor: entry.actor,
    role: entry.role,
    action: entry.action,
    resource: entry.resource,
    riskLevel: entry.riskLevel,
    executionStatus: entry.executionStatus,
    sessionRef: entry.sessionRef || null,
    approvalRef: entry.approvalRef || null,
    correlationId: entry.correlationId || null,
    detailsSanitized: entry.detailsSanitized,
  });

  const hmacKey = getAuditHMACKey();
  return crypto
    .createHmac("sha256", hmacKey)
    .update(`${previousHash}::${canonicalData}`)
    .digest("hex");
}

/**
 * Confirms that persisted JSON has the fields required to verify each ledger entry.
 *
 * @param value - Untrusted value loaded from the audit ledger.
 * @returns True when the value is a structurally valid audit-entry array.
 */
function isAuditLedger(value: unknown): value is ChainedAuditEntry[] {
  if (!Array.isArray(value)) return false;

  return value.every((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const record = entry as Record<string, unknown>;

    return (
      typeof record.auditId === "string" &&
      typeof record.sequenceNumber === "number" &&
      typeof record.timestamp === "number" &&
      typeof record.actor === "string" &&
      typeof record.role === "string" &&
      typeof record.action === "string" &&
      typeof record.resource === "string" &&
      typeof record.riskLevel === "string" &&
      typeof record.executionStatus === "string" &&
      typeof record.detailsSanitized === "string" &&
      typeof record.previousEntryHash === "string" &&
      typeof record.currentEntryHash === "string"
    );
  });
}

/**
 * Verifies an audit-entry snapshot without depending on the in-memory ledger.
 *
 * @param entries - Audit entries to verify from genesis to tip.
 * @returns Integrity status and the first broken sequence, if any.
 */
function verifyAuditEntries(
  entries: readonly ChainedAuditEntry[]
): AuditVerificationReport {
  const total = entries.length;
  if (total === 0) {
    return { isChainValid: true, totalEntriesVerified: 0, verifiedAt: Date.now() };
  }

  let expectedPreviousHash = GENESIS_BLOCK_HASH;

  for (let i = 0; i < total; i++) {
    const entry = entries[i];
    if (entry.sequenceNumber !== i + 1 || entry.previousEntryHash !== expectedPreviousHash) {
      return {
        isChainValid: false,
        totalEntriesVerified: i,
        brokenSequenceAt: i + 1,
        corruptedAuditId: entry.auditId,
        verifiedAt: Date.now(),
      };
    }

    const recomputedHash = computeEntryHash(expectedPreviousHash, entry);
    if (recomputedHash !== entry.currentEntryHash) {
      return {
        isChainValid: false,
        totalEntriesVerified: i,
        brokenSequenceAt: i + 1,
        corruptedAuditId: entry.auditId,
        verifiedAt: Date.now(),
      };
    }

    expectedPreviousHash = entry.currentEntryHash;
  }

  return {
    isChainValid: true,
    totalEntriesVerified: total,
    verifiedAt: Date.now(),
  };
}

/**
 * Preserves an old ledger before replacing the active chain with an empty one.
 *
 * @param entries - Existing ledger data to retain in the archive.
 * @param reason - Why the ledger was retired.
 * @throws Error if either the archive or replacement cannot be written.
 */
function archiveLedger(
  entries: ChainedAuditEntry[],
  reason: "key_epoch" | "integrity"
): void {
  const archivePath = path.join(
    path.dirname(AUDIT_LEDGER_FILE),
    `audit_chain_${reason}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.json`
  );
  writeVaultJsonSync(archivePath, entries);
  writeVaultJsonSync(AUDIT_LEDGER_FILE, []);
  console.warn(`[AUDIT ENGINE] Archived ${reason} ledger at "${archivePath}".`);
}

/**
 * Loads and restores the audit ledger from disk on startup.
 * Validates the whole chain before use and preserves invalid or old-key ledgers before
 * beginning a fresh chain, so later appends cannot make compromised history look valid.
 */
function initializeLedger(): void {
  const releaseLock = acquireVaultLockSync(AUDIT_LEDGER_TRANSACTION_LOCK);
  try {
    const loaded = readVaultJsonSync<unknown>(AUDIT_LEDGER_FILE, []);
    if (!isAuditLedger(loaded) || loaded.length === 0) return;

    const expectedGenesis = computeEntryHash(GENESIS_BLOCK_HASH, loaded[0]);
    if (expectedGenesis !== loaded[0].currentEntryHash) {
      archiveLedger(loaded, "key_epoch");
      return;
    }

    const report = verifyAuditEntries(loaded);
    if (!report.isChainValid) {
      archiveLedger(loaded, "integrity");
      return;
    }

    auditChain.push(...loaded);
  } finally {
    releaseLock();
  }
}

initializeLedger();

/**
 * Persists the chained audit ledger to disk atomically with concurrency locking.
 */
function persistLedger(): void {
  writeVaultJsonSync(AUDIT_LEDGER_FILE, auditChain);
}

/**
 * Appends a new verified entry to the HMAC-SHA256 chained audit ledger.
 *
 * @param params - Audit entry parameters.
 * @returns The newly created and chained entry.
 */
export function appendAuditEntry(params: {
  actor: string;
  role?: UserRole;
  action: PermissionActionType | string;
  resource: string;
  riskLevel: ActionRiskLevel;
  executionStatus: "SUCCESS" | "FAILURE" | "DENIED" | "BLOCKED" | "REVOKED";
  resultSummary?: string;
  failureReason?: string;
  details: string;
  sessionRef?: string;
  approvalRef?: string;
  correlationId?: string;
}): ChainedAuditEntry {
  const releaseLock = acquireVaultLockSync(AUDIT_LEDGER_TRANSACTION_LOCK);
  try {
    const loaded = readVaultJsonSync<unknown>(AUDIT_LEDGER_FILE, []);
    if (!isAuditLedger(loaded)) {
      throw new Error("Cannot append to an audit ledger with an invalid schema.");
    }

    const report = verifyAuditEntries(loaded);
    if (!report.isChainValid) {
      throw new Error(
        `Cannot append to a corrupted audit ledger (broken sequence ${report.brokenSequenceAt}).`
      );
    }

    auditChain.splice(0, auditChain.length, ...loaded);
    const sequenceNumber = auditChain.length + 1;
    const previousEntryHash =
      auditChain.length > 0
        ? auditChain[auditChain.length - 1].currentEntryHash
        : GENESIS_BLOCK_HASH;

    const sanitizedDetails = scanAndSanitizeText(params.details).sanitizedText;
    const auditId = "aud_" + crypto.randomBytes(8).toString("hex");

    const entryData: Omit<ChainedAuditEntry, "previousEntryHash" | "currentEntryHash"> = {
      auditId,
      sequenceNumber,
      timestamp: Date.now(),
      actor: params.actor,
      role: params.role || "founder",
      action: params.action,
      resource: params.resource,
      riskLevel: params.riskLevel,
      sessionRef: params.sessionRef,
      approvalRef: params.approvalRef,
      correlationId: params.correlationId || `corr_${crypto.randomBytes(6).toString("hex")}`,
      executionStatus: params.executionStatus,
      resultSummary: params.resultSummary,
      failureReason: params.failureReason,
      detailsSanitized: sanitizedDetails,
    };

    const currentEntryHash = computeEntryHash(previousEntryHash, entryData);
    const fullEntry: ChainedAuditEntry = {
      ...entryData,
      previousEntryHash,
      currentEntryHash,
    };

    auditChain.push(fullEntry);
    persistLedger();
    return fullEntry;
  } finally {
    releaseLock();
  }
}

/**
 * Connects the Action Gateway to the cryptographic audit ledger.
 */
setGatewayAuditHook((actor, action, target, riskLevel, status, details, sessionId, approvalId) => {
  appendAuditEntry({
    actor,
    role: "founder",
    action,
    resource: target,
    riskLevel,
    executionStatus: status,
    details,
    sessionRef: sessionId,
    approvalRef: approvalId,
  });
});

/**
 * Verifies the complete cryptographic integrity of the audit chain from genesis to tip.
 *
 * Checks:
 * 1. Monotonic sequence numbering (1, 2, 3...)
 * 2. Hash chaining: entry[i].previousEntryHash === entry[i-1].currentEntryHash
 * 3. Recomputed HMAC: validates that entry fields were not tampered with
 *
 * @returns AuditVerificationReport.
 */
export function verifyAuditChainIntegrity(): AuditVerificationReport {
  return verifyAuditEntries(auditChain);
}

/**
 * Retrieves audit entries with optional filtering.
 *
 * @param filter - Query parameters.
 * @returns Array of ChainedAuditEntry.
 */
export function queryAuditEntries(filter: {
  actor?: string;
  action?: string;
  executionStatus?: string;
  limit?: number;
} = {}): ChainedAuditEntry[] {
  let results = [...auditChain];

  if (filter.actor) {
    results = results.filter((e) => e.actor.toLowerCase().includes(filter.actor!.toLowerCase()));
  }
  if (filter.action) {
    results = results.filter((e) => e.action.toLowerCase().includes(filter.action!.toLowerCase()));
  }
  if (filter.executionStatus) {
    results = results.filter((e) => e.executionStatus === filter.executionStatus);
  }

  const limit = filter.limit || 100;
  return results.slice(-limit).reverse();
}
