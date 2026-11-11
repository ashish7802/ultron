/**
 * @file lib/cognitive/types.ts
 * @description Strongly-typed schemas and data contracts for the ULTRON Cognitive Intelligence Engine.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Reasoning Architecture.
 *
 * Key Responsibilities:
 * - Defines structured representations for parsed context, user intent, ambiguity, and constraints.
 * - Outlines reasoning chains, critical thinking evaluations, and decision matrices.
 * - Establishes contracts for confidence calibration, pre-delivery self-evaluation, and model profiles.
 * - Provides strict typing to prevent runtime errors and ensure reliable multi-agent coordination.
 *
 * Architectural Role & Interactions:
 * - Shared across all 10 cognitive engines located in `lib/cognitive/`.
 * - Consumed by `app/api/chat/route.ts` to enrich the streaming conversation pipeline.
 *
 * Safety / Security Guarantees:
 * - Read-only types and immutable structures.
 * - Untrusted external inputs are isolated from internal directive metadata.
 */

/** High-level user intent category determined by the Context Understanding Engine. */
export type CognitiveIntentCategory =
  | "GREETING"
  | "FAST_COMMAND"
  | "SYSTEM_QUERY"
  | "TECHNICAL_ANALYSIS"
  | "STRATEGIC_DECISION"
  | "CRITICAL_INQUIRY"
  | "PROBLEM_SOLVING"
  | "PROJECT_PLANNING"
  | "CREATIVE_EXPLORATION"
  | "GENERAL_CONVERSATION";

/** Priority level assigned to extracted user instructions and constraints. */
export type InstructionPriority = "MANDATORY" | "HIGH" | "MEDIUM" | "OPTIONAL";

/** Individual extracted instruction or constraint. */
export interface ExtractedInstruction {
  id: string;
  rawText: string;
  normalizedText: string;
  priority: InstructionPriority;
  isNegativeConstraint: boolean; // e.g. "Do not use paid APIs"
  category: "TECHNICAL" | "ARCHITECTURAL" | "FINANCIAL" | "PROCEDURAL" | "PREFERENCE";
}

/** Detected missing information or ambiguous facet of a user request. */
export interface AmbiguityFacet {
  parameter: string;
  explanation: string;
  bestEffortAssumption: string;
  importance: "CRITICAL" | "MODERATE" | "LOW";
}

/** Result of the Context Understanding Engine pass. */
export interface ParsedContext {
  originalQuery: string;
  cleanedQuery: string;
  intentCategory: CognitiveIntentCategory;
  primaryGoal: string;
  subGoals: string[];
  instructions: ExtractedInstruction[];
  ambiguityScore: number; // 0.0 (completely clear) to 1.0 (highly ambiguous)
  ambiguityFacets: AmbiguityFacet[];
  statedAssumptions: string[];
  isMultiStep: boolean;
  isFollowUp: boolean;
  resolvedReferences: Record<string, string>; // e.g. {"it": "Ollama LLM", "the first one": "PostgreSQL"}
  detectedLanguage: string;
  complexityScore: number; // 0.0 (trivial) to 1.0 (deeply analytical)
}

/** Execution depth tier selected by the Cognitive Orchestrator. */
export type CognitiveTier = "TIER_1_FAST" | "TIER_2_ANALYTICAL";

/** Calibrated confidence assessment grounded in observable factors. */
export interface CalibratedConfidence {
  overallScore: number; // 0.0 to 1.0
  contextGroundingScore: number; // How well claims are grounded in user facts / verified context
  constraintComplianceScore: number; // How strictly the response adheres to non-negotiable rules
  epistemicClarityScore: number; // 1 - ambiguityScore
  classification: "HIGH_CERTAINTY" | "REASONABLE_CONFIDENCE" | "PROVISIONAL_ASSUMPTION" | "HIGH_UNCERTAINTY";
  knownFacts: string[];
  workingAssumptions: string[];
  acknowledgedUnknowns: string[];
}

/** Outcome of pre-delivery response self-evaluation. */
export interface SelfEvaluationAudit {
  passed: boolean;
  complianceScore: number; // 0.0 to 1.0
  constraintViolations: string[];
  logicalContradictions: string[];
  hallucinationRisks: string[];
  unsupportedClaims: string[];
  revisedReplyRequired: boolean;
}

/** Complete cognitive synthesis produced for the co-founder dialogue. */
export interface CognitiveSynthesis {
  context: ParsedContext;
  tier: CognitiveTier;
  reasoningSummary?: string;
  criticalInsights?: string[];
  prosAndCons?: { pros: string[]; cons: string[] };
  actionablePlan?: { objective: string; milestones: string[] };
  confidence: CalibratedConfidence;
  evaluation: SelfEvaluationAudit;
  finalReply: string;
}

// ============================================================================
// PHASE 2 COGNITIVE SCHEMAS: REASONING, CRITICAL THINKING & PROBLEM SOLVING
// ============================================================================

/** Component 02: Advanced Reasoning Models */
export interface ReasoningSubProblem {
  id: string;
  title: string;
  dependencies: string[]; // IDs of sub-problems that must be addressed first
  prerequisites: string[];
  invariants: string[]; // Properties that must hold true
}

export interface CausalDriver {
  cause: string;
  directEffect: string;
  indirectEffects: string[];
  reversibility: "HIGH" | "MEDIUM" | "LOW";
}

export interface CompetingHypothesis {
  hypothesisId: string;
  statement: string;
  likelihood: "HIGH" | "MODERATE" | "LOW";
  supportingFactors: string[];
  contradictingFactors: string[];
  criticalAssumptions: string[];
}

export interface AdvancedReasoningResult {
  decomposedSubProblems: ReasoningSubProblem[];
  causalChain: CausalDriver[];
  competingHypotheses: CompetingHypothesis[];
  topologicalOrder: string[]; // Execution/analysis sequence
  analyticalSummary: string;
}

/** Component 03: Critical Thinking Models */
export type FallacyType =
  | "FALSE_DICHOTOMY"
  | "SUNK_COST"
  | "CAUSAL_LEAP"
  | "CIRCULAR_REASONING"
  | "HASTY_GENERALIZATION"
  | "APPEAL_TO_NOVELTY"
  | "OPTIMISM_BIAS";

export interface EvaluatedAssumption {
  assumption: string;
  isStated: boolean; // Stated by user vs implicit hidden assumption
  validity: "SOUND" | "QUESTIONABLE" | "UNSUPPORTED";
  riskImpact: "CRITICAL" | "MODERATE" | "LOW";
  challengeReason: string;
}

export interface LogicalWeakness {
  fallacy: FallacyType;
  quoteOrRef: string;
  explanation: string;
  counterExample: string;
}

export interface CriticalThinkingResult {
  assumptions: EvaluatedAssumption[];
  weaknesses: LogicalWeakness[];
  counterarguments: string[];
  devilsAdvocateScenarios: string[];
  stance: "AGREES_WITH_PREMISE" | "PARTIALLY_VALID_WITH_RESERVATIONS" | "DISAGREES_WITH_EVIDENCE";
  executiveCritique: string;
}

/** Component 05: Problem-Solving Models */
export interface FiveWhyStep {
  level: number; // 1 to 5
  question: string;
  answer: string;
  evidence: string;
}

export interface SolutionOption {
  id: string;
  name: string;
  description: string;
  complexity: number; // 1 (trivial) to 5 (extreme)
  impact: number; // 1 (minor) to 5 (transformative)
  reversibility: "EASILY_REVERSIBLE" | "MODERATE_EFFORT_TO_REVERT" | "IRREVERSIBLE";
  tradeOffs: string;
  estimatedEffort: string;
}

export interface ProblemValidationMetric {
  metricName: string;
  baselineValue: string;
  targetValue: string;
  verificationMethod: string;
}

export interface ProblemSolvingResult {
  symptoms: string[];
  fiveWhyChain: FiveWhyStep[];
  rootCause: string;
  candidateSolutions: SolutionOption[];
  recommendedSolution: SolutionOption;
  validationCriteria: ProblemValidationMetric[];
  recoveryContingency: string;
}

