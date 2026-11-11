/**
 * @file lib/memory/contradictionDetector.ts
 * @description Multilingual Contradiction & Truth-Maintenance Engine for ULTRON Advanced Memory.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P5.2 Truth Maintenance).
 *
 * Key Responsibilities:
 * - Implements multi-stage contradiction detection between existing memories and incoming candidates.
 * - Detects and classifies all 6 canonical contradiction classes:
 *     1. Identity Inversion (personal identity, user name corrections)
 *     2. Preference Shift (user preferences, tool/theme selections)
 *     3. Architectural Decision Collision (ADR tech stack and storage choices)
 *     4. Procedural Scope Conflict (operational directives, deletion approvals, exceptions)
 *     5. Temporal Evolution (historical vs current state, deadline shifts, tool transitions)
 *     6. Negation & Nullification (polarity inversion, direct bans, cancel directives)
 * - Calibrated multilingual support across English, Hindi, and Hinglish transliterations.
 * - Multi-factor evidence scoring combining semantic key matching, Ollama dense cosine similarity,
 *   FTS5 lexical matching, and polarity inversion heuristics.
 * - Enforces zero-trust safety: strips quoted markdown, rejects speculative hypotheticals,
 *   and neutralizes prompt injection attempts.
 *
 * Architectural Role & Safety Guarantees:
 * - Operates before database persistence to prevent corrupted or conflicting memory state.
 * - Zero external cloud dependencies; runs 100% locally on Windows desktop.
 * - Graceful fallback to lexical feature vectors if local Ollama daemon is offline.
 * - Strictly preserves project isolation boundaries (no cross-workspace candidate leakage).
 */

import { SqliteMemoryAdapter } from "./sqliteAdapter.ts";
import { getLocalVectorClient, cosineSimilarity, computeLexicalFeatureVector } from "./vectorClient.ts";
import { isQuestionOrHypothetical, stripUntrustedAndQuotedContent } from "./extractor.ts";
import type {
  MemoryRecord,
  MemoryTier,
  MemorySourceType,
  ContradictionClass,
  ContradictionClassification,
  ContradictionDetectionResult,
  ReconciliationPolicy,
} from "./types.ts";
import { GLOBAL_PROJECT_ID } from "./schema.ts";

/**
 * Multilingual negation and polarity inversion marker dictionaries.
 */
const ENGLISH_NEGATIONS = [
  /\bnot\b/i,
  /\bnever\b/i,
  /\bno\s+longer\b/i,
  /\binstead\b/i,
  /\bdeprecated\b/i,
  /\bchanged\s+to\b/i,
  /\bdon'?t\b/i,
  /\bdoesn'?t\b/i,
  /\bstop\b/i,
  /\bdisallow\b/i,
  /\bprohibit\b/i,
  /\bdisable\b/i,
  /\bcancel\b/i,
  /\bswitch\s+(?:from|to)\b/i,
];

const HINDI_HINGLISH_NEGATIONS = [
  /\bnahi\b/i,
  /\bnahin\b/i,
  /\bmat\b/i,
  /\bab\s+nahi\b/i,
  /\bpehle\b/i,
  /\bbadal\s+do\b/i,
  /\bhata\s+do\b/i,
  /\bband\s+kar\s+do\b/i,
  /\bki\s+jagah\b/i,
  /\bab\s+se\b/i,
  /\brok\s+do\b/i,
  /\bkhatam\b/i,
];

/**
 * Temporal indicator patterns distinguishing historical facts from current states.
 */
const TEMPORAL_HISTORICAL_PATTERNS = [
  /\bused\s+to\b/i,
  /\bpreviously\b/i,
  /\bformerly\b/i,
  /\blast\s+(?:year|month|week)\b/i,
  /\bpehle\b/i,
  /\bpurana\b/i,
  /\bearlier\b/i,
];

const TEMPORAL_UPDATE_PATTERNS = [
  /\bnow\b/i,
  /\bcurrently\b/i,
  /\bupdated\b/i,
  /\bextended\s+to\b/i,
  /\bpostponed\s+to\b/i,
  /\bab\s+se\b/i,
  /\bfrom\s+now\s+on\b/i,
  /\bas\s+of\s+today\b/i,
  /\blatest\b/i,
];

/**
 * Input contract for detecting contradictions.
 */
export interface ContradictionDetectionInput {
  candidateContent: string;
  candidateKey: string;
  candidateTier: MemoryTier;
  candidateSource?: MemorySourceType;
  projectId?: string;
  candidateConfidence?: number;
  existingMemoryId?: string; // Optional direct target comparison
}

/**
 * Multi-Stage Contradiction Detection Engine.
 */
export class ContradictionDetector {
  private _adapter: SqliteMemoryAdapter;

  constructor(adapter?: SqliteMemoryAdapter) {
    this._adapter = adapter || new SqliteMemoryAdapter();
  }

  /**
   * Analyzes an incoming candidate memory against persistent memories to detect contradictions.
   *
   * @param input - Candidate memory details and project scope.
   * @returns Detailed ContradictionDetectionResult.
   */
  public async detectContradiction(input: ContradictionDetectionInput): Promise<ContradictionDetectionResult> {
    const projectId = input.projectId || GLOBAL_PROJECT_ID;
    const rawContent = input.candidateContent.trim();
    const candidateSource = input.candidateSource || "inferred_dialogue";
    const candidateConfidence = input.candidateConfidence !== undefined ? input.candidateConfidence : 0.85;

    // Phase 1: Security & Sanity Filters
    // Reject hypothetical speculation or interrogative sentences
    if (isQuestionOrHypothetical(rawContent)) {
      return this._buildNoConflictResult(input, "Hypothetical or interrogative candidate ignored as non-authoritative");
    }

    // Strip quotes and markdown blocks to prevent untrusted prompt injection
    const sanitizedContent = stripUntrustedAndQuotedContent(rawContent);
    if (!sanitizedContent || sanitizedContent.length < 3) {
      return this._buildNoConflictResult(input, "Candidate content empty or purely quoted text");
    }

    // Phase 2: Candidate Memory Lookup
    // Find potential colliding memory by exact key, direct ID, or semantic search
    let existingMemory: MemoryRecord | null = null;
    if (input.existingMemoryId) {
      existingMemory = this._adapter.getMemoryById(input.existingMemoryId);
    } else {
      existingMemory = this._adapter.getCurrentRevision(input.candidateKey, projectId);
    }

    // If no direct key collision, search active memories in project for close matches
    if (!existingMemory) {
      const candidates = this._adapter.queryMemories({
        projectId,
        tiers: [input.candidateTier],
        limit: 5,
        includeSuperseded: false,
      });

      // Scan candidate list for semantic overlap
      for (const m of candidates) {
        if (this._isCloseKeyMatch(input.candidateKey, m.semanticKey)) {
          existingMemory = m;
          break;
        }
      }
    }

    // If still no matching memory in persistent database, there is no collision
    if (!existingMemory) {
      return this._buildNoConflictResult(input, "No existing memory found with overlapping semantic key");
    }

    // Phase 3: Project Isolation Boundary Guard
    // Memories from different isolated workspaces (neither being global) cannot conflict
    if (
      existingMemory.projectId !== projectId &&
      existingMemory.projectId !== GLOBAL_PROJECT_ID &&
      projectId !== GLOBAL_PROJECT_ID
    ) {
      return this._buildNoConflictResult(input, "Project boundary isolation: workspaces do not overlap");
    }

    // Exact identical content check (Deduplication NO-OP)
    if (existingMemory.content.trim().toLowerCase() === sanitizedContent.toLowerCase()) {
      return {
        classification: "NO_CONFLICT",
        existingMemory,
        candidateContent: sanitizedContent,
        candidateKey: input.candidateKey,
        candidateTier: input.candidateTier,
        candidateSource,
        projectId,
        semanticSimilarity: 1.0,
        detectionConfidence: 1.0,
        evidenceStrength: 1.0,
        temporalRelationship: "concurrent",
        polarityInfo: { hasNegation: false, invertedPolarity: false, detectedKeywords: [] },
        explanation: "Identical duplicate content; access count incremented without contradiction",
        recommendedPolicy: "RETAIN_BOTH",
      };
    }

    // Phase 4: Hybrid Similarity Computation
    const similarity = await this._computeSimilarity(existingMemory.content, sanitizedContent);

    // Phase 5: Polarity and Multilingual Negation Analysis
    const polarityInfo = this._analyzePolarity(existingMemory.content, sanitizedContent);

    // If candidate key does not match existing key, and similarity < 0.60 with no polarity inversion, there is no conflict
    if (
      input.candidateKey !== existingMemory.semanticKey &&
      similarity < 0.60 &&
      !polarityInfo.invertedPolarity
    ) {
      return this._buildNoConflictResult(input, "Disparate semantic keys with low semantic similarity (< 0.60)");
    }

    // Phase 6: Temporal Evolution Analysis
    const temporalRel = this._analyzeTemporalRelationship(existingMemory.content, sanitizedContent);

    // Phase 7: Classify Contradiction Category (The 6 Classes)
    const conflictClass = this._classifyContradictionClass(
      input.candidateTier,
      input.candidateKey,
      existingMemory.content,
      sanitizedContent,
      polarityInfo,
      temporalRel
    );

    // Phase 8: Determine Contradiction Classification & Recommended Policy
    return this._evaluateContradictionVerdict(
      conflictClass,
      existingMemory,
      sanitizedContent,
      input,
      similarity,
      polarityInfo,
      temporalRel,
      candidateConfidence
    );
  }

  /**
   * Computes hybrid semantic similarity using Ollama embeddings with fallback to lexical n-gram vectors.
   */
  private async _computeSimilarity(textA: string, textB: string): Promise<number> {
    try {
      const vectorClient = getLocalVectorClient();
      const [resA, resB] = await Promise.all([
        vectorClient.embed(textA),
        vectorClient.embed(textB),
      ]);
      return Math.max(0.0, Math.min(1.0, cosineSimilarity(resA.embedding, resB.embedding)));
    } catch {
      // Offline fallback: isolated lexical unit-norm feature hash
      const vecA = computeLexicalFeatureVector(textA);
      const vecB = computeLexicalFeatureVector(textB);
      return Math.max(0.0, Math.min(1.0, cosineSimilarity(vecA, vecB)));
    }
  }

  /**
   * Evaluates polarity and multilingual negation markers across English, Hindi, and Hinglish.
   */
  private _analyzePolarity(textA: string, textB: string): {
    hasNegation: boolean;
    negationType?: "english" | "hindi" | "hinglish";
    invertedPolarity: boolean;
    detectedKeywords: string[];
  } {
    const detected: string[] = [];
    let hasEn = false;
    let hasHi = false;

    // Check English negation markers in textB
    for (const pat of ENGLISH_NEGATIONS) {
      const match = textB.match(pat);
      if (match) {
        detected.push(match[0].toLowerCase());
        hasEn = true;
      }
    }

    // Check Hindi / Hinglish negation markers in textB
    for (const pat of HINDI_HINGLISH_NEGATIONS) {
      const match = textB.match(pat);
      if (match) {
        detected.push(match[0].toLowerCase());
        hasHi = true;
      }
    }

    const hasNegationB = detected.length > 0;

    // Check if textA had negation
    const hasNegationA = ENGLISH_NEGATIONS.some((p) => p.test(textA)) || HINDI_HINGLISH_NEGATIONS.some((p) => p.test(textA));

    // Polarity is inverted if one contains negation and the other does not
    const invertedPolarity = (hasNegationA && !hasNegationB) || (!hasNegationA && hasNegationB);

    let negationType: "english" | "hindi" | "hinglish" | undefined = undefined;
    if (hasHi && hasEn) negationType = "hinglish";
    else if (hasHi) negationType = "hindi";
    else if (hasEn) negationType = "english";

    return {
      hasNegation: hasNegationB,
      negationType,
      invertedPolarity,
      detectedKeywords: detected,
    };
  }

  /**
   * Distinguishes historical statements from current updates using temporal markers.
   */
  private _analyzeTemporalRelationship(textA: string, textB: string): "past_vs_present" | "concurrent" | "future_update" | "unspecified" {
    const hasPastMarker = TEMPORAL_HISTORICAL_PATTERNS.some((p) => p.test(textB));
    const hasUpdateMarker = TEMPORAL_UPDATE_PATTERNS.some((p) => p.test(textB));

    if (hasPastMarker && hasUpdateMarker) {
      return "past_vs_present"; // e.g. "I used to prefer X, now I prefer Y"
    }
    if (hasUpdateMarker) {
      return "future_update"; // e.g. "Deadline extended to Monday"
    }
    if (hasPastMarker) {
      return "past_vs_present";
    }
    return "concurrent";
  }

  /**
   * Classifies the specific contradiction category out of the 6 canonical classes.
   */
  private _classifyContradictionClass(
    tier: MemoryTier,
    semanticKey: string,
    textA: string,
    textB: string,
    polarityInfo: { hasNegation: boolean; invertedPolarity: boolean },
    temporalRel: string
  ): ContradictionClass {
    // Class 1: Identity Inversion
    if (
      semanticKey.includes("user_name") ||
      semanticKey.includes("identity") ||
      tier === "personal" && (/\bnaam\b/i.test(textB) || /\bname\b/i.test(textB))
    ) {
      return "identity_inversion";
    }

    // Class 2: Preference Shift
    if (
      semanticKey.includes("preference") ||
      semanticKey.includes("theme") ||
      semanticKey.includes("ui_") ||
      /\bprefer\b/i.test(textB) ||
      /\bpasand\b/i.test(textB) ||
      /\blike\b/i.test(textB) ||
      /\bchahiye\b/i.test(textB) ||
      /\bwant\b/i.test(textB)
    ) {
      return "preference_shift";
    }

    // Class 3: Architectural Decision Collision
    if (
      tier === "decision" ||
      semanticKey.includes("db") ||
      semanticKey.includes("database") ||
      semanticKey.includes("framework") ||
      semanticKey.includes("architecture") ||
      /\bdatabase\b/i.test(textB) ||
      /\barchitecture\b/i.test(textB) ||
      /\bpostgresql\b/i.test(textB) ||
      /\bsqlite\b/i.test(textB)
    ) {
      return "architecture_collision";
    }

    // Class 4: Procedural Scope Conflict
    if (
      tier === "procedural" ||
      semanticKey.includes("deploy") ||
      semanticKey.includes("approval") ||
      semanticKey.includes("permission") ||
      /\balways\s+ask\b/i.test(textB) ||
      /\bpermission\b/i.test(textB)
    ) {
      return "procedural_conflict";
    }

    // Class 5: Temporal Evolution
    if (
      tier === "temporal" ||
      temporalRel === "past_vs_present" ||
      temporalRel === "future_update" ||
      semanticKey.includes("deadline") ||
      /\bdeadline\b/i.test(textB)
    ) {
      return "temporal_evolution";
    }

    // Class 6: Negation & Nullification
    if (polarityInfo.invertedPolarity || polarityInfo.hasNegation) {
      return "negation_nullification";
    }

    // Default to Tier-aligned classification
    if (tier === "project") return "architecture_collision";
    return "negation_nullification";
  }

  /**
   * Final decision synthesis evaluating confidence, authority, and conflict severity.
   */
  private _evaluateContradictionVerdict(
    conflictClass: ContradictionClass,
    existingMemory: MemoryRecord,
    sanitizedContent: string,
    input: ContradictionDetectionInput,
    similarity: number,
    polarityInfo: { hasNegation: boolean; invertedPolarity: boolean; detectedKeywords: string[] },
    temporalRel: "past_vs_present" | "concurrent" | "future_update" | "unspecified",
    candidateConfidence: number
  ): ContradictionDetectionResult {
    const candidateSource = input.candidateSource || "inferred_dialogue";
    const projectId = input.projectId || GLOBAL_PROJECT_ID;

    // Detect if this is an explicit correction pattern: "I am not X, I am Y" or "X nahi Y" in identity
    const isExplicitCorrection =
      (conflictClass === "identity_inversion" && (
        /\bnot\s+([a-zA-Z0-9_]+)[,;]?\s+(?:i\s+am|it\s+is|call\s+me)\s+([a-zA-Z0-9_]+)/i.test(sanitizedContent) ||
        /\b([a-zA-Z0-9_]+)\s+nahi\s+([a-zA-Z0-9_]+)/i.test(sanitizedContent)
      )) ||
      /\bki\s+jagah\s+([a-zA-Z0-9_]+)/i.test(sanitizedContent) ||
      /\binstead\s+of\b/i.test(sanitizedContent);

    // Complementary refinement check: high similarity without negation or conflict markers
    const isComplementary =
      conflictClass !== "architecture_collision" &&
      conflictClass !== "identity_inversion" &&
      conflictClass !== "procedural_conflict" &&
      similarity >= 0.70 &&
      !polarityInfo.invertedPolarity &&
      !isExplicitCorrection &&
      temporalRel === "concurrent" &&
      sanitizedContent.length > existingMemory.content.length &&
      sanitizedContent.toLowerCase().includes(existingMemory.content.toLowerCase().slice(0, 20));

    if (isComplementary) {
      return {
        conflictClass,
        classification: "COMPLEMENTARY_INFORMATION",
        existingMemory,
        candidateContent: sanitizedContent,
        candidateKey: input.candidateKey,
        candidateTier: input.candidateTier,
        candidateSource,
        projectId,
        semanticSimilarity: similarity,
        detectionConfidence: candidateConfidence,
        evidenceStrength: 0.85,
        temporalRelationship: temporalRel,
        polarityInfo,
        explanation: "Candidate provides refined detail or complementary specification without invalidating parent fact",
        recommendedPolicy: "AUTO_SUPERSEDE",
      };
    }

    // Temporal Update Handling
    if (conflictClass === "temporal_evolution" || temporalRel === "future_update" || temporalRel === "past_vs_present") {
      return {
        conflictClass,
        classification: "TEMPORAL_UPDATE",
        existingMemory,
        candidateContent: sanitizedContent,
        candidateKey: input.candidateKey,
        candidateTier: input.candidateTier,
        candidateSource,
        projectId,
        semanticSimilarity: similarity,
        detectionConfidence: candidateConfidence,
        evidenceStrength: 0.90,
        temporalRelationship: temporalRel,
        polarityInfo,
        explanation: "Factual state evolved over time (historical timeline update or milestone shift)",
        recommendedPolicy: "AUTO_SUPERSEDE",
      };
    }

    // Explicit Corrections (e.g. Identity: "Mera naam Ashish hai, Rahul nahi")
    if (isExplicitCorrection || (conflictClass === "identity_inversion" && candidateSource === "explicit_user")) {
      return {
        conflictClass,
        classification: "EXPLICIT_CORRECTION",
        existingMemory,
        candidateContent: sanitizedContent,
        candidateKey: input.candidateKey,
        candidateTier: input.candidateTier,
        candidateSource,
        projectId,
        semanticSimilarity: similarity,
        detectionConfidence: Math.max(0.95, candidateConfidence),
        evidenceStrength: 0.98,
        temporalRelationship: temporalRel,
        polarityInfo,
        explanation: "Explicit founder correction overrides prior statement deterministically",
        recommendedPolicy: "AUTO_SUPERSEDE",
      };
    }

    // High-consequence ADR or Procedural collision: requires founder confirmation gate
    if (conflictClass === "architecture_collision" || conflictClass === "procedural_conflict") {
      // Check if candidate is an exploratory experiment or proposal
      const isExperiment = /\b(?:experiment\w*|trying|poc|evaluating|consider\w*)\b/i.test(sanitizedContent);
      if (isExperiment) {
        return {
          conflictClass,
          classification: "CONTEXTUAL_COEXISTENCE",
          existingMemory,
          candidateContent: sanitizedContent,
          candidateKey: input.candidateKey,
          candidateTier: input.candidateTier,
          candidateSource,
          projectId,
          semanticSimilarity: similarity,
          detectionConfidence: candidateConfidence,
          evidenceStrength: 0.70,
          temporalRelationship: temporalRel,
          polarityInfo,
          explanation: "Candidate is an exploratory experiment; both base architecture and test branch coexist",
          recommendedPolicy: "CONTEXTUAL_COEXISTENCE",
        };
      }

      return {
        conflictClass,
        classification: "TRUE_CONTRADICTION",
        existingMemory,
        candidateContent: sanitizedContent,
        candidateKey: input.candidateKey,
        candidateTier: input.candidateTier,
        candidateSource,
        projectId,
        semanticSimilarity: similarity,
        detectionConfidence: candidateConfidence,
        evidenceStrength: 0.92,
        temporalRelationship: temporalRel,
        polarityInfo,
        explanation: "High-consequence architectural/procedural collision; requires founder confirmation before state change",
        recommendedPolicy: "FOUNDER_CONFIRMATION",
      };
    }

    // Direct Polarity Inversion (Class 6: Negation / Ban / Cancel)
    if (polarityInfo.invertedPolarity) {
      // If candidate is from an untrusted or inferred source, do not auto-supersede
      if (candidateSource === "inferred_dialogue" && candidateConfidence < 0.80) {
        return {
          conflictClass,
          classification: "UNCERTAIN",
          existingMemory,
          candidateContent: sanitizedContent,
          candidateKey: input.candidateKey,
          candidateTier: input.candidateTier,
          candidateSource,
          projectId,
          semanticSimilarity: similarity,
          detectionConfidence: candidateConfidence,
          evidenceStrength: 0.60,
          temporalRelationship: temporalRel,
          polarityInfo,
          explanation: "Moderate confidence polarity inversion; deferred to prevent hallucinated negation overwrite",
          recommendedPolicy: "DEFER_UNCERTAIN",
        };
      }

      return {
        conflictClass,
        classification: "TRUE_CONTRADICTION",
        existingMemory,
        candidateContent: sanitizedContent,
        candidateKey: input.candidateKey,
        candidateTier: input.candidateTier,
        candidateSource,
        projectId,
        semanticSimilarity: similarity,
        detectionConfidence: candidateConfidence,
        evidenceStrength: 0.90,
        temporalRelationship: temporalRel,
        polarityInfo,
        explanation: "Direct logical polarity clash across negation markers",
        recommendedPolicy: "AUTO_SUPERSEDE",
      };
    }

    // Preference Shift: User likes/dislikes
    if (conflictClass === "preference_shift") {
      return {
        conflictClass,
        classification: "TRUE_CONTRADICTION",
        existingMemory,
        candidateContent: sanitizedContent,
        candidateKey: input.candidateKey,
        candidateTier: input.candidateTier,
        candidateSource,
        projectId,
        semanticSimilarity: similarity,
        detectionConfidence: candidateConfidence,
        evidenceStrength: 0.88,
        temporalRelationship: temporalRel,
        polarityInfo,
        explanation: "User preference shift; new stated preference supersedes older configuration",
        recommendedPolicy: "AUTO_SUPERSEDE",
      };
    }

    // Default Fallback
    return {
      conflictClass,
      classification: "TRUE_CONTRADICTION",
      existingMemory,
      candidateContent: sanitizedContent,
      candidateKey: input.candidateKey,
      candidateTier: input.candidateTier,
      candidateSource,
      projectId,
      semanticSimilarity: similarity,
      detectionConfidence: candidateConfidence,
      evidenceStrength: 0.75,
      temporalRelationship: temporalRel,
      polarityInfo,
      explanation: "Semantic collision detected under matching semantic key",
      recommendedPolicy: "AUTO_SUPERSEDE",
    };
  }

  /**
   * Constructs a NO_CONFLICT result.
   */
  private _buildNoConflictResult(input: ContradictionDetectionInput, reason: string): ContradictionDetectionResult {
    return {
      classification: "NO_CONFLICT",
      candidateContent: input.candidateContent,
      candidateKey: input.candidateKey,
      candidateTier: input.candidateTier,
      candidateSource: input.candidateSource || "inferred_dialogue",
      projectId: input.projectId || GLOBAL_PROJECT_ID,
      semanticSimilarity: 0.0,
      detectionConfidence: 1.0,
      evidenceStrength: 1.0,
      temporalRelationship: "unspecified",
      polarityInfo: { hasNegation: false, invertedPolarity: false, detectedKeywords: [] },
      explanation: reason,
      recommendedPolicy: "RETAIN_BOTH",
    };
  }

  /**
   * Helper to check if two semantic keys are close enough to consider a potential match.
   */
  private _isCloseKeyMatch(keyA: string, keyB: string): boolean {
    if (keyA === keyB) return true;
    const normA = keyA.toLowerCase().replace(/_/g, " ");
    const normB = keyB.toLowerCase().replace(/_/g, " ");
    return normA.includes(normB) || normB.includes(normA);
  }
}

/** Singleton instance getter for application-wide contradiction detection. */
let defaultContradictionDetector: ContradictionDetector | null = null;

export function getContradictionDetector(): ContradictionDetector {
  if (!defaultContradictionDetector) {
    defaultContradictionDetector = new ContradictionDetector();
  }
  return defaultContradictionDetector;
}
