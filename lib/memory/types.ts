/**
 * @file lib/memory/types.ts
 * @description Strongly-typed schemas and data contracts for the ULTRON Advanced Cognitive Memory System.
 *
 * Subsystem:
 * Core Knowledge, Dual-Vault Persistent Storage & Cognitive Memory Architecture.
 *
 * Key Responsibilities:
 * - Defines structured representations for all 12 memory types:
 *   1. Working Memory (short-term attention, turns, transient goals)
 *   2. Episodic Memory (event transcripts, conversational episodes)
 *   3. Semantic Memory (facts, definitions, world knowledge)
 *   4. Procedural Memory (workflows, step-by-step execution playbooks)
 *   5. Personal Memory (user identity, preferences, relationships)
 *   6. Project Memory (repository facts, milestones, architectural bounds)
 *   7. Decision Memory (MCDA logs, evaluated trade-offs, rationale)
 *   8. Error & Solution Memory (5-Why root causes, past fixes, regression criteria)
 *   9. Research Memory (investigation dossiers, verified citations, freshness)
 *   10. Temporal Memory (timestamps, validity intervals, obsolescence detection)
 *   11. Relational Memory (knowledge graph triples: Subject-Predicate-Object)
 *   12. Meta-Memory (self-awareness of knowledge limits, missing information, calibration)
 * - Defines metadata contracts: Sensitivity tiers, Provenance, Versioning, and Contradictions.
 * - Establishes contracts for Self-Healing recovery playbooks and audit logging.
 *
 * Architectural Role & Interactions:
 * - Shared across all memory modules in `lib/memory/`.
 * - Bridges into `lib/memoryManager.ts` to maintain 100% backward compatibility.
 * - Integrates with `lib/cognitive/orchestrator.ts` for bidirectional memory-reasoning exchange.
 *
 * Safety / Security Guarantees:
 * - Sensitive and Restricted memories require cryptographic authorization.
 * - Project isolation guarantees no cross-project memory leakage.
 * - Credential exclusion prevents API keys, tokens, and passwords from persistent storage.
 */

/** Sensitivity classification for data privacy and zero-trust gating. */
export type MemorySensitivity = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

/** Source provenance classification indicating how a memory entered ULTRON. */
export type MemorySource =
  | "explicit"              // User directly stated "remember that..." or introduced themselves
  | "inferred"              // Extracted silently from natural language conversation
  | "autonomous_learning"   // Synthesized from problem-solving, decisions, or research
  | "system_observation";   // Captured from OS, file system, or runtime environment

/** Full provenance tracking origin, author, and timestamp. */
export interface MemoryProvenance {
  origin: string;
  timestamp: number;
  author?: string;
  sessionId?: string;
  messageId?: string;
  projectId?: string;
}

/** Temporal validity tracking for obsolescence and historical changes. */
export interface TemporalValidity {
  validFrom: number;
  validUntil?: number;
  isObsolescent: boolean;
  supersededBy?: string;
}

/** Historical version record for point-in-time auditability. */
export interface MemoryVersionRecord {
  versionNumber: number;
  content: string;
  timestamp: number;
  changeReason: string;
  author?: string;
}

/** Status of detected contradictions with other stored memories. */
export type ContradictionStatus = "NONE" | "SUSPECTED" | "CONFIRMED" | "RECONCILED";

/** Base interface inherited by all memory records in ULTRON. */
export interface BaseMemoryRecord {
  id: string;
  key: string;
  memoryType:
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
  content: string;
  importance: number; // 1 to 5 scale
  confidence: number; // 0.0 to 1.0 calibrated confidence
  sensitivity: MemorySensitivity;
  source: MemorySource;
  projectId: string; // Default: "default" for global user context
  provenance: MemoryProvenance;
  temporal: TemporalValidity;
  versions: MemoryVersionRecord[];
  contradictionStatus: ContradictionStatus;
  contradictionNotes?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

// ============================================================================
// 12 SPECIALIZED MEMORY TYPE SCHEMAS
// ============================================================================

/** 1. Working Memory: Short-term transient dialogue turn and active focus. */
export interface WorkingMemoryItem {
  id: string;
  turnIndex: number;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  activeGoal?: string;
  transientSlots: Record<string, string>;
  intentCategory?: string;
}

/** 2. Episodic Memory: Narrative interaction or completed conversation session. */
export interface EpisodicMemoryRecord extends BaseMemoryRecord {
  memoryType: "episodic";
  sessionId: string;
  summary: string;
  turnCount: number;
  participants: string[];
  keyOutcomes: string[];
  durationMs: number;
}

/** 3. Semantic Memory: Factual truths, concepts, and definitions. */
export interface SemanticMemoryRecord extends BaseMemoryRecord {
  memoryType: "semantic";
  subject: string;
  predicate: string;
  object: string;
  domain: string;
  verificationSource?: string;
}

/** 4. Procedural Memory: Step-by-step playbooks, recipes, and executable workflows. */
export interface ProceduralMemoryRecord extends BaseMemoryRecord {
  memoryType: "procedural";
  workflowName: string;
  prerequisites: string[];
  steps: Array<{
    stepNumber: number;
    action: string;
    expectedOutcome: string;
    command?: string;
  }>;
  recoverySteps?: string[];
  successCount: number;
  failureCount: number;
}

/** 5. Personal Memory: User identity, personal preferences, and bio. */
export interface PersonalMemoryRecord extends BaseMemoryRecord {
  memoryType: "personal";
  facet: "identity" | "preference" | "bio" | "relationship" | "communication_style";
  preferredName?: string;
  tonePreference?: string;
  value: string;
}

/** 6. Project Memory: Repository specifications, architecture constraints, and milestones. */
export interface ProjectMemoryRecord extends BaseMemoryRecord {
  memoryType: "project";
  projectName: string;
  repositoryPath?: string;
  techStack: string[];
  architecturalConstraints: string[];
  activeMilestone?: string;
  codingStandardsDoc?: string;
}

/** 7. Decision Memory: Multi-criteria decision outcomes, trade-offs, and rationale. */
export interface DecisionMemoryRecord extends BaseMemoryRecord {
  memoryType: "decision";
  decisionTitle: string;
  chosenOption: string;
  rejectedOptions: Array<{ name: string; reason: string }>;
  mcdaScore?: number;
  tradeOffSummary: string;
  approvedByFounder: boolean;
  status: "ACTIVE" | "SUPERSEDED" | "REVERSED";
}

/** 8. Error & Solution Memory: 5-Why root cause analyses, bugs, and verified fixes. */
export interface ErrorSolutionMemoryRecord extends BaseMemoryRecord {
  memoryType: "error_solution";
  errorMessage: string;
  symptoms: string[];
  fiveWhyRootCause: string;
  remediationApplied: string;
  validationTestId?: string;
  isResolved: boolean;
  recurrenceCount: number;
}

/** 9. Research Memory: Live web findings, citations, and freshness verification. */
export interface ResearchMemoryRecord extends BaseMemoryRecord {
  memoryType: "research";
  inquiry: string;
  executiveSummary: string;
  citations: Array<{ title: string; url: string; credibilityScore: number }>;
  freshnessTimestamp: number;
  contradictionFlags: string[];
}

/** 10. Temporal Memory: Timeline events, epoch ordering, and expiration rules. */
export interface TemporalMemoryRecord extends BaseMemoryRecord {
  memoryType: "temporal";
  eventTime: number;
  timeAccuracy: "exact" | "day" | "approximate";
  eraOrPhase: string;
  relativeOrderIndex: number;
  isCurrent: boolean;
}

/** 11. Relational Memory: Knowledge graph nodes and Subject-Predicate-Object triples. */
export interface RelationalTriple {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  bidirectional?: boolean;
}

export interface RelationalMemoryRecord extends BaseMemoryRecord {
  memoryType: "relational";
  triples: RelationalTriple[];
  connectedEntityIds: string[];
  graphCluster?: string;
}

/** 12. Meta-Memory: Knowledge awareness, completeness self-assessment, and gaps. */
export interface MetaMemoryRecord extends BaseMemoryRecord {
  memoryType: "meta";
  targetTopic: string;
  knownInformationCount: number;
  missingInformationFacets: string[];
  overallKnowledgeCompleteness: number; // 0.0 to 1.0
  retrievalReliabilityRating: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  recommendedClarifications: string[];
}

/** Union type representing any verified memory record. */
export type AnyMemoryRecord =
  | EpisodicMemoryRecord
  | SemanticMemoryRecord
  | ProceduralMemoryRecord
  | PersonalMemoryRecord
  | ProjectMemoryRecord
  | DecisionMemoryRecord
  | ErrorSolutionMemoryRecord
  | ResearchMemoryRecord
  | TemporalMemoryRecord
  | RelationalMemoryRecord
  | MetaMemoryRecord;

// ============================================================================
// RECOVERY & SELF-HEALING SCHEMAS
// ============================================================================

/** Reusable self-healing recovery playbooks. */
export type RecoveryPlaybook =
  | "REINDEX"
  | "RESTORE_BACKUP"
  | "RESOLVE_ORPHANS"
  | "COMPACT_DUPLICATES"
  | "RECONCILE_CONTRADICTIONS"
  | "REPAIR_CORRUPTED_RECORDS";

/** Audit log entry for a self-healing action. */
export interface SelfHealingAuditEntry {
  id: string;
  timestamp: number;
  playbook: RecoveryPlaybook;
  issueDescription: string;
  affectedRecordCount: number;
  success: boolean;
  diagnostics: string;
}

/** Diagnostic health report for the memory subsystem. */
export interface MemoryHealthCheckReport {
  isHealthy: boolean;
  totalRecords: number;
  corruptedRecordsCount: number;
  orphanedRelationsCount: number;
  unresolvedContradictionsCount: number;
  duplicateHashCount: number;
  backupFilePresent: boolean;
  backupValid: boolean;
  lastHealthCheckTimestamp: number;
  recommendedPlaybooks: RecoveryPlaybook[];
}

// ============================================================================
// RETRIEVAL & QUERY OPTIONS
// ============================================================================

/** Options for smart memory retrieval. */
export interface MemoryRetrievalOptions {
  query: string;
  projectId?: string; // If omitted, defaults to "default" + global items
  includeTypes?: Array<BaseMemoryRecord["memoryType"]>;
  limit?: number;
  minImportance?: number;
  minConfidence?: number;
  includeRestricted?: boolean; // Requires Zero-Trust authentication
  pointInTimeTimestamp?: number; // For historical time-travel queries
  useHybridFusion?: boolean; // Combines keyword + semantic associative scoring
}

/** Scored search result returned from the retrieval engine. */
export interface ScoredMemoryResult {
  record: AnyMemoryRecord;
  relevanceScore: number; // 0.0 to 1.0
  keywordScore: number;
  semanticScore: number;
  recencyFactor: number;
  finalScore: number; // Normalized combined score
  matchExplanation: string;
}
