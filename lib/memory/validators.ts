/**
 * @file lib/memory/validators.ts
 * @description Specialized Validation Gates, Secret Exclusion, and Decay Policies for 12 Memory Tiers.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P2: 12 Memory Types).
 *
 * Key Responsibilities:
 * - Sanitizes all incoming memory content and strictly blocks secrets and credentials.
 * - Enforces tier-specific schema invariants across all 12 memory types.
 * - Assigns scientifically calibrated Ebbinghaus decay parameters ($\lambda$) by memory tier.
 * - Normalizes semantic keys into standard, searchable slugs.
 *
 * Architectural Role & Safety Guarantees:
 * - Fail-closed: invalid or secret-leaking payloads are rejected before database writes.
 * - Secret exclusion guarantees: AWS keys, bearer tokens, private keys, and passwords are
 *   never stored as ordinary memories.
 */

import type {
  AnySpecializedMemoryPayload,
  WorkingMemoryPayload,
  EpisodicMemoryPayload,
  SemanticMemoryPayload,
  ProceduralMemoryPayload,
  PersonalMemoryPayload,
  ProjectMemoryPayload,
  DecisionMemoryPayload,
  ErrorSolutionMemoryPayload,
  ResearchMemoryPayload,
  TemporalMemoryPayload,
  RelationalMemoryPayload,
  MetaMemoryPayload,
} from "./tierModels.ts";
import type { MemoryTier, SensitivityLevel } from "./types.ts";

/** Standard decay rate parameters (half-life multipliers) calibrated by memory tier. */
export const TIER_DECAY_RATES: Record<MemoryTier, number> = {
  working: 0.500,        // Ephemeral, rapid decay (turn-to-turn)
  episodic: 0.050,       // Ebbinghaus curve, half-life ~14 days
  semantic: 0.005,       // Technical documentation & syntax, virtually permanent
  procedural: 0.010,     // Tool recipes, reinforced by successful runs
  personal: 0.000,       // Founder preferences, permanent zero-decay
  project: 0.020,        // Active during project sprint
  decision: 0.000,       // Architecture Decision Records, immutable zero-decay
  error_solution: 0.005, // Root cause & fix recipes, long-term
  research: 0.030,       // Web research dossiers, marked stale over 90 days
  temporal: 0.040,       // Milestones & deadlines, time-sensitive
  relational: 0.005,     // Knowledge graph entity connections
  meta: 0.010,           // System self-awareness analytics
};

/** High-risk credential patterns strictly prohibited from ordinary memory storage. */
const CREDENTIAL_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,                              // AWS Access Key ID
  /sk-[a-zA-Z0-9_-]{20,}/,                         // OpenAI / API Secret Keys
  /ghp_[a-zA-Z0-9]{36}/,                           // GitHub Personal Access Token
  /bearer\s+[a-zA-Z0-9_-]{20,}/i,                  // Bearer Authorization Tokens
  /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH)?\s*PRIVATE KEY-----/i, // Private Keys
  /password\s*[:=]\s*["'][^"']{6,}["']/i,         // Hardcoded passwords
  /client_secret\s*[:=]\s*["'][^"']{8,}["']/i,     // OAuth client secrets
  /(?:^|\s)eyJ[a-zA-Z0-9_-]{15,}\.eyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}(?:\s|$)/, // Unlabelled JWT tokens
  /(?:postgres|postgresql|mysql|mongodb|redis|mssql):\/\/[^\s:]+:[^\s@]+@[^\s]+/i,       // DB URIs with credentials
];

export interface ValidationOutcome {
  isValid: boolean;
  errors: string[];
  scrubbedContent: string;
  assignedTier: MemoryTier;
  assignedDecayRate: number;
  assignedSensitivity: SensitivityLevel;
  normalizedKey: string;
}

/**
 * Scans text content for sensitive credentials or private tokens.
 *
 * @param text - Raw input string.
 * @returns True if a high-risk secret is detected.
 */
export function containsProhibitedSecrets(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitizes input text, removing control characters and dangerous prompt injection vectors.
 *
 * @param text - Raw text.
 * @returns Cleaned string.
 */
export function sanitizeMemoryText(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/<\|.*?\|>/g, "")
    .replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous\s+)?instructions/gi, "[redacted override]")
    .trim();
}

/**
 * Normalizes a semantic key into a clean alphanumeric slug.
 *
 * @param rawKey - User or engine provided key string.
 * @returns Normalized slug, e.g. "user_preferred_language".
 */
export function normalizeSemanticKey(rawKey: string): string {
  return rawKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}

/**
 * Validates any specialized memory payload against tier invariants and secret exclusion rules.
 *
 * @param payload - The AnySpecializedMemoryPayload to validate.
 * @returns ValidationOutcome detailing pass/fail, scrubbed content, and assigned parameters.
 */
export function validateMemoryPayload(payload: AnySpecializedMemoryPayload): ValidationOutcome {
  const errors: string[] = [];

  // 1. Secret Exclusion Guard
  if (containsProhibitedSecrets(payload.content) || containsProhibitedSecrets(JSON.stringify(payload.metadata || {}))) {
    errors.push("Security Policy Violation: Content contains prohibited secrets (API keys, private keys, or passwords).");
  }

  const scrubbedContent = sanitizeMemoryText(payload.content);
  if (!scrubbedContent) {
    errors.push("Memory content cannot be empty.");
  }

  const normalizedKey = normalizeSemanticKey(payload.semanticKey || `mem_${payload.tier}_${Date.now()}`);
  if (!normalizedKey) {
    errors.push("Semantic key cannot be empty.");
  }

  const assignedTier = payload.tier;
  const assignedDecayRate = TIER_DECAY_RATES[assignedTier] ?? 0.050;
  let assignedSensitivity: SensitivityLevel = payload.sensitivity || "internal";

  // Tier-Specific Invariant Checks
  switch (assignedTier) {
    case "working": {
      const p = payload as WorkingMemoryPayload;
      if (!p.activeSessionId) errors.push("Working memory requires an activeSessionId.");
      break;
    }
    case "episodic": {
      const p = payload as EpisodicMemoryPayload;
      if (!p.episodeTitle) errors.push("Episodic memory requires an episodeTitle.");
      break;
    }
    case "semantic": {
      const p = payload as SemanticMemoryPayload;
      if (!p.factStatement) errors.push("Semantic memory requires a verified factStatement.");
      break;
    }
    case "procedural": {
      const p = payload as ProceduralMemoryPayload;
      if (!p.procedureName) errors.push("Procedural memory requires a procedureName.");
      if (!Array.isArray(p.executionSteps) || p.executionSteps.length === 0) {
        errors.push("Procedural memory requires at least one executionStep.");
      }
      break;
    }
    case "personal": {
      const p = payload as PersonalMemoryPayload;
      if (!p.founderAttribute) errors.push("Personal memory requires a founderAttribute.");
      // Personal memories must remain permanent
      assignedSensitivity = "internal";
      break;
    }
    case "project": {
      const p = payload as ProjectMemoryPayload;
      if (!p.projectName) errors.push("Project memory requires a projectName.");
      break;
    }
    case "decision": {
      const p = payload as DecisionMemoryPayload;
      if (!p.decisionTitle) errors.push("Decision memory requires a decisionTitle.");
      if (!p.decisionMade) errors.push("Decision memory requires a decisionMade statement.");
      if (!p.problemContext) errors.push("Decision memory requires problemContext.");
      break;
    }
    case "error_solution": {
      const p = payload as ErrorSolutionMemoryPayload;
      if (!p.errorSignature) errors.push("ErrorSolution memory requires an errorSignature.");
      if (!p.rootCause) errors.push("ErrorSolution memory requires a rootCause diagnosis.");
      if (!p.verifiedSolution) errors.push("ErrorSolution memory requires a verifiedSolution.");
      break;
    }
    case "research": {
      const p = payload as ResearchMemoryPayload;
      if (!p.searchQuery) errors.push("Research memory requires a searchQuery.");
      if (!p.synthesizedSummary) errors.push("Research memory requires a synthesizedSummary.");
      break;
    }
    case "temporal": {
      const p = payload as TemporalMemoryPayload;
      if (!p.eventTitle) errors.push("Temporal memory requires an eventTitle.");
      if (typeof p.eventTimestamp !== "number") errors.push("Temporal memory requires an eventTimestamp.");
      break;
    }
    case "relational": {
      const p = payload as RelationalMemoryPayload;
      if (!p.sourceEntityName || !p.targetEntityName) {
        errors.push("Relational memory requires both sourceEntityName and targetEntityName.");
      }
      if (!p.relationType) errors.push("Relational memory requires a relationType.");
      break;
    }
    case "meta": {
      const p = payload as MetaMemoryPayload;
      if (!p.topicArea) errors.push("Meta memory requires a topicArea.");
      if (!p.confidenceAssessment) errors.push("Meta memory requires a confidenceAssessment.");
      break;
    }
    default:
      errors.push(`Unknown memory tier: ${String(assignedTier)}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    scrubbedContent,
    assignedTier,
    assignedDecayRate,
    assignedSensitivity,
    normalizedKey,
  };
}
