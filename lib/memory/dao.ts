/**
 * @file lib/memory/dao.ts
 * @description Unified Data Access Object (DAO) Interface for ULTRON Advanced Memory System.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P1–P5 Core).
 *
 * Key Responsibilities:
 * - Provides the high-level, technology-agnostic interface for storing, querying, and managing memories.
 * - Enforces the Dual-Adapter pattern: delegates by default to `SqliteMemoryAdapter` (embedded, zero-daemon),
 *   while supporting future enterprise PostgreSQL adapters via configuration.
 * - Implements Reciprocal Rank Fusion (RRF) and Ebbinghaus temporal decay re-ranking.
 * - Exposes Phase P5 atomic revision management, branch navigation, and integrity validation.
 * - Serves as the primary integration bridge for `app/api/chat/route.ts` and `app/api/memory/route.ts`.
 *
 * Architectural Role & Safety Guarantees:
 * - Single point of entry for memory persistence in the application layer.
 * - Protects against memory corruption through atomic transactions and blind-index deduplication.
 * - Preserves existing authentication and session boundaries (fail-closed token checks).
 */

import { getDefaultMemoryAdapter, SqliteMemoryAdapter } from "./sqliteAdapter.ts";
import { HybridMemorySearcher, getHybridMemorySearcher } from "./hybridSearch.ts";
import type {
  MemoryRecord,
  MemoryQueryOptions,
  HybridSearchOptions,
  MemorySystemStats,
  ScoredMemoryResult,
  MemoryTier,
  CreateRevisionOptions,
  RevisionTreeNode,
  RevisionIntegrityReport,
} from "./types.ts";
import { GLOBAL_PROJECT_ID } from "./schema.ts";

/**
 * High-Level Memory Data Access Object coordinating storage, indexing, and retrieval.
 */
export class MemoryDAO {
  private _adapter: SqliteMemoryAdapter;
  private _searcher: HybridMemorySearcher;

  constructor(adapter?: SqliteMemoryAdapter, searcher?: HybridMemorySearcher) {
    this._adapter = adapter || getDefaultMemoryAdapter();
    this._searcher = searcher || new HybridMemorySearcher({ adapter: this._adapter });
  }

  /**
   * Returns the underlying SqliteMemoryAdapter instance.
   */
  public get adapter(): SqliteMemoryAdapter {
    return this._adapter;
  }

  /**
   * Stores a new memory record with validation and blind-index deduplication.
   *
   * @param record - Partial memory record to store.
   * @returns Canonical stored MemoryRecord.
   */
  public async store(
    record: Omit<MemoryRecord, "id" | "contentHash" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      version?: number;
      createdAt?: number;
      updatedAt?: number;
    }
  ): Promise<MemoryRecord> {
    return this._adapter.storeMemory(record);
  }

  /**
   * Retrieves a specific memory record by unique ID.
   *
   * @param id - Memory identifier.
   * @returns MemoryRecord or null.
   */
  public async getById(id: string): Promise<MemoryRecord | null> {
    return this._adapter.getMemoryById(id);
  }

  /**
   * Updates access count and last accessed time for a memory record.
   *
   * @param id - Memory record ID.
   */
  public async recordAccess(id: string): Promise<void> {
    this._adapter.recordAccess(id);
  }

  /**
   * Retrieves a memory record by semantic key slug within a project.
   *
   * @param key - Semantic slug (e.g. "user_name").
   * @param projectId - Project UUID.
   * @returns MemoryRecord or null.
   */
  public async getByKey(key: string, projectId: string = GLOBAL_PROJECT_ID): Promise<MemoryRecord | null> {
    return this._adapter.getMemoryByKey(key, projectId);
  }

  /**
   * Searches memories using parallel hybrid retrieval: FTS5 BM25, vector cosine similarity, and RRF.
   *
   * @param query - Search keywords or statement.
   * @param options - Hybrid filtering and scoring options.
   * @returns Array of prioritized ScoredMemoryResults.
   */
  public async search(query: string, options: HybridSearchOptions = {}): Promise<ScoredMemoryResult[]> {
    return this._searcher.search(query, options);
  }

  /**
   * High-level recall returning prioritized memories formatted for immediate context usage.
   *
   * @param query - Search keywords or statement.
   * @param options - Hybrid filtering and scoring options.
   * @returns Array of MemoryRecords.
   */
  public async recall(query: string, options: HybridSearchOptions = {}): Promise<MemoryRecord[]> {
    const scored = await this.search(query, options);
    return scored.map((s) => s.memory);
  }

  /**
   * Queries memories matching structured attribute filters.
   *
   * @param options - Filter options.
   * @returns Array of MemoryRecords.
   */
  public async query(options: MemoryQueryOptions = {}): Promise<MemoryRecord[]> {
    return this._adapter.queryMemories(options);
  }

  /**
   * Supersedes an existing memory record, creating an immutable new version node.
   * Wrapped in an atomic SQLite transaction.
   *
   * @param oldId - Target memory ID.
   * @param newContent - Revised content string.
   * @param reason - Rationale for supersession.
   * @returns Newly created revision MemoryRecord.
   */
  public async supersede(oldId: string, newContent: string, reason?: string): Promise<MemoryRecord> {
    return this._adapter.supersedeMemory(oldId, newContent, reason);
  }

  /**
   * Phase P5.1: Creates an atomic revision supporting branching, refactoring, and rollback.
   *
   * @param options - Revision specifications including parentId, newContent, and relationshipType.
   * @returns Newly created revision MemoryRecord.
   */
  public async createRevision(options: CreateRevisionOptions): Promise<MemoryRecord> {
    return this._adapter.createRevision(options);
  }

  /**
   * Phase P5.1: Retrieves full chronological revision ancestry back to genesis root.
   *
   * @param memoryId - Target memory ID.
   * @returns Array of MemoryRecords ordered from root (v1) to target.
   */
  public async getRevisionHistory(memoryId: string): Promise<MemoryRecord[]> {
    return this._adapter.getRevisionHistory(memoryId);
  }

  /**
   * Phase P5.1: Retrieves the current active revision for a semantic key.
   *
   * @param semanticKey - Target semantic key.
   * @param projectId - Project isolation ID.
   * @returns MemoryRecord or null.
   */
  public async getCurrentRevision(semanticKey: string, projectId: string = GLOBAL_PROJECT_ID): Promise<MemoryRecord | null> {
    return this._adapter.getCurrentRevision(semanticKey, projectId);
  }

  /**
   * Phase P5.1: Retrieves the direct parent/predecessor revision of a memory.
   *
   * @param memoryId - Target memory ID.
   * @returns MemoryRecord or null.
   */
  public async getPreviousRevision(memoryId: string): Promise<MemoryRecord | null> {
    return this._adapter.getPreviousRevision(memoryId);
  }

  /**
   * Phase P5.1: Retrieves competing revision branches sharing the same parent.
   *
   * @param memoryId - Target memory ID.
   * @returns Array of sibling MemoryRecords.
   */
  public async getCompetingRevisions(memoryId: string): Promise<MemoryRecord[]> {
    return this._adapter.getCompetingRevisions(memoryId);
  }

  /**
   * Phase P5.1: Retrieves the complete hierarchical revision tree (DAG).
   *
   * @param rootMemoryId - Root or anchor memory ID.
   * @param maxDepth - Maximum recursion depth (default 50).
   * @returns RevisionTreeNode or null.
   */
  public async getRevisionTree(rootMemoryId: string, maxDepth: number = 50): Promise<RevisionTreeNode | null> {
    return this._adapter.getRevisionTree(rootMemoryId, maxDepth);
  }

  /**
   * Phase P5.1: Validates structural integrity of revisions (cycles, orphans, cross-project).
   *
   * @param memoryId - Optional target memory ID to check specific branch.
   * @returns RevisionIntegrityReport.
   */
  public async validateRevisionIntegrity(memoryId?: string): Promise<RevisionIntegrityReport> {
    return this._adapter.validateRevisionIntegrity(memoryId);
  }

  /**
   * Deletes a memory record by ID.
   *
   * @param id - Memory ID to delete.
   * @returns True if deleted.
   */
  public async delete(id: string): Promise<boolean> {
    return this._adapter.deleteMemory(id);
  }

  /**
   * Returns system health and utilization statistics.
   *
   * @returns MemorySystemStats object.
   */
  public async getStats(): Promise<MemorySystemStats> {
    return this._adapter.getStats();
  }

  /**
   * Performs an internal SQLite integrity check.
   *
   * @returns Array of diagnostic warnings (empty if healthy).
   */
  public async checkIntegrity(): Promise<string[]> {
    return this._adapter.checkIntegrity();
  }

  /**
   * Creates an atomic backup snapshot of the memory database.
   *
   * @param destinationPath - Optional destination file path.
   * @returns Path to saved backup snapshot.
   */
  public async backup(destinationPath?: string): Promise<string> {
    return this._adapter.backupDatabase(destinationPath);
  }
}

/** Singleton default DAO instance for application-wide consumption. */
let defaultMemoryDAOInstance: MemoryDAO | null = null;

export function getMemoryDAO(): MemoryDAO {
  if (!defaultMemoryDAOInstance) {
    defaultMemoryDAOInstance = new MemoryDAO();
  }
  return defaultMemoryDAOInstance;
}
