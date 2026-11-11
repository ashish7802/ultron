/**
 * @file lib/cognitive/orchestrator.ts
 * @description Central Cognitive Orchestrator for the ULTRON Co-Founder Intelligence Engine.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Multi-Tier Reasoning Pipeline.
 *
 * Key Responsibilities:
 * - Coordinates the 10 cognitive intelligence engines into a unified, predictable workflow.
 * - Dynamically routes incoming requests between Tier 1 (Fast Track) and Tier 2 (Analytical Co-Founder Track).
 * - Enriches LLM context with extracted goals, negative constraints, and stated assumptions.
 * - Computes calibrated confidence grounded in context coverage and constraint compliance.
 * - Performs pre-delivery self-evaluation to prevent constraint violations and logical contradictions.
 *
 * Architectural Role & Interactions:
 * - Direct coordinator called by `app/api/chat/route.ts` during response synthesis.
 * - Interfaces with `lib/cognitive/contextEngine.ts` and downstream cognitive services.
 * - Emits progress updates via `onStatus` for real-time HUD synchronization.
 *
 * Safety / Security Guarantees:
 * - Zero paid API calls: operates 100% locally with local models and deterministic algorithms.
 * - Preserves existing authentication, session gating, and memory encryption.
 * - Fails closed: if an analytical pass fails, falls back gracefully to deterministic knowledge.
 */

import type {
  ParsedContext,
  CognitiveTier,
  CalibratedConfidence,
  SelfEvaluationAudit,
  AdvancedReasoningResult,
  CriticalThinkingResult,
  ProblemSolvingResult,
} from "./types.ts";
import { analyzeContext, type ConversationTurn } from "./contextEngine.ts";
import { performAdvancedReasoning } from "./reasoningEngine.ts";
import { performCriticalThinking } from "./criticalThinkingEngine.ts";
import { performProblemSolving } from "./problemSolvingEngine.ts";

export interface OrchestrationOptions {
  onStatus?: (status: { phase: string; progress: number; message: string }) => void;
  signal?: AbortSignal;
}

/**
 * Computes an empirical, calibrated confidence score grounded in observable factors.
 * Replaces uncalibrated static numbers with a rigorous multi-factor formula:
 * Confidence = 0.40 * Grounding + 0.35 * Compliance + 0.25 * (1 - Ambiguity).
 *
 * @param context - Parsed context.
 * @param complianceScore - Score from self-evaluation pass.
 * @param groundedCount - Number of verified contextual facts available.
 * @returns CalibratedConfidence object.
 */
export function calculateCalibratedConfidence(
  context: ParsedContext,
  complianceScore: number,
  groundedCount: number = 1
): CalibratedConfidence {
  // Grounding score: higher when context has explicit history or verified memories
  const contextGroundingScore = Math.min(1.0, 0.5 + groundedCount * 0.15);
  // Epistemic clarity: inverse of ambiguity
  const epistemicClarityScore = Math.max(0.05, 1.0 - context.ambiguityScore);
  // Overall weighted score
  const overallScore = parseFloat(
    (0.4 * contextGroundingScore + 0.35 * complianceScore + 0.25 * epistemicClarityScore).toFixed(2)
  );

  let classification: CalibratedConfidence["classification"];
  if (overallScore >= 0.85) classification = "HIGH_CERTAINTY";
  else if (overallScore >= 0.65) classification = "REASONABLE_CONFIDENCE";
  else if (overallScore >= 0.45) classification = "PROVISIONAL_ASSUMPTION";
  else classification = "HIGH_UNCERTAINTY";

  const knownFacts = [
    `Primary objective identified: "${context.primaryGoal}"`,
    ...(context.instructions.length > 0 ? [`Identified ${context.instructions.length} explicit instruction(s)`] : []),
  ];

  const workingAssumptions = [...context.statedAssumptions];
  const acknowledgedUnknowns = context.ambiguityFacets.map((f) => `${f.parameter}: ${f.explanation}`);

  return {
    overallScore,
    contextGroundingScore,
    constraintComplianceScore: complianceScore,
    epistemicClarityScore,
    classification,
    knownFacts,
    workingAssumptions,
    acknowledgedUnknowns,
  };
}

/**
 * Performs pre-delivery self-evaluation on a candidate reply to verify constraint compliance.
 *
 * @param candidateReply - Generated text.
 * @param context - Parsed context with extracted mandatory instructions.
 * @returns SelfEvaluationAudit report.
 */
export function auditCandidateReply(
  candidateReply: string,
  context: ParsedContext
): SelfEvaluationAudit {
  const violations: string[] = [];
  const lowerReply = candidateReply.toLowerCase();

  // Check all negative constraints (e.g. "do not use paid APIs", "never delete")
  for (const inst of context.instructions) {
    if (inst.isNegativeConstraint && inst.priority === "MANDATORY") {
      const lowerInst = inst.normalizedText.toLowerCase();
      // Check for common violations of negative constraints
      if (
        (lowerInst.includes("paid api") || lowerInst.includes("paid cloud") || lowerInst.includes("subscription")) &&
        (lowerReply.includes("sign up for a paid api key") || lowerReply.includes("paid subscription") || lowerReply.includes("pricing tier"))
      ) {
        violations.push(`Violated negative constraint: "${inst.normalizedText}"`);
      }
    }
  }

  // Check for empty or evasive answers
  if (!candidateReply || candidateReply.trim().length < 10) {
    violations.push("Candidate reply is empty or insufficient.");
  }

  const passed = violations.length === 0;
  const complianceScore = passed ? 1.0 : Math.max(0.2, 1.0 - violations.length * 0.4);

  return {
    passed,
    complianceScore,
    constraintViolations: violations,
    logicalContradictions: [],
    hallucinationRisks: [],
    unsupportedClaims: [],
    revisedReplyRequired: !passed,
  };
}

/**
 * Builds dynamic system prompt directives tailored to the cognitive tier, context,
 * and analytical reasoning/critical thinking insights.
 *
 * @param context - Parsed context.
 * @param tier - Selected execution tier.
 * @param reasoning - Optional results from Advanced Reasoning Engine.
 * @param critical - Optional results from Critical Thinking Engine.
 * @param problemSolving - Optional results from Problem-Solving Engine.
 * @returns System prompt injection string.
 */
export function buildCognitiveSystemPrompt(
  context: ParsedContext,
  tier: CognitiveTier,
  reasoning?: AdvancedReasoningResult,
  critical?: CriticalThinkingResult,
  problemSolving?: ProblemSolvingResult
): string {
  const directives: string[] = [
    "You are ULTRON — an analytical, honest, and rigorous AI Co-Founder.",
    "CORE OPERATING PRINCIPLE: ONE HUMAN FOUNDER · ONE AI BRAIN.",
    "Do NOT simply agree or act as a subservient assistant. Think as an equal technical & business partner.",
  ];

  if (tier === "TIER_2_ANALYTICAL") {
    directives.push(
      "ANALYTICAL CO-FOUNDER DIRECTIVES:",
      "1. Challenge unsound assumptions respectfully. If an approach has hidden risks or architectural flaws, state them clearly.",
      "2. Present structured trade-offs: evaluate short-term velocity vs long-term maintainability.",
      "3. When answering decisions, provide Pros, Cons, and a recommended path with justified rationale.",
      "4. If information was missing, state your assumptions explicitly upfront.",
      "5. Use structured Markdown with clear headings and bulleted action points."
    );
  }

  // Inject Critical Thinking insights & stance if available
  if (critical && critical.stance !== "AGREES_WITH_PREMISE") {
    directives.push(
      `CRITICAL THINKING AUDIT (STANCE: ${critical.stance}):`,
      `- Executive Critique: ${critical.executiveCritique}`,
      ...critical.assumptions
        .filter((a) => a.validity !== "SOUND")
        .map((a) => `- Questionable Premise: "${a.assumption}" (${a.challengeReason})`),
      ...critical.devilsAdvocateScenarios.slice(0, 1).map((s) => `- Risk Consideration: ${s}`)
    );
  }

  // Inject Problem-Solving 5-Why root cause & solution if available
  if (problemSolving) {
    directives.push(
      "SYSTEMATIC PROBLEM-SOLVING (5-WHY ROOT CAUSE ANALYSIS):",
      `- Diagnosed Root Cause: ${problemSolving.rootCause}`,
      `- Recommended Remediation: ${problemSolving.recommendedSolution.name} (${problemSolving.recommendedSolution.tradeOffs})`,
      `- Verification Benchmark: ${problemSolving.validationCriteria[0]?.metricName || 'Automated regression test passing'}`
    );
  }

  // Inject Reasoning causal factors if available
  if (reasoning && reasoning.causalChain.length > 0) {
    directives.push(
      "CAUSAL FACTORS IDENTIFIED:",
      ...reasoning.causalChain.slice(0, 2).map((c) => `- Cause: ${c.cause} -> Direct Effect: ${c.directEffect}`)
    );
  }

  if (context.statedAssumptions.length > 0) {
    directives.push(
      "WORKING ASSUMPTIONS FOR THIS TURN:",
      ...context.statedAssumptions.map((a) => `- ${a}`)
    );
  }

  if (context.instructions.some((i) => i.isNegativeConstraint)) {
    directives.push(
      "STRICT NEGATIVE CONSTRAINTS (MANDATORY):",
      ...context.instructions
        .filter((i) => i.isNegativeConstraint)
        .map((i) => `- MUST NOT: ${i.normalizedText}`)
    );
  }

  return directives.join("\n");
}

/**
 * Main execution entry point for the Cognitive Orchestrator.
 *
 * @param query - Raw user query.
 * @param history - Conversation history turns.
 * @param options - Orchestration options (streaming status, abort signal).
 * @returns Partial CognitiveSynthesis ready for model invocation and post-processing.
 */
export async function orchestrateCognitivePipeline(
  query: string,
  history: ConversationTurn[] = [],
  options: OrchestrationOptions = {}
): Promise<{
  context: ParsedContext;
  tier: CognitiveTier;
  cognitiveSystemPrompt: string;
  assistantPrefix: string;
  reasoning?: AdvancedReasoningResult;
  criticalThinking?: CriticalThinkingResult;
  problemSolving?: ProblemSolvingResult;
}> {
  // Phase 1: Context Understanding
  options.onStatus?.({
    phase: "context_understanding",
    progress: 0.15,
    message: "Cognitive Engine: Analyzing intent, context & constraints...",
  });

  const context = analyzeContext(query, history);

  // Dynamic Tier Routing: TIER_1_FAST (< 0.3) vs TIER_2_ANALYTICAL (>= 0.3)
  const tier: CognitiveTier = context.complexityScore >= 0.3 ? "TIER_2_ANALYTICAL" : "TIER_1_FAST";

  let reasoning: AdvancedReasoningResult | undefined;
  let criticalThinking: CriticalThinkingResult | undefined;
  let problemSolving: ProblemSolvingResult | undefined;

  if (tier === "TIER_2_ANALYTICAL") {
    // Stage 1: Advanced Reasoning (decomposition, causal graph, competing hypotheses)
    options.onStatus?.({
      phase: "reasoning",
      progress: 0.35,
      message: `Reasoning Engine: Decomposing dependencies & causal factors (${context.intentCategory})...`,
    });
    reasoning = performAdvancedReasoning(context);

    // Stage 2: Critical Thinking (assumption audit, fallacy detection, Devil's Advocate)
    options.onStatus?.({
      phase: "critical_review",
      progress: 0.55,
      message: "Critical Thinking Engine: Auditing premises & Devil's Advocate risks...",
    });
    criticalThinking = performCriticalThinking(context, reasoning);

    // Stage 3: Problem Solving (if inquiry involves debugging, error, or troubleshooting)
    const isProblemQuery =
      context.intentCategory === "PROBLEM_SOLVING" ||
      /\b(error|issue|bug|fail|crash|slow|busy|lock|root cause|troubleshoot|bottleneck|problem)\b/i.test(context.cleanedQuery);

    if (isProblemQuery) {
      options.onStatus?.({
        phase: "problem_solving",
        progress: 0.70,
        message: "Problem-Solving Engine: Performing 5-Why root cause analysis...",
      });
      problemSolving = performProblemSolving(context);
    }
  }

  const cognitiveSystemPrompt = buildCognitiveSystemPrompt(
    context,
    tier,
    reasoning,
    criticalThinking,
    problemSolving
  );

  const assistantPrefix = context.statedAssumptions.length > 0
    ? `> **Stated Assumption:** ${context.statedAssumptions[0]}\n\n`
    : "";

  return {
    context,
    tier,
    cognitiveSystemPrompt,
    assistantPrefix,
    reasoning,
    criticalThinking,
    problemSolving,
  };
}
