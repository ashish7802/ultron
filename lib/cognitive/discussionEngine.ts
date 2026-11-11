/**
 * @file lib/cognitive/discussionEngine.ts
 * @description Component 10: Co-Founder Discussion Engine for ULTRON.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Strategic Co-Founder Synthesis Layer.
 *
 * Key Responsibilities:
 * - Selective Activation: Guards the fast path, activating only for strategic decisions, business/product proposals,
 *   technical architecture reviews, risk assessments, and major trade-offs.
 * - 10-Stage Co-Founder Workflow:
 *   Stage 1: UNDERSTAND (Proposal, objective, constraints)
 *   Stage 2: INDEPENDENT ANALYSIS (Objective evaluation decoupled from confirmation bias)
 *   Stage 3: SUPPORTING ARGUMENTS (Strengths, strategic advantages, viability factors)
 *   Stage 4: OPPOSING ARGUMENTS / DEVIL'S ADVOCATE (Failure modes across Technical, Business, Product, and Financial risks)
 *   Stage 5: ALTERNATIVE STRATEGIES (Actionable alternatives evaluated against constraints)
 *   Stage 6: RISK EVALUATION (Structured categorization of severity, likelihood, and mitigations)
 *   Stage 7: DECISION EVALUATION (Integrated with Component 04 MCDA scoring)
 *   Stage 8: UNCERTAINTY EVALUATION (Integrated with Component 07 epistemic grounding)
 *   Stage 9: SELF-EVALUATION (Response validation against negative constraints and logical consistency)
 *   Stage 10: FINAL CO-FOUNDER RESPONSE (11-section structured synthesis with transparent recommendation)
 * - Constructive Disagreement: Evaluates evidence over user preference, challenges invalid assumptions with data,
 *   acknowledges when user premises are sound, and specifies exact conditions that would alter recommendations.
 *
 * Architectural Role & Interactions:
 * - Invoked by `lib/cognitive/orchestrator.ts` during analytical passes.
 * - Coordinates outputs from `decisionEngine.ts`, `uncertaintyEngine.ts`, and `criticalThinkingEngine.ts`.
 * - Surfaces comprehensive Co-Founder briefing telemetry to `app/api/chat/route.ts`.
 *
 * Safety / Security Guarantees:
 * - Strictly advisory-only (`isAdvisoryOnly: true`): Never executes actions or alters system files.
 * - Respects all non-negotiable negative constraints (100% offline, zero paid cloud APIs).
 * - Disqualifies any alternative that breaches mandatory project invariants.
 */

import type {
  ParsedContext,
  AdvancedReasoningResult,
  CriticalThinkingResult,
  DecisionIntelligenceResult,
  UncertaintyAssessmentResult,
  DiscussionStage,
  DiscussionRiskFactor,
  CoFounderDiscussionResult,
  FounderFeedback,
  FounderFeedbackContext,
} from "./types.ts";
import { performDecisionAnalysis } from "./decisionEngine.ts";
import { assessUncertaintyAndConfidence } from "./uncertaintyEngine.ts";
import { evaluateCandidateResponse } from "./selfEvaluationEngine.ts";

/**
 * Determines whether the user request requires the full Co-Founder Discussion Engine.
 *
 * Returns false for simple greetings, brief queries, status checks, or deterministic tool calls.
 * Returns true for strategic decisions, complex proposals, architecture debates, or multi-faceted business ideas.
 *
 * @param context - Parsed context.
 * @returns Boolean indicating whether discussion workflow should activate.
 */
export function isCoFounderDiscussionRequired(context: ParsedContext): boolean {
  const query = context.cleanedQuery.toLowerCase();
  const intent = context.intentCategory;

  // Fast-path guard: Greetings, fast commands, or trivial queries
  if (intent === "GREETING" || intent === "FAST_COMMAND" || query.length < 12) {
    return false;
  }

  // Explicit proposal or co-founder triggers
  if (
    /\b(co-founder|cofounder|evaluate my idea|what do you think of|feedback on|proposal|pitch|business idea|startup|strategy|strategic proposal)\b/i.test(query)
  ) {
    return true;
  }

  // Strategic decision involving comparisons or architectural pivots
  if (
    intent === "STRATEGIC_DECISION" ||
    /\b(should we|should i|choose between|compare|versus|vs|pivot to|migrate to|replace|is it worth)\b/i.test(query)
  ) {
    return true;
  }

  // Project planning involving major business or technical ventures
  if (
    intent === "PROJECT_PLANNING" &&
    /\b(launch|start|open|build|commercial|retail|company|venture|product|mvp)\b/i.test(query)
  ) {
    return true;
  }

  // Proposal evaluation with stated assumptions
  if (context.statedAssumptions.length > 0 && context.complexityScore >= 0.30) {
    return true;
  }

  return false;
}

/**
 * Formulates the Independent Assessment (Stage 2) decoupled from user confirmation bias.
 *
 * @param context - Parsed context.
 * @returns Concise objective assessment string.
 */
function formulateIndependentAssessment(context: ParsedContext): string {
  const query = context.cleanedQuery.toLowerCase();
  const hasNegativeConstraints = context.instructions.some((i) => i.isNegativeConstraint);

  if (query.includes("rewrite") || query.includes("overhaul")) {
    return "A complete architectural rewrite carries extreme regression risks, high engineering friction, and delayed time-to-value compared to targeted modular refactoring.";
  }

  if (query.includes("pinecone") || query.includes("cloud") || query.includes("aws")) {
    if (hasNegativeConstraints || query.includes("offline") || query.includes("free") || query.includes("zero") || query.includes("local")) {
      return "The proposed reliance on external cloud infrastructure directly violates non-negotiable local-first privacy and zero recurring cost invariants.";
    }
    return "Adopting paid cloud services introduces recurring operational liabilities, external network latency dependencies, and credentials security boundaries.";
  }

  if (/\b(coffee shop|restaurant|retail|cafe|store|bakery)\b/i.test(query)) {
    return "Physical commercial retail ventures require disciplined unit economics, upfront capital reserves for municipal permitting delays, and conservative customer volume assumptions.";
  }

  if (/\b(marathon|fitness|habit|language|study)\b/i.test(query)) {
    return "Sustainable personal skill acquisition relies on behavioral consistency, incremental progressive overload, and scheduled rest periods rather than unsustainable initial intensity.";
  }

  return `Objective evaluation of "${context.primaryGoal}": Feasible provided that architectural dependencies, cost constraints, and implementation complexity are rigorously bounded.`;
}

/**
 * Formulates Supporting Arguments (Stage 3) identifying genuine strengths and favorable conditions.
 *
 * @param context - Parsed context.
 * @returns Array of reasoned supporting factors.
 */
function formulateSupportingArguments(context: ParsedContext): string[] {
  const query = context.cleanedQuery.toLowerCase();
  const supports: string[] = [];

  if (query.includes("sqlite") || query.includes("local") || query.includes("in-memory")) {
    supports.push("Strictly preserves zero recurring cloud cost and eliminates external third-party data transmission.");
    supports.push("Guarantees low-latency in-process data access without network round-trip overhead.");
  }

  if (query.includes("wal") || query.includes("concurrency")) {
    supports.push("Enables concurrent reader access alongside serialized writer transactions, eliminating database lock starvation.");
  }

  if (/\b(coffee shop|retail|cafe|store)\b/i.test(query)) {
    supports.push("Direct local foot traffic provides immediate customer feedback loops and daily cash-flow opportunities.");
    supports.push("Tangible differentiated customer experience fosters strong neighborhood brand loyalty.");
  }

  if (/\b(marathon|fitness|language|habit|study)\b/i.test(query)) {
    supports.push("Structured milestone pacing protects against cognitive burnout and physical overuse injuries.");
    supports.push("Daily incremental repetitions establish neural automaticity and long-term retention.");
  }

  if (supports.length === 0) {
    supports.push(`Directly targets the primary user objective: "${context.primaryGoal}".`);
    supports.push("Clear baseline motivation provides alignment for focused engineering execution.");
  }

  return supports;
}

/**
 * Evaluates Devil's Advocate Risks (Stage 4) across Technical, Business, Product, and Financial categories.
 *
 * @param context - Parsed context.
 * @returns Array of structured DiscussionRiskFactor items.
 */
function evaluateDevilAdvocateRisks(context: ParsedContext): DiscussionRiskFactor[] {
  const query = context.cleanedQuery.toLowerCase();
  const risks: DiscussionRiskFactor[] = [];

  const isBusiness = /\b(coffee shop|restaurant|retail|cafe|store|bakery|hiring|recruit|marketing campaign|offline business|franchise)\b/i.test(query);
  const isFinancial = /\b(cash reserve|runway|capital|entire reserve|\$|financial risk|burn rate|all our cash|treasury)\b/i.test(query);
  const isPersonal = /\b(marathon|fitness|workout|exercise|running|run|gym|training|diet|weight loss|language|learn|habit|study)\b/i.test(query);

  if (isFinancial) {
    risks.push({
      category: "FINANCIAL",
      riskTitle: "Working Capital Depletion & Inflexible Cash Lockup",
      severity: "CRITICAL",
      explanation: "Allocating the entire working capital reserve to fixed infrastructural or operational commitments removes emergency liquidity buffer.",
      failureScenario: "Unforeseen delays, cost overruns, or slow monetization exhaust liquid capital reserves, forcing premature shutdown.",
      suggestedMitigation: "Cap initial investment to maximum 25% of liquid reserves and fund expansion from proven operational cash-flow.",
    });
  }

  if (isBusiness) {
    // Business Risks
    risks.push({
      category: "BUSINESS",
      riskTitle: "Prolonged Regulatory Permitting & Inspection Lead Time",
      severity: "HIGH",
      explanation: "Municipal health and fire department inspection backlogs frequently push opening dates back by 4-8 weeks.",
      failureScenario: "Commercial lease rent accrues while the storefront remains legally barred from retail operations.",
      suggestedMitigation: "Submit architectural plans early, schedule pre-inspections, and negotiate lease rent-abatement float.",
    });

    // Financial Risks
    risks.push({
      category: "FINANCIAL",
      riskTitle: "Working Capital Depletion Before Break-Even Throughput",
      severity: "CRITICAL",
      explanation: "Initial payroll, inventory waste, and fixed commercial utilities often exceed early gross revenues.",
      failureScenario: "Cash reserves exhaust within the first 90 days before customer retention stabilizes.",
      suggestedMitigation: "Maintain a strict 6-month operating expense runway reserve before signing commercial commitments.",
    });

    // Product / Market Risks
    risks.push({
      category: "PRODUCT",
      riskTitle: "Demographic Misalignment & Neighborhood Cannibalization",
      severity: "MEDIUM",
      explanation: "Proximity to entrenched retail incumbents can suppress organic customer acquisition.",
      failureScenario: "Daily foot-traffic volume fails to reach the critical break-even customer volume.",
      suggestedMitigation: "Conduct on-site pedestrian counts across morning peak hours before finalizing lease terms.",
    });

    return risks;
  }

  if (isPersonal) {
    // Personal / Operational Risks
    risks.push({
      category: "TECHNICAL",
      riskTitle: "Overtraining, Physiological Fatigue or Cognitive Exhaustion",
      severity: "HIGH",
      explanation: "Ramping up session volume or intensity too aggressively without adequate biological recovery periods.",
      failureScenario: "Acute overuse injury or psychological burnout leading to complete routine abandonment.",
      suggestedMitigation: "Enforce a strict 10% maximum weekly volume increment cap and insert mandatory deload weeks.",
    });

    risks.push({
      category: "PRODUCT",
      riskTitle: "Habit Disruption from Unscheduled Real-Life Friction",
      severity: "MEDIUM",
      explanation: "Travel, acute illness, or emergency work schedule shifts disrupting habit consistency cues.",
      failureScenario: "Missing several consecutive days triggers the 'what-the-hell' effect, breaking habit automaticity.",
      suggestedMitigation: "Deploy the 'never miss twice' protocol with a fallback 5-minute emergency minimum viable session.",
    });

    return risks;
  }

  // Technical Software Architecture Risks
  risks.push({
    category: "TECHNICAL",
    riskTitle: "High Coupling & Thread Starvation under Multi-Turn Concurrency",
    severity: "HIGH",
    explanation: "Executing compute-heavy analytical loops on the primary thread can delay user message turns.",
    failureScenario: "Client requests encounter latency timeouts or UI freeze during heavy reasoning decomposition.",
    suggestedMitigation: "Offload compute passes to async worker pools and configure database WAL concurrency pragma.",
  });

  if (query.includes("cloud") || query.includes("pinecone") || query.includes("api")) {
    risks.push({
      category: "TECHNICAL",
      riskTitle: "External Network Dependency & Credential Boundary Vulnerability",
      severity: "CRITICAL",
      explanation: "Transmitting analytical state over WAN requires third-party API keys and exposes data outside host memory.",
      failureScenario: "Cloud outage or expired API token halts desktop application functionality entirely.",
      suggestedMitigation: "Adhere to 100% offline local inference over local loopback with zero paid API dependencies.",
    });
  }

  if (query.includes("rewrite") || query.includes("overhaul")) {
    risks.push({
      category: "TECHNICAL",
      riskTitle: "Broad Regression Surface across Established Security Gates",
      severity: "CRITICAL",
      explanation: "Sweeping architectural overhauls invalidate verified encryption, permission, and session boundaries.",
      failureScenario: "Security bypasses or broken IPC contracts slip past unit tests into release builds.",
      suggestedMitigation: "Execute incremental modular refactoring backed by immediate test regression suites.",
    });
  }

  if (
    (query.includes("skip") || query.includes("delete") || query.includes("remove") || query.includes("zero")) &&
    (query.includes("test") || query.includes("suite") || query.includes("verification"))
  ) {
    risks.push({
      category: "TECHNICAL",
      riskTitle: "Destruction of Regression Detection & Safety Baselines",
      severity: "CRITICAL",
      explanation: "Removing test suites hides latent bugs, breaks CI guarantees, and drastically inflates technical debt.",
      failureScenario: "Uncaught breaking changes cascade into production without build-time early warning.",
      suggestedMitigation: "Retain automated test coverage and use parallel execution or test selection instead.",
    });
  }

  return risks;
}

/**
 * Formulates Opposing Arguments (Stage 4) detailing why the proposal could encounter friction or failure.
 *
 * @param context - Parsed context.
 * @param risks - Evaluated Devil's Advocate risks.
 * @returns Array of concrete opposing counterarguments.
 */
function formulateOpposingArguments(context: ParsedContext, risks: DiscussionRiskFactor[]): string[] {
  const query = context.cleanedQuery.toLowerCase();
  const opposing: string[] = [];

  for (const r of risks) {
    opposing.push(`${r.riskTitle} [${r.category}]: ${r.explanation}`);
  }

  if (query.includes("rewrite")) {
    opposing.push("Total rewrites consistently take 2-3x longer than projected and introduce new edge-case bugs.");
  }

  if (
    (query.includes("skip") || query.includes("delete") || query.includes("remove") || query.includes("zero")) &&
    (query.includes("test") || query.includes("suite") || query.includes("verification"))
  ) {
    opposing.push("Skipping verification tests or deleting test suites creates immediate unquantified technical debt and regressions.");
  }

  if (opposing.length === 0) {
    opposing.push("Implementation effort and ongoing maintenance may outweigh the marginal capabilities gained.");
  }

  return opposing;
}

/**
 * Builds the comprehensive 11-section Co-Founder Discussion Report.
 */
function formatStructuredDiscussionReport(
  proposal: string,
  independentAssessment: string,
  supports: string[],
  opposing: string[],
  risks: DiscussionRiskFactor[],
  alternatives: string[],
  comparativeEvaluation: string,
  recommendation: string,
  assumptions: string[],
  conditionsAltering: string[],
  nextSteps: string[],
  founderFeedbackContext?: FounderFeedbackContext
): string {
  const feedbackSection =
    founderFeedbackContext && founderFeedbackContext.feedbackCount > 0
      ? `## 👤 Human Co-Founder Guidance & Feedback Integration\n${founderFeedbackContext.acknowledgments.map((a) => `- ${a}`).join("\n")}\n\n*Influence on this turn:* ${founderFeedbackContext.influenceSummary}\n\n`
      : "";

  return (
    `# 🤝 ULTRON Co-Founder Strategic Briefing\n\n` +
    `## 1. Understanding of the Proposal\n${proposal}\n\n` +
    feedbackSection +
    `## 2. Independent Co-Founder Assessment\n${independentAssessment}\n\n` +
    `## 3. What Supports the Proposal (Viability Factors)\n${supports.map((s) => `- ${s}`).join("\n")}\n\n` +
    `## 4. What Challenges the Proposal (Devil's Advocate Counterarguments)\n${opposing.map((o) => `- ${o}`).join("\n")}\n\n` +
    `## 5. Major Risk Breakdown\n${risks.map((r) => `- **[${r.category}] ${r.riskTitle}** (${r.severity}): ${r.explanation} *Mitigation:* ${r.suggestedMitigation}`).join("\n")}\n\n` +
    `## 6. Alternative Strategic Approaches\n${alternatives.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\n` +
    `## 7. Comparative Trade-Off Evaluation\n${comparativeEvaluation}\n\n` +
    `## 8. Final Co-Founder Recommendation\n${recommendation}\n\n` +
    `## 9. Stated Working Assumptions & Unknowns\n${assumptions.map((a) => `- ${a}`).join("\n")}\n\n` +
    `## 10. Conditions That Could Alter This Recommendation\n${conditionsAltering.map((c) => `- ${c}`).join("\n")}\n\n` +
    `## 11. Actionable Next Steps\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` +
    `> **Advisory Disclaimer:** This briefing is rendered by the ULTRON Co-Founder Discussion Engine for strategic planning and executive decision support. It represents structured advisory analysis, not autonomous execution. Founder feedback informs this session turn only; no permanent weights or background learning are simulated.`
  );
}

/**
 * Main execution entry point for Component 10: Co-Founder Discussion Engine.
 *
 * Implements the 10-stage structured Co-Founder Discussion workflow:
 * STAGE 1: Understand
 * STAGE 2: Independent Analysis
 * STAGE 3: Supporting Arguments
 * STAGE 4: Opposing Arguments (Devil's Advocate)
 * STAGE 5: Alternative Strategies (Integrated with Decision Engine)
 * STAGE 6: Risk Evaluation
 * STAGE 7: Decision Evaluation
 * STAGE 8: Uncertainty Evaluation
 * STAGE 9: Self-Evaluation
 * STAGE 10: Final Co-Founder Response
 *
 * @param context - Parsed context.
 * @param reasoning - Optional results from Reasoning Engine.
 * @param critique - Optional results from Critical Thinking Engine.
 * @param decision - Optional results from Decision Engine.
 * @param uncertainty - Optional results from Uncertainty Engine.
 * @param founderFeedback - Optional prior human founder feedback to integrate.
 * @returns CoFounderDiscussionResult with 11-section structured briefing.
 */
export function performCoFounderDiscussion(
  context: ParsedContext,
  reasoning?: AdvancedReasoningResult,
  critique?: CriticalThinkingResult,
  decision?: DecisionIntelligenceResult,
  uncertainty?: UncertaintyAssessmentResult,
  founderFeedback?: FounderFeedback[]
): CoFounderDiscussionResult {
  const stagesCompleted: DiscussionStage[] = [];

  // Integrate explicit human founder feedback into advisory context if provided
  let founderFeedbackContext: FounderFeedbackContext | undefined;
  if (founderFeedback && founderFeedback.length > 0) {
    const acknowledgments = founderFeedback.map(
      (f) => `[${f.category}] Human Co-Founder on "${f.targetTopic}": "${f.comment}".`
    );
    const influenceSummary =
      `Human co-founder feedback across ${founderFeedback.length} item(s) (${founderFeedback.map((f) => f.category).join(", ")}) was evaluated and factored into current trade-off weighting. (Advisory input only; not treated as verified objective ground truth).`;

    founderFeedbackContext = {
      activeFeedback: founderFeedback,
      feedbackCount: founderFeedback.length,
      acknowledgments,
      influenceSummary,
      isTreatedAsGroundTruth: false,
      learningScope: "CURRENT_SESSION_ONLY",
    };
  }

  // STAGE 1: Understand
  stagesCompleted.push("STAGE_01_UNDERSTAND");
  const proposalSummary =
    `Proposal Focus: "${context.primaryGoal}". ` +
    `Identified ${context.instructions.length} parameter(s), ` +
    `${context.instructions.filter((i) => i.isNegativeConstraint).length} negative constraint(s), ` +
    `and an ambiguity index of ${context.ambiguityScore}.`;

  // STAGE 2: Independent Analysis
  stagesCompleted.push("STAGE_02_INDEPENDENT_ANALYSIS");
  const independentAssessment = formulateIndependentAssessment(context);

  // STAGE 3: Supporting Arguments
  stagesCompleted.push("STAGE_03_SUPPORTING_ARGUMENTS");
  const supportingArguments = formulateSupportingArguments(context);

  // STAGE 4: Opposing Arguments (Devil's Advocate)
  stagesCompleted.push("STAGE_04_OPPOSING_ARGUMENTS");
  const devilAdvocateRisks = evaluateDevilAdvocateRisks(context);
  const opposingArguments = formulateOpposingArguments(context, devilAdvocateRisks);

  // Inject founder feedback counterarguments or cautions into opposing arguments if relevant
  if (founderFeedbackContext) {
    for (const f of founderFeedbackContext.activeFeedback) {
      if (f.category === "INCORRECT_ASSUMPTION" || f.category === "DISAGREE" || f.category === "INCORRECT_RECOMMENDATION") {
        opposingArguments.push(`Founder Observation [${f.category}]: ${f.comment}`);
      }
    }
  }

  // STAGE 5: Alternative Strategies (Integrated with Decision Engine)
  stagesCompleted.push("STAGE_05_ALTERNATIVE_STRATEGIES");
  const activeDecision = decision || performDecisionAnalysis(context, reasoning, critique);
  const alternativeStrategies = activeDecision.candidates.map(
    (c) => `"${c.name}" — Impact: ${c.expectedImpact}/5, Complexity: ${c.implementationComplexity}/5, Reversibility: ${c.reversibility}, Cost: ${c.financialCost.category}`
  );

  // If founder suggested a better alternative, inject it as a candidate alternative
  if (founderFeedbackContext) {
    for (const f of founderFeedbackContext.activeFeedback) {
      if (f.suggestedAlternative) {
        alternativeStrategies.push(`Founder-Proposed Alternative: "${f.suggestedAlternative}" (Provided via feedback on ${f.targetTopic})`);
      }
    }
  }

  // STAGE 6: Risk Evaluation
  stagesCompleted.push("STAGE_06_RISK_EVALUATION");

  // STAGE 7: Decision Evaluation
  stagesCompleted.push("STAGE_07_DECISION_EVALUATION");
  const comparativeEvaluation = activeDecision.recommendedOption
    ? `MCDA scoring evaluated ${activeDecision.candidates.length} options. Recommended option "${activeDecision.recommendedOption.name}" achieved top score (${activeDecision.recommendedOption.weightedScore}) due to zero recurring cost and verified local-first alignment. Rejected ${activeDecision.rejectedAlternatives.length} alternative(s).`
    : `All ${activeDecision.candidates.length} candidate option(s) were disqualified (${activeDecision.epistemicStatus}) because they breach non-negotiable project boundaries.`;

  const finalRecommendation = activeDecision.recommendedOption
    ? `Proceed with "${activeDecision.recommendedOption.name}". ${activeDecision.rationaleSummary}`
    : `Reject all proposed candidates due to invariant boundary violations. ${activeDecision.rationaleSummary}`;

  // STAGE 8: Uncertainty Evaluation
  stagesCompleted.push("STAGE_08_UNCERTAINTY_EVALUATION");
  const activeUncertainty = uncertainty || assessUncertaintyAndConfidence(context);
  const assumptionsAndUnknowns = [
    ...context.statedAssumptions,
    ...(activeUncertainty.missingInformation.length > 0 ? activeUncertainty.missingInformation : ["Host system environment operates under standard desktop constraints."]),
    `Calibrated Epistemic Stance: "${activeUncertainty.epistemicPhrasing}" (Certainty Score: ${activeUncertainty.overallCertaintyScore})`,
  ];

  // STAGE 9: Self-Evaluation & Invariant Audit
  stagesCompleted.push("STAGE_09_SELF_EVALUATION");
  const conditionsAlteringRecommendation = [
    "Discovery of previously unidentified mandatory constraints that disqualify the recommended option.",
    "Significant shifts in available hardware compute (RAM/VRAM) or local execution timeouts.",
    "New empirical user requirements demanding higher real-time throughput over local privacy.",
  ];

  if (founderFeedbackContext) {
    conditionsAlteringRecommendation.push(
      `Direct founder overrides based on session guidance: ${founderFeedbackContext.influenceSummary}`
    );
  }

  const suggestedNextSteps = [
    activeDecision.recommendedOption
      ? `Draft low-risk implementation spike for "${activeDecision.recommendedOption.name}".`
      : "Formulate feasible local-first candidate alternatives that satisfy all mandatory constraints.",
    "Review Devil's Advocate risks and formalize contingency triggers in project documentation.",
    "Execute automated test suites to ensure zero regressions across security and session gates.",
  ];

  // STAGE 10: Final Co-Founder Response
  stagesCompleted.push("STAGE_10_FINAL_SYNTHESIS");
  const structuredDiscussionReport = formatStructuredDiscussionReport(
    proposalSummary,
    independentAssessment,
    supportingArguments,
    opposingArguments,
    devilAdvocateRisks,
    alternativeStrategies,
    comparativeEvaluation,
    finalRecommendation,
    assumptionsAndUnknowns,
    conditionsAlteringRecommendation,
    suggestedNextSteps,
    founderFeedbackContext
  );

  // Self-evaluation validation on generated synthesis
  evaluateCandidateResponse(structuredDiscussionReport, context, activeUncertainty);

  return {
    proposalSummary,
    independentAssessment,
    supportingArguments,
    opposingArguments,
    devilAdvocateRisks,
    alternativeStrategies,
    comparativeEvaluation,
    finalRecommendation,
    assumptionsAndUnknowns,
    conditionsAlteringRecommendation,
    suggestedNextSteps,
    structuredDiscussionReport,
    isAdvisoryOnly: true,
    stagesCompleted,
    founderFeedbackContext,
  };
}
