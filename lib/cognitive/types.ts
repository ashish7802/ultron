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
  epistemicPhrasing?: EpistemicPhrasing;
  isCalibratedStatisticalProbability?: false;
  calculationBreakdown?: string;
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

// ============================================================================
// PHASE 4 COGNITIVE SCHEMAS: UNCERTAINTY & SELF-EVALUATION ENGINES
// ============================================================================

/** Component 07: Uncertainty & Confidence Engine Models */
export type UncertaintySource =
  | "MISSING_INFORMATION"
  | "AMBIGUITY"
  | "UNVERIFIED_ASSUMPTION"
  | "CONTRADICTION"
  | "PROBABILISTIC_ESTIMATE"
  | "EXTERNAL_DEPENDENCY";

export interface EpistemicClaim {
  claim: string;
  classification: EpistemicDataClassification;
  sourceOrEvidence?: string;
  confidence: number; // 0.0 to 1.0
}

export interface UncertaintyFacet {
  facet: string;
  source: UncertaintySource;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  impactOnDecision: string;
  mitigationOrQuestion: string;
}

export type EpistemicPhrasing =
  | "I know this."
  | "This is my best estimate."
  | "This depends on an assumption."
  | "I don't have enough information."
  | "I need clarification before recommending a solution.";

export interface UncertaintyAssessmentResult {
  overallCertaintyScore: number; // 0.0 to 1.0
  calibrationCategory: "HIGH_CERTAINTY" | "REASONABLE_CONFIDENCE" | "PROVISIONAL_ASSUMPTION" | "HIGH_UNCERTAINTY";
  groundingScore: number;
  completenessScore: number;
  contradictionScore: number;
  claims: EpistemicClaim[];
  uncertainties: UncertaintyFacet[];
  missingInformation: string[];
  epistemicPhrasing: EpistemicPhrasing;
  requiresClarification: boolean;
  clarificationQuestions: string[];
  auditExplanation: string;
  isCalibratedStatisticalProbability: false; // Explicitly documented as a calibrated index, NOT an unverified statistical probability
  calculationBreakdown: string;
}

/** Component 08: Self-Evaluation & Response Validation Models */
export type DefectSeverity = "CRITICAL" | "MAJOR" | "MINOR";

export type DefectCategory =
  | "INSTRUCTION_VIOLATION"
  | "NEGATIVE_CONSTRAINT_BREACH"
  | "CONTEXT_IRRELEVANCE"
  | "FACTUAL_UNGROUNDED"
  | "LOGICAL_INCONSISTENCY"
  | "INCOMPLETENESS"
  | "CONTRADICTION"
  | "UNSUPPORTED_CLAIM"
  | "RISKY_ASSUMPTION"
  | "UNCLEAR_OR_EVASIVE";

export interface ResponseDefect {
  category: DefectCategory;
  severity: DefectSeverity;
  description: string;
  locationQuote?: string;
  remediationAction: string;
}

export interface EvaluationScoreCard {
  instructionCompliance: number; // 0.0 to 1.0
  contextRelevance: number; // 0.0 to 1.0
  factualGrounding: number; // 0.0 to 1.0
  logicalConsistency: number; // 0.0 to 1.0
  completeness: number; // 0.0 to 1.0
  safetyAndConstraints: number; // 0.0 to 1.0
  overallScore: number; // 0.0 to 1.0
}

export type CorrectionDecision =
  | "NO_CORRECTION_NEEDED"
  | "AUTOMATIC_CORRECTION_APPLIED"
  | "REQUIRES_CLARIFICATION"
  | "CANNOT_SAFELY_CORRECT";

export interface SelfEvaluationResult {
  passed: boolean;
  scoreCard: EvaluationScoreCard;
  defects: ResponseDefect[];
  correctionDecision: CorrectionDecision;
  originalReply: string;
  correctedReply?: string;
  correctionSummary?: string;
  iterationCount: number;
}


/** Epistemic classification to distinguish verified facts from assumptions */
export type EpistemicDataClassification = "MEASURED_FACT" | "ESTIMATE" | "UNVERIFIED_ASSUMPTION";

/** Component 04: Decision Intelligence Models */
export interface DecisionScenarioAnalysis {
  bestCase: string;
  expectedCase: string;
  worstCase: string;
}

export interface DecisionCostAssessment {
  category: "ZERO_LOCAL" | "LOW_COMPUTE" | "MODERATE_RESOURCES" | "PAID_CLOUD_SERVICE";
  description: string;
  classification: EpistemicDataClassification;
}

export interface DecisionCandidate {
  id: string;
  name: string;
  description: string;
  expectedImpact: number; // 1 (marginal) to 5 (transformative)
  implementationComplexity: number; // 1 (trivial) to 5 (extreme)
  financialCost: DecisionCostAssessment;
  technicalRisk: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  reversibility: "EASILY_REVERSIBLE" | "MODERATE_EFFORT_TO_REVERT" | "IRREVERSIBLE";
  longTermMaintainability: number; // 1 (technical debt magnet) to 5 (clean architecture)
  alignmentWithConstraints: boolean;
  constraintViolations: string[];
  shortVsLongTermTradeoff: string;
  scenarioAnalysis: DecisionScenarioAnalysis;
  weightedScore: number;
  scoreBreakdown: string;
}

export interface DecisionIntelligenceResult {
  requiresClarification: boolean;
  clarificationPrompt?: string;
  candidates: DecisionCandidate[];
  recommendedOption?: DecisionCandidate;
  rejectedAlternatives: Array<{ id: string; name: string; reasonForRejection: string }>;
  confidenceScore: number; // 0.0 to 1.0
  epistemicStatus:
    | "EVIDENCE_BACKED"
    | "ESTIMATED_RECOMMENDATION"
    | "INSUFFICIENT_INFORMATION"
    | "DISQUALIFIED_BY_CONSTRAINTS";
  facts: string[];
  estimates: string[];
  assumptions: string[];
  rationaleSummary: string;
}

/** Component 06: Planning Intelligence Models */
export type TaskPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  dependencies: string[]; // Task IDs that must be completed first
  priority: TaskPriority;
  estimatedEffort?: string; // Stated only when sufficient evidence exists
  effortClassification: EpistemicDataClassification;
  completionCriteria: string;
  assignedPhase: string;
}

export interface PlanMilestone {
  id: string;
  title: string;
  prerequisiteTaskIds: string[];
  successCriteria: string;
  deliverable: string;
}

export interface PlanRisk {
  risk: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  contingencyStrategy: string;
  triggerCondition: string;
}

export interface PlanningIntelligenceResult {
  goal: string;
  tasks: PlanTask[];
  executionSequence: string[]; // Valid topological order of task IDs
  milestones: PlanMilestone[];
  criticalPath: string[];
  risks: PlanRisk[];
  alternativeFallbackPlan?: string;
  hasContradictions: boolean;
  contradictions: string[];
  successMetrics: string[];
  isAdvisoryOnly: true;
}

// ============================================================================
// PHASE 5 COGNITIVE SCHEMAS: MULTI-MODEL & CO-FOUNDER DISCUSSION ENGINES
// ============================================================================

/** Component 09: Multi-Model Intelligence Models */

export type TaskCategory =
  | "SIMPLE_CONVERSATION"
  | "CONTEXT_UNDERSTANDING"
  | "ANALYTICAL_REASONING"
  | "MATHEMATICAL_REASONING"
  | "CRITICAL_EVALUATION"
  | "DECISION_ANALYSIS"
  | "PLANNING"
  | "TECHNICAL_ARCHITECTURE"
  | "CODE_EXPLANATION"
  | "STRUCTURED_COFOUNDER_DISCUSSION"
  | "RESPONSE_EVALUATION";

export type ModelCapability =
  | "FAST_CHAT"
  | "ANALYTICAL_REASONING"
  | "MATHEMATICAL_LOGIC"
  | "CODE_GENERATION"
  | "STRUCTURED_OUTPUT"
  | "CRITICAL_EVALUATION"
  | "LONG_CONTEXT";

export type ModelAvailabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "FAILED" | "UNKNOWN" | "OFFLINE";

export interface ModelRegistryEntry {
  modelId: string;
  name: string;
  availability: ModelAvailabilityStatus;
  provider: "OLLAMA_LOCAL";
  contextCapacity: number; // e.g. 2048, 4096, 8192, 32768
  sizeBytes?: number;
  capabilities: ModelCapability[];
  taskSuitability: TaskCategory[];
  isRecommendedDefault: boolean;
  lastVerified: string; // ISO 8601
}

export interface ModelDiscoveryStatus {
  isOnline: boolean;
  endpoint: string;
  totalModelsFound: number;
  installedModels: ModelRegistryEntry[];
  activeDefaultModel: string;
  discoveryLatencyMs: number;
  error?: string;
}

export interface ModelSelectionCandidate {
  model: ModelRegistryEntry;
  suitabilityScore: number; // 0.0 to 1.0
  matchReasons: string[];
}

export interface ModelSelectionResult {
  selectedModel: ModelRegistryEntry;
  taskCategory: TaskCategory;
  complexityTier: CognitiveTier;
  selectionRationale: string;
  rankedCandidates: ModelSelectionCandidate[];
  isSingleModelEnvironment: boolean;
  fallbackModel?: ModelRegistryEntry;
  diagnostics: {
    estimatedMemoryMb: number;
    recommendedTimeoutMs: number;
    requiresSequentialExecution: boolean;
  };
}

export interface MultiModelExecutionResult {
  executionMode: "SINGLE_MODEL" | "MULTI_MODEL_CONSENSUS" | "FALLBACK_MODE";
  modelsAttempted: string[];
  primaryOutput: string;
  secondaryOutput?: string;
  consensusLevel:
    | "UNANIMOUS"
    | "SUBSTANTIAL_AGREEMENT"
    | "DIVERGENT"
    | "SINGLE_PERSPECTIVE"
    | "INSUFFICIENT_EVIDENCE";
  disagreementPoints: string[];
  modelResponses: Array<{
    modelId: string;
    output: string;
    latencyMs: number;
    success: boolean;
    error?: string;
  }>;
  qualityComparison?: ResponseQualityComparisonResult;
  operationalMetrics?: CognitiveOperationalMetrics;
  resourceProfile?: LocalInferenceResourceProfile;
}

/** Component 10: Co-Founder Discussion Engine Models */

export type DiscussionStage =
  | "STAGE_01_UNDERSTAND"
  | "STAGE_02_INDEPENDENT_ANALYSIS"
  | "STAGE_03_SUPPORTING_ARGUMENTS"
  | "STAGE_04_OPPOSING_ARGUMENTS"
  | "STAGE_05_ALTERNATIVE_STRATEGIES"
  | "STAGE_06_RISK_EVALUATION"
  | "STAGE_07_DECISION_EVALUATION"
  | "STAGE_08_UNCERTAINTY_EVALUATION"
  | "STAGE_09_SELF_EVALUATION"
  | "STAGE_10_FINAL_SYNTHESIS";

export type DevilAdvocateRiskCategory = "TECHNICAL" | "BUSINESS" | "PRODUCT" | "FINANCIAL";

export interface DiscussionRiskFactor {
  category: DevilAdvocateRiskCategory;
  riskTitle: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  explanation: string;
  failureScenario: string;
  suggestedMitigation: string;
}

export interface CoFounderDiscussionResult {
  proposalSummary: string;
  independentAssessment: string;
  supportingArguments: string[];
  opposingArguments: string[];
  devilAdvocateRisks: DiscussionRiskFactor[];
  alternativeStrategies: string[];
  comparativeEvaluation: string;
  finalRecommendation: string;
  assumptionsAndUnknowns: string[];
  conditionsAlteringRecommendation: string[];
  suggestedNextSteps: string[];
  structuredDiscussionReport: string;
  isAdvisoryOnly: true;
  stagesCompleted: DiscussionStage[];
  founderFeedbackContext?: FounderFeedbackContext;
}

// ============================================================================
// PHASE 6: OPERATIONAL, BENCHMARK, FEEDBACK & QUALITY EVALUATION SCHEMAS
// ============================================================================

/** Founder feedback categories for explicit human co-founder steering. */
export type FounderFeedbackCategory =
  | "AGREE"
  | "DISAGREE"
  | "PARTIALLY_AGREE"
  | "INCORRECT_ASSUMPTION"
  | "MISSING_INFORMATION"
  | "BETTER_ALTERNATIVE"
  | "INCORRECT_RECOMMENDATION";

/** Explicit feedback payload provided by the human founder on an advisory turn. */
export interface FounderFeedback {
  feedbackId: string;
  turnId?: string;
  timestamp: string;
  category: FounderFeedbackCategory;
  targetTopic: string;
  comment: string;
  suggestedAlternative?: string;
}

/** Synthesized feedback context injected into the Co-Founder Discussion pipeline. */
export interface FounderFeedbackContext {
  activeFeedback: FounderFeedback[];
  feedbackCount: number;
  acknowledgments: string[];
  influenceSummary: string;
  isTreatedAsGroundTruth: false;
  learningScope: "CURRENT_SESSION_ONLY";
}

/** Response quality comparative categories between candidate model outputs. */
export type ResponseQualityCategory =
  | "FACTUAL_AGREEMENT"
  | "FACTUAL_DISAGREEMENT"
  | "COMPLEMENTARY_PERSPECTIVES"
  | "INSUFFICIENT_EVIDENCE"
  | "UNCOMPARABLE";

/** Structured evaluation criteria for an individual model response. */
export interface QualityCriteriaScore {
  criterion:
    | "CORRECTNESS"
    | "COMPLETENESS"
    | "INSTRUCTION_ADHERENCE"
    | "REASONING_CONSISTENCY"
    | "EVIDENCE_GROUNDING"
    | "RELEVANCE"
    | "SAFETY_COMPLIANCE"
    | "TASK_USEFULNESS";
  score: number; // 0.0 to 1.0
  notes: string;
}

/** Quality evaluation scorecard for an individual model output. */
export interface ModelQualityEvaluation {
  modelId: string;
  criteriaScores: QualityCriteriaScore[];
  overallQualityScore: number; // 0.0 to 1.0
  strengths: string[];
  weaknesses: string[];
}

/** Objective multi-criteria comparison between local model responses. */
export interface ResponseQualityComparisonResult {
  isSingleModel: boolean;
  comparisonCategory: ResponseQualityCategory;
  primaryQuality?: ModelQualityEvaluation;
  secondaryQuality?: ModelQualityEvaluation;
  comparativeSummary: string;
  detectedDivergences: string[];
  limitations: string;
}

/** Truthful local operational and hardware resource metrics. */
export interface CognitiveOperationalMetrics {
  modelId: string;
  modelDiscoveryLatencyMs: number;
  modelSelectionLatencyMs: number;
  inferenceLatencyMs: number;
  totalTurnLatencyMs: number;
  timeoutCount: number;
  retryCount: number;
  fallbackActivated: boolean;
  fallbackReason?: string;
  sequentialMultiModelDurationMs?: number;
  hardware: {
    cpuUserUsagePercent?: number;
    ramHeapUsedMb: number;
    ramRssMb: number;
    gpuVramUsedMb: number | null; // Null when driver metrics are not exposed; never fabricated
    gpuAccessible: boolean;
    collectionTimestamp: string;
  };
  metricsCollectionFailed: boolean;
}

/** Local inference resource and operational cost profile (zero paid API guarantees). */
export interface LocalInferenceResourceProfile {
  executionDurationMs: number;
  estimatedWattHours: number;
  monetaryCostUsd: 0;
  isZeroPaidApiGuaranteed: true;
  resourceFootprintRating: "LOW" | "MODERATE" | "INTENSIVE";
  measurementMethod: "MEASURED_LOCAL_RUNTIME_METRICS";
  notes: string;
}



