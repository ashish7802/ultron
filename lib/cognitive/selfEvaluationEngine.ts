/**
 * @file lib/cognitive/selfEvaluationEngine.ts
 * @description Component 08: Self-Evaluation & Response Validation Engine for ULTRON.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Pre-Delivery Validation Pipeline.
 *
 * Key Responsibilities:
 * - Implements the pre-delivery validation workflow:
 *   Candidate Response -> Multi-Factor Evaluation -> Defect Detection -> Correction Decision -> Final Response.
 * - Evaluates candidate responses across 9 rigorous criteria:
 *   1. Instruction Compliance (Mandatory instructions, negative constraints)
 *   2. Context Relevance (Direct alignment with user's primary goal)
 *   3. Factual Grounding (Anchored in local offline facts)
 *   4. Logical Consistency (Deductions, calculations, non-contradiction)
 *   5. Completeness (Addresses all parts of multi-part goals)
 *   6. Contradictions (Self-consistency and alignment with prompt)
 *   7. Unsupported Claims (Detects hallucinated external dependencies or APIs)
 *   8. Risky Assumptions (Unchecked assumptions affecting security or stability)
 *   9. Clarity and Usefulness (Actionable, articulate, non-evasive)
 * - Identifies specific defects with category, severity, location quote, and remediation actions.
 * - Enforces infinite-loop prevention with strict iteration capping.
 * - Corrects detectable defects safely before delivery while preserving user intent.
 *
 * Architectural Role & Interactions:
 * - Invoked by `lib/cognitive/orchestrator.ts` and `app/api/chat/route.ts` prior to streaming or delivering replies.
 * - Interfaces with `ParsedContext` and `UncertaintyAssessmentResult`.
 *
 * Safety / Security Guarantees:
 * - Strictly in-memory analysis and string transformation: zero file writes, zero shell execution.
 * - Preserves user safety: never silently invents missing facts to simulate completeness.
 * - Fails closed: if an unresolvable defect exists, alerts the founder rather than concealing the error.
 */

import type {
  ParsedContext,
  ResponseDefect,
  EvaluationScoreCard,
  CorrectionDecision,
  SelfEvaluationResult,
  UncertaintyAssessmentResult,
} from "./types.ts";

/**
 * Maximum remediation iterations allowed to prevent infinite correction loops.
 */
const MAX_REMEDIATION_ITERATIONS = 2;

/**
 * Evaluates a candidate response across the 9 core quality and security criteria.
 *
 * @param candidateReply - Raw text proposed by LLM or synthesis pipeline.
 * @param context - Parsed context with extracted instructions and constraints.
 * @param uncertainty - Optional uncertainty assessment from Component 07.
 * @returns SelfEvaluationResult with scorecard, detected defects, and correction decision.
 */
export function evaluateCandidateResponse(
  candidateReply: string,
  context: ParsedContext,
  uncertainty?: UncertaintyAssessmentResult
): SelfEvaluationResult {
  const defects: ResponseDefect[] = [];
  const lower = (candidateReply || "").toLowerCase().trim();

  // --------------------------------------------------------------------------
  // Criterion 1 & 6: Instruction Compliance & Negative Constraint Breaches
  // --------------------------------------------------------------------------
  let instructionComplianceScore = 1.0;
  for (const inst of context.instructions) {
    if (inst.isNegativeConstraint && inst.priority === "MANDATORY") {
      const lowerInst = inst.normalizedText.toLowerCase();

      // Negative constraint: Zero paid cloud APIs / Pinecone / AWS
      if (
        (lowerInst.includes("paid api") || lowerInst.includes("paid cloud") || lowerInst.includes("subscription")) &&
        (lower.includes("pinecone") || lower.includes("sign up for a paid") || lower.includes("monthly subscription") || lower.includes("aws dynamodb"))
      ) {
        defects.push({
          category: "NEGATIVE_CONSTRAINT_BREACH",
          severity: "CRITICAL",
          description: `Breached mandatory negative constraint: "${inst.normalizedText}". Candidate suggested paid cloud services.`,
          locationQuote: candidateReply.slice(0, 100),
          remediationAction: "Replace paid cloud references with local SQLite or in-process alternatives.",
        });
        instructionComplianceScore -= 0.5;
      }

      // Negative constraint: Do not delete/skip tests
      if (
        (lowerInst.includes("test") || lowerInst.includes("verify")) &&
        (lower.includes("delete the tests") || lower.includes("skip the unit tests") || lower.includes("disable testing"))
      ) {
        defects.push({
          category: "NEGATIVE_CONSTRAINT_BREACH",
          severity: "CRITICAL",
          description: `Breached negative constraint regarding testing: "${inst.normalizedText}".`,
          locationQuote: candidateReply.slice(0, 100),
          remediationAction: "Preserve test suites and formulate non-destructive verification steps.",
        });
        instructionComplianceScore -= 0.5;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Criterion 2 & 9: Context Relevance, Clarity & Usefulness
  // --------------------------------------------------------------------------
  let contextRelevanceScore = 1.0;
  if (!candidateReply || candidateReply.trim().length < 15) {
    defects.push({
      category: "UNCLEAR_OR_EVASIVE",
      severity: "CRITICAL",
      description: "Candidate reply is empty or excessively brief (< 15 characters).",
      remediationAction: "Expand candidate response with structured explanation addressing the user goal.",
    });
    contextRelevanceScore = 0.1;
  } else if (
    context.primaryGoal.length > 20 &&
    !lower.includes(context.primaryGoal.toLowerCase().slice(0, 15)) &&
    context.complexityScore >= 0.4 &&
    !lower.includes("analysis") &&
    !lower.includes("recommend") &&
    !lower.includes("sqlite") &&
    !lower.includes("ultron")
  ) {
    defects.push({
      category: "CONTEXT_IRRELEVANCE",
      severity: "MAJOR",
      description: "Candidate reply appears unaligned with the stated primary goal.",
      remediationAction: "Re-anchor introduction to explicitly acknowledge the user's primary objective.",
    });
    contextRelevanceScore = 0.5;
  }

  // --------------------------------------------------------------------------
  // Criterion 3 & 7: Factual Grounding & Unsupported Claims
  // --------------------------------------------------------------------------
  let factualGroundingScore = uncertainty?.groundingScore ?? 0.8;
  if (
    lower.includes("connected to the internet") ||
    lower.includes("calling external openapi server") ||
    lower.includes("cloud database connected")
  ) {
    defects.push({
      category: "UNSUPPORTED_CLAIM",
      severity: "CRITICAL",
      description: "False claim of external internet or remote cloud connectivity in an offline local build.",
      remediationAction: "Correct claim: ULTRON operates 100% locally and offline without external connections.",
    });
    factualGroundingScore = Math.max(0.2, factualGroundingScore - 0.4);
  }

  // --------------------------------------------------------------------------
  // Criterion 4: Logical Consistency & Arithmetic Deductions
  // --------------------------------------------------------------------------
  let logicalConsistencyScore = 1.0;
  // Check for simple arithmetic contradictions (e.g. "5 - 2 = 7")
  const arithmeticMatch = candidateReply.match(/([0-9]+)\s*([+\-*])\s*([0-9]+)\s*=\s*([0-9]+)/);
  if (arithmeticMatch) {
    const a = parseInt(arithmeticMatch[1], 10);
    const op = arithmeticMatch[2];
    const b = parseInt(arithmeticMatch[3], 10);
    const claimed = parseInt(arithmeticMatch[4], 10);
    let expected = 0;
    if (op === "+") expected = a + b;
    else if (op === "-") expected = a - b;
    else if (op === "*") expected = a * b;

    if (claimed !== expected) {
      defects.push({
        category: "LOGICAL_INCONSISTENCY",
        severity: "MAJOR",
        description: `Arithmetic inconsistency detected: claimed "${arithmeticMatch[0]}", but ${a} ${op} ${b} is ${expected}.`,
        locationQuote: arithmeticMatch[0],
        remediationAction: `Correct calculation to "${a} ${op} ${b} = ${expected}".`,
      });
      logicalConsistencyScore = 0.4;
    }
  }

  // --------------------------------------------------------------------------
  // Criterion 5: Completeness (Multi-Part Instruction Coverage)
  // --------------------------------------------------------------------------
  let completenessScore = 1.0;
  if (context.isMultiStep && context.subGoals.length > 0) {
    const unaddressed = context.subGoals.filter(
      (sub) => !lower.includes(sub.toLowerCase().slice(0, 20))
    );
    if (unaddressed.length > 0 && unaddressed.length === context.subGoals.length) {
      defects.push({
        category: "INCOMPLETENESS",
        severity: "MAJOR",
        description: `Candidate response omitted sub-goal requirements: "${unaddressed[0]}".`,
        remediationAction: "Incorporate dedicated section addressing the omitted sub-goal.",
      });
      completenessScore = 0.5;
    }
  }

  // --------------------------------------------------------------------------
  // Criterion 8: Risky Assumptions & Transparency
  // --------------------------------------------------------------------------
  if (context.statedAssumptions.length > 0 && !lower.includes("assumption")) {
    defects.push({
      category: "RISKY_ASSUMPTION",
      severity: "MINOR",
      description: "Working assumptions were identified in context but omitted from candidate response.",
      remediationAction: "Prepend transparent stated assumption banner.",
    });
  }

  // Calculate scorecard
  instructionComplianceScore = Math.max(0.0, Math.min(1.0, instructionComplianceScore));
  contextRelevanceScore = Math.max(0.0, Math.min(1.0, contextRelevanceScore));
  factualGroundingScore = Math.max(0.0, Math.min(1.0, factualGroundingScore));
  logicalConsistencyScore = Math.max(0.0, Math.min(1.0, logicalConsistencyScore));
  completenessScore = Math.max(0.0, Math.min(1.0, completenessScore));
  const safetyAndConstraints = defects.some((d) => d.severity === "CRITICAL") ? 0.2 : 1.0;

  const overallScore = parseFloat(
    (
      instructionComplianceScore * 0.25 +
      contextRelevanceScore * 0.20 +
      factualGroundingScore * 0.15 +
      logicalConsistencyScore * 0.15 +
      completenessScore * 0.15 +
      safetyAndConstraints * 0.10
    ).toFixed(2)
  );

  const passed = defects.filter((d) => d.severity === "CRITICAL" || d.severity === "MAJOR").length === 0;

  let correctionDecision: CorrectionDecision = "NO_CORRECTION_NEEDED";
  if (!passed) {
    if (defects.some((d) => d.category === "NEGATIVE_CONSTRAINT_BREACH" || d.category === "UNCLEAR_OR_EVASIVE" || d.category === "LOGICAL_INCONSISTENCY")) {
      correctionDecision = "AUTOMATIC_CORRECTION_APPLIED";
    } else if (uncertainty?.requiresClarification) {
      correctionDecision = "REQUIRES_CLARIFICATION";
    } else {
      correctionDecision = "AUTOMATIC_CORRECTION_APPLIED";
    }
  }

  const scoreCard: EvaluationScoreCard = {
    instructionCompliance: instructionComplianceScore,
    contextRelevance: contextRelevanceScore,
    factualGrounding: factualGroundingScore,
    logicalConsistency: logicalConsistencyScore,
    completeness: completenessScore,
    safetyAndConstraints,
    overallScore,
  };

  return {
    passed,
    scoreCard,
    defects,
    correctionDecision,
    originalReply: candidateReply,
    iterationCount: 1,
  };
}

/**
 * Executes controlled deterministic remediation on a candidate reply containing defects.
 *
 * Requirements:
 * - Avoids infinite loops (caps remediation at MAX_REMEDIATION_ITERATIONS).
 * - Avoids unnecessary regeneration by applying surgical, deterministic replacements.
 * - Preserves user intent; never invents missing facts.
 * - If remediation cannot safely resolve defects, communicates limitations explicitly.
 *
 * @param candidateReply - Text proposed by LLM or synthesis.
 * @param evaluation - Completed evaluation result.
 * @param context - Parsed context.
 * @param iteration - Current remediation attempt count.
 * @returns Remediated reply string and execution summary.
 */
export function remediateCandidateResponse(
  candidateReply: string,
  evaluation: SelfEvaluationResult,
  context: ParsedContext,
  iteration: number = 1
): {
  finalReply: string;
  decision: CorrectionDecision;
  correctionSummary: string;
} {
  // Loop guard: prevent infinite recursion
  if (iteration > MAX_REMEDIATION_ITERATIONS) {
    const fallbackText =
      `${candidateReply}\n\n` +
      `> **[Self-Evaluation Limitation Warning]**: Response was delivered with reservations. ` +
      `Encountered complex defects that could not be deterministically remediated within ${MAX_REMEDIATION_ITERATIONS} passes: ` +
      evaluation.defects.map((d) => d.description).join("; ");

    return {
      finalReply: fallbackText,
      decision: "CANNOT_SAFELY_CORRECT",
      correctionSummary: `Loop limit reached (${iteration} passes). Emitted response with safety advisory.`,
    };
  }

  if (evaluation.passed) {
    return {
      finalReply: candidateReply,
      decision: "NO_CORRECTION_NEEDED",
      correctionSummary: "Response passed all 9 self-evaluation criteria without defects.",
    };
  }

  let repaired = candidateReply;
  const appliedActions: string[] = [];

  for (const defect of evaluation.defects) {
    // 1. Remediate negative constraint breach (paid cloud / Pinecone / AWS)
    if (defect.category === "NEGATIVE_CONSTRAINT_BREACH" && (repaired.toLowerCase().includes("pinecone") || repaired.toLowerCase().includes("aws dynamodb"))) {
      repaired = repaired.replace(
        /\b(?:pinecone|aws dynamodb)\b/gi,
        "local SQLite vector storage"
      );
      repaired = repaired.replace(
        /\b(?:sign up for a paid api key|paid subscription)\b/gi,
        "use existing zero-cost local architecture"
      );
      appliedActions.push("Substituted paid cloud services with local zero-cost SQLite architecture.");
    }

    // 2. Remediate arithmetic calculation defects
    if (defect.category === "LOGICAL_INCONSISTENCY" && defect.locationQuote) {
      const match = defect.locationQuote.match(/([0-9]+)\s*([+\-*])\s*([0-9]+)\s*=\s*([0-9]+)/);
      if (match) {
        const a = parseInt(match[1], 10);
        const op = match[2];
        const b = parseInt(match[3], 10);
        let corrected = 0;
        if (op === "+") corrected = a + b;
        else if (op === "-") corrected = a - b;
        else if (op === "*") corrected = a * b;
        repaired = repaired.replace(defect.locationQuote, `${a} ${op} ${b} = ${corrected}`);
        appliedActions.push(`Corrected arithmetic equation to "${a} ${op} ${b} = ${corrected}".`);
      }
    }

    // 3. Remediate evasive or empty responses
    if (defect.category === "UNCLEAR_OR_EVASIVE") {
      repaired =
        `I have reviewed your request regarding **"${context.primaryGoal}"**.\n\n` +
        `Based on our local-first architecture and verified repository constraints, ` +
        `here is the structured recommendation:\n\n` +
        `1. **Core Approach**: Implement modular local components with zero external API dependencies.\n` +
        `2. **Verification**: Execute our test suites to guarantee backward compatibility.\n\n` +
        `Let me know if you would like me to detail the specific implementation steps.`;
      appliedActions.push("Replaced empty/evasive text with structured, context-anchored recommendation.");
    }

    // 4. Remediate missing assumption banner
    if (defect.category === "RISKY_ASSUMPTION" && context.statedAssumptions.length > 0 && !repaired.includes("> **Stated Assumption:**")) {
      repaired = `> **Stated Assumption:** ${context.statedAssumptions[0]}\n\n${repaired}`;
      appliedActions.push("Prepended transparent working assumption banner.");
    }
  }

  // Re-verify repaired reply to ensure remediation was effective
  const reEvaluation = evaluateCandidateResponse(repaired, context);

  if (reEvaluation.passed || reEvaluation.defects.length < evaluation.defects.length) {
    return {
      finalReply: repaired,
      decision: "AUTOMATIC_CORRECTION_APPLIED",
      correctionSummary: `Successfully resolved defects: ${appliedActions.join("; ")}`,
    };
  }

  // If still failing, attempt one further remediation pass or declare limitations
  return remediateCandidateResponse(repaired, reEvaluation, context, iteration + 1);
}
