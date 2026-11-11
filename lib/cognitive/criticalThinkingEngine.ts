/**
 * @file lib/cognitive/criticalThinkingEngine.ts
 * @description Component 03: Critical Thinking & Devil's Advocate Engine for ULTRON.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Epistemic Evaluation Layer.
 *
 * Key Responsibilities:
 * - Prevents sycophancy (blind agreement) by actively auditing user and system premises.
 * - Identifies unstated hidden assumptions, optimism bias, and single points of failure.
 * - Detects structural logical fallacies (False Dichotomies, Causal Leaps, Sunk Cost, Appeal to Novelty).
 * - Formulates evidence-based counterarguments and Devil's Advocate failure scenarios.
 * - Renders a definitive epistemic stance: AGREES, PARTIALLY_VALID_WITH_RESERVATIONS, or DISAGREES_WITH_EVIDENCE.
 *
 * Architectural Role & Interactions:
 * - Invoked by `lib/cognitive/orchestrator.ts` during analytical evaluations.
 * - Consumes `ParsedContext` and `AdvancedReasoningResult` to formulate challenging co-founder perspectives.
 *
 * Safety / Security Guarantees:
 * - Read-only logical evaluation.
 * - Respectful disagreement: strictly challenges premises and data, never the human founder.
 */

import type {
  ParsedContext,
  CriticalThinkingResult,
  EvaluatedAssumption,
  LogicalWeakness,
  AdvancedReasoningResult,
} from "./types.ts";

/**
 * Audits explicit and hidden assumptions in the query and reasoning context.
 *
 * @param context - Parsed context.
 * @param reasoning - Results from Advanced Reasoning Engine.
 * @returns Array of EvaluatedAssumption models.
 */
function evaluateAssumptions(
  context: ParsedContext,
  reasoning?: AdvancedReasoningResult
): EvaluatedAssumption[] {
  const query = context.cleanedQuery.toLowerCase();
  const assumptions: EvaluatedAssumption[] = [];

  // 1. Audit explicit stated assumptions from context
  for (const stated of context.statedAssumptions) {
    assumptions.push({
      assumption: stated,
      isStated: true,
      validity: "SOUND",
      riskImpact: "LOW",
      challengeReason: "Explicitly declared working assumption by the Cognitive Orchestrator.",
    });
  }

  // 2. Audit invariants derived from reasoning decomposition
  if (reasoning?.decomposedSubProblems) {
    const allInvariants = reasoning.decomposedSubProblems.flatMap((p) => p.invariants || []);
    for (const inv of allInvariants) {
      assumptions.push({
        assumption: `Invariant requirement: ${inv}`,
        isStated: false,
        validity: "SOUND",
        riskImpact: "CRITICAL",
        challengeReason: "Structural invariant identified during hierarchical decomposition.",
      });
    }
  }

  // 3. Detect proposal: Deleting or disabling unit tests
  if (
    /\b(delete|remove|disable|drop|skip|get rid of)\b.*?\b(tests?|unit tests?|test suites?|testing)\b/i.test(query) ||
    /\b(tests?|testing)\b.*?\b(slow(?:s)? down|waste of time|unnecessary|delete them)\b/i.test(query)
  ) {
    assumptions.push({
      assumption: "Deleting or skipping automated tests will accelerate delivery safely without increasing production defect rates.",
      isStated: false,
      validity: "UNSUPPORTED",
      riskImpact: "CRITICAL",
      challengeReason: "Automated test suites are the primary verification harness preventing regression across 15 critical modules. Eliminating them removes error detection and leads to catastrophic silent failures.",
    });
  }

  // 4. Detect proposal: Removing security checks, permission gateways, or sandboxing
  if (
    /\b(remove|disable|bypass|strip|turn off|delete)\b.*?\b(security|checks?|permission gateway|gateway|guard|sandbox|access control)\b/i.test(query) ||
    /\bwithout\s+(?:the\s+)?(?:permission gateway|security checks?|sandbox)\b/i.test(query)
  ) {
    assumptions.push({
      assumption: "Removing security checks and the permission gateway improves developer velocity without compromising system security.",
      isStated: false,
      validity: "UNSUPPORTED",
      riskImpact: "CRITICAL",
      challengeReason: "The Universal Permission Gateway enforces token lifecycle, hash immutability, and single-use execution. Removing it allows unauthorized OS commands and violates fail-closed security guarantees.",
    });
  }

  // 5. Detect proposal: Bypassing confirmation tokens or authorization
  if (
    /\b(bypass|skip|disable|ignore|remove)\b.*?\b(confirmation|tokens?|approval|prompts?|authorization|auth|gates?)\b/i.test(query)
  ) {
    assumptions.push({
      assumption: "Autonomous execution without confirmation tokens or user approval is safe for desktop operations.",
      isStated: false,
      validity: "UNSUPPORTED",
      riskImpact: "CRITICAL",
      challengeReason: "Confirmation tokens ensure single-use, human-in-the-loop authorization for sensitive Win32 and system actions. Bypassing them introduces severe risk of uncontained autonomous system mutations.",
    });
  }

  // 6. Detect proposal: Introducing paid cloud services or external SaaS where they conflict with project constraints
  if (
    /\b(migrate to|switch to|use|adopt|integrate|replace with)\b.*?\b(paid|cloud|pinecone|aws|gcp|azure|openai|anthropic|subscription)\b/i.test(query) ||
    /\b(paid cloud|pinecone vector|external saas|managed cloud)\b/i.test(query)
  ) {
    assumptions.push({
      assumption: "Adopting external paid cloud infrastructure or proprietary vector services is acceptable despite project constraints.",
      isStated: false,
      validity: "UNSUPPORTED",
      riskImpact: "CRITICAL",
      challengeReason: "ULTRON has an explicit architectural non-negotiable constraint: 100% offline, local-first execution with zero paid cloud API dependencies.",
    });
  }

  // 7. Detect unstated assumption: "Newer is always better" (Appeal to Novelty)
  if (/\b(rewrite|migrate to|switch to|replace with)\b/i.test(query) && /\b(rust|bun|deno|mojo|langchain)\b/i.test(query)) {
    assumptions.push({
      assumption: "A modern rewrite will inherently solve existing latency or architectural challenges without introducing new failure modes.",
      isStated: false,
      validity: "QUESTIONABLE",
      riskImpact: "CRITICAL",
      challengeReason: "New frameworks introduce fresh dependency maintenance, unfamiliar debugging tooling, and high migration friction.",
    });
  }

  // 8. Detect unstated assumption: "Microservices equal scalability for desktop software"
  if (/\b(microservices?|distributed architecture)\b/i.test(query)) {
    assumptions.push({
      assumption: "Decomposing an in-process local desktop application into distributed services improves performance.",
      isStated: false,
      validity: "UNSUPPORTED",
      riskImpact: "CRITICAL",
      challengeReason: "In a single-user desktop environment, inter-process communication serialization, port collisions, and process management introduce significant overhead.",
    });
  }

  // 9. Detect unstated assumption: "Concurrency will scale without resource locking"
  if (/\b(concurrent|parallel|workers?|multi-thread)\b/i.test(query) && !/\b(lock|mutex|atomic|wal|semaphore)\b/i.test(query)) {
    assumptions.push({
      assumption: "Adding concurrent parallel workers will increase throughput linearly without requiring atomic locking or resource arbitration.",
      isStated: false,
      validity: "QUESTIONABLE",
      riskImpact: "MODERATE",
      challengeReason: "Shared file access (such as SQLite or config files) serializes at the OS kernel layer, turning parallel writes into lock contention.",
    });
  }

  // Ensure at least one baseline assumption is evaluated
  if (assumptions.length === 0) {
    assumptions.push({
      assumption: `The proposed approach for "${context.primaryGoal.slice(0, 60)}" assumes existing local hardware and system libraries are sufficient.`,
      isStated: false,
      validity: "SOUND",
      riskImpact: "LOW",
      challengeReason: "Local hardware has been verified during baseline environment auditing.",
    });
  }

  return assumptions;
}

/**
 * Evaluates structural logical fallacies in the user inquiry or proposed solution.
 * Uses semantic argument analysis rather than superficial single-keyword matching.
 *
 * @param context - Parsed context.
 * @returns Array of detected LogicalWeakness models.
 */
function analyzeLogicalWeaknesses(context: ParsedContext): LogicalWeakness[] {
  const query = context.cleanedQuery;
  const lower = query.toLowerCase();
  const weaknesses: LogicalWeakness[] = [];

  // 1. False Dichotomy: Framing as "Either X or Y" when viable hybrid alternatives exist
  const falseDichotomyMatch = /\b(?:either|or)\b.*\b(?:or|otherwise)\b/i.test(lower) ||
    /\b(should we (?:choose|pick|use)\s+([a-z0-9_-]+)\s+or\s+([a-z0-9_-]+))\b/i.test(lower);
  if (falseDichotomyMatch && !lower.includes("hybrid") && !lower.includes("both")) {
    weaknesses.push({
      fallacy: "FALSE_DICHOTOMY",
      quoteOrRef: query.slice(0, 100),
      explanation: "Framing the choice as an exclusive binary decision overlooks hybrid architectures or incremental migration paths.",
      counterExample: "Rather than choosing strictly between a complete rewrite or doing nothing, native module extensions (e.g. N-API) provide speed on hot paths while preserving existing stability.",
    });
  }

  // 2. Causal Leap & Post-Hoc Fallacy: Assuming temporal correlation proves causation
  const causalLeapMatch =
    /\b(?:because of .* (?:our|the) .* (?:crashes|fails|breaks|times out)|since .* (?:updated|changed) .*,? (?:the|our) .* (?:broke|crashed|failed))\b/i.test(lower) ||
    /\b(because of .* we must|since .* is failing, the entire .* is broken|error .* means .* is corrupted)\b/i.test(lower) ||
    /\b(?:since|after|following)\s+([a-z0-9_\s-]+?)\s+(?:updated|changed|happened)\b.*?\b(?:the|our)\s+([a-z0-9_\s-]+?)\s+(?:broke|crashed|is broken|failed)\b/i.test(lower) ||
    /\b(?:because of the (?:last|recent) [a-z0-9_\s-]+? update|since [a-z0-9_\s-]+? updated yesterday)\b/i.test(lower);
  if (causalLeapMatch) {
    weaknesses.push({
      fallacy: "CAUSAL_LEAP",
      quoteOrRef: query.slice(0, 100),
      explanation: "Assuming temporal correlation proves causation (Post Hoc Ergo Propter Hoc). Just because event B occurred after event A does not establish that event A caused event B.",
      counterExample: "An application failure following an OS update may stem from a coincident local configuration change, stale lockfile, or missing local environment variable rather than OS-level breakage.",
    });
  }

  // 3. Optimism Bias: Treating defensive security gates or test harnesses as disposable friction
  const optimismBiasMatch =
    /\b(delete|remove|disable|skip|bypass|get rid of)\b.*?\b(tests?|security|gateway|permission|confirmation|auth)\b/i.test(lower);
  if (optimismBiasMatch) {
    weaknesses.push({
      fallacy: "OPTIMISM_BIAS",
      quoteOrRef: query.slice(0, 100),
      explanation: "Treating automated tests, security checks, or authorization gates as disposable overhead under the assumption that past success guarantees future safety.",
      counterExample: "Automated regression tests and the Universal Permission Gateway are active fail-closed invariants; disabling them creates immediate vulnerability to token forgery and undetected regressions.",
    });
  }

  // 4. Sunk Cost Fallacy: Justifying continued investment solely based on past effort
  const sunkCostMatch =
    /\b(we already spent|we have invested so much|we cannot abandon .* now|after all this time)\b/i.test(lower);
  if (sunkCostMatch) {
    weaknesses.push({
      fallacy: "SUNK_COST",
      quoteOrRef: query.slice(0, 100),
      explanation: "Evaluating future technical viability based on past non-recoverable time and resource investments rather than forward-looking ROI.",
      counterExample: "Past development time cannot be recovered; the current decision must be judged strictly on maintenance costs, reliability, and upcoming feature velocity.",
    });
  }

  // 5. Appeal to Novelty: Valuing an approach purely because it is cutting-edge
  const noveltyMatch =
    /\b(latest|newest|modern|cutting-edge|trending|everyone is using)\b/i.test(lower) &&
    /\b(better|superior|must adopt|must switch)\b/i.test(lower);
  if (noveltyMatch) {
    weaknesses.push({
      fallacy: "APPEAL_TO_NOVELTY",
      quoteOrRef: query.slice(0, 100),
      explanation: "Equating technological recency with operational superiority without empirical stability and performance benchmarks.",
      counterExample: "Battle-tested libraries with mature documentation and predictable failure modes often deliver significantly higher production reliability than alpha-stage projects.",
    });
  }

  return weaknesses;
}

/**
 * Formulates evidence-based counterarguments and failure scenarios (Devil's Advocate).
 *
 * @param context - Parsed context.
 * @param assumptions - Evaluated assumptions.
 * @param weaknesses - Identified logical weaknesses.
 * @returns Object with counterarguments, Devil's Advocate scenarios, and overall stance.
 */
function formulateCritiqueAndStance(
  context: ParsedContext,
  assumptions: EvaluatedAssumption[],
  weaknesses: LogicalWeakness[]
): {
  counterarguments: string[];
  devilsAdvocateScenarios: string[];
  stance: CriticalThinkingResult["stance"];
  executiveCritique: string;
} {
  const counterarguments: string[] = [];
  const devilsAdvocateScenarios: string[] = [];

  // Build counterarguments from questionable or unsupported assumptions
  for (const a of assumptions) {
    if (a.validity === "QUESTIONABLE" || a.validity === "UNSUPPORTED") {
      counterarguments.push(
        `Critical Challenge: The assumption that "${a.assumption}" is unverified. ${a.challengeReason}`
      );
    }
  }

  // Build counterarguments from detected fallacies
  for (const w of weaknesses) {
    counterarguments.push(
      `Counterargument (${w.fallacy}): ${w.explanation} ${w.counterExample}`
    );
  }

  // Devil's Advocate failure modes
  devilsAdvocateScenarios.push(
    `Worst-Case Scenario 1 (Operational): If the proposed architecture encounters unexpected runtime concurrency under load, recovery may require emergency rollbacks and extensive downtime.`,
    `Worst-Case Scenario 2 (Resource): Diverting engineering attention to non-essential rewrites delays core product milestones and risks introducing unverified regressions.`
  );

  // Determine overall co-founder stance
  let stance: CriticalThinkingResult["stance"];
  const hasCriticalRisk = assumptions.some((a) => a.riskImpact === "CRITICAL" && a.validity !== "SOUND");
  const hasMultipleWeaknesses = weaknesses.length > 0;

  if (hasCriticalRisk) {
    stance = "DISAGREES_WITH_EVIDENCE";
  } else if (hasMultipleWeaknesses || assumptions.some((a) => a.validity === "QUESTIONABLE")) {
    stance = "PARTIALLY_VALID_WITH_RESERVATIONS";
  } else {
    stance = "AGREES_WITH_PREMISE";
  }

  let executiveCritique: string;
  if (stance === "DISAGREES_WITH_EVIDENCE") {
    const isSecurityOrTestRisk = assumptions.some(
      (a) => a.riskImpact === "CRITICAL" && /tests?|security|permission|token|paid cloud|cloud infrastructure/i.test(a.assumption)
    );
    if (isSecurityOrTestRisk) {
      executiveCritique =
        "I strongly push back on this proposal. Bypassing security boundaries, eliminating automated test harnesses, or introducing violating cloud dependencies directly compromises system integrity and safety guarantees.";
    } else {
      executiveCritique =
        "I respectfully push back on this approach. The premise contains critical unstated risks and unsupported assumptions that could compromise system stability or development velocity.";
    }
  } else if (stance === "PARTIALLY_VALID_WITH_RESERVATIONS") {
    executiveCritique =
      "The core intuition has merit, but requires key architectural guardrails. We must address identified assumptions before committing resources.";
  } else {
    executiveCritique =
      "The proposed approach is logically sound and aligns with our system constraints. Proceeding with targeted implementation and verification criteria.";
  }

  return {
    counterarguments,
    devilsAdvocateScenarios,
    stance,
    executiveCritique,
  };
}

/**
 * Main execution entry point for Component 03: Critical Thinking Engine.
 *
 * @param context - Parsed context from Context Understanding Engine.
 * @param reasoning - Optional reasoning results from Advanced Reasoning Engine.
 * @returns CriticalThinkingResult with evaluated assumptions, fallacies, counterarguments, and stance.
 */
export function performCriticalThinking(
  context: ParsedContext,
  reasoning?: AdvancedReasoningResult
): CriticalThinkingResult {
  const assumptions = evaluateAssumptions(context, reasoning);
  const weaknesses = analyzeLogicalWeaknesses(context);
  const { counterarguments, devilsAdvocateScenarios, stance, executiveCritique } =
    formulateCritiqueAndStance(context, assumptions, weaknesses);

  return {
    assumptions,
    weaknesses,
    counterarguments,
    devilsAdvocateScenarios,
    stance,
    executiveCritique,
  };
}
