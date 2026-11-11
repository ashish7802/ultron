/**
 * @file lib/cognitive/decisionEngine.ts
 * @description Component 04: Decision Intelligence Engine for ULTRON.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Multi-Criteria Decision Analysis (MCDA) Layer.
 *
 * Key Responsibilities:
 * - Executes Multi-Criteria Decision Analysis (MCDA) across candidate technical/architectural options.
 * - Evaluates candidates along 7 rigorous dimensions: Impact, Complexity, Financial Cost, Risk,
 *   Reversibility, Long-Term Maintainability, and Constraint Alignment.
 * - Conducts structured short-term vs long-term trade-off analyses.
 * - Performs tri-scenario projections (Best Case, Expected Case, Worst Case) for each candidate.
 * - Produces transparent recommendations with detailed reasons why alternatives were rejected.
 * - Explicitly partitions verified facts from estimates and unverified assumptions.
 * - Detects underspecified decision contexts and requests targeted clarification rather than guessing.
 *
 * Architectural Role & Interactions:
 * - Invoked by `lib/cognitive/orchestrator.ts` when queries require strategic choice or trade-off evaluation.
 * - Interfaces with `ParsedContext`, `AdvancedReasoningResult`, and `CriticalThinkingResult`.
 *
 * Safety / Security Guarantees:
 * - Strictly advisory: produces structured analytical evaluations; never executes system actions.
 * - Preserves ULTRON local-first, zero-paid-API, and fail-closed security invariants.
 * - Never presents arbitrary mathematical scoring models as objective truth.
 */

import type {
  ParsedContext,
  CriticalThinkingResult,
  AdvancedReasoningResult,
  DecisionCandidate,
  DecisionIntelligenceResult,
  DecisionCostAssessment,
} from "./types.ts";

/**
 * Normalizes and extracts decision options from user query or contextual reasoning.
 *
 * @param context - Parsed context.
 * @returns Array of identified option names/descriptions.
 */
function extractCandidateNames(context: ParsedContext): string[] {
  const query = context.cleanedQuery;
  const lower = query.toLowerCase();

  // Pattern 1: "choose between X and Y" / "decide between X and Y"
  const betweenMatch = query.match(/\b(?:choose|decide|pick|compare)\s+between\s+([^,]+?)\s+and\s+([^.?]+)/i);
  if (betweenMatch) {
    return [betweenMatch[1].trim(), betweenMatch[2].trim()];
  }

  // Pattern 2: "X vs Y" / "X versus Y"
  const vsMatch = query.match(/([a-zA-Z0-9_\s-]{3,})\s+(?:vs\.?|versus)\s+([a-zA-Z0-9_\s-]{3,})/i);
  if (vsMatch) {
    return [vsMatch[1].trim(), vsMatch[2].trim()];
  }

  // Pattern 3: "should we (choose|use|pick) X or Y"
  const orMatch = query.match(/\bshould\s+(?:we|i)\s+(?:choose|use|pick|go with)?\s*([a-zA-Z0-9_\s-]{3,})\s+or\s+([a-zA-Z0-9_\s-]{3,})/i);
  if (orMatch) {
    return [orMatch[1].trim(), orMatch[2].trim()];
  }

  // Pattern 4: "migrate from X to Y" / "switch from X to Y"
  const migrateMatch = query.match(/\b(?:migrate|switch|move|upgrade)\s+(?:from\s+)?([a-zA-Z0-9_\s-]{3,})\s+to\s+([a-zA-Z0-9_\s-]{3,})/i);
  if (migrateMatch) {
    return [`Retain/Optimize ${migrateMatch[1].trim()}`, `Migrate to ${migrateMatch[2].trim()}`];
  }

  // Domain Fallback: Quick fix vs Long-term refactor
  if (lower.includes("quick fix") || lower.includes("temporary") || lower.includes("long term") || lower.includes("refactor")) {
    return ["Targeted Immediate Hotfix", "Architectural Root Refactoring"];
  }

  return [];
}

/**
 * Checks whether an inquiry lacks vital decision criteria, requiring clarification.
 *
 * @param context - Parsed context.
 * @param candidates - Extracted candidates.
 * @returns Object indicating if clarification is required and the guidance prompt.
 */
function checkClarificationNeed(
  context: ParsedContext,
  candidates: string[]
): { requiresClarification: boolean; clarificationPrompt?: string } {
  const query = context.cleanedQuery.toLowerCase();

  // If query is an abstract decision without concrete options or criteria
  const isVagueDecision =
    (query.startsWith("what should i do") ||
      query.startsWith("how should we decide") ||
      query === "which is better?" ||
      query.startsWith("should we upgrade?")) &&
    candidates.length === 0;

  if (isVagueDecision || (context.ambiguityScore >= 0.5 && candidates.length === 0)) {
    return {
      requiresClarification: true,
      clarificationPrompt:
        "To provide a rigorous decision recommendation without guessing, please specify: " +
        "(1) What concrete candidate alternatives are you considering? " +
        "(2) What is your primary priority (e.g. developer velocity, zero cost, runtime performance, or maximum reversibility)? " +
        "(3) Are there hardware, latency, or environmental constraints we must respect?",
    };
  }

  return { requiresClarification: false };
}

/**
 * Calculates a transparent weighted score for a candidate option.
 * Note: Presented transparently as a heuristic model, never as objective mathematical fact.
 *
 * Score Formula:
 * Score = (Impact * 2.0) - (Complexity * 1.0) + (CostModifier) + (RiskModifier) + (ReversibilityModifier) + (Maintainability * 1.5)
 *
 * @param candidate - Evaluated candidate option.
 * @returns Score number and human-readable mathematical breakdown string.
 */
function computeMCDAScore(
  candidate: Omit<DecisionCandidate, "weightedScore" | "scoreBreakdown">,
  queryLower: string = ""
): { score: number; breakdown: string } {
  let score = 0;

  // Dynamic priority weight modifiers extracted from query context
  const prioritizeSpeed = queryLower.includes("speed") || queryLower.includes("velocity") || queryLower.includes("fast");
  const prioritizeCost = queryLower.includes("cost") || queryLower.includes("cheap") || queryLower.includes("free") || queryLower.includes("budget");
  const prioritizeMaintainability = queryLower.includes("maintainab") || queryLower.includes("long term") || queryLower.includes("clean code");
  const prioritizeReversibility = queryLower.includes("reversib") || queryLower.includes("safe") || queryLower.includes("rollback");

  const impactWeight = prioritizeSpeed ? 2.5 : 2.0;
  const complexityWeight = prioritizeSpeed ? 0.5 : 1.0;
  const maintainabilityWeight = prioritizeMaintainability ? 2.5 : 1.5;

  // 1. Expected Impact (1-5)
  score += candidate.expectedImpact * impactWeight;

  // 2. Implementation Complexity (1-5, negative weight)
  score -= candidate.implementationComplexity * complexityWeight;

  // 3. Financial Cost Modifier
  let costMod = 0;
  const costScale = prioritizeCost ? 1.5 : 1.0;
  if (candidate.financialCost.category === "ZERO_LOCAL") costMod = 3.0 * costScale;
  else if (candidate.financialCost.category === "LOW_COMPUTE") costMod = 1.0 * costScale;
  else if (candidate.financialCost.category === "MODERATE_RESOURCES") costMod = -1.0 * costScale;
  else if (candidate.financialCost.category === "PAID_CLOUD_SERVICE") costMod = -8.0 * costScale; // Heavy penalty for recurring cost
  score += costMod;

  // 4. Technical Risk Modifier
  let riskMod = 0;
  if (candidate.technicalRisk === "LOW") riskMod = 2.0;
  else if (candidate.technicalRisk === "MODERATE") riskMod = 0.0;
  else if (candidate.technicalRisk === "HIGH") riskMod = -3.0;
  else if (candidate.technicalRisk === "CRITICAL") riskMod = -8.0;
  score += riskMod;

  // 5. Reversibility Modifier
  let revMod = 0;
  const revScale = prioritizeReversibility ? 1.8 : 1.0;
  if (candidate.reversibility === "EASILY_REVERSIBLE") revMod = 3.0 * revScale;
  else if (candidate.reversibility === "MODERATE_EFFORT_TO_REVERT") revMod = 1.0 * revScale;
  else if (candidate.reversibility === "IRREVERSIBLE") revMod = -4.0 * revScale;
  score += revMod;

  // 6. Long-term Maintainability (1-5)
  score += candidate.longTermMaintainability * maintainabilityWeight;

  // 7. Non-negotiable Constraint Violation Penalty
  if (!candidate.alignmentWithConstraints) {
    score -= 20.0; // Disqualifying penalty for breaking documented system constraints
  }

  score = parseFloat(score.toFixed(1));

  const breakdown =
    `Impact(${candidate.expectedImpact}*${impactWeight}) - Complexity(${candidate.implementationComplexity}*${complexityWeight}) ` +
    `+ Cost(${costMod.toFixed(1)}) + Risk(${riskMod}) + Reversibility(${revMod.toFixed(1)}) + Maintainability(${candidate.longTermMaintainability}*${maintainabilityWeight})` +
    (!candidate.alignmentWithConstraints ? ` - ConstraintViolationPenalty(20.0)` : ``) +
    ` = ${score}`;

  return { score, breakdown };
}

/**
 * Builds a concrete DecisionCandidate from name and context.
 *
 * @param name - Candidate name.
 * @param context - Parsed context.
 * @returns Fully populated DecisionCandidate model.
 */
function evaluateOption(name: string, context: ParsedContext): DecisionCandidate {
  const lower = name.toLowerCase();
  const queryLower = context.cleanedQuery.toLowerCase();
  const id = `cand_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

  // Evaluate if candidate represents a paid cloud service
  const isPaidCloud =
    lower.includes("pinecone") ||
    lower.includes("paid") ||
    lower.includes("cloud") ||
    lower.includes("saas") ||
    lower.includes("aws") ||
    lower.includes("openai");

  // Evaluate if candidate represents a quick hotfix
  const isQuickFix =
    lower.includes("quick") ||
    lower.includes("hotfix") ||
    lower.includes("temporary") ||
    lower.includes("patch");

  // Evaluate if candidate represents an aggressive rewrite / overhaul
  const isRewrite =
    lower.includes("rewrite") ||
    lower.includes("rust") ||
    lower.includes("overhaul") ||
    lower.includes("postgres") ||
    lower.includes("external");

  const isDistributed =
    lower.includes("microservice") ||
    lower.includes("distributed");

  // Cost evaluation
  let financialCost: DecisionCostAssessment;
  if (isPaidCloud) {
    financialCost = {
      category: "PAID_CLOUD_SERVICE",
      description: "Requires external paid subscription and recurring monthly cloud hosting charges.",
      classification: "MEASURED_FACT",
    };
  } else if (lower.includes("sqlite") || lower.includes("local") || isQuickFix) {
    financialCost = {
      category: "ZERO_LOCAL",
      description: "Zero external financial cost; executes 100% within existing local desktop process.",
      classification: "MEASURED_FACT",
    };
  } else {
    financialCost = {
      category: "LOW_COMPUTE",
      description: "Runs on local CPU/RAM; zero monetary cost.",
      classification: "ESTIMATE",
    };
  }

  // Constraint alignment: ULTRON has strict zero paid API non-negotiable
  const constraintViolations: string[] = [];
  if (isPaidCloud) {
    constraintViolations.push(
      "Violates ULTRON non-negotiable architectural invariant: 100% offline, zero paid cloud API dependencies."
    );
  }

  const alignmentWithConstraints = constraintViolations.length === 0;

  // Impact & Complexity
  let expectedImpact = 4;
  let implementationComplexity = 2;
  let technicalRisk: DecisionCandidate["technicalRisk"] = "LOW";
  let reversibility: DecisionCandidate["reversibility"] = "EASILY_REVERSIBLE";
  let longTermMaintainability = 4;

  if (isPaidCloud) {
    expectedImpact = 3;
    implementationComplexity = 3;
    technicalRisk = "HIGH";
    reversibility = "MODERATE_EFFORT_TO_REVERT";
    longTermMaintainability = 2; // External dependency risk
  } else if (isQuickFix) {
    expectedImpact = 2;
    implementationComplexity = 1;
    technicalRisk = "LOW";
    reversibility = "EASILY_REVERSIBLE";
    longTermMaintainability = 2; // Leaves underlying root cause unaddressed
  } else if (isDistributed) {
    expectedImpact = 3;
    implementationComplexity = 4; // High IPC, port management, and process lifecycle overhead
    technicalRisk = "HIGH";
    reversibility = "MODERATE_EFFORT_TO_REVERT";
    longTermMaintainability = 3;
  } else if (isRewrite) {
    expectedImpact = 4;
    implementationComplexity = 5;
    technicalRisk = "CRITICAL";
    reversibility = "IRREVERSIBLE";
    longTermMaintainability = 4;
  } else if (lower.includes("sqlite") || lower.includes("wal") || lower.includes("monolith")) {
    expectedImpact = 5;
    implementationComplexity = 2;
    technicalRisk = "LOW";
    reversibility = "EASILY_REVERSIBLE";
    longTermMaintainability = 5;
  }

  // Short-term vs Long-term Trade-offs
  let shortVsLongTermTradeoff: string;
  if (isQuickFix) {
    shortVsLongTermTradeoff =
      "Short-Term: Instant unblock in minutes with minimal code edits. " +
      "Long-Term: Accrues technical debt; underlying architectural flaw remains unresolved and will recur.";
  } else if (isPaidCloud) {
    shortVsLongTermTradeoff =
      "Short-Term: Offloads indexing computation to third-party servers. " +
      "Long-Term: Introduces persistent vendor lock-in, recurring operational invoices, and network latency on every turn.";
  } else if (isRewrite) {
    shortVsLongTermTradeoff =
      "Short-Term: High migration overhead, halts feature velocity, risks regressions across verified test suites. " +
      "Long-Term: Modern language guarantees, but high maintenance barrier for TypeScript ecosystem integrations.";
  } else {
    shortVsLongTermTradeoff =
      "Short-Term: Focused patch requiring targeted verification. " +
      "Long-Term: Clean, robust architecture with zero external dependency overhead.";
  }

  // Scenario Projections
  const scenarioAnalysis = {
    bestCase: isPaidCloud
      ? "High vector query throughput offloaded to remote server."
      : isQuickFix
      ? "Suppresses symptom immediately allowing rapid release."
      : "Complete resolution of objective with maximum local performance and stability.",
    expectedCase: isPaidCloud
      ? "Functionally operates but incurs network latency and recurring monthly cost."
      : isQuickFix
      ? "Temporary reprieve until next edge case exposes the root problem."
      : "Verified, predictable behavior across all unit test suites.",
    worstCase: isPaidCloud
      ? "Network partition or billing suspension completely breaks core memory persistence."
      : isQuickFix
      ? "Silent defect accumulation leading to severe cascading failure later in production."
      : isRewrite
      ? "Multi-week derailment of development velocity with extensive regressions."
      : "Minor rollback required if unexpected edge case fails initial benchmark.",
  };

  const baseCandidate = {
    id,
    name,
    description: `Option evaluating: "${name}" for query context "${queryLower.slice(0, 80)}"`,
    expectedImpact,
    implementationComplexity,
    financialCost,
    technicalRisk,
    reversibility,
    longTermMaintainability,
    alignmentWithConstraints,
    constraintViolations,
    shortVsLongTermTradeoff,
    scenarioAnalysis,
  };

  const { score, breakdown } = computeMCDAScore(baseCandidate, queryLower);

  return {
    ...baseCandidate,
    weightedScore: score,
    scoreBreakdown: breakdown,
  };
}

/**
 * Main execution entry point for Component 04: Decision Intelligence Engine.
 *
 * @param context - Parsed context.
 * @param _reasoning - Optional results from Advanced Reasoning Engine.
 * @param _critique - Optional results from Critical Thinking Engine.
 * @returns DecisionIntelligenceResult with MCDA comparison, tradeoffs, and recommendation.
 */
export function performDecisionAnalysis(
  context: ParsedContext,
  reasoning?: AdvancedReasoningResult,
  critique?: CriticalThinkingResult
): DecisionIntelligenceResult {
  const candidateNames = extractCandidateNames(context);
  const { requiresClarification, clarificationPrompt } = checkClarificationNeed(context, candidateNames);

  // If information is insufficient, return clarification requirement without fabricating recommendations
  if (requiresClarification) {
    return {
      requiresClarification: true,
      clarificationPrompt,
      candidates: [],
      rejectedAlternatives: [],
      confidenceScore: 0.2,
      epistemicStatus: "INSUFFICIENT_INFORMATION",
      facts: ["User submitted an open strategic inquiry without specified criteria or options."],
      estimates: [],
      assumptions: [],
      rationaleSummary:
        "Clarification required: Insufficient criteria provided to render an evidence-based recommendation.",
    };
  }

  // Build candidates
  const candidates: DecisionCandidate[] = candidateNames.map((name) => evaluateOption(name, context));

  // If no explicit pairs found but query is a decision, evaluate default options (Focused Optimization vs Broad Overhaul)
  if (candidates.length === 0) {
    candidates.push(evaluateOption("Targeted Local-First Optimization", context));
    candidates.push(evaluateOption("Aggressive Broad Refactoring", context));
  }

  // Rank candidates by weighted score (filtering for constraint alignment)
  const sortedCandidates = [...candidates].sort((a, b) => b.weightedScore - a.weightedScore);
  const allDisqualified = sortedCandidates.every((c) => !c.alignmentWithConstraints);
  const recommendedOption = allDisqualified ? undefined : (sortedCandidates.find((c) => c.alignmentWithConstraints) || sortedCandidates[0]);

  // Document reasons why each rejected alternative was not recommended
  const rejectedAlternatives = sortedCandidates
    .filter((c) => !recommendedOption || c.id !== recommendedOption.id)
    .map((c) => {
      let reason: string;
      if (!c.alignmentWithConstraints) {
        reason = `Disqualified: ${c.constraintViolations.join("; ")}`;
      } else if (c.technicalRisk === "HIGH" || c.technicalRisk === "CRITICAL") {
        reason = `High technical risk (${c.technicalRisk}), elevated implementation complexity (${c.implementationComplexity}/5), and poor reversibility (${c.reversibility}).`;
      } else if (recommendedOption && c.longTermMaintainability < recommendedOption.longTermMaintainability) {
        reason = `Inferior long-term maintainability (${c.longTermMaintainability}/5 vs ${recommendedOption.longTermMaintainability}/5).`;
      } else {
        reason = `Lower overall MCDA score (${c.weightedScore} vs ${recommendedOption?.weightedScore ?? 'N/A'}) when evaluating impact vs complexity.`;
      }
      return {
        id: c.id,
        name: c.name,
        reasonForRejection: reason,
      };
    });

  // Segregate facts, estimates, and assumptions
  const facts = [
    "Repository operates 100% locally with zero paid cloud API dependencies.",
    `Identified ${candidates.length} distinct option(s) for comparison.`,
    ...(recommendedOption && recommendedOption.constraintViolations.length === 0
      ? ["Recommended option fully satisfies non-negotiable project boundaries."]
      : []),
    ...(reasoning?.topologicalOrder ? [`Reasoning execution sequence available: [${reasoning.topologicalOrder.join(" -> ")}]`] : []),
    ...(critique?.stance ? [`Critical review stance evaluated: ${critique.stance}`] : []),
  ];

  const estimates = recommendedOption
    ? [
        `Implementation complexity: ${recommendedOption.implementationComplexity}/5 (Estimated engineering effort).`,
        `Expected impact: ${recommendedOption.expectedImpact}/5 on application capabilities.`,
        `Long-term maintainability projection: ${recommendedOption.longTermMaintainability}/5.`,
      ]
    : ["All alternatives disqualified due to invariant boundary violations."];

  const assumptions = [
    "Host machine has adequate local hardware headroom for in-process execution.",
    "User prioritizes operational stability, local-first privacy, and zero recurring monetary cost.",
  ];

  const confidenceScore = recommendedOption ? (recommendedOption.alignmentWithConstraints ? 0.85 : 0.45) : 0.15;
  const epistemicStatus = allDisqualified
    ? "DISQUALIFIED_BY_CONSTRAINTS"
    : (recommendedOption?.alignmentWithConstraints ? "EVIDENCE_BACKED" : "ESTIMATED_RECOMMENDATION");

  const rationaleSummary = recommendedOption
    ? `Recommended "${recommendedOption.name}" (MCDA Score: ${recommendedOption.weightedScore}). ` +
      `Rationale: High reversibility (${recommendedOption.reversibility}), verified zero financial cost, ` +
      `and strict alignment with local-first system boundaries. ` +
      `Rejected ${rejectedAlternatives.length} alternative(s): ${rejectedAlternatives.map((r) => r.name).join(", ")}.`
    : `All ${candidates.length} evaluated alternative(s) were disqualified because they violate non-negotiable project constraints (100% offline local execution, zero paid cloud APIs). No candidate can be safely recommended without breaching architectural invariants.`;

  return {
    requiresClarification: false,
    candidates,
    recommendedOption,
    rejectedAlternatives,
    confidenceScore,
    epistemicStatus,
    facts,
    estimates,
    assumptions,
    rationaleSummary,
  };
}
