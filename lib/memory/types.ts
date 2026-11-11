/**
 * @file lib/memory/types.ts
 * @description Canonical Type Definitions for the ULTRON Advanced Memory System.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P1–P5 Core).
 *
 * Key Responsibilities:
 * - Defines all 12 memory tiers and their lifecycle properties.
 * - Outlines data structures for vector embeddings, entity graphs, ADRs, and error solutions.
 * - Establishes contracts for cryptographic audit trails, blind indexing, and search parameters.
 * - Defines Phase P5 revision relationships, DAG revision trees, and atomic transaction parameters.
 *
 * Architectural Role & Safety Guarantees:
 * - Serves as the single source of truth for TypeScript types across the memory domain.
 * - Enforces compile-time guarantees on sensitive data handling and immutability.
 * - Prevents circular imports by containing purely structural definitions.
 */

/** The 12 Canonical Memory Tiers in the ULTRON Architecture. */
export type MemoryTier =
  | "working"
  | "episodic"
  | "semantic"
  | "procedural"
  | "personal"
  | "project"
  | "decision"
  | "error_solution"
  | "research"
  | "temporal"
  | "relational"
  | "meta";

/** Sensitivity classification for data segregation and zero-plaintext guarantees. */
export type SensitivityLevel = "public" | "internal" | "sensitive" | "restricted";

/** Lifecycle status of a memory record. */
export type MemoryStatus =
  | "active"
  | "deprecated"
  | "superseded"
  | "pending_confirmation"
  | "rejected"
  | "disputed";

/** Provenance origin source type. */
export type MemorySourceType =
  | "explicit_user"
  | "inferred_dialogue"
  | "research_agent"
  | "tool_execution"
  | "system_rule"
  | "legacy_migration";

/**
 * Phase P5: Revision Relationship Classification.
 * Defines the semantic nature of how a child revision relates to its parent.
 */
export type RevisionRelationshipType =
  | "supersedes"   // Direct replacement / factual correction of parent
  | "refines"      // Added precision or sub-detail without invalidating parent fact
  | "forks"        // Competing hypothesis or alternative scenario branch
  | "merges"       // Synthesis of two or more previous memories
  | "rolls_back";  // Reinstatement of an older revision state

/**
 * Phase P5: Actor initiating the memory revision.
 */
export type RevisionActor = "founder" | "agent" | "system" | "consensus";

/**
 * Phase P5: Dedicated Revision Relationship Record.
 * Maps to `ultron_memory_revisions` table to support arbitrary DAG branching.
 */
export interface MemoryRevisionRecord {
  /** Unique revision edge identifier (e.g. "rev_" + UUID). */
  id: string;
  /** Project boundary isolation UUID. */
  projectId: string;
  /** Parent memory identifier (the prior state or branch anchor). */
  parentId: string;
  /** Child memory identifier (the newly created revision). */
  childId: string;
  /** The semantic relationship connecting parent to child. */
  relationshipType: RevisionRelationshipType;
  /** Confidence score of the revision (0.0 to 1.0). */
  confidenceScore: number;
  /** Strategy or policy applied (e.g. "auto_supersede", "founder_confirmed"). */
  reconciliationStrategy: string;
  /** Human-readable explanation of why this revision was made. */
  changeSummary: string;
  /** Entity that authorized or triggered this revision. */
  actor: RevisionActor;
  /** Unix timestamp in milliseconds when this revision edge was recorded. */
  createdAt: number;
}

/**
 * Phase P5: Options for creating an atomic revision.
 */
export interface CreateRevisionOptions {
  /** Existing memory ID to revise or branch from. */
  parentId: string;
  /** Revised or branched content string. */
  newContent: string;
  /** Relationship type (defaults to "supersedes"). */
  relationshipType?: RevisionRelationshipType;
  /** Reason or summary of the change. */
  reason?: string;
  /** Actor initiating revision (defaults to "agent"). */
  actor?: RevisionActor;
  /** Confidence score of the new revision (0.0 to 1.0, defaults to parent confidence). */
  confidenceScore?: number;
  /** Reconciliation strategy applied (defaults to "atomic_supersession"). */
  reconciliationStrategy?: string;
  /** Target status of the new revision (defaults to 'active'). */
  status?: MemoryStatus;
  /** Optimistic concurrency control: expected version of parent to prevent stale overwrites. */
  expectedVersion?: number;
  /** Idempotency key to safely deduplicate replayed requests. */
  idempotencyKey?: string;
  /** Optional override for tier (defaults to parent tier). */
  tier?: MemoryTier;
  /** Optional override for semanticKey (defaults to parent semanticKey). */
  semanticKey?: string;
  /** Optional override for projectId (defaults to parent projectId). */
  projectId?: string;
  /** Optional summary string. */
  summary?: string;
  /** Optional sensitivity level (defaults to parent sensitivity). */
  sensitivity?: SensitivityLevel;
  /** Optional importance score (1 to 5, defaults to parent importance). */
  importance?: number;
  /** Optional expiration timestamp. */
  validUntil?: number;
  /** Additional custom metadata dictionary. */
  metadata?: Record<string, unknown>;
}

/**
 * Phase P5: Hierarchical Revision Tree Node for DAG inspection.
 */
export interface RevisionTreeNode {
  /** The memory record at this node. */
  memory: MemoryRecord;
  /** Revision link metadata from parent to this node (null for root/genesis). */
  revision?: MemoryRevisionRecord;
  /** Depth level relative to query root (0 for root). */
  depth: number;
  /** Array of descendant child nodes. */
  children: RevisionTreeNode[];
}

/**
 * Phase P5: Structural integrity report for revision trees and foreign keys.
 */
export interface RevisionIntegrityReport {
  /** Overall validity flag: true if no structural anomalies detected. */
  valid: boolean;
  /** Total number of memory records verified. */
  checkedCount: number;
  /** Number of records referencing non-existent parent IDs. */
  orphanCount: number;
  /** Number of circular reference loops detected. */
  cycleCount: number;
  /** Number of revision links spanning mismatched project IDs. */
  crossProjectCount: number;
  /** Detailed error or warning messages. */
  issues: string[];
}

/** Canonical Memory Record stored in the primary database. */
export interface MemoryRecord {
  /** Unique primary identifier (e.g. "mem_" + UUID or hex). */
  id: string;
  /** Project boundary isolation UUID (defaults to Global Workspace). */
  projectId: string;
  /** Cognitive classification tier. */
  tier: MemoryTier;
  /** Semantic grouping key for deterministic identity/fact lookup. */
  semanticKey: string;
  /** Plaintext content of the memory (subject to secret masking). */
  content: string;
  /** Optional concise summary or distilled insight. */
  summary?: string;
  /** Data sensitivity tier. */
  sensitivity: SensitivityLevel;
  /** Current lifecycle status. */
  status: MemoryStatus;
  /** Retrieval priority weight (1 = lowest, 5 = highest). */
  importance: number;
  /** Confidence rating in extraction accuracy (0.0 to 1.0). */
  confidence: number;
  /** Cumulative access frequency counter. */
  accessCount: number;
  /** Unix timestamp in milliseconds of most recent retrieval. */
  lastAccessedAt?: number;
  /** HMAC-SHA256 blind index hash for O(1) deduplication. */
  contentHash: string;
  /** Unix timestamp in milliseconds when this memory becomes valid. */
  validFrom: number;
  /** Optional Unix timestamp in milliseconds when memory expires. */
  validUntil?: number;
  /** Half-life decay constant for temporal relevance scoring. */
  decayRate: number;
  /** Monotonically increasing revision version counter (starts at 1). */
  version: number;
  /** Optional reference to the memory record that superseded this one. */
  supersededBy?: string;
  /**
   * Phase P5: Direct foreign key reference to the parent memory ID.
   * Enables rapid single-hop reverse traversal (child -> parent).
   */
  parentMemoryId?: string;
  /** Provenance origin source type. */
  source: MemorySourceType;
  /** Reference URI, turn ID, or file path where this memory originated. */
  sourceRef?: string;
  /** Structured arbitrary metadata payload. */
  metadata: Record<string, unknown>;
  /** Flag indicating whether the database row is stored as an encrypted blob. */
  isEncrypted: boolean;
  /** Unix timestamp in milliseconds of initial record creation. */
  createdAt: number;
  /** Unix timestamp in milliseconds of most recent record mutation. */
  updatedAt: number;
}

/** Query options for searching and filtering memory records. */
export interface MemoryQueryOptions {
  projectId?: string;
  tiers?: MemoryTier[];
  minImportance?: number;
  minConfidence?: number;
  includeSuperseded?: boolean;
  limit?: number;
  offset?: number;
}

/** Nature of user query for query-aware hybrid search routing. */
export type QueryNature = "exact_code" | "conceptual" | "general";

/** Options for hybrid multi-modal search (BM25 + Dense Vectors). */
export interface HybridSearchOptions extends MemoryQueryOptions {
  vector?: Float32Array | number[];
  queryNature?: QueryNature;
  alpha?: number;
  rrfK?: number;
}

/** Stored dense vector record. */
export interface VectorRecord {
  memoryId: string;
  embedding: Float32Array;
  dimensions: number;
  modelName: string;
  provider: string;
  vectorVersion: number;
  createdAt: number;
}

/** Unified hybrid search result with component score attribution. */
export interface ScoredMemoryResult {
  memory: MemoryRecord;
  combinedScore: number;
  ftsRank?: number;
  vectorSimilarity?: number;
  decayMultiplier: number;
}

/** Knowledge Graph Entity Node. */
export interface EntityNode {
  id: string;
  projectId: string;
  name: string;
  entityType: string;
  description?: string;
  attributes: Record<string, unknown>;
  createdAt: number;
}

/** Knowledge Graph Directed Edge. */
export interface EntityEdge {
  id: string;
  projectId: string;
  sourceId: string;
  targetId: string;
  relation: string;
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: number;
}

/** Architectural Decision Record (ADR). */
export interface DecisionRecord {
  id: string;
  memoryId: string;
  projectId: string;
  title: string;
  problemContext: string;
  decisionMade: string;
  alternativesConsidered: string[];
  tradeoffs: string;
  status: "proposed" | "accepted" | "rejected" | "superseded";
  createdAt: number;
}

/** Error & Debugging Solution Pair. */
export interface ErrorSolutionRecord {
  id: string;
  memoryId: string;
  projectId: string;
  errorSignature: string;
  stackTraceSnippet?: string;
  rootCause: string;
  verifiedSolution: string;
  preventionRule?: string;
  occurrenceCount: number;
  lastOccurredAt: number;
}

/** Tamper-evident Audit Ledger Entry. */
export interface MemoryAuditEntry {
  id?: number;
  memoryId: string;
  action: "CREATE" | "READ" | "UPDATE" | "SUPERSEDE" | "REVISE" | "DELETE" | "ENCRYPT" | "DECRYPT";
  actor: string;
  previousHash?: string;
  currentHash: string;
  tamperSeal: string;
  payloadSnapshot?: Record<string, unknown>;
  createdAt: number;
}

/** Aggregated health and distribution statistics for the memory engine. */
export interface MemorySystemStats {
  totalCount: number;
  activeCount: number;
  supersededCount: number;
  pendingCount: number;
  tierCounts: Record<MemoryTier, number>;
  projectCounts: Record<string, number>;
  dbSizeBytes: number;
  oldestMemoryMs?: number;
  newestMemoryMs?: number;
}

/** Full source-level provenance tracking for extracted statements. */
export interface MemoryProvenance {
  sourceType: MemorySourceType;
  sourceTurnId?: string;
  sourceSpeaker?: "user" | "assistant" | "system" | "tool";
  sourceSentence?: string;
  confidence: number;
  languageDetected?: "en" | "hi" | "hinglish";
  rawUtteranceHash?: string;
  extractedAt: number;
}

/**
 * Phase P5.2: Six Canonical Contradiction Classes.
 */
export type ContradictionClass =
  | "identity_inversion"       // Class 1: User name or personal identity conflict
  | "preference_shift"        // Class 2: Evolving likes, dislikes, configurations
  | "architecture_collision"  // Class 3: Conflicting tech stacks, architectural choices
  | "procedural_conflict"     // Class 4: Conflicting commands, execution steps, rules
  | "temporal_evolution"      // Class 5: Timeline updates, deadlines, historical vs current
  | "negation_nullification"; // Class 6: Direct polarity reversal, nullifications, bans

/**
 * Phase P5.2: Classification outcome for conflict detection.
 */
export type ContradictionClassification =
  | "TRUE_CONTRADICTION"        // Direct logical clash in same scope
  | "EXPLICIT_CORRECTION"       // Explicit user statement correcting earlier statement
  | "TEMPORAL_UPDATE"           // Historical state evolution over elapsed time
  | "CONTEXTUAL_COEXISTENCE"    // Different environments, scopes, or exceptions
  | "COMPLEMENTARY_INFORMATION" // Supplementary detail or refinement
  | "UNCERTAIN"                 // Ambiguous or low-confidence collision
  | "NO_CONFLICT";              // Orthogonal or identical statements

/**
 * Phase P5.3: Deterministic Reconciliation Policy Outcomes.
 */
export type ReconciliationPolicy =
  | "AUTO_SUPERSEDE"
  | "FOUNDER_CONFIRMATION"
  | "CONTEXTUAL_COEXISTENCE"
  | "REJECT_CANDIDATE"
  | "RETAIN_BOTH"
  | "DEFER_UNCERTAIN";

/**
 * Phase P5.2: Result of contradiction detection between existing memory and incoming candidate.
 */
export interface ContradictionDetectionResult {
  conflictClass?: ContradictionClass;
  classification: ContradictionClassification;
  existingMemory?: MemoryRecord;
  candidateContent: string;
  candidateKey: string;
  candidateTier: MemoryTier;
  candidateSource: MemorySourceType;
  projectId: string;
  semanticSimilarity: number;
  detectionConfidence: number;
  evidenceStrength: number;
  temporalRelationship: "past_vs_present" | "concurrent" | "future_update" | "unspecified";
  polarityInfo: {
    hasNegation: boolean;
    negationType?: "english" | "hindi" | "hinglish";
    invertedPolarity: boolean;
    detectedKeywords: string[];
  };
  explanation: string;
  recommendedPolicy: ReconciliationPolicy;
}

/**
 * Phase P5.3: Final reconciliation decision outcome.
 */
export interface ReconciliationDecision {
  policy: ReconciliationPolicy;
  conflictClass?: ContradictionClass;
  classification: ContradictionClassification;
  existingMemoryId?: string;
  candidateContent: string;
  candidateKey: string;
  candidateTier: MemoryTier;
  projectId: string;
  confidenceScore: number;
  sourceAuthority: number;
  evidenceReliability: number;
  resultingStatus: MemoryStatus;
  reason: string;
  requiresFounderPrompt: boolean;
  inlinePrompt?: string;
  confirmationId?: string;
  appliedAt: number;
}

/**
 * Phase P5.3: Stored founder confirmation request for review.
 */
export interface ConfirmationRecord {
  id: string;
  projectId: string;
  existingMemoryId: string;
  candidateKey: string;
  candidateTier: MemoryTier;
  candidateContent: string;
  candidateSource: MemorySourceType;
  conflictClass: ContradictionClass;
  reason: string;
  status: "pending" | "approved" | "rejected" | "deferred" | "expired";
  inlinePrompt: string;
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

