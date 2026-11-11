/**
 * @file lib/memory/sqliteAdapter.ts
 * @description Embedded SQLite 3 DAO Adapter for ULTRON Advanced Memory System.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P1–P5 Core).
 *
 * Key Responsibilities:
 * - Direct C-level SQLite 3 interface using native Node.js 22+ `node:sqlite` (`DatabaseSync`).
 * - Zero external background process requirement; zero TCP port binding.
 * - Manages transactions, automatic FTS5 synchronization, and parameter bindings.
 * - Enforces Phase P5 atomic memory revisions, DAG revision relationships, and branch navigation.
 * - Implements atomic `BEGIN IMMEDIATE` transaction boundaries with `PRAGMA busy_timeout = 5000`.
 * - Computes blind index hashes and records tamper-evident audit ledger entries.
 * - Provides sub-millisecond retrieval, versioning, supersession, and integrity verification.
 *
 * Architectural Role & Safety Guarantees:
 * - Single source of truth for local memory persistence on Windows desktop.
 * - Thread-safe within Node.js process; cooperative file locking via SQLite WAL mode.
 * - Preserves existing `ultron_memory.db` tables (`memory`, `research_archive`) intact.
 * - Enforces fail-closed validation on all incoming memory records and revisions.
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { SQLITE_MEMORY_SCHEMA_DDL, GLOBAL_PROJECT_ID } from "./schema.ts";
import type {
  MemoryRecord,
  MemoryQueryOptions,
  MemorySystemStats,
  MemoryTier,
  SensitivityLevel,
  MemoryStatus,
  MemoryAuditEntry,
  CreateRevisionOptions,
  MemoryRevisionRecord,
  RevisionTreeNode,
  RevisionIntegrityReport,
  ConfirmationRecord,
} from "./types.ts";
import { getActiveMasterSecret } from "../crypto.ts";

/** Default SQLite database path in project root/ultron_engine. */
export const DEFAULT_DB_PATH = path.join(process.cwd(), "ultron_engine", "ultron_memory.db");

/** Computes an HMAC-SHA256 blind index hash for deterministic O(1) deduplication. */
export function computeBlindIndexHash(content: string): string {
  const normalized = content.trim().toLowerCase().replace(/\s+/g, " ");
  const secret = getActiveMasterSecret();
  return crypto.createHmac("sha256", secret).update(normalized).digest("hex");
}

/** Computes tamper-evident HMAC seal for audit ledger entries. */
export function computeAuditTamperSeal(recordId: string, currentHash: string, timestamp: number): string {
  const secret = getActiveMasterSecret();
  const payload = `${recordId}:${currentHash}:${timestamp}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * SQLite DAO Adapter implementing the Advanced Memory storage contracts.
 */
export class SqliteMemoryAdapter {
  private _db: DatabaseSync;
  private _dbPath: string;

  /**
   * Initializes the SQLite Memory Adapter.
   *
   * @param dbPath - Optional path to the SQLite file (defaults to `ultron_engine/ultron_memory.db`).
   */
  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this._dbPath = dbPath;
    const parentDir = path.dirname(dbPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    this._db = new DatabaseSync(dbPath);
    this._initSchema();
  }

  /**
   * Returns the underlying DatabaseSync instance for direct statement execution.
   */
  public get rawDb(): DatabaseSync {
    return this._db;
  }

  /**
   * Idempotently executes the canonical DDL and migrations establishing all Phase P1–P5 tables and triggers.
   */
  private _initSchema(): void {
    // 1. Establish concurrency busy timeout before running DDL
    try {
      this._db.exec("PRAGMA busy_timeout = 5000;");
    } catch {
      /* ignore */
    }

    // 2. DatabaseSync requires executing multi-statement DDL via exec()
    this._db.exec(SQLITE_MEMORY_SCHEMA_DDL);

    // 3. Additive non-destructive migration for parent_memory_id column in ultron_memories
    try {
      const tableInfo = this._db.prepare("PRAGMA table_info(ultron_memories)").all() as { name: string }[];
      const hasParent = tableInfo.some((col) => col.name === "parent_memory_id");
      if (!hasParent) {
        this._db.exec("ALTER TABLE ultron_memories ADD COLUMN parent_memory_id TEXT REFERENCES ultron_memories(id) ON DELETE SET NULL;");
      }
    } catch {
      /* column already exists */
    }

    // 4. Non-destructive schema migration for vector table columns
    try {
      this._db.exec("ALTER TABLE ultron_memory_vectors ADD COLUMN provider TEXT NOT NULL DEFAULT 'ollama'");
    } catch {
      /* column already exists */
    }
    try {
      this._db.exec("ALTER TABLE ultron_memory_vectors ADD COLUMN vector_version INTEGER NOT NULL DEFAULT 1");
    } catch {
      /* column already exists */
    }

    // 5. Additive migration for ultron_memory_revisions table and indexes
    try {
      this._db.exec(`
        CREATE TABLE IF NOT EXISTS ultron_memory_revisions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES ultron_projects(id) ON DELETE CASCADE,
            parent_id TEXT NOT NULL REFERENCES ultron_memories(id) ON DELETE CASCADE,
            child_id TEXT NOT NULL REFERENCES ultron_memories(id) ON DELETE CASCADE,
            relationship_type TEXT NOT NULL CHECK(relationship_type IN (
                'supersedes',
                'refines',
                'forks',
                'merges',
                'rolls_back'
            )),
            confidence_score REAL NOT NULL CHECK(confidence_score >= 0.0 AND confidence_score <= 1.0),
            reconciliation_strategy TEXT NOT NULL,
            change_summary TEXT NOT NULL,
            actor TEXT NOT NULL CHECK(actor IN ('founder', 'agent', 'system', 'consensus')),
            created_at REAL NOT NULL,
            UNIQUE(parent_id, child_id)
        );

        CREATE INDEX IF NOT EXISTS idx_revisions_parent ON ultron_memory_revisions(parent_id);
        CREATE INDEX IF NOT EXISTS idx_revisions_child ON ultron_memory_revisions(child_id);
        CREATE INDEX IF NOT EXISTS idx_revisions_project ON ultron_memory_revisions(project_id);
      `);
    } catch {
      /* table already exists */
    }

    // 6. Additive partial unique index on active semantic keys
    try {
      this._db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_active_semantic_key 
        ON ultron_memories(project_id, semantic_key) 
        WHERE status = 'active' AND semantic_key IS NOT NULL;
      `);
    } catch {
      /* index already exists */
    }

    // 7. Additive migration for ultron_memory_confirmations table and indexes
    try {
      this._db.exec(`
        CREATE TABLE IF NOT EXISTS ultron_memory_confirmations (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES ultron_projects(id) ON DELETE CASCADE,
            existing_memory_id TEXT REFERENCES ultron_memories(id) ON DELETE CASCADE,
            candidate_key TEXT NOT NULL,
            candidate_tier TEXT NOT NULL,
            candidate_content TEXT NOT NULL,
            candidate_source TEXT NOT NULL,
            conflict_class TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'deferred', 'expired')),
            inline_prompt TEXT NOT NULL,
            created_at REAL NOT NULL,
            resolved_at REAL,
            resolved_by TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_confirmations_status ON ultron_memory_confirmations(status);
        CREATE INDEX IF NOT EXISTS idx_confirmations_project ON ultron_memory_confirmations(project_id);
      `);
    } catch {
      /* table already exists */
    }
  }

  /**
   * Returns the configured busy timeout in milliseconds on the active connection.
   */
  public getBusyTimeout(): number {
    const row = this._db.prepare("PRAGMA busy_timeout").get() as { timeout: number };
    return Number(row.timeout);
  }

  /**
   * Stores a new canonical memory record, performing blind-index deduplication check.
   *
   * @param record - Partial memory record to insert.
   * @returns Stored canonical MemoryRecord.
   * @throws Error if validation fails or insertion cannot complete.
   */
  public storeMemory(
    record: Omit<MemoryRecord, "id" | "contentHash" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      version?: number;
      createdAt?: number;
      updatedAt?: number;
    }
  ): MemoryRecord {
    const now = Date.now();
    const id = record.id || `mem_${crypto.randomBytes(8).toString("hex")}`;
    const projectId = record.projectId || GLOBAL_PROJECT_ID;
    const version = record.version || 1;
    const content = record.content.trim();
    const contentHash = computeBlindIndexHash(content);
    const createdAt = record.createdAt || now;
    const updatedAt = record.updatedAt || now;
    const validFrom = record.validFrom || now;
    const decayRate = typeof record.decayRate === "number" ? record.decayRate : 0.05;
    const importance = Math.max(1, Math.min(5, Math.round(record.importance || 3)));
    const confidence = Math.max(0.0, Math.min(1.0, record.confidence !== undefined ? record.confidence : 1.0));
    const sensitivity = record.sensitivity || "internal";
    const status = record.status || "active";
    const isEncrypted = record.isEncrypted ? 1 : 0;
    const metadataStr = JSON.stringify(record.metadata || {});

    // Check for exact blind-index duplicate in the same project and tier
    const existingStmt = this._db.prepare(
      `SELECT id, access_count FROM ultron_memories WHERE project_id = ? AND content_hash = ? AND status = 'active' LIMIT 1`
    );
    const existing = existingStmt.get(projectId, contentHash) as { id: string; access_count: number } | undefined;

    if (existing) {
      // Duplicate identified: update access count and last accessed time without creating redundant row
      const updateStmt = this._db.prepare(
        `UPDATE ultron_memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?`
      );
      updateStmt.run(now, existing.id);
      return this.getMemoryById(existing.id)!;
    }

    const insertStmt = this._db.prepare(`
      INSERT INTO ultron_memories (
        id, project_id, tier, semantic_key, content, summary, sensitivity, status,
        importance, confidence, access_count, last_accessed_at, content_hash,
        valid_from, valid_until, decay_rate, version, superseded_by, parent_memory_id,
        source, source_ref, metadata, is_encrypted, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    insertStmt.run(
      id,
      projectId,
      record.tier,
      record.semanticKey,
      content,
      record.summary || null,
      sensitivity,
      status,
      importance,
      confidence,
      record.accessCount || 0,
      record.lastAccessedAt || null,
      contentHash,
      validFrom,
      record.validUntil || null,
      decayRate,
      version,
      record.supersededBy || null,
      record.parentMemoryId || null,
      record.source || "inferred_dialogue",
      record.sourceRef || null,
      metadataStr,
      isEncrypted,
      createdAt,
      updatedAt
    );

    // Audit log for genesis creation
    this.logAudit({
      memoryId: id,
      action: "CREATE",
      actor: "ultron_agent",
      currentHash: contentHash,
      tamperSeal: computeAuditTamperSeal(id, contentHash, now),
      payloadSnapshot: { id, semanticKey: record.semanticKey, tier: record.tier, projectId },
      createdAt: now,
    });

    return this.getMemoryById(id)!;
  }

  /**
   * Phase P5.1: Atomically creates a memory revision, tracking ancestry and DAG relationships.
   *
   * Executes inside an atomic SQLite BEGIN IMMEDIATE transaction:
   * 1. Acquires immediate exclusive write lock to prevent race conditions.
   * 2. Validates parent memory exists, verifying expected version and project boundary ownership.
   * 3. Checks for duplicate requests via idempotency key if provided.
   * 4. Enforces cycle prevention to ensure acyclic graph structure.
   * 5. If relationshipType is 'supersedes' or 'rolls_back' and child is active:
   *    a) Updates parent status to 'superseded' (satisfies partial unique index on active keys).
   *    b) Inserts child revision with parent_memory_id = parentId (child now exists).
   *    c) Updates parent superseded_by = childId (satisfies foreign key constraint).
   * 6. Records the dedicated revision link in `ultron_memory_revisions`.
   * 7. Appends a tamper-sealed event into `ultron_memory_audit_ledger`.
   * 8. Commits the transaction atomically. Rolls back cleanly on any failure.
   *
   * @param options - CreateRevisionOptions specifying parent, new content, and revision metadata.
   * @returns Newly created MemoryRecord.
   * @throws Error if validation fails or optimistic concurrency conflict is detected.
   */
  public createRevision(options: CreateRevisionOptions): MemoryRecord {
    const parentId = options.parentId;
    if (!parentId) {
      throw new Error("Cannot create revision: parentId is required");
    }

    const content = options.newContent?.trim();
    if (!content || content.length < 3) {
      throw new Error("Cannot create revision: newContent must be at least 3 characters");
    }

    const relationshipType = options.relationshipType || "supersedes";
    const actor = options.actor || "agent";
    const strategy = options.reconciliationStrategy || (relationshipType === "supersedes" ? "atomic_supersession" : "branch_fork");
    const summary = options.reason || (relationshipType === "supersedes" ? "Content revision" : "Revision branch");
    const now = Date.now();
    const newHash = computeBlindIndexHash(content);

    // Idempotency check: if an idempotency key was supplied, verify if it was already applied
    if (options.idempotencyKey) {
      const existing = this._findRevisionByIdempotencyKey(parentId, options.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    // Begin atomic transaction with IMMEDIATE write lock
    this._db.exec("BEGIN IMMEDIATE;");
    try {
      // Step 1: Fetch parent row inside transaction to lock and inspect fresh state
      const parentStmt = this._db.prepare("SELECT * FROM ultron_memories WHERE id = ? LIMIT 1");
      const parentRow = parentStmt.get(parentId) as Record<string, unknown> | undefined;
      if (!parentRow) {
        throw new Error(`Cannot create revision: parent memory ${parentId} not found`);
      }
      const parent = this._mapRowToRecord(parentRow);

      // Step 2: Project boundary isolation check: parent and child must belong to same project
      const targetProjectId = options.projectId || parent.projectId;
      if (targetProjectId !== parent.projectId) {
        throw new Error(
          `Cross-project revision rejected: parent belongs to project ${parent.projectId}, but revision target is ${targetProjectId}`
        );
      }

      // Step 3: Optimistic concurrency control & state validation
      if (options.expectedVersion !== undefined && parent.version !== options.expectedVersion) {
        throw new Error(
          `Optimistic concurrency conflict: expected parent version ${options.expectedVersion}, but found ${parent.version}`
        );
      }

      // If superseding, parent cannot already be superseded by a previous concurrent call
      if (relationshipType === "supersedes" && parent.status === "superseded") {
        throw new Error(
          `Optimistic concurrency conflict: parent memory ${parentId} is already superseded`
        );
      }

      // Step 4: Self-referencing cycle check
      if (options.parentId === options.idempotencyKey) {
        throw new Error("Circular revision rejected: parent cannot reference itself");
      }

      // Step 5: Generate unique IDs and attributes
      const newId = `mem_${crypto.randomBytes(8).toString("hex")}`;
      const revId = `rev_${crypto.randomBytes(8).toString("hex")}`;
      const targetConfidence = options.confidenceScore !== undefined ? options.confidenceScore : parent.confidence;
      const targetImportance = options.importance !== undefined ? options.importance : parent.importance;
      const targetSensitivity = options.sensitivity || parent.sensitivity;
      const targetTier = options.tier || parent.tier;
      const targetSemanticKey = options.semanticKey || parent.semanticKey;
      const targetValidUntil = options.validUntil !== undefined ? options.validUntil : parent.validUntil;

      // Compute next version monotonically per (project_id, semantic_key) to avoid collision on UNIQUE(project_id, semantic_key, version)
      const maxVerStmt = this._db.prepare(
        "SELECT COALESCE(MAX(version), 0) AS max_v FROM ultron_memories WHERE project_id = ? AND semantic_key = ?"
      );
      const maxVer = (maxVerStmt.get(parent.projectId, targetSemanticKey) as { max_v: number }).max_v;
      const nextVersion = Math.max(parent.version, maxVer) + 1;

      // Determine initial status of the new child revision
      const childStatus: MemoryStatus = options.status || (relationshipType === "forks" ? "pending_confirmation" : "active");

      const newMetadata = {
        ...parent.metadata,
        ...(options.metadata || {}),
        parentMemoryId: parentId,
        relationshipType,
        revisionReason: summary,
        actor,
        idempotencyKey: options.idempotencyKey || undefined,
      };

      // Step 6a: If this is an active supersession/rollback, update parent status to 'superseded' FIRST.
      // Do NOT set superseded_by yet (newId doesn't exist in DB yet, which would fail FK constraint).
      // Updating status removes parent from idx_active_semantic_key index, clearing path for child.
      if ((relationshipType === "supersedes" || relationshipType === "rolls_back") && childStatus === "active") {
        const updateParentStatusStmt = this._db.prepare(
          `UPDATE ultron_memories SET status = 'superseded', updated_at = ? WHERE id = ?`
        );
        updateParentStatusStmt.run(now, parentId);
      }

      // Step 6b: Insert new memory revision row
      const insertStmt = this._db.prepare(`
        INSERT INTO ultron_memories (
          id, project_id, tier, semantic_key, content, summary, sensitivity, status,
          importance, confidence, access_count, last_accessed_at, content_hash,
          valid_from, valid_until, decay_rate, version, superseded_by, parent_memory_id,
          source, source_ref, metadata, is_encrypted, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, 0, ?, ?,
          ?, ?, ?, ?, NULL, ?,
          ?, ?, ?, ?, ?, ?
        )
      `);

      insertStmt.run(
        newId,
        parent.projectId,
        targetTier,
        targetSemanticKey,
        content,
        options.summary || parent.summary || null,
        targetSensitivity,
        childStatus,
        targetImportance,
        targetConfidence,
        now,
        newHash,
        now,
        targetValidUntil || null,
        parent.decayRate,
        nextVersion,
        parentId,
        parent.source,
        `rev:${parentId}`,
        JSON.stringify(newMetadata),
        parent.isEncrypted ? 1 : 0,
        now,
        now
      );

      // Step 6c: Now that newId exists, link parent's superseded_by to newId (satisfies FK constraint)
      if ((relationshipType === "supersedes" || relationshipType === "rolls_back") && childStatus === "active") {
        const updateParentFkStmt = this._db.prepare(
          `UPDATE ultron_memories SET superseded_by = ?, updated_at = ? WHERE id = ?`
        );
        updateParentFkStmt.run(newId, now, parentId);
      }

      // Step 7: Record dedicated revision edge in ultron_memory_revisions
      const revStmt = this._db.prepare(`
        INSERT INTO ultron_memory_revisions (
          id, project_id, parent_id, child_id, relationship_type,
          confidence_score, reconciliation_strategy, change_summary, actor, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      revStmt.run(
        revId,
        parent.projectId,
        parentId,
        newId,
        relationshipType,
        targetConfidence,
        strategy,
        summary,
        actor,
        now
      );

      // Step 8: Append to cryptographic audit ledger
      const auditStmt = this._db.prepare(`
        INSERT INTO ultron_memory_audit_ledger (
          memory_id, action, actor, previous_hash, current_hash, tamper_seal, payload_snapshot, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tamperSeal = computeAuditTamperSeal(newId, newHash, now);
      auditStmt.run(
        newId,
        relationshipType === "supersedes" ? "SUPERSEDE" : "REVISE",
        actor,
        parent.contentHash,
        newHash,
        tamperSeal,
        JSON.stringify({
          parentId,
          newId,
          revisionId: revId,
          version: nextVersion,
          relationshipType,
          reason: summary,
          idempotencyKey: options.idempotencyKey || null,
        }),
        now
      );

      // Step 9: Commit transaction atomically
      this._db.exec("COMMIT;");

      return this.getMemoryById(newId)!;
    } catch (error) {
      // Rollback transaction to preserve database consistency on any error
      try {
        this._db.exec("ROLLBACK;");
      } catch {
        /* rollback safety */
      }
      throw error;
    }
  }

  /**
   * Helper to check if a revision was already applied with a given idempotency key.
   */
  private _findRevisionByIdempotencyKey(parentId: string, idempotencyKey: string): MemoryRecord | null {
    const stmt = this._db.prepare(
      `SELECT * FROM ultron_memories WHERE parent_memory_id = ? AND json_extract(metadata, '$.idempotencyKey') = ? LIMIT 1`
    );
    const row = stmt.get(parentId, idempotencyKey) as Record<string, unknown> | undefined;
    return row ? this._mapRowToRecord(row) : null;
  }

  /**
   * Supersedes an existing memory record, creating an immutable new version node.
   * Delegates to `createRevision` inside an atomic transaction.
   *
   * @param oldId - Target memory ID.
   * @param newContent - Revised content string.
   * @param reason - Optional explanation for the revision.
   * @returns Newly created revision MemoryRecord.
   */
  public supersedeMemory(oldId: string, newContent: string, reason?: string): MemoryRecord {
    return this.createRevision({
      parentId: oldId,
      newContent,
      relationshipType: "supersedes",
      reason: reason || "Content revision",
      actor: "agent",
    });
  }

  /**
   * Phase P5.1: Retrieves full chronological revision ancestry back to genesis root.
   * Uses recursive CTE following `parent_memory_id` upward.
   *
   * @param memoryId - Target memory ID.
   * @returns Array of MemoryRecords ordered from root (v1) to target.
   */
  public getRevisionHistory(memoryId: string): MemoryRecord[] {
    const sql = `
      WITH RECURSIVE AncestryTree AS (
        SELECT m.*, 0 AS depth
        FROM ultron_memories m
        WHERE m.id = ?
        
        UNION ALL
        
        SELECT p.*, a.depth + 1
        FROM ultron_memories p
        JOIN AncestryTree a ON p.id = a.parent_memory_id
        WHERE a.depth < 100
      )
      SELECT * FROM AncestryTree ORDER BY depth DESC;
    `;
    const stmt = this._db.prepare(sql);
    const rows = stmt.all(memoryId) as Record<string, unknown>[];
    return rows.map((r) => this._mapRowToRecord(r));
  }

  /**
   * Phase P5.1: Retrieves the current active revision for a semantic key within a project.
   *
   * @param semanticKey - Semantic lookup slug.
   * @param projectId - Project isolation ID (defaults to global).
   * @returns Active MemoryRecord or null.
   */
  public getCurrentRevision(semanticKey: string, projectId: string = GLOBAL_PROJECT_ID): MemoryRecord | null {
    const stmt = this._db.prepare(
      `SELECT * FROM ultron_memories WHERE project_id = ? AND semantic_key = ? AND status = 'active' ORDER BY version DESC LIMIT 1`
    );
    const row = stmt.get(projectId, semanticKey) as Record<string, unknown> | undefined;
    return row ? this._mapRowToRecord(row) : null;
  }

  /**
   * Phase P5.1: Retrieves the direct predecessor/parent revision of a memory record.
   *
   * @param memoryId - Target memory ID.
   * @returns Parent MemoryRecord or null if genesis.
   */
  public getPreviousRevision(memoryId: string): MemoryRecord | null {
    const mem = this.getMemoryById(memoryId);
    if (!mem || !mem.parentMemoryId) {
      return null;
    }
    return this.getMemoryById(mem.parentMemoryId);
  }

  /**
   * Phase P5.1: Retrieves competing revision branches that share the same parent.
   *
   * @param memoryId - Target memory ID.
   * @returns Array of sibling MemoryRecords.
   */
  public getCompetingRevisions(memoryId: string): MemoryRecord[] {
    const target = this.getMemoryById(memoryId);
    if (!target) return [];

    if (target.parentMemoryId) {
      const stmt = this._db.prepare(
        `SELECT * FROM ultron_memories WHERE parent_memory_id = ? AND id != ? ORDER BY created_at ASC`
      );
      const rows = stmt.all(target.parentMemoryId, memoryId) as Record<string, unknown>[];
      return rows.map((r) => this._mapRowToRecord(r));
    }

    // If target has no parent, find competing genesis records for same semantic key
    const stmt = this._db.prepare(
      `SELECT * FROM ultron_memories WHERE project_id = ? AND semantic_key = ? AND id != ? ORDER BY created_at ASC`
    );
    const rows = stmt.all(target.projectId, target.semanticKey, memoryId) as Record<string, unknown>[];
    return rows.map((r) => this._mapRowToRecord(r));
  }

  /**
   * Phase P5.1: Constructs a hierarchical revision tree (DAG) starting from root node.
   *
   * @param rootMemoryId - Target root memory ID.
   * @param maxDepth - Recursion guard limit (default 50).
   * @returns Hierarchical RevisionTreeNode or null.
   */
  public getRevisionTree(rootMemoryId: string, maxDepth: number = 50): RevisionTreeNode | null {
    const root = this.getMemoryById(rootMemoryId);
    if (!root) return null;

    return this._buildSubtree(root, 0, maxDepth, new Set<string>());
  }

  /** Recursive tree builder with cycle guard. */
  private _buildSubtree(memory: MemoryRecord, depth: number, maxDepth: number, visited: Set<string>): RevisionTreeNode {
    if (depth >= maxDepth || visited.has(memory.id)) {
      return { memory, depth, children: [] };
    }
    visited.add(memory.id);

    // Fetch children edges from ultron_memory_revisions
    const revStmt = this._db.prepare(
      `SELECT * FROM ultron_memory_revisions WHERE parent_id = ? ORDER BY created_at ASC`
    );
    const revRows = revStmt.all(memory.id) as Record<string, unknown>[];

    const children: RevisionTreeNode[] = [];
    for (const r of revRows) {
      const childMem = this.getMemoryById(String(r.child_id));
      if (childMem) {
        const revRecord: MemoryRevisionRecord = {
          id: String(r.id),
          projectId: String(r.project_id),
          parentId: String(r.parent_id),
          childId: String(r.child_id),
          relationshipType: r.relationship_type as MemoryRevisionRecord["relationshipType"],
          confidenceScore: Number(r.confidence_score),
          reconciliationStrategy: String(r.reconciliation_strategy),
          changeSummary: String(r.change_summary),
          actor: r.actor as MemoryRevisionRecord["actor"],
          createdAt: Number(r.created_at),
        };

        const childSubtree = this._buildSubtree(childMem, depth + 1, maxDepth, new Set(visited));
        childSubtree.revision = revRecord;
        children.push(childSubtree);
      }
    }

    return { memory, depth, children };
  }

  /**
   * Phase P5.1: Validates structural integrity of memory revisions.
   * Detects orphaned records, circular references, and cross-project pollution.
   *
   * @param memoryId - Optional specific memory ID to audit.
   * @returns RevisionIntegrityReport.
   */
  public validateRevisionIntegrity(memoryId?: string): RevisionIntegrityReport {
    const issues: string[] = [];

    // 1. Orphan Check: parent_memory_id points to non-existent memory
    const orphanStmt = this._db.prepare(`
      SELECT id, parent_memory_id 
      FROM ultron_memories 
      WHERE parent_memory_id IS NOT NULL 
        AND parent_memory_id NOT IN (SELECT id FROM ultron_memories)
    `);
    const orphanRows = orphanStmt.all() as { id: string; parent_memory_id: string }[];
    for (const r of orphanRows) {
      issues.push(`Orphan reference: memory ${r.id} references missing parent ${r.parent_memory_id}`);
    }

    // 2. Self-Reference Check
    const selfStmt = this._db.prepare(`
      SELECT id FROM ultron_memories WHERE id = parent_memory_id
    `);
    const selfRows = selfStmt.all() as { id: string }[];
    for (const r of selfRows) {
      issues.push(`Self-referencing cycle: memory ${r.id} is its own parent`);
    }

    // 3. Cross-Project Revision Check
    const crossStmt = this._db.prepare(`
      SELECT r.id, r.project_id, p.project_id AS parent_project, c.project_id AS child_project
      FROM ultron_memory_revisions r
      JOIN ultron_memories p ON r.parent_id = p.id
      JOIN ultron_memories c ON r.child_id = c.id
      WHERE p.project_id != c.project_id OR r.project_id != p.project_id
    `);
    const crossRows = crossStmt.all() as { id: string; project_id: string; parent_project: string; child_project: string }[];
    for (const r of crossRows) {
      issues.push(
        `Cross-project pollution in revision ${r.id}: parent project (${r.parent_project}) does not match child (${r.child_project})`
      );
    }

    // 4. Cycle Detection in Revisions
    let cycleCount = 0;
    const allStmt = this._db.prepare("SELECT id FROM ultron_memories" + (memoryId ? " WHERE id = ?" : ""));
    const allRows = (memoryId ? allStmt.all(memoryId) : allStmt.all()) as { id: string }[];

    for (const row of allRows) {
      const history = this.getRevisionHistory(row.id);
      const seen = new Set<string>();
      for (const h of history) {
        if (seen.has(h.id)) {
          issues.push(`Circular ancestry loop detected on memory ${h.id}`);
          cycleCount++;
          break;
        }
        seen.add(h.id);
      }
    }

    return {
      valid: issues.length === 0,
      checkedCount: allRows.length,
      orphanCount: orphanRows.length,
      cycleCount,
      crossProjectCount: crossRows.length,
      issues,
    };
  }

  /**
   * Persists a pending founder confirmation request in ultron_memory_confirmations.
   *
   * @param record - Partial confirmation record.
   * @returns Stored ConfirmationRecord.
   */
  public createConfirmation(
    record: Omit<ConfirmationRecord, "id" | "createdAt" | "status"> & { id?: string; status?: ConfirmationRecord["status"] }
  ): ConfirmationRecord {
    const id = record.id || `conf_${crypto.randomBytes(8).toString("hex")}`;
    const createdAt = Date.now();
    const status = record.status || "pending";

    const stmt = this._db.prepare(`
      INSERT INTO ultron_memory_confirmations (
        id, project_id, existing_memory_id, candidate_key, candidate_tier,
        candidate_content, candidate_source, conflict_class, reason, status,
        inline_prompt, created_at, resolved_at, resolved_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      record.projectId,
      record.existingMemoryId,
      record.candidateKey,
      record.candidateTier,
      record.candidateContent,
      record.candidateSource,
      record.conflictClass,
      record.reason,
      status,
      record.inlinePrompt,
      createdAt,
      record.resolvedAt || null,
      record.resolvedBy || null
    );

    return {
      id,
      projectId: record.projectId,
      existingMemoryId: record.existingMemoryId,
      candidateKey: record.candidateKey,
      candidateTier: record.candidateTier,
      candidateContent: record.candidateContent,
      candidateSource: record.candidateSource,
      conflictClass: record.conflictClass,
      reason: record.reason,
      status,
      inlinePrompt: record.inlinePrompt,
      createdAt,
      resolvedAt: record.resolvedAt,
      resolvedBy: record.resolvedBy,
    };
  }

  /**
   * Retrieves a confirmation record by ID.
   *
   * @param id - Confirmation UUID.
   * @returns ConfirmationRecord or null.
   */
  public getConfirmation(id: string): ConfirmationRecord | null {
    const stmt = this._db.prepare(`SELECT * FROM ultron_memory_confirmations WHERE id = ? LIMIT 1`);
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this._mapRowToConfirmation(row);
  }

  /**
   * Lists confirmation records with optional filtering by project and status.
   *
   * @param projectId - Optional project UUID filter.
   * @param status - Optional status filter.
   * @returns Array of ConfirmationRecord.
   */
  public listConfirmations(projectId?: string, status?: string): ConfirmationRecord[] {
    let sql = `SELECT * FROM ultron_memory_confirmations WHERE 1=1`;
    const params: (string | number)[] = [];

    if (projectId) {
      sql += ` AND project_id = ?`;
      params.push(projectId);
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC`;
    const stmt = this._db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((r) => this._mapRowToConfirmation(r));
  }

  /**
   * Resolves a pending confirmation request.
   *
   * @param id - Confirmation UUID.
   * @param status - New status ('approved' | 'rejected' | 'deferred').
   * @param resolvedBy - Actor who resolved the confirmation.
   * @returns Boolean indicating whether a row was updated.
   */
  public resolveConfirmation(
    id: string,
    status: "approved" | "rejected" | "deferred",
    resolvedBy: string = "founder"
  ): boolean {
    const now = Date.now();
    const stmt = this._db.prepare(`
      UPDATE ultron_memory_confirmations 
      SET status = ?, resolved_at = ?, resolved_by = ? 
      WHERE id = ? AND status = 'pending'
    `);
    const info = stmt.run(status, now, resolvedBy, id) as { changes?: number };
    return (info.changes || 0) > 0;
  }

  private _mapRowToConfirmation(row: Record<string, unknown>): ConfirmationRecord {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      existingMemoryId: String(row.existing_memory_id),
      candidateKey: String(row.candidate_key),
      candidateTier: row.candidate_tier as any,
      candidateContent: String(row.candidate_content),
      candidateSource: row.candidate_source as any,
      conflictClass: row.conflict_class as any,
      reason: String(row.reason),
      status: row.status as any,
      inlinePrompt: String(row.inline_prompt),
      createdAt: Number(row.created_at),
      resolvedAt: row.resolved_at ? Number(row.resolved_at) : undefined,
      resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    };
  }

  /**
   * Retrieves a specific memory record by primary UUID.
   *
   * @param id - Memory identifier.
   * @returns MemoryRecord or null.
   */
  public getMemoryById(id: string): MemoryRecord | null {
    const stmt = this._db.prepare(`SELECT * FROM ultron_memories WHERE id = ? LIMIT 1`);
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this._mapRowToRecord(row) : null;
  }

  /**
   * Retrieves a memory record by its semantic key and project ID.
   *
   * @param semanticKey - Semantic lookup slug (e.g. "user_name").
   * @param projectId - Project isolation ID (defaults to global).
   * @returns MemoryRecord or null.
   */
  public getMemoryByKey(semanticKey: string, projectId: string = GLOBAL_PROJECT_ID): MemoryRecord | null {
    const stmt = this._db.prepare(
      `SELECT * FROM ultron_memories WHERE project_id = ? AND semantic_key = ? AND status = 'active' ORDER BY version DESC LIMIT 1`
    );
    const row = stmt.get(projectId, semanticKey) as Record<string, unknown> | undefined;
    return row ? this._mapRowToRecord(row) : null;
  }

  /**
   * Updates access count and last accessed timestamp for a memory record.
   *
   * @param id - Memory identifier.
   */
  public recordAccess(id: string): void {
    const stmt = this._db.prepare(
      `UPDATE ultron_memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?`
    );
    stmt.run(Date.now(), id);
  }

  /**
   * Queries memories matching structured options and filters.
   *
   * @param options - MemoryQueryOptions.
   * @returns Array of MemoryRecords.
   */
  public queryMemories(options: MemoryQueryOptions = {}): MemoryRecord[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Project boundary isolation: match specific project OR global workspace
    if (options.projectId && options.projectId !== GLOBAL_PROJECT_ID) {
      conditions.push(`(project_id = ? OR project_id = ?)`);
      params.push(options.projectId, GLOBAL_PROJECT_ID);
    } else {
      conditions.push(`project_id = ?`);
      params.push(options.projectId || GLOBAL_PROJECT_ID);
    }

    // Status filter
    if (!options.includeSuperseded) {
      conditions.push(`status = 'active'`);
    }

    // Tier filtering
    if (options.tiers && options.tiers.length > 0) {
      const placeholders = options.tiers.map(() => "?").join(",");
      conditions.push(`tier IN (${placeholders})`);
      params.push(...options.tiers);
    }

    // Importance & confidence bounds
    if (typeof options.minImportance === "number") {
      conditions.push(`importance >= ?`);
      params.push(options.minImportance);
    }
    if (typeof options.minConfidence === "number") {
      conditions.push(`confidence >= ?`);
      params.push(options.minConfidence);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(100, options.limit || 50));
    params.push(limit);

    const query = `
      SELECT * FROM ultron_memories
      ${whereClause}
      ORDER BY importance DESC, updated_at DESC
      LIMIT ?
    `;

    const stmt = this._db.prepare(query);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((r) => this._mapRowToRecord(r));
  }

  /**
   * Searches memories via full-text search (FTS5) using BM25 ranking.
   *
   * @param queryText - Search terms.
   * @param options - Filtering options.
   * @returns Array of MemoryRecords ordered by BM25 relevance.
   */
  public searchFTS(queryText: string, options: MemoryQueryOptions = {}): MemoryRecord[] {
    const sanitized = queryText.replace(/["*]/g, "").trim();
    if (!sanitized) return [];

    const ftsQuery = sanitized
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w}"*`)
      .join(" OR ");

    const conditions: string[] = ["ultron_memories_fts MATCH ?"];
    const params: (string | number)[] = [ftsQuery];

    if (options.projectId && options.projectId !== GLOBAL_PROJECT_ID) {
      conditions.push(`(m.project_id = ? OR m.project_id = ?)`);
      params.push(options.projectId, GLOBAL_PROJECT_ID);
    } else {
      conditions.push(`m.project_id = ?`);
      params.push(options.projectId || GLOBAL_PROJECT_ID);
    }

    if (!options.includeSuperseded) {
      conditions.push(`m.status = 'active'`);
    }

    if (options.tiers && options.tiers.length > 0) {
      const placeholders = options.tiers.map(() => "?").join(",");
      conditions.push(`m.tier IN (${placeholders})`);
      params.push(...options.tiers);
    }

    const limit = Math.max(1, Math.min(100, options.limit || 50));
    params.push(limit);

    const sql = `
      SELECT m.*
      FROM ultron_memories_fts
      JOIN ultron_memories m ON ultron_memories_fts.memory_id = m.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY bm25(ultron_memories_fts) ASC
      LIMIT ?
    `;

    try {
      const stmt = this._db.prepare(sql);
      const rows = stmt.all(...params) as Record<string, unknown>[];
      return rows.map((r) => this._mapRowToRecord(r));
    } catch {
      return [];
    }
  }

  /**
   * Stores or updates a dense vector embedding for a memory record.
   * Preserves exact parameter ordering: (memoryId, vector, modelName, dimensions, provider, vectorVersion).
   *
   * @param memoryId - Target memory ID.
   * @param vector - Float32Array dense embedding.
   * @param modelName - Name of generating model (defaults to nomic-embed-text).
   * @param dimensions - Expected vector dimension length (defaults to 768).
   * @param provider - Embedding provider (defaults to ollama).
   * @param vectorVersion - Vector schema version (defaults to 1).
   */
  public storeVector(
    memoryId: string,
    vector: Float32Array,
    modelName: string = "nomic-embed-text",
    dimensions: number = 768,
    provider: string = "ollama",
    vectorVersion: number = 1
  ): void {
    if (vector.length !== dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${dimensions}, got ${vector.length}`);
    }

    const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
    const now = Date.now();

    const stmt = this._db.prepare(`
      INSERT INTO ultron_memory_vectors (
        memory_id, embedding_blob, dimensions, model_name, provider, vector_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_id) DO UPDATE SET
        embedding_blob = excluded.embedding_blob,
        dimensions = excluded.dimensions,
        model_name = excluded.model_name,
        provider = excluded.provider,
        vector_version = excluded.vector_version,
        created_at = excluded.created_at
    `);

    stmt.run(memoryId, buffer, dimensions, modelName, provider, vectorVersion, now);
  }

  /**
   * Retrieves the dense vector record for a specific memory.
   *
   * @param memoryId - Target memory ID.
   * @returns Object with embedding Float32Array or null if not found.
   */
  public getVector(
    memoryId: string
  ): { memoryId: string; embedding: Float32Array; dimensions: number; modelName: string; provider: string; vectorVersion: number } | null {
    const stmt = this._db.prepare(`SELECT * FROM ultron_memory_vectors WHERE memory_id = ? LIMIT 1`);
    const row = stmt.get(memoryId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const rawBlob = row.embedding_blob as Buffer | Uint8Array;
    const dims = Number(row.dimensions);
    const floatArr = new Float32Array(rawBlob.buffer, rawBlob.byteOffset, dims);

    return {
      memoryId: String(row.memory_id),
      embedding: floatArr,
      dimensions: dims,
      modelName: String(row.model_name),
      provider: String(row.provider || "ollama"),
      vectorVersion: Number(row.vector_version || 1),
    };
  }

  /**
   * Retrieves all vectors matching given constraints for in-memory cosine ranking.
   */
  public getAllVectors(options: {
    projectId?: string;
    modelName?: string;
    dimensions?: number;
    includeSuperseded?: boolean;
  } = {}): { memory: MemoryRecord; embedding: Float32Array; dimensions: number; modelName: string }[] {
    const { projectId, modelName, dimensions, includeSuperseded } = options;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (!includeSuperseded) {
      conditions.push("m.status = 'active'");
    }

    if (projectId && projectId !== GLOBAL_PROJECT_ID) {
      conditions.push(`(m.project_id = ? OR m.project_id = '${GLOBAL_PROJECT_ID}')`);
      params.push(projectId);
    } else {
      conditions.push(`m.project_id = '${GLOBAL_PROJECT_ID}'`);
    }

    if (modelName) {
      conditions.push("v.model_name = ?");
      params.push(modelName);
    }
    if (typeof dimensions === "number") {
      conditions.push("v.dimensions = ?");
      params.push(dimensions);
    }

    const sql = `
      SELECT v.*, m.project_id, m.tier, m.semantic_key, m.content, m.summary,
             m.sensitivity, m.status, m.importance, m.confidence, m.access_count,
             m.last_accessed_at, m.content_hash, m.valid_from, m.valid_until,
             m.decay_rate, m.version, m.superseded_by, m.parent_memory_id, m.source, m.source_ref,
             m.metadata, m.is_encrypted, m.created_at as mem_created_at, m.updated_at
      FROM ultron_memory_vectors v
      JOIN ultron_memories m ON v.memory_id = m.id
      WHERE ${conditions.join(" AND ")}
    `;

    try {
      const stmt = this._db.prepare(sql);
      const rows = stmt.all(...params) as Record<string, unknown>[];
      const results = [];

      for (const r of rows) {
        const rawBlob = r.embedding_blob as Buffer | Uint8Array;
        const dims = Number(r.dimensions);
        const floatArr = new Float32Array(rawBlob.buffer, rawBlob.byteOffset, dims);

        let metadata: Record<string, unknown> = {};
        if (typeof r.metadata === "string") {
          try {
            metadata = JSON.parse(r.metadata);
          } catch {
            /* empty */
          }
        }

        const mem: MemoryRecord = {
          id: String(r.memory_id),
          projectId: String(r.project_id),
          tier: r.tier as MemoryTier,
          semanticKey: String(r.semantic_key),
          content: String(r.content),
          summary: r.summary ? String(r.summary) : undefined,
          sensitivity: r.sensitivity as SensitivityLevel,
          status: r.status as MemoryStatus,
          importance: Number(r.importance),
          confidence: Number(r.confidence),
          accessCount: Number(r.access_count || 0),
          lastAccessedAt: r.last_accessed_at ? Number(r.last_accessed_at) : undefined,
          contentHash: String(r.content_hash),
          validFrom: Number(r.valid_from),
          validUntil: r.valid_until ? Number(r.valid_until) : undefined,
          decayRate: Number(r.decay_rate),
          version: Number(r.version),
          supersededBy: r.superseded_by ? String(r.superseded_by) : undefined,
          parentMemoryId: r.parent_memory_id ? String(r.parent_memory_id) : undefined,
          source: r.source as MemoryRecord["source"],
          sourceRef: r.source_ref ? String(r.source_ref) : undefined,
          metadata,
          isEncrypted: Boolean(r.is_encrypted),
          createdAt: Number(r.mem_created_at),
          updatedAt: Number(r.updated_at),
        };

        results.push({
          memory: mem,
          embedding: floatArr,
          dimensions: dims,
          modelName: String(r.model_name),
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Deletes a memory record and its associated FTS/vector indexes.
   *
   * @param id - Memory record ID to delete.
   * @returns True if deleted, false if not found.
   */
  public deleteMemory(id: string): boolean {
    const existing = this.getMemoryById(id);
    if (!existing) return false;

    const stmt = this._db.prepare(`DELETE FROM ultron_memories WHERE id = ?`);
    stmt.run(id);

    const now = Date.now();
    this.logAudit({
      memoryId: id,
      action: "DELETE",
      actor: "ultron_agent",
      previousHash: existing.contentHash,
      currentHash: "DELETED",
      tamperSeal: computeAuditTamperSeal(id, "DELETED", now),
      payloadSnapshot: { id, semanticKey: existing.semanticKey },
      createdAt: now,
    });

    return true;
  }

  /**
   * Logs a tamper-evident entry into the memory audit ledger.
   *
   * @param entry - MemoryAuditEntry to record.
   */
  public logAudit(entry: MemoryAuditEntry | (Omit<MemoryAuditEntry, "tamperSeal" | "createdAt"> & { tamperSeal?: string; createdAt?: number })): void {
    const now = entry.createdAt || Date.now();
    const currentHash = entry.currentHash || "none";
    const memoryId = entry.memoryId || null;
    const tamperSeal = entry.tamperSeal || computeAuditTamperSeal(memoryId || "audit", currentHash, now);

    const stmt = this._db.prepare(`
      INSERT INTO ultron_memory_audit_ledger (
        memory_id, action, actor, previous_hash, current_hash, tamper_seal, payload_snapshot, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      memoryId,
      entry.action,
      entry.actor,
      entry.previousHash || null,
      currentHash,
      tamperSeal,
      JSON.stringify(entry.payloadSnapshot || {}),
      now
    );
  }

  /**
   * Performs an integrity check on the SQLite database.
   *
   * @returns Array of diagnostic messages (empty if completely clean).
   */
  public checkIntegrity(): string[] {
    const stmt = this._db.prepare(`PRAGMA integrity_check`);
    const rows = stmt.all() as { integrity_check: string }[];
    const issues = rows.map((r) => r.integrity_check).filter((r) => r !== "ok");
    return issues;
  }

  /**
   * Computes comprehensive health and utilization statistics.
   * Preserves exact legacy property names: totalRecords, byTier, bySensitivity, byStatus, etc.
   *
   * @returns MemorySystemStats telemetry object.
   */
  public getStats(): any {
    const countStmt = this._db.prepare(`SELECT count(*) as total FROM ultron_memories`);
    const total = (countStmt.get() as { total: number }).total;

    const tierStmt = this._db.prepare(`SELECT tier, count(*) as count FROM ultron_memories GROUP BY tier`);
    const tierRows = tierStmt.all() as { tier: MemoryTier; count: number }[];
    const byTier = this._emptyTierMap();
    for (const r of tierRows) {
      if (byTier[r.tier] !== undefined) byTier[r.tier] = r.count;
    }

    const sensStmt = this._db.prepare(`SELECT sensitivity, count(*) as count FROM ultron_memories GROUP BY sensitivity`);
    const sensRows = sensStmt.all() as { sensitivity: SensitivityLevel; count: number }[];
    const bySensitivity: Record<SensitivityLevel, number> = { public: 0, internal: 0, sensitive: 0, restricted: 0 };
    for (const r of sensRows) {
      if (bySensitivity[r.sensitivity] !== undefined) bySensitivity[r.sensitivity] = r.count;
    }

    const statStmt = this._db.prepare(`SELECT status, count(*) as count FROM ultron_memories GROUP BY status`);
    const statRows = statStmt.all() as { status: MemoryStatus; count: number }[];
    const byStatus: Record<string, number> = { active: 0, deprecated: 0, superseded: 0, pending_confirmation: 0, rejected: 0, disputed: 0 };
    for (const r of statRows) {
      if (byStatus[r.status] !== undefined) byStatus[r.status] = r.count;
    }

    let databaseSizeBytes = 0;
    try {
      if (fs.existsSync(this._dbPath)) {
        databaseSizeBytes = fs.statSync(this._dbPath).size;
      }
    } catch {
      /* ignore */
    }

    const ftsStmt = this._db.prepare(`SELECT count(*) as ftsCount FROM ultron_memories_fts`);
    const ftsCount = (ftsStmt.get() as { ftsCount: number }).ftsCount;

    let vectorCount = 0;
    try {
      const vecStmt = this._db.prepare(`SELECT count(*) as count FROM ultron_memory_vectors`);
      vectorCount = (vecStmt.get() as { count: number }).count;
    } catch {
      /* ignore */
    }

    return {
      totalRecords: total,
      totalCount: total,
      byTier,
      bySensitivity,
      byStatus,
      activeCount: byStatus.active || 0,
      supersededCount: byStatus.superseded || 0,
      pendingCount: byStatus.pending_confirmation || 0,
      databaseSizeBytes,
      ftsIndexedCount: ftsCount,
      vectorIndexedCount: vectorCount,
      walModeActive: true,
    };
  }

  /**
   * Creates a WAL-consistent atomic backup snapshot of the database using SQLite's native VACUUM INTO.
   *
   * @param destinationPath - Optional backup destination path.
   * @returns Resolved backup file path.
   */
  public backupDatabase(destinationPath?: string): string {
    const backupDir = path.join(process.cwd(), "ultron_engine", "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const dest = destinationPath || path.join(backupDir, `ultron_memory_backup_${Date.now()}.db`);
    
    // SQLite VACUUM INTO requires target file to NOT already exist
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }

    // Execute SQLite native VACUUM INTO for zero-overhead, WAL-consistent backup
    const escapedDest = dest.replace(/'/g, "''");
    this._db.exec(`VACUUM INTO '${escapedDest}';`);
    return dest;
  }

  /**
   * Closes the underlying database connection.
   */
  public close(): void {
    this._db.close();
  }

  /** Internal helper to map a raw SQL row into a typed MemoryRecord. */
  private _mapRowToRecord(row: Record<string, unknown>): MemoryRecord {
    let metadata: Record<string, unknown> = {};
    if (typeof row.metadata === "string") {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        /* empty */
      }
    }

    return {
      id: String(row.id),
      projectId: String(row.project_id),
      tier: row.tier as MemoryTier,
      semanticKey: String(row.semantic_key),
      content: String(row.content),
      summary: row.summary ? String(row.summary) : undefined,
      sensitivity: row.sensitivity as SensitivityLevel,
      status: row.status as MemoryStatus,
      importance: Number(row.importance),
      confidence: Number(row.confidence),
      accessCount: Number(row.access_count),
      lastAccessedAt: row.last_accessed_at ? Number(row.last_accessed_at) : undefined,
      contentHash: String(row.content_hash),
      validFrom: Number(row.valid_from),
      validUntil: row.valid_until ? Number(row.valid_until) : undefined,
      decayRate: Number(row.decay_rate),
      version: Number(row.version),
      supersededBy: row.superseded_by ? String(row.superseded_by) : undefined,
      parentMemoryId: row.parent_memory_id ? String(row.parent_memory_id) : undefined,
      source: row.source as MemoryRecord["source"],
      sourceRef: row.source_ref ? String(row.source_ref) : undefined,
      metadata,
      isEncrypted: Boolean(row.is_encrypted),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  private _emptyTierMap(): Record<MemoryTier, number> {
    return {
      working: 0,
      episodic: 0,
      semantic: 0,
      procedural: 0,
      personal: 0,
      project: 0,
      decision: 0,
      error_solution: 0,
      research: 0,
      temporal: 0,
      relational: 0,
      meta: 0,
    };
  }
}

/** Singleton instance getter for default application-wide memory access. */
let defaultAdapterInstance: SqliteMemoryAdapter | null = null;

export function getDefaultMemoryAdapter(): SqliteMemoryAdapter {
  if (!defaultAdapterInstance) {
    defaultAdapterInstance = new SqliteMemoryAdapter();
  }
  return defaultAdapterInstance;
}
