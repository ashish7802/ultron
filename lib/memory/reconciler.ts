/**
 * @file lib/memory/reconciler.ts
 * @description Authority Evaluation & Deterministic Reconciliation Engine for ULTRON Advanced Memory System.
 *
 * Subsystem:
 * Memory Versioning, Contradiction Detection & Reconciliation (Phase P5.3 Foundation).
 *
 * Key Responsibilities:
 * - Implements 3D Authority Tensor (Source Authority x Extraction Confidence x Tier Sensitivity Multiplier).
 * - Enforces the 20-scenario deterministic decision matrix (Auto-supersession, Founder confirmation, Coexistence, Rejection).
 * - Governs the 5-state memory lifecycle state machine:
 *   active -> superseded | deprecated | pending_confirmation | disputed | rejected.
 * - Manages founder confirmation requests in `ultron_memory_confirmations` with bilingual English/Hinglish prompts.
 * - Coordinates atomic supersession, revision tracking in `ultron_memory_revisions`, and cryptographic tamper-evident audits.
 * - Preserves entity graph linkages and prevents unauthorized cross-workspace memory modifications.
 *
 * Architectural Role & Safety Guarantees:
 * - Sits between the extraction pipeline (`extractor.ts` / `asyncQueue.ts`) and persistent storage (`sqliteAdapter.ts`).
 * - Never allows autonomous agents or speculative chatter to silently override direct founder directives.
 * - Ensures all mutations happen within atomic transactions with foreign-key integrity.
 * - Retains full historical lineage: no memory is ever permanently deleted during normal supersession.
 */

import { SqliteMemoryAdapter } from "./sqliteAdapter.ts";
import { GLOBAL_PROJECT_ID } from "./schema.ts";
import { ContradictionDetector } from "./contradictionDetector.ts";
import type {
  MemoryRecord,
  MemoryTier,
  MemorySourceType,
  SensitivityLevel,
  MemoryStatus,
  ContradictionClass,
  ContradictionClassification,
  ReconciliationPolicy,
  ReconciliationDecision,
  ConfirmationRecord,
} from "./types.ts";

/**
 * Base authority weights by provenance source.
 * The founder/direct user holds absolute primacy (1.0).
 * Autonomous background agents and dialogue inferences have strictly subordinate authority.
 */
export const SOURCE_AUTHORITY_WEIGHTS: Record<MemorySourceType, number> = {
  user_direct: 1.0,      // Explicit statement by founder Ashish
  project_owner: 0.9,    // Workspace owner directive
  verified_tool: 0.85,   // Deterministic compiler, linter, or test runner output
  system: 0.8,           // Core OS / platform kernel diagnostics
  agent: 0.5,            // LLM agent internal hypothesis
  inferred_dialogue: 0.3 // Inferred casually from multi-turn chat
};

/**
 * Sensitivity multipliers by memory tier.
 * Critical architecture decisions and governance rules demand higher certainty before alteration.
 */
export const TIER_SENSITIVITY_MULTIPLIERS: Record<MemoryTier, number> = {
  decision: 1.2,        // Architecture decisions (ADRs) - high consequence
  procedural: 1.2,      // Repeatable rules and security directives - high consequence
  meta: 1.1,            // Self-referential ULTRON system configurations
  personal: 1.0,        // Founder preferences, identity, contact info
  project: 1.0,         // Repository metadata and tech stack
  error_solution: 0.9,  // Bug root causes and verified patches
  temporal: 0.9,        // Timelines and milestone schedules
  semantic: 0.9,        // General domain knowledge
  relational: 0.8,      // Graph relationships between concepts
  research: 0.8,        // Paper summaries and exploratory findings
  episodic: 0.8,        // Specific conversation turn logs
  working: 0.7,         // Transient scratchpad memories
};

/**
 * Input contract for submitting a candidate memory to the reconciler.
 */
export interface CandidateMemoryInput {
  projectId?: string;
  tier: MemoryTier;
  semanticKey: string;
  content: string;
  summary?: string;
  source: MemorySourceType;
  sourceRef?: string;
  confidence?: number;
  importance?: number;
  sensitivity?: SensitivityLevel;
  metadata?: Record<string, unknown>;
  isExplicitCorrection?: boolean;
  isExperimental?: boolean;
  actor?: "founder" | "agent" | "system" | "consensus";
}

/**
 * Options for executing reconciliation.
 */
export interface ReconciliationOptions {
  autoApply?: boolean; // If true (default), automatically writes approved changes to SQLite
  actor?: "founder" | "agent" | "system" | "consensus";
}

/**
 * MemoryReconciler governs the reconciliation of incoming memories against active persistent memories.
 */
export class MemoryReconciler {
  private _adapter: SqliteMemoryAdapter;
  private _detector: ContradictionDetector;

  /**
   * Initializes the MemoryReconciler.
   *
   * @param adapter - Optional SQLite memory adapter (defaults to canonical instance).
   * @param detector - Optional ContradictionDetector (defaults to new instance with adapter).
   */
  constructor(adapter?: SqliteMemoryAdapter, detector?: ContradictionDetector) {
    this._adapter = adapter || new SqliteMemoryAdapter();
    this._detector = detector || new ContradictionDetector(this._adapter);
  }

  /**
   * Evaluates the 3D authority score for a given source, tier, and extraction confidence.
   * Formula: EffectiveAuthority = min(1.0, BaseSourceWeight * TierSensitivityMultiplier * Confidence)
   *
   * @param source - Provenance source type.
   * @param tier - Target memory tier.
   * @param confidence - Extraction confidence (0.0 to 1.0, defaults to 1.0).
   * @returns Effective authority scalar between 0.0 and 1.0.
   */
  public calculateEffectiveAuthority(source: MemorySourceType, tier: MemoryTier, confidence: number = 1.0): number {
    const baseWeight = SOURCE_AUTHORITY_WEIGHTS[source] ?? 0.5;
    const tierMultiplier = TIER_SENSITIVITY_MULTIPLIERS[tier] ?? 1.0;
    const clampedConf = Math.max(0.0, Math.min(1.0, confidence));

    // Calculate composite authority score
    const composite = baseWeight * tierMultiplier * clampedConf;
    return Math.min(1.0, Math.max(0.0, Number(composite.toFixed(4))));
  }

  /**
   * Evaluates candidate memory and decides on the reconciliation policy using the 20-scenario matrix.
   *
   * @param candidate - Incoming memory payload.
   * @param options - Execution options (e.g. autoApply).
   * @returns ReconciliationDecision detailing policy, resulting status, and audit rationale.
   */
  public async reconcile(
    candidate: CandidateMemoryInput,
    options: ReconciliationOptions = { autoApply: true }
  ): Promise<ReconciliationDecision> {
    const now = Date.now();
    const projectId = candidate.projectId || GLOBAL_PROJECT_ID;
    const candidateSource = candidate.source || "inferred_dialogue";
    const candidateConfidence = candidate.confidence !== undefined ? candidate.confidence : 1.0;
    const actor = options.actor || candidate.actor || (candidateSource === "user_direct" ? "founder" : "agent");

    // Phase 1: Run contradiction detection against active records in this project workspace
    const detection = await this._detector.detectContradiction({
      projectId,
      candidateKey: candidate.semanticKey,
      candidateTier: candidate.tier,
      candidateContent: candidate.content,
      candidateSource,
      candidateConfidence,
    });

    const existing = detection.existingMemory;
    const candAuthority = this.calculateEffectiveAuthority(candidateSource, candidate.tier, candidateConfidence);
    const existAuthority = existing
      ? this.calculateEffectiveAuthority(existing.source, existing.tier, existing.confidence)
      : 0.0;

    // Phase 2: Apply the 20-Scenario Deterministic Decision Matrix
    let policy: ReconciliationPolicy = "RETAIN_BOTH";
    let resultingStatus: MemoryStatus = "active";
    let requiresFounderPrompt = false;
    let reason = "";

    // -------------------------------------------------------------
    // Scenario Evaluation Block
    // -------------------------------------------------------------

    // Check for prompt injection neutralization or hypothetical/interrogative rejection
    if (
      detection.explanation.includes("prompt injection") ||
      detection.explanation.includes("interrogative") ||
      detection.explanation.includes("Hypothetical") ||
      detection.explanation.includes("Candidate payload empty") ||
      detection.explanation.includes("quoted text") ||
      detection.explanation.includes("Candidate content empty")
    ) {
      policy = "REJECT_CANDIDATE";
      resultingStatus = "rejected";
      reason = `Candidate rejected by safety filter: ${detection.explanation}`;
    }
    // Check for extremely low extraction confidence (< 0.40) on contradictory data
    else if (detection.classification !== "NO_CONFLICT" && candidateConfidence < 0.40) {
      policy = "REJECT_CANDIDATE";
      resultingStatus = "rejected";
      reason = `Candidate rejected: extraction confidence (${candidateConfidence}) is below minimum threshold (0.40) for conflicting claim.`;
    }
    // Check for explicit user identity/directive correction (Founder authority 1.0)
    else if (
      candidate.isExplicitCorrection ||
      detection.classification === "EXPLICIT_CORRECTION" ||
      (detection.conflictClass === "identity_inversion" && candidateSource === "user_direct")
    ) {
      policy = "AUTO_SUPERSEDE";
      resultingStatus = "active";
      reason = `Founder explicit correction applied: ${detection.explanation}`;
    }
    // Check for direct user preference shift
    else if (
      (detection.classification === "PREFERENCE_SHIFT" || detection.conflictClass === "preference_shift") &&
      candidateSource === "user_direct"
    ) {
      policy = "AUTO_SUPERSEDE";
      resultingStatus = "active";
      reason = `Founder preference shift accepted: ${detection.explanation}`;
    }
    // Check for temporal state evolution (e.g. deadline extended, state transitioned)
    else if (
      detection.classification === "TEMPORAL_UPDATE" ||
      detection.conflictClass === "temporal_evolution"
    ) {
      if (candAuthority >= 0.50) {
        policy = "AUTO_SUPERSEDE";
        resultingStatus = "active";
        reason = `Temporal evolution supersedes earlier state: ${detection.explanation}`;
      } else {
        policy = "FOUNDER_CONFIRMATION";
        resultingStatus = "pending_confirmation";
        requiresFounderPrompt = true;
        reason = `Low-authority temporal update requires founder confirmation.`;
      }
    }
    // Check for Architectural Collision (Class 3)
    else if (
      detection.conflictClass === "architecture_collision" ||
      detection.conflictClass === "architectural_collision"
    ) {
      if (candidateSource === "inferred_dialogue" && existing?.source === "user_direct") {
        policy = "REJECT_CANDIDATE";
        resultingStatus = "rejected";
        reason = `Authority mismatch: inferred dialogue cannot alter direct founder architectural decision.`;
      } else if (candidate.isExperimental) {
        // Experimental/POC framework coexist contextually with main architecture
        policy = "CONTEXTUAL_COEXISTENCE";
        resultingStatus = "active";
        reason = `Experimental architectural exploration coexists with canonical stack: ${detection.explanation}`;
      } else {
        // Major stack change demands founder confirmation
        policy = "FOUNDER_CONFIRMATION";
        resultingStatus = "pending_confirmation";
        requiresFounderPrompt = true;
        reason = `High-impact architectural change detected (${detection.candidateContent} vs ${existing?.content}). Requires founder confirmation.`;
      }
    }
    // Check for Procedural Scope Conflict (Class 4 - governance & security)
    else if (detection.conflictClass === "procedural_conflict") {
      policy = "FOUNDER_CONFIRMATION";
      resultingStatus = "pending_confirmation";
      requiresFounderPrompt = true;
      reason = `Critical procedural/security rule modification detected. Requires founder confirmation.`;
    }
    // Check for Polarity / Negation Inversion (Class 6)
    else if (
      (detection.conflictClass === "negation_nullification" || detection.conflictClass === "negation_inversion") &&
      (detection.polarityInfo.hasNegation || detection.polarityInfo.invertedPolarity)
    ) {
      if (candidateSource === "user_direct" || candidateSource === "project_owner") {
        policy = "AUTO_SUPERSEDE";
        resultingStatus = "active";
        reason = `Founder polarity reversal applied: ${detection.explanation}`;
      } else {
        // Autonomous agent attempting to negate founder directive -> REJECT
        policy = "REJECT_CANDIDATE";
        resultingStatus = "rejected";
        reason = `Unauthorized negation: agent or inferred source cannot invert active founder directive.`;
      }
    }
    // Check for Agent Inferred vs Founder Direct Memory (Authority hierarchy)
    else if (
      existing &&
      existing.source === "user_direct" &&
      (candidateSource === "inferred_dialogue" || candidateSource === "agent") &&
      detection.classification === "TRUE_CONTRADICTION"
    ) {
      policy = "REJECT_CANDIDATE";
      resultingStatus = "rejected";
      reason = `Authority mismatch: inferred agent statement cannot override direct founder memory (${existing.content}).`;
    }
    // Check for Tool-verified output vs stale agent belief
    else if (
      existing &&
      existing.source === "agent" &&
      candidateSource === "verified_tool" &&
      candidateConfidence >= 0.80
    ) {
      policy = "AUTO_SUPERSEDE";
      resultingStatus = "active";
      reason = `Verified tool diagnostics supersede older unverified agent memory.`;
    }
    // Check for Ambiguous / Low-confidence delta
    else if (
      detection.classification === "UNCERTAIN" ||
      (detection.classification === "TRUE_CONTRADICTION" && Math.abs(candAuthority - existAuthority) < 0.15 && candidateConfidence < 0.75)
    ) {
      policy = "FOUNDER_CONFIRMATION";
      resultingStatus = "pending_confirmation";
      requiresFounderPrompt = true;
      reason = `Ambiguous semantic collision with comparable authority (${candAuthority.toFixed(2)} vs ${existAuthority.toFixed(2)}).`;
    }
    // Check for Complementary Information Refinement
    else if (
      detection.classification === "COMPLEMENTARY_INFORMATION" ||
      detection.classification === "COMPLEMENTARY"
    ) {
      policy = "RETAIN_BOTH";
      resultingStatus = "active";
      reason = `Complementary refinement retains both existing foundation and new context.`;
    }
    // True Contradiction with clear candidate authority superiority
    else if (detection.classification === "TRUE_CONTRADICTION" && candAuthority > existAuthority) {
      policy = "AUTO_SUPERSEDE";
      resultingStatus = "active";
      reason = `Candidate authority (${candAuthority.toFixed(2)}) exceeds existing memory authority (${existAuthority.toFixed(2)}).`;
    }
    // True Contradiction with existing authority superiority
    else if (detection.classification === "TRUE_CONTRADICTION" && existAuthority >= candAuthority) {
      policy = "REJECT_CANDIDATE";
      resultingStatus = "rejected";
      reason = `Existing memory authority (${existAuthority.toFixed(2)}) matches or exceeds candidate authority (${candAuthority.toFixed(2)}).`;
    }
    // Clean default for non-conflicting new memory
    else {
      policy = "RETAIN_BOTH";
      resultingStatus = "active";
      reason = `No collision detected: storing new canonical memory.`;
    }

    // Phase 3: Inline Prompt Formulation for Founder Confirmations
    let inlinePrompt: string | undefined;
    let confirmationId: string | undefined;

    if (requiresFounderPrompt && existing) {
      const isHinglish = detection.polarityInfo.negationType === "hindi" || detection.polarityInfo.negationType === "hinglish";
      inlinePrompt = isHinglish
        ? `ULTRON Memory Conflict: Pehle record tha "${existing.content}". Naya input mila: "${candidate.content}". Kya ise replace karein ya dono ko coexist karne dein?`
        : `ULTRON Memory Conflict: Existing memory is "${existing.content}". Candidate input states "${candidate.content}". Should ULTRON supersede the existing record or retain both?`;
    }

    // Phase 4: State Machine Execution & Database Persistence (if autoApply)
    if (options.autoApply) {
      if (policy === "AUTO_SUPERSEDE" && existing) {
        // Execute atomic supersession with revision graph tracking
        this._adapter.createRevision({
          parentId: existing.id,
          newContent: candidate.content,
          relationshipType: "supersedes",
          reconciliationStrategy: "reconciliation_engine",
          reason,
          actor: actor as any,
          confidenceScore: candidateConfidence,
          newSummary: candidate.summary,
          newMetadata: {
            ...(candidate.metadata || {}),
            reconciledFrom: existing.id,
            reconciliationPolicy: policy,
          },
        });
      } else if (policy === "FOUNDER_CONFIRMATION" && existing) {
        // Persist confirmation request in ultron_memory_confirmations
        const conf = this._adapter.createConfirmation({
          projectId,
          existingMemoryId: existing.id,
          candidateKey: candidate.semanticKey,
          candidateTier: candidate.tier,
          candidateContent: candidate.content,
          candidateSource,
          conflictClass: detection.conflictClass || "architecture_collision",
          reason,
          status: "pending",
          inlinePrompt: inlinePrompt!,
        });
        confirmationId = conf.id;
      } else if (policy === "RETAIN_BOTH" || policy === "CONTEXTUAL_COEXISTENCE") {
        // Store candidate as active memory
        const keyCollision = existing && existing.semanticKey === candidate.semanticKey;
        const isCoexisting = policy === "CONTEXTUAL_COEXISTENCE" || Boolean(keyCollision);
        this._adapter.storeMemory({
          projectId,
          tier: candidate.tier,
          semanticKey: isCoexisting ? `${candidate.semanticKey}_coexist_${now}` : candidate.semanticKey,
          content: candidate.content,
          summary: candidate.summary,
          sensitivity: candidate.sensitivity || "internal",
          importance: candidate.importance || 3,
          confidence: candidateConfidence,
          source: candidateSource,
          sourceRef: candidate.sourceRef,
          status: "active",
          metadata: {
            ...(candidate.metadata || {}),
            coexistenceMode: isCoexisting ? "contextual_exception" : undefined,
          },
        });
      } else if (policy === "REJECT_CANDIDATE") {
        // Audit log the rejection for complete forensic traceability
        this._adapter.logAudit({
          memoryId: existing?.id,
          action: "RECONCILIATION_REJECT",
          actor,
          currentHash: "rejected_candidate",
          payloadSnapshot: JSON.stringify({
            candidateKey: candidate.semanticKey,
            candidateContent: candidate.content,
            reason,
          }),
        });
      }
    }

    return {
      policy,
      conflictClass: detection.conflictClass,
      classification: detection.classification,
      existingMemoryId: existing?.id,
      candidateContent: candidate.content,
      candidateKey: candidate.semanticKey,
      candidateTier: candidate.tier,
      projectId,
      confidenceScore: candidateConfidence,
      sourceAuthority: candAuthority,
      evidenceReliability: detection.evidenceStrength,
      resultingStatus,
      reason,
      requiresFounderPrompt,
      inlinePrompt,
      confirmationId,
      appliedAt: now,
    };
  }

  /**
   * Resolves a pending founder confirmation by either approving (superseding), rejecting, or deferring.
   *
   * @param confirmationId - UUID of the pending confirmation record.
   * @param action - Resolution decision ('approve' | 'reject' | 'defer').
   * @param resolvedBy - Name or ID of the actor (defaults to 'founder').
   * @returns Updated confirmation record or null if not found.
   */
  public async resolveConfirmation(
    confirmationId: string,
    action: "approve" | "reject" | "defer",
    resolvedBy: string = "founder"
  ): Promise<ConfirmationRecord | null> {
    const conf = this._adapter.getConfirmation(confirmationId);
    if (!conf || conf.status !== "pending") {
      return null;
    }

    if (action === "approve") {
      // Execute the deferred supersession
      const existing = this._adapter.getMemoryById(conf.existingMemoryId);
      if (existing) {
        this._adapter.createRevision({
          parentId: existing.id,
          newContent: conf.candidateContent,
          relationshipType: "supersedes",
          reconciliationStrategy: "founder_confirmed_supersession",
          reason: `Founder approved confirmation ${conf.id}: ${conf.reason}`,
          actor: resolvedBy as any,
          confidenceScore: 1.0,
          newMetadata: {
            confirmedBy: resolvedBy,
            confirmationId: conf.id,
          },
        });
      }
      this._adapter.resolveConfirmation(conf.id, "approved", resolvedBy);
    } else if (action === "reject") {
      this._adapter.resolveConfirmation(conf.id, "rejected", resolvedBy);
      this._adapter.logAudit({
        memoryId: conf.existingMemoryId,
        action: "CONFIRMATION_REJECT",
        actor: resolvedBy,
        currentHash: "founder_rejected",
        payloadSnapshot: JSON.stringify({ confirmationId: conf.id, reason: conf.reason }),
      });
    } else if (action === "defer") {
      this._adapter.resolveConfirmation(conf.id, "deferred", resolvedBy);
    }

    return this._adapter.getConfirmation(conf.id);
  }
}
