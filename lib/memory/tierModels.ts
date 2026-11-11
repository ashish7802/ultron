/**
 * @file lib/memory/tierModels.ts
 * @description Specialized Data Models and Type Contracts for All 12 Memory Tiers.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P2: 12 Memory Types).
 *
 * Key Responsibilities:
 * - Implements strongly-typed domain interfaces for every memory tier:
 *   1. WorkingMemoryPayload (active turns, scratchpad, goal stack)
 *   2. EpisodicMemoryPayload (dialogue turn summaries, meeting milestones)
 *   3. SemanticMemoryPayload (verified truths, syntax rules, architectural principles)
 *   4. ProceduralMemoryPayload (executable steps, tool chains, success weights)
 *   5. PersonalMemoryPayload (founder profile, preferences, communication styles)
 *   6. ProjectMemoryPayload (repo paths, sprint milestones, constraints)
 *   7. DecisionMemoryPayload (ADRs, rationale, trade-offs, alternatives)
 *   8. ErrorSolutionMemoryPayload (signatures, root cause, prevention rules)
 *   9. ResearchMemoryPayload (dossiers, cited URLs, credibility ratings)
 *   10. TemporalMemoryPayload (milestones, deadlines, cron triggers)
 *   11. RelationalMemoryPayload (graph nodes and directed edges)
 *   12. MetaMemoryPayload (confidence scores, retrieval accuracy, gap flags)
 *
 * Architectural Role & Safety Guarantees:
 * - Each tier enforces its own decay rates, retention policies, and validation gates.
 * - Secret exclusion guarantees: credentials and sensitive tokens are strictly rejected.
 * - Zero breaking changes: builds directly on Phase P1 canonical schema and DAO.
 */

import type { MemoryTier, SensitivityLevel } from "./types.ts";

/** Base properties shared by all specialized memory payloads. */
export interface BaseMemoryPayload {
  projectId?: string;
  semanticKey: string;
  summary?: string;
  sensitivity?: SensitivityLevel;
  importance?: number; // 1 to 5
  confidence?: number; // 0.0 to 1.0
  sourceRef?: string;
  metadata?: Record<string, unknown>;
}

/** 1. Working Memory: Ephemeral active session dialogue & goal scratchpad. */
export interface WorkingMemoryPayload extends BaseMemoryPayload {
  tier: "working";
  content: string;
  activeSessionId: string;
  goalStack: string[];
  unresolvedReferences: Record<string, string>;
  scratchpadNotes?: string;
  turnCount: number;
}

/** 2. Episodic Memory: Historical narrative of interactions, meetings, and sessions. */
export interface EpisodicMemoryPayload extends BaseMemoryPayload {
  tier: "episodic";
  content: string;
  episodeTitle: string;
  participants: string[];
  dialogueTurnIds: string[];
  keyOutcomes: string[];
  sessionStartedAt: number;
  sessionEndedAt: number;
}

/** 3. Semantic Memory: Verified domain facts, syntax standards, and universal truths. */
export interface SemanticMemoryPayload extends BaseMemoryPayload {
  tier: "semantic";
  content: string;
  conceptDomain: "architecture" | "software_engineering" | "security" | "ai_ml" | "general_knowledge";
  factStatement: string;
  verificationSource?: string;
  relatedConcepts: string[];
}

/** 4. Procedural Memory: Executable recipes, tool chains, and step-by-step routines. */
export interface ProceduralMemoryPayload extends BaseMemoryPayload {
  tier: "procedural";
  content: string;
  procedureName: string;
  triggerIntent: string;
  prerequisites: string[];
  executionSteps: Array<{
    stepNumber: number;
    actionType: "shell_command" | "app_launch" | "api_call" | "ui_click" | "verify";
    target: string;
    expectedOutcome: string;
  }>;
  successRate: number; // 0.0 to 1.0
  executionCount: number;
}

/** 5. Personal Memory: Founder profile, preferences, persona traits, and language style. */
export interface PersonalMemoryPayload extends BaseMemoryPayload {
  tier: "personal";
  content: string;
  founderAttribute: "name" | "role" | "language_preference" | "coding_style" | "working_hours" | "custom_value";
  attributeValue: string;
  isImmutable: boolean;
  userExplicitlyDeclared: boolean;
}

/** 6. Project Memory: Active repo context, sprint goals, architecture rules, and dependencies. */
export interface ProjectMemoryPayload extends BaseMemoryPayload {
  tier: "project";
  content: string;
  projectName: string;
  repositoryPath?: string;
  activeTechStack: string[];
  sprintMilestones: string[];
  architecturalConstraints: string[];
}

/** 7. Decision Memory: Architecture Decision Records (ADRs) with trade-offs. */
export interface DecisionMemoryPayload extends BaseMemoryPayload {
  tier: "decision";
  content: string;
  decisionTitle: string;
  problemContext: string;
  decisionMade: string;
  alternativesConsidered: Array<{
    alternative: string;
    rejectionReason: string;
  }>;
  tradeoffsAccepted: string;
  decisionStatus: "proposed" | "accepted" | "superseded" | "rejected";
}

/** 8. Error & Solution Memory: Bug signatures, tested fixes, root causes, and prevention rules. */
export interface ErrorSolutionMemoryPayload extends BaseMemoryPayload {
  tier: "error_solution";
  content: string;
  errorSignature: string;
  exceptionClass?: string;
  stackTraceSnippet?: string;
  rootCause: string;
  verifiedSolution: string;
  preventionRule?: string;
  regressionTestFile?: string;
  reproductionEnvironment: string;
}

/** 9. Research Memory: Synthesized web research dossiers, citations, and credibility scores. */
export interface ResearchMemoryPayload extends BaseMemoryPayload {
  tier: "research";
  content: string;
  searchQuery: string;
  synthesizedSummary: string;
  findings: string[];
  sources: Array<{
    title: string;
    url: string;
    domain: string;
    credibilityScore: number;
  }>;
  elapsedMs: number;
}

/** 10. Temporal Memory: Time-anchored facts, calendar deadlines, and chronological milestones. */
export interface TemporalMemoryPayload extends BaseMemoryPayload {
  tier: "temporal";
  content: string;
  eventTitle: string;
  eventTimestamp: number;
  deadlineTimestamp?: number;
  recurrenceRule?: string; // e.g. "cron:0 9 * * 1"
  isCompleted: boolean;
}

/** 11. Relational Memory: Knowledge Graph entity nodes and directed weighted edges. */
export interface RelationalMemoryPayload extends BaseMemoryPayload {
  tier: "relational";
  content: string;
  sourceEntityName: string;
  sourceEntityType: string;
  targetEntityName: string;
  targetEntityType: string;
  relationType: "uses" | "depends_on" | "decided_by" | "conflicts_with" | "authored_by" | "implements";
  edgeWeight: number; // 0.1 to 1.0
}

/** 12. Meta-Memory: Self-awareness metrics, retrieval accuracy, and knowledge gaps. */
export interface MetaMemoryPayload extends BaseMemoryPayload {
  tier: "meta";
  content: string;
  metricCategory: "recall_precision" | "contradiction_frequency" | "knowledge_gap" | "integrity_diagnostic";
  topicArea: string;
  confidenceAssessment: "high_certainty" | "moderate_confidence" | "provisional_guess" | "knowledge_gap";
  gapExplanation?: string;
  recommendedInvestigation?: string;
}

/** Union of all specialized memory payloads. */
export type AnySpecializedMemoryPayload =
  | WorkingMemoryPayload
  | EpisodicMemoryPayload
  | SemanticMemoryPayload
  | ProceduralMemoryPayload
  | PersonalMemoryPayload
  | ProjectMemoryPayload
  | DecisionMemoryPayload
  | ErrorSolutionMemoryPayload
  | ResearchMemoryPayload
  | TemporalMemoryPayload
  | RelationalMemoryPayload
  | MetaMemoryPayload;
