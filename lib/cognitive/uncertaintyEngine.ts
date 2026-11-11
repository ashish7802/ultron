/**
 * @file lib/cognitive/uncertaintyEngine.ts
 * @description Component 07: Uncertainty & Confidence Engine for ULTRON.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Epistemic Calibration Layer.
 *
 * Key Responsibilities:
 * - Epistemic Classification: Segregates claims into MEASURED_FACT, ESTIMATE, and UNVERIFIED_ASSUMPTION.
 * - Missing-Information Detection: Identifies absent parameters, unstated constraints, and incomplete inputs.
 * - Contradiction Detection: Flags logical, temporal, or policy conflicts in user inputs and proposed reasoning.
 * - Grounding Assessment: Evaluates how well claims are anchored in verified local state (Ashish identity, DPAPI vault, SQLite).
 * - Calibrated Confidence Assessment: Replaces arbitrary LLM percentages with a deterministic, multi-factor index.
 * - Epistemic Honesty Phrasing: Formulates clear epistemic stances ("I know this", "This is my best estimate",
 *   "This depends on an assumption", "I don't have enough information", "I need clarification").
 * - Clarification Protocol: Halts speculative generation when critical parameters are missing.
 *
 * Architectural Role & Interactions:
 * - Invoked by `lib/cognitive/orchestrator.ts` during analytical passes and pre-delivery checks.
 * - Provides grounding metrics to `lib/cognitive/selfEvaluationEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - Strictly analytical and read-only: zero file modifications, zero process spawning, zero network calls.
 * - Never presents heuristic confidence scores as verified statistical probabilities.
 * - Enforces transparent mathematical breakdowns for all calibrated scores.
 */

import type {
  ParsedContext,
  EpistemicClaim,
  UncertaintyFacet,
  EpistemicPhrasing,
  UncertaintyAssessmentResult,
} from "./types.ts";

/**
 * Verified repository and system facts used as ground truth for grounding evaluation.
 */
export const VERIFIED_SYSTEM_FACTS = [
  "Repository operates 100% locally with zero paid cloud API dependencies.",
  "User identity is Ashish (Human Founder), single-user desktop environment.",
  "Memory vault is secured at rest via AES-256-GCM and Windows DPAPI master key.",
  "Database engine is local SQLite with WAL mode and serialized write transactions.",
  "Audio speech engine runs via local Python child process with loopback IPC.",
  "Ollama local inference executes over local loopback at http://127.0.0.1:11434.",
];

/**
 * Classifies an array of raw claims or assertions into epistemic categories.
 *
 * @param claims - Text statements or assertions to evaluate.
 * @param context - Parsed context for domain reference.
 * @returns Array of structured EpistemicClaim models.
 */
export function classifyEpistemicClaims(
  claims: string[],
  context?: ParsedContext
): EpistemicClaim[] {
  return claims.map((claim) => {
    const lower = claim.toLowerCase();

    // Check for verified architectural and repository facts
    const isVerifiedFact =
      lower.includes("ashish") ||
      lower.includes("dpapi") ||
      lower.includes("aes-256-gcm") ||
      lower.includes("offline") ||
      lower.includes("zero paid") ||
      lower.includes("local sqlite") ||
      lower.includes("wal") ||
      lower.includes("loopback") ||
      lower.includes("single-user");

    if (isVerifiedFact) {
      return {
        claim,
        classification: "MEASURED_FACT",
        sourceOrEvidence: "Verified repository configuration & security invariants",
        confidence: 0.95,
      };
    }

    // Check for user stated assumptions or speculative assertions (takes precedence over numeric metrics)
    const isAssumption =
      lower.includes("assum") ||
      lower.includes("if we") ||
      lower.includes("suppose") ||
      lower.includes("presumably") ||
      lower.includes("unverified") ||
      (context && context.statedAssumptions.some((a) => lower.includes(a.toLowerCase().slice(0, 30))));

    if (isAssumption) {
      return {
        claim,
        classification: "UNVERIFIED_ASSUMPTION",
        sourceOrEvidence: "Unverified premise or contextual assumption",
        confidence: 0.40,
      };
    }

    // Check for quantitative estimates (metrics, timing, memory, complexity)
    const isEstimate =
      /\b(?:estimate|estimated|approx|approximately|~|\b[0-9]+(?:\.[0-9]+)?\s*(?:ms|seconds?|mins?|hours?|mb|gb|%))\b/i.test(lower) ||
      /\b(?:complexity|impact|maintainability)\s*:\s*[0-9]/i.test(lower) ||
      lower.includes("effort classification: estimate");

    if (isEstimate) {
      return {
        claim,
        classification: "ESTIMATE",
        sourceOrEvidence: "Heuristic engineering calculation or projection",
        confidence: 0.70,
      };
    }

    // Unsupported claims lacking verified repository grounding or explicit quantitative signals
    // default to UNVERIFIED_ASSUMPTION, preventing unsubstantiated assertions from posing as estimates.
    return {
      claim,
      classification: "UNVERIFIED_ASSUMPTION",
      sourceOrEvidence: "Unsupported assertion lacking verified repository grounding or quantitative metric",
      confidence: context ? Math.max(0.3, Math.min(0.5, 1.0 - context.ambiguityScore)) : 0.4,
    };
  });
}

/**
 * Detects missing information, unstated parameters, and underspecified requirements.
 *
 * @param context - Parsed context.
 * @returns Object with missing parameter descriptions and clarification questions.
 */
export function detectMissingInformation(context: ParsedContext): {
  missingParameters: string[];
  requiresClarification: boolean;
  clarificationQuestions: string[];
} {
  const query = context.cleanedQuery.toLowerCase();
  const missing: string[] = [];
  const questions: string[] = [];

  // 1. Missing target in refactoring or optimization requests
  if (
    /\b(optimize|refactor|fix|improve|clean up)\b/i.test(query) &&
    !/\b(sqlite|database|audio|voice|ui|orb|ipc|memory|chat|electron|api)\b/i.test(query) &&
    query.length < 45
  ) {
    missing.push("Target subsystem or file scope is unstated.");
    questions.push("Which subsystem, module, or file would you like to focus on?");
  }

  // 2. Decision queries lacking decision criteria or options
  if (
    context.intentCategory === "STRATEGIC_DECISION" &&
    !query.includes(" vs ") &&
    !query.includes(" or ") &&
    !query.includes("between")
  ) {
    missing.push("Candidate alternatives and decision criteria are missing.");
    questions.push("What specific candidate options are you evaluating, and what is your top priority (e.g. latency, cost, stability)?");
  }

  // 3. Technical bug reports lacking error messages or reproduction context
  if (
    context.intentCategory === "PROBLEM_SOLVING" &&
    !query.includes("error") &&
    !query.includes("busy") &&
    !query.includes("lock") &&
    !query.includes("crash") &&
    !query.includes("timeout") &&
    query.length < 35
  ) {
    missing.push("Exact error symptom, log output, or reproduction steps omitted.");
    questions.push("Can you share the exact error text, stack trace, or failing command?");
  }

  // 4. Critical ambiguity facets lacking best-effort assumptions
  for (const facet of context.ambiguityFacets) {
    if (facet.importance === "CRITICAL") {
      missing.push(`${facet.parameter}: ${facet.explanation}`);
      questions.push(`Clarification needed for ${facet.parameter}: ${facet.explanation}`);
    }
  }

  const requiresClarification = questions.length > 0;

  return {
    missingParameters: missing,
    requiresClarification,
    clarificationQuestions: questions,
  };
}

/**
 * Detects direct logical or policy contradictions in user inputs.
 *
 * @param context - Parsed context.
 * @returns Array of detected contradiction descriptions.
 */
export function detectContradictions(context: ParsedContext): string[] {
  const query = context.cleanedQuery.toLowerCase();
  const contradictions: string[] = [];

  // 1. Policy vs Cloud constraint
  if (
    (query.includes("zero cost") || query.includes("offline") || query.includes("local only") || query.includes("free")) &&
    (query.includes("pinecone") || query.includes("aws") || query.includes("openai api") || query.includes("paid cloud"))
  ) {
    contradictions.push(
      "Architectural Contradiction: Query simultaneously requests zero-cost/offline execution while specifying paid cloud services."
    );
  }

  // 2. Time vs Scope contradiction
  if (
    /\b(?:in\s+([0-9]+)\s*(?:seconds?|minutes?|hours?)|immediately|by\s+tonight)\b/i.test(query) &&
    (query.includes("rewrite the entire") || query.includes("complete overhaul") || query.includes("full migration"))
  ) {
    contradictions.push(
      "Feasibility Contradiction: A complete architectural rewrite cannot be safely executed, audited, and tested in the requested timeframe."
    );
  }

  // 3. Quality vs Verification contradiction
  if (
    /\b(?:skip|no|delete|disable|remove)\s+(?:all\s+)?(?:the\s+)?(?:unit\s+)?tests?\b/i.test(query) &&
    /\b(?:zero bugs?|100%\s*(?:reliable|bug\s*free)|production\s*(?:ready|grade))\b/i.test(query)
  ) {
    contradictions.push(
      "Verification Contradiction: Demanding zero bugs or production readiness while eliminating automated test suites is contradictory."
    );
  }

  return contradictions;
}

/**
 * Assesses factual grounding against verified system facts and context.
 *
 * @param claims - Epistemic claims to evaluate.
 * @returns Grounding score (0.0 to 1.0) and ungrounded claim details.
 */
export function evaluateGrounding(claims: EpistemicClaim[]): {
  groundingScore: number;
  ungroundedClaims: string[];
} {
  if (claims.length === 0) {
    return { groundingScore: 0.5, ungroundedClaims: [] };
  }

  const ungrounded: string[] = [];
  let groundedCount = 0;

  for (const c of claims) {
    if (c.classification === "MEASURED_FACT") {
      groundedCount += 1.0;
    } else if (c.classification === "ESTIMATE") {
      groundedCount += 0.6;
    } else {
      ungrounded.push(c.claim);
      groundedCount += 0.2;
    }
  }

  const groundingScore = parseFloat(Math.min(1.0, groundedCount / claims.length).toFixed(2));
  return { groundingScore, ungroundedClaims: ungrounded };
}

/**
 * Determines the appropriate epistemic phrasing based on grounding, certainty, and missing data.
 *
 * @param certaintyScore - Calibrated certainty score.
 * @param requiresClarification - True if vital parameters are missing.
 * @param hasAssumptions - True if response relies on unverified assumptions.
 * @param isFactBased - True if grounded on verified measured facts.
 * @returns Explicit EpistemicPhrasing phrase.
 */
export function determineEpistemicPhrasing(
  certaintyScore: number,
  requiresClarification: boolean,
  hasAssumptions: boolean,
  isFactBased: boolean
): EpistemicPhrasing {
  if (requiresClarification) {
    return "I need clarification before recommending a solution.";
  }
  if (certaintyScore < 0.35) {
    return "I don't have enough information.";
  }
  if (isFactBased && certaintyScore >= 0.85) {
    return "I know this.";
  }
  if (hasAssumptions || certaintyScore < 0.60) {
    return "This depends on an assumption.";
  }
  return "This is my best estimate.";
}

/**
 * Main execution entry point for Component 07: Uncertainty & Confidence Engine.
 *
 * Computes a calibrated certainty index:
 * Score = (0.35 * Grounding) + (0.30 * EpistemicClarity) + (0.20 * Completeness) + (0.15 * NonContradiction)
 *
 * Note: Transparently documented as a heuristic calibration index, NEVER as a true Bayesian probability.
 *
 * @param context - Parsed context.
 * @param candidateClaims - Optional list of explicit assertions or proposed claims.
 * @returns UncertaintyAssessmentResult.
 */
export function assessUncertaintyAndConfidence(
  context: ParsedContext,
  candidateClaims: string[] = []
): UncertaintyAssessmentResult {
  // 1. Missing information detection
  const { missingParameters, requiresClarification, clarificationQuestions } = detectMissingInformation(context);

  // 2. Contradiction detection
  const contradictions = detectContradictions(context);
  const contradictionScore = contradictions.length > 0 ? Math.max(0.1, 1.0 - contradictions.length * 0.4) : 1.0;

  // 3. Epistemic claim classification
  const claimsToEvaluate = candidateClaims.length > 0
    ? candidateClaims
    : [
        context.primaryGoal,
        ...context.instructions.map((i) => i.normalizedText),
        ...context.statedAssumptions,
      ];

  const claims = classifyEpistemicClaims(claimsToEvaluate, context);
  const { groundingScore } = evaluateGrounding(claims);

  // 4. Completeness score
  const completenessScore = missingParameters.length > 0
    ? Math.max(0.2, 1.0 - missingParameters.length * 0.25)
    : 1.0;

  // 5. Epistemic clarity (inverse of ambiguity)
  const epistemicClarity = Math.max(0.05, 1.0 - context.ambiguityScore);

  // 6. Calibrated certainty formula
  const rawScore =
    0.35 * groundingScore +
    0.30 * epistemicClarity +
    0.20 * completenessScore +
    0.15 * contradictionScore;

  let overallCertaintyScore = parseFloat(Math.min(1.0, Math.max(0.05, rawScore)).toFixed(2));
  if (requiresClarification) {
    overallCertaintyScore = Math.min(0.35, overallCertaintyScore);
  }

  // 7. Calibration categorization
  let calibrationCategory: UncertaintyAssessmentResult["calibrationCategory"];
  if (overallCertaintyScore >= 0.85) calibrationCategory = "HIGH_CERTAINTY";
  else if (overallCertaintyScore >= 0.65) calibrationCategory = "REASONABLE_CONFIDENCE";
  else if (overallCertaintyScore >= 0.45) calibrationCategory = "PROVISIONAL_ASSUMPTION";
  else calibrationCategory = "HIGH_UNCERTAINTY";

  // 8. Epistemic phrasing determination
  const hasAssumptions = claims.some((c) => c.classification === "UNVERIFIED_ASSUMPTION") || context.statedAssumptions.length > 0;
  const isFactBased = claims.length > 0 && claims.every((c) => c.classification === "MEASURED_FACT");
  const epistemicPhrasing = determineEpistemicPhrasing(
    overallCertaintyScore,
    requiresClarification,
    hasAssumptions,
    isFactBased
  );

  // 9. Document uncertainties as structured facets
  const uncertainties: UncertaintyFacet[] = [];

  if (missingParameters.length > 0) {
    uncertainties.push({
      facet: "Missing Parameters",
      source: "MISSING_INFORMATION",
      severity: requiresClarification ? "CRITICAL" : "MEDIUM",
      description: missingParameters.join("; "),
      impactOnDecision: "Limits analytical certainty; requires reasonable defaults or explicit user input.",
      mitigationOrQuestion: clarificationQuestions[0] || "State assumptions upfront.",
    });
  }

  if (contradictions.length > 0) {
    uncertainties.push({
      facet: "Contradictory Directives",
      source: "CONTRADICTION",
      severity: "CRITICAL",
      description: contradictions.join("; "),
      impactOnDecision: "Prevents clean execution; conflicting goals cannot be satisfied simultaneously.",
      mitigationOrQuestion: "Clarify which constraint takes priority.",
    });
  }

  if (context.ambiguityScore >= 0.2 || context.ambiguityFacets.length > 0) {
    uncertainties.push({
      facet: "Linguistic or Environmental Ambiguity",
      source: "AMBIGUITY",
      severity: context.ambiguityScore > 0.6 ? "HIGH" : "MEDIUM",
      description: context.ambiguityFacets[0]?.explanation || `Ambiguity score: ${context.ambiguityScore}. Multiple valid interpretations exist.`,
      impactOnDecision: "Risk of misinterpreting user intent.",
      mitigationOrQuestion: context.ambiguityFacets[0]?.bestEffortAssumption || "Document working assumptions visibly in response.",
    });
  }

  const calculationBreakdown =
    `Grounding(${groundingScore}*0.35) + Clarity(${epistemicClarity.toFixed(2)}*0.30) ` +
    `+ Completeness(${completenessScore.toFixed(2)}*0.20) + ContradictionFactor(${contradictionScore.toFixed(2)}*0.15) ` +
    `= ${overallCertaintyScore} [Category: ${calibrationCategory}]`;

  const auditExplanation =
    `Certainty Assessment: ${epistemicPhrasing} (Score: ${overallCertaintyScore}). ` +
    `Grounding: ${(groundingScore * 100).toFixed(0)}%, Clarity: ${(epistemicClarity * 100).toFixed(0)}%, ` +
    `Completeness: ${(completenessScore * 100).toFixed(0)}%. ` +
    (uncertainties.length > 0 ? `Active uncertainties: ${uncertainties.map((u) => u.facet).join(", ")}.` : "Zero active uncertainties.");

  return {
    overallCertaintyScore,
    calibrationCategory,
    groundingScore,
    completenessScore,
    contradictionScore,
    claims,
    uncertainties,
    missingInformation: missingParameters,
    epistemicPhrasing,
    requiresClarification,
    clarificationQuestions,
    auditExplanation,
    isCalibratedStatisticalProbability: false,
    calculationBreakdown,
  };
}
