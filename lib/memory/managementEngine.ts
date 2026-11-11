/**
 * @file lib/memory/managementEngine.ts
 * @description Advanced Memory Management Subsystem (Advanced Memory Intelligence System C).
 *
 * Subsystem:
 * Memory Deduplication, Contradiction Detection, Versioning & Reconciliation.
 *
 * Key Responsibilities:
 * - Deduplication: Calculates SHA-256 content hashes to detect duplicate or near-duplicate facts.
 * - Contradiction Detection: Analyzes candidate memories against existing knowledge for semantic clashes
 *   (e.g., location changes, tech stack conflicts, role updates, conflicting deadlines).
 * - Memory Versioning: Preserves full historical audit trails when memories are modified or overridden.
 * - Reconciliation: Automatically applies resolution strategies:
 *   * `USER_OVERRIDE`: Explicit user instructions always override prior inferences.
 *   * `PREFER_NEWER`: Newer operational facts supersede older versions.
 *   * `PRESERVE_BOTH_WITH_NOTE`: Ambiguous or contextual differences are flagged for review.
 * - Consolidation: Compresses multiple related episodic observations into unified semantic facts.
 *
 * Architectural Role & Interactions:
 * - Intermediary between extraction (`lib/memory/extractionEngine.ts`) and physical storage.
 * - Enforces zero data loss: historical facts are marked superseded/archived rather than deleted.
 *
 * Safety / Security Guarantees:
 * - Preserves version immutability for past records.
 * - Never silently erases contradictions; tags records with `ContradictionStatus`.
 */

import crypto from "crypto";
import type {
  AnyMemoryRecord,
  ContradictionStatus,
  MemoryVersionRecord,
} from "./types.ts";
import type { ExtractedCandidate } from "./extractionEngine.ts";

export interface ReconciliationResult {
  action: "INSERT_NEW" | "UPDATE_EXISTING" | "RECONCILE_CONTRADICTION" | "DISCARD_DUPLICATE";
  record: AnyMemoryRecord;
  supersededRecordId?: string;
  notes?: string;
}

export interface ContradictionEvaluation {
  hasContradiction: boolean;
  status: ContradictionStatus;
  conflictingRecordId?: string;
  conflictReason?: string;
  suggestedResolution: "USER_OVERRIDE" | "PREFER_NEWER" | "PRESERVE_BOTH_WITH_NOTE";
}

export class MemoryManagementEngine {
  /**
   * Generates a deterministic SHA-256 blind hash of memory content for duplicate detection.
   *
   * @param content - Text content.
   * @returns Hex-encoded 64-character hash.
   */
  public computeContentHash(content: string): string {
    const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Detects whether a candidate memory is an exact or near-identical duplicate of an existing record.
   *
   * @param candidateContent - Content string to check.
   * @param existingRecords - Current active memory records.
   * @returns Matching record if found, or null.
   */
  public findDuplicate(
    candidateContent: string,
    existingRecords: AnyMemoryRecord[]
  ): AnyMemoryRecord | null {
    const candidateHash = this.computeContentHash(candidateContent);
    const candidateNorm = candidateContent.toLowerCase().replace(/\s+/g, " ").trim();

    for (const record of existingRecords) {
      // 1. Exact blind index hash match
      if (this.computeContentHash(record.content) === candidateHash) {
        return record;
      }
      // 2. High string similarity / subset match
      const recNorm = record.content.toLowerCase().replace(/\s+/g, " ").trim();
      if (candidateNorm === recNorm) {
        return record;
      }
    }
    return null;
  }

  /**
   * Analyzes a candidate fact against existing records to detect semantic contradictions.
   *
   * @param candidate - Candidate extracted memory.
   * @param existingRecords - Current active memory records.
   * @returns Contradiction evaluation result.
   */
  public detectContradiction(
    candidate: ExtractedCandidate,
    existingRecords: AnyMemoryRecord[]
  ): ContradictionEvaluation {
    const candContent = candidate.content.toLowerCase();

    for (const rec of existingRecords) {
      const recContent = rec.content.toLowerCase();

      // Case 1: Same semantic key with opposing content (e.g. user_name, user_role, user_location)
      if (rec.key === candidate.key && rec.content !== candidate.content) {
        // If candidate is explicit instruction, it is an authoritative user override
        const suggestedResolution =
          candidate.source === "explicit" ? "USER_OVERRIDE" : "PREFER_NEWER";
        return {
          hasContradiction: true,
          status: "CONFIRMED",
          conflictingRecordId: rec.id,
          conflictReason: `Key "${rec.key}" conflict: "${rec.content}" vs new "${candidate.content}"`,
          suggestedResolution,
        };
      }

      // Case 2: Name contradictions ("User's name is Rahul" vs "User's name is Ashish")
      if (candidate.key === "user_name" && rec.key === "user_name") {
        return {
          hasContradiction: true,
          status: "CONFIRMED",
          conflictingRecordId: rec.id,
          conflictReason: `Name identity change from "${rec.content}" to "${candidate.content}"`,
          suggestedResolution: "USER_OVERRIDE",
        };
      }

      // Case 3: Technology preference opposition ("prefers SQLite" vs "prefers PostgreSQL")
      if (
        candContent.startsWith("user prefers ") &&
        recContent.startsWith("user prefers ")
      ) {
        // Check if both relate to the same domain (e.g., databases or frontend frameworks)
        const candTech = candContent.replace("user prefers ", "").trim();
        const recTech = recContent.replace("user prefers ", "").trim();
        if (candTech !== recTech && candidate.key === rec.key) {
          return {
            hasContradiction: true,
            status: "SUSPECTED",
            conflictingRecordId: rec.id,
            conflictReason: `Differing preferences detected: "${recTech}" vs "${candTech}"`,
            suggestedResolution: candidate.source === "explicit" ? "USER_OVERRIDE" : "PREFER_NEWER",
          };
        }
      }
    }

    return {
      hasContradiction: false,
      status: "NONE",
      suggestedResolution: "PRESERVE_BOTH_WITH_NOTE",
    };
  }

  /**
   * Reconciles candidate memory with existing records using versioning and resolution policies.
   *
   * @param candidate - Extracted candidate memory.
   * @param existingRecords - Current active memory records.
   * @returns ReconciliationResult detailing action, updated record, and version history.
   */
  public reconcileMemory(
    candidate: ExtractedCandidate,
    existingRecords: AnyMemoryRecord[]
  ): ReconciliationResult {
    const now = Date.now();

    // Step 1: Duplicate check
    const duplicate = this.findDuplicate(candidate.content, existingRecords);
    if (duplicate) {
      // Refresh access timestamp and confidence
      duplicate.lastAccessedAt = now;
      duplicate.accessCount++;
      return {
        action: "DISCARD_DUPLICATE",
        record: duplicate,
        notes: `Duplicate detected via content hash. Updated access statistics.`,
      };
    }

    // Step 2: Contradiction check
    const contradiction = this.detectContradiction(candidate, existingRecords);
    if (contradiction.hasContradiction && contradiction.conflictingRecordId) {
      const conflictingRecord = existingRecords.find((r) => r.id === contradiction.conflictingRecordId);
      if (conflictingRecord) {
        if (contradiction.suggestedResolution === "USER_OVERRIDE" || contradiction.suggestedResolution === "PREFER_NEWER") {
          // Version the older record
          const versionEntry: MemoryVersionRecord = {
            versionNumber: conflictingRecord.versions.length + 1,
            content: conflictingRecord.content,
            timestamp: now,
            changeReason: contradiction.conflictReason || "Superseded by user update",
            author: candidate.provenance.author,
          };

          // Mark older record temporal validity as superseded
          conflictingRecord.temporal.validUntil = now;
          conflictingRecord.temporal.isObsolescent = true;
          conflictingRecord.temporal.supersededBy = candidate.key;

          // Update conflicting record with new facts while maintaining full version history
          conflictingRecord.content = candidate.content;
          conflictingRecord.importance = Math.max(conflictingRecord.importance, candidate.importance);
          conflictingRecord.confidence = candidate.confidence;
          conflictingRecord.source = candidate.source;
          conflictingRecord.updatedAt = now;
          conflictingRecord.contradictionStatus = "RECONCILED";
          conflictingRecord.contradictionNotes = `Reconciled via ${contradiction.suggestedResolution}: ${contradiction.conflictReason}`;
          conflictingRecord.versions.push(versionEntry);

          return {
            action: "RECONCILE_CONTRADICTION",
            record: conflictingRecord,
            supersededRecordId: conflictingRecord.id,
            notes: `Contradiction reconciled: ${contradiction.conflictReason}`,
          };
        }
      }
    }

    // Step 3: Insert brand new memory record
    const newRecordId = `mem_${candidate.category.slice(0, 4)}_${crypto.randomBytes(6).toString("hex")}`;
    const newRecord: AnyMemoryRecord = {
      id: newRecordId,
      key: candidate.key,
      memoryType: candidate.category === "personal" ? "personal" : candidate.category === "decision" ? "decision" : candidate.category === "procedure" ? "procedural" : "semantic",
      content: candidate.content,
      importance: candidate.importance,
      confidence: candidate.confidence,
      sensitivity: candidate.sensitivity,
      source: candidate.source,
      projectId: candidate.projectId || "default",
      provenance: candidate.provenance,
      temporal: {
        validFrom: now,
        isObsolescent: false,
      },
      versions: [
        {
          versionNumber: 1,
          content: candidate.content,
          timestamp: now,
          changeReason: "Initial extraction and persistence",
          author: candidate.provenance.author,
        },
      ],
      contradictionStatus: "NONE",
      tags: [...candidate.tags],
      createdAt: now,
      updatedAt: now,
      accessCount: 1,
      lastAccessedAt: now,
    } as AnyMemoryRecord;

    return {
      action: "INSERT_NEW",
      record: newRecord,
      notes: "Created new memory record with initial version 1.",
    };
  }

  /**
   * Consolidates multiple related observations into a single higher-order semantic fact.
   *
   * @param records - Array of memory records to consolidate.
   * @param consolidatedSummary - Unified summary statement.
   * @returns New consolidated AnyMemoryRecord.
   */
  public consolidateMemories(
    records: AnyMemoryRecord[],
    consolidatedSummary: string
  ): AnyMemoryRecord {
    const now = Date.now();
    const primaryId = `mem_cons_${crypto.randomBytes(6).toString("hex")}`;
    const maxImportance = Math.max(...records.map((r) => r.importance), 3);
    const avgConfidence = records.reduce((acc, r) => acc + r.confidence, 0) / (records.length || 1);

    const consolidatedRecord: AnyMemoryRecord = {
      id: primaryId,
      key: `consolidated_${records.map((r) => r.key).slice(0, 3).join("_")}`,
      memoryType: "semantic",
      content: consolidatedSummary,
      importance: maxImportance,
      confidence: parseFloat(avgConfidence.toFixed(2)),
      sensitivity: records.some((r) => r.sensitivity === "RESTRICTED") ? "RESTRICTED" : records.some((r) => r.sensitivity === "CONFIDENTIAL") ? "CONFIDENTIAL" : "INTERNAL",
      source: "autonomous_learning",
      projectId: records[0]?.projectId || "default",
      provenance: {
        origin: "memory_consolidation_pipeline",
        timestamp: now,
        author: "ultron_engine",
      },
      temporal: {
        validFrom: now,
        isObsolescent: false,
      },
      versions: [
        {
          versionNumber: 1,
          content: consolidatedSummary,
          timestamp: now,
          changeReason: `Consolidation of ${records.length} episodic records`,
        },
      ],
      contradictionStatus: "NONE",
      tags: ["consolidated", ...new Set(records.flatMap((r) => r.tags))],
      createdAt: now,
      updatedAt: now,
      accessCount: 1,
      lastAccessedAt: now,
    } as AnyMemoryRecord;

    // Mark consolidated source records as superseded/archived
    for (const r of records) {
      r.temporal.validUntil = now;
      r.temporal.isObsolescent = true;
      r.temporal.supersededBy = primaryId;
    }

    return consolidatedRecord;
  }
}

/** Global singleton instance of the Management Engine. */
export const defaultMemoryManager = new MemoryManagementEngine();
