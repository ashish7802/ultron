/**
 * @file lib/learning/types.ts
 * @description Centralized Type Definitions & Contracts for the ULTRON Learning & Evolution Engine.
 *
 * Subsystem:
 * Learning & Evolution Engine (Blueprint Section 8, Pages 71-79).
 *
 * Key Responsibilities:
 * - Defines universal data models, enums, interfaces, and state contracts across all 10 core modules:
 *   1. Experience Learning Engine (`experienceLearningEngine.ts`)
 *   2. Feedback Learning Engine (`feedbackLearningEngine.ts`)
 *   3. Mistake & Failure Learning Engine (`mistakeLearningEngine.ts`)
 *   4. Knowledge Acquisition Engine (`knowledgeAcquisitionEngine.ts`)
 *   5. Skill Development Engine (`skillDevelopmentEngine.ts`)
 *   6. Strategy Optimization Engine (`strategyOptimizationEngine.ts`)
 *   7. Performance Evaluation Engine (`performanceEvaluationEngine.ts`)
 *   8. Adaptive Intelligence Engine (`adaptiveIntelligenceEngine.ts`)
 *   9. Self-Improvement Engine (`selfImprovementEngine.ts`)
 *   10. Evolution Management Engine (`evolutionManagementEngine.ts`)
 * - Defines contracts for the 8 Advanced Learning Capabilities:
 *   Continuous Learning, Meta-Learning, Transfer Learning, Reinforcement from Feedback,
 *   Skill Library, Knowledge Consolidation, Adaptive Model Routing, Evolution Analytics.
 *
 * Architectural Role & Interactions:
 * - Shared contract library consumed by all learning engines, `lib/learning/learningCoordinator.ts`,
 *   the Next.js API route (`app/api/learning/route.ts`), and the frontend modal (`LearningEvolutionModal.tsx`).
 * - Bridges to `lib/memory/types.ts` for dual-vault persistence and `lib/security/types.ts` for authorization gates.
 *
 * Safety / Security Guarantees:
 * - Strict immutability flags and cryptographic SHA-256 provenance hashes.
 * - Explicit founder approval contracts (no autonomous production changes permitted).
 * - Enforces zero-unverified-knowledge boundaries and cross-project privacy fencing.
 */

// ==============================================================================
// 1. MODULE 01: EXPERIENCE LEARNING ENGINE CONTRACTS
// ==============================================================================

export type TaskOutcomeStatus = "SUCCESS" | "FAILURE" | "PARTIAL" | "ABORTED";

export interface TaskStepRecord {
  stepId: string;
  name: string;
  toolUsed?: string;
  parameters?: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface TaskExperience {
  experienceId: string;
  taskId: string;
  goal: string;
  category: string;
  projectId: string;
  strategyUsed: string;
  steps: TaskStepRecord[];
  outcome: TaskOutcomeStatus;
  executionDurationMs: number;
  totalTokensUsed: number;
  resourceUsage: {
    peakMemoryMb: number;
    cpuPercent: number;
  };
  verifiedByTest: boolean;
  testEvidenceId?: string;
  timestamp: number;
  lessonsExtracted: string[];
  transferableToProjects: string[];
  hash: string;
}

export interface ReusableLesson {
  lessonId: string;
  experienceId: string;
  title: string;
  context: string;
  triggerCondition: string;
  recommendedAction: string;
  pitfallToAvoid?: string;
  confidenceScore: number; // 0.0 to 1.0 based on verification
  verificationStatus: "VERIFIED" | "HYPOTHESIS" | "DEPRECATED";
  timesApplied: number;
  timesSuccessful: number;
  isProjectAgnostic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ExperienceRecommendation {
  recommendedStrategy: string;
  similarPreviousTasks: string[];
  applicableLessons: ReusableLesson[];
  expectedSuccessRate: number;
  estimatedDurationMs: number;
  confidence: number;
}

// ==============================================================================
// 2. MODULE 02: FEEDBACK LEARNING ENGINE CONTRACTS
// ==============================================================================

export type FeedbackPolarity = "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "CORRECTION";

export type FeedbackCategory =
  | "CODE_QUALITY"
  | "COMMUNICATION_STYLE"
  | "TOOL_SELECTION"
  | "STRATEGY_ACCURACY"
  | "LATENCY"
  | "PREFERENCE"
  | "SAFETY"
  | "GENERAL";

export interface FounderFeedback {
  feedbackId: string;
  sessionId?: string;
  messageId?: string;
  polarity: FeedbackPolarity;
  category: FeedbackCategory;
  rating?: number; // 1 to 5 scale
  rawText: string;
  targetResponse?: string;
  correctedResponse?: string;
  isExplicitInstruction: boolean; // Differentiates explicit founder orders from subtle preference inferences
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  projectId?: string;
  timestamp: number;
  retained: boolean;
  hash: string;
}

export interface LearnedPreference {
  preferenceId: string;
  key: string;
  category: FeedbackCategory;
  value: string | number | boolean;
  confidence: number; // 0.0 to 1.0
  reinforcementCount: number;
  isHardRule: boolean; // From explicit instruction
  sourceFeedbackIds: string[];
  lastUpdated: number;
}

export interface CommunicationStyleProfile {
  verbosityLevel: "CONCISE" | "BALANCED" | "DETAILED";
  formalityLevel: "PROFESSIONAL_CO_FOUNDER" | "TECHNICAL_PEER" | "MINIMALIST";
  codeCommentPreference: "RICH_EDUCATIONAL" | "ESSENTIAL_ONLY";
  proactivityScore: number; // 0.0 to 1.0
  customRules: string[];
  lastAdaptedAt: number;
}

// ==============================================================================
// 3. MODULE 03: MISTAKE & FAILURE LEARNING ENGINE CONTRACTS
// ==============================================================================

export type FailureTaxonomy =
  | "SYNTAX_ERROR"
  | "RUNTIME_EXCEPTION"
  | "LOGIC_ERROR"
  | "TIMEOUT_EXCEEDED"
  | "PERMISSION_DENIED"
  | "RESOURCE_EXHAUSTION"
  | "DEPENDENCY_MISSING"
  | "SCHEMA_MISMATCH"
  | "NETWORK_FAILURE"
  | "TOOL_MISUSE"
  | "UNVERIFIED_ASSUMPTION";

export interface FiveWhyAnalysis {
  why1: string; // Immediate symptom
  why2: string; // Underlying trigger
  why3: string; // Intermediate cause
  why4: string; // Systemic context
  why5: string; // Fundamental root cause
  rootCauseSummary: string;
}

export interface FailureRecord {
  failureId: string;
  taskId: string;
  errorSignature: string; // Normalized error pattern for clustering
  rawErrorMessage: string;
  taxonomy: FailureTaxonomy;
  failedApproachDescription: string;
  rootCauseAnalysis?: FiveWhyAnalysis;
  recoveryApplied?: string;
  recoverySuccessful: boolean;
  regressionGuardId?: string;
  recurrenceCount: number;
  projectId: string;
  timestamp: number;
  resolvedAt?: number;
}

export interface RegressionGuard {
  guardId: string;
  name: string;
  associatedFailureId: string;
  checkType: "PRE_CONDITION" | "POST_CONDITION" | "LINT_RULE" | "SECURITY_CHECK";
  conditionPattern: string;
  remediationAdvice: string;
  isActive: boolean;
  triggeredCount: number;
  createdAt: number;
}

// ==============================================================================
// 4. MODULE 04: KNOWLEDGE ACQUISITION ENGINE CONTRACTS
// ==============================================================================

export type KnowledgeSourceType =
  | "TECHNICAL_DOCS"
  | "OFFICIAL_API_SPEC"
  | "RESEARCH_PAPER"
  | "SOURCE_CODE"
  | "EXPERIENCE_LESSON"
  | "FOUNDER_DIRECTIVE";

export interface KnowledgeProvenance {
  sourceType: KnowledgeSourceType;
  sourceUri: string;
  authorOrMaintainer?: string;
  retrievedAt: number;
  contentSha256: string;
  licenseOrTerms?: string;
}

export interface KnowledgeItem {
  knowledgeId: string;
  topic: string;
  summary: string;
  fullContent: string;
  provenance: KnowledgeProvenance;
  concepts: string[];
  relatedKnowledgeIds: string[];
  confidence: number;
  verificationStatus: "VERIFIED" | "UNVERIFIED" | "SUPERSEDED" | "DEPRECATED";
  verifiedByEvidence?: string;
  timeToLiveSeconds?: number;
  isOutdated: boolean;
  lastValidatedAt: number;
  projectId?: string; // Optional isolation boundary
}

// ==============================================================================
// 5. MODULE 05: SKILL DEVELOPMENT ENGINE CONTRACTS
// ==============================================================================

export type SkillStatus = "DRAFT" | "PROPOSED" | "TESTING" | "ACTIVE" | "DEPRECATED" | "DISABLED";

export interface SkillIOParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  defaultValue?: unknown;
}

export interface SkillWorkflowStep {
  stepNumber: number;
  stepName: string;
  action: string;
  parameters: Record<string, unknown>;
  expectedResult: string;
  canFailWithoutStopping: boolean;
}

export interface SkillDefinition {
  skillId: string;
  name: string;
  description: string;
  version: string; // Semver format (e.g. "1.0.0")
  status: SkillStatus;
  category: string;
  requiredPermissions: string[];
  inputs: SkillIOParameter[];
  outputs: SkillIOParameter[];
  workflow: SkillWorkflowStep[];
  validationCriteria: string[];
  testHarnessCode?: string;
  lastTestPassed: boolean;
  executionCount: number;
  successRate: number; // 0.0 to 1.0
  averageDurationMs: number;
  author: "SYSTEM_AUTONOMOUS" | "FOUNDER";
  createdAt: number;
  updatedAt: number;
  documentationMarkdown: string;
}

export interface SkillProposal {
  proposalId: string;
  proposedSkill: SkillDefinition;
  motivation: string;
  sourceExperienceIds: string[];
  expectedImpact: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  proposedAt: number;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
}

// ==============================================================================
// 6. MODULE 06: STRATEGY OPTIMIZATION ENGINE CONTRACTS
// ==============================================================================

export interface StrategyMetricRecord {
  strategyName: string;
  taskCategory: string;
  sampleCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  totalTokens: number;
  averageTokens: number;
  successCount: number;
  failureCount: number;
  successRate: number; // 0.0 to 1.0
  peakMemoryMb: number;
  toolUsageFrequencies: Record<string, number>;
}

export interface StrategyComparisonResult {
  category: string;
  primaryStrategy: string;
  baselineStrategy: string;
  latencyDeltaPercent: number; // Negative means faster
  tokenDeltaPercent: number;   // Negative means fewer tokens
  successRateDelta: number;    // Positive means better success
  recommendedStrategy: string;
  statisticalConfidence: number; // 0.0 to 1.0
  reasoning: string;
}

// ==============================================================================
// 7. MODULE 07: PERFORMANCE EVALUATION ENGINE CONTRACTS
// ==============================================================================

export interface BenchmarkTestCase {
  testId: string;
  name: string;
  category: "REASONING" | "RETRIEVAL" | "TOOL_EXECUTION" | "RESPONSE_QUALITY" | "SAFETY";
  inputPrompt: string;
  contextData?: Record<string, unknown>;
  expectedOutputRegex?: string;
  expectedKeywords?: string[];
  forbiddenKeywords?: string[];
  maxAllowedLatencyMs: number;
  passCriteria: string;
}

export interface BenchmarkTestResult {
  testId: string;
  name: string;
  category: string;
  passed: boolean;
  actualDurationMs: number;
  score: number; // 0.0 to 1.0
  reasoningAssessment: string;
  discrepancies: string[];
}

export interface SystemPerformanceReport {
  reportId: string;
  timestamp: number;
  overallScore: number; // 0.0 to 100.0
  taskSuccessRate: number;
  reasoningBenchmarkScore: number;
  retrievalAccuracyScore: number;
  toolExecutionAccuracy: number;
  responseQualityScore: number;
  meanLatencyMs: number;
  errorFrequencyPerHundred: number;
  benchmarkResults: BenchmarkTestResult[];
  historicalDeltaVsPreviousReport?: {
    overallScoreDelta: number;
    latencyDeltaMs: number;
    successRateDelta: number;
  };
}

// ==============================================================================
// 8. MODULE 08: ADAPTIVE INTELLIGENCE ENGINE CONTRACTS
// ==============================================================================

export type TaskComplexityTier = "SIMPLE" | "MODERATE" | "COMPLEX" | "HIGHLY_COMPLEX";

export interface AdaptationContext {
  taskGoal: string;
  projectId: string;
  urgency: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  hostResourceState: {
    freeMemoryMb: number;
    cpuLoadPercent: number;
  };
  founderPreferences?: Record<string, unknown>;
  recentFailuresInScope?: number;
}

export interface AdaptiveRoutingDecision {
  selectedModel: string;
  complexityTier: TaskComplexityTier;
  recommendedWorkflowType: "SEQUENTIAL" | "PARALLEL" | "SPECULATIVE_FAST_PATH";
  resourceAllocation: {
    maxConcurrency: number;
    timeoutMs: number;
    enableDeepVerification: boolean;
  };
  adaptedPromptGuidelines: string[];
  rationale: string;
}

// ==============================================================================
// 9. MODULE 09: SELF-IMPROVEMENT ENGINE CONTRACTS
// ==============================================================================

export type ImprovementType =
  | "NEW_SKILL"
  | "STRATEGY_TUNING"
  | "KNOWLEDGE_UPDATE"
  | "REGRESSION_GUARD"
  | "PROMPT_REFINEMENT"
  | "PERFORMANCE_CACHE";

export interface CapabilityGap {
  gapId: string;
  title: string;
  domain: string;
  description: string;
  evidenceFailureIds: string[];
  frequencyCount: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suggestedRemedy: string;
  detectedAt: number;
}

export interface ImprovementProposal {
  proposalId: string;
  title: string;
  type: ImprovementType;
  description: string;
  motivation: string;
  supportingEvidenceIds: string[];
  expectedImpactMetric: string;
  expectedImprovementDelta: number;
  riskAssessment: {
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    potentialSideEffects: string[];
    reversibility: "INSTANT" | "MODERATE" | "MANUAL";
  };
  implementationPayload: Record<string, unknown>;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "APPLIED" | "ROLLED_BACK";
  proposedAt: number;
  decidedAt?: number;
  decisionNotes?: string;
  isImplemented: boolean;
}

// ==============================================================================
// 10. MODULE 10: EVOLUTION MANAGEMENT ENGINE CONTRACTS
// ==============================================================================

export type EvolutionState =
  | "PROPOSED"
  | "APPROVED"
  | "TESTING_IN_ISOLATION"
  | "ACTIVE"
  | "REVERTED"
  | "REJECTED";

export interface EvolutionAuditLogEntry {
  entryId: string;
  evolutionId: string;
  action: "PROPOSE" | "APPROVE" | "TEST_START" | "TEST_PASS" | "TEST_FAIL" | "ACTIVATE" | "ROLLBACK";
  actor: "FOUNDER" | "SYSTEM_AUDITOR";
  details: string;
  timestamp: number;
  signatureSha256: string;
}

export interface EvolutionRecord {
  evolutionId: string;
  capabilityVersion: string; // e.g. "v1.2.0"
  title: string;
  description: string;
  proposalId: string;
  state: EvolutionState;
  preBenchmarkReportId: string;
  postBenchmarkReportId?: string;
  regressionTestPassed: boolean;
  rollbackSnapshot: {
    previousVersion: string;
    affectedComponent: string;
    rollbackPayload: Record<string, unknown>;
  };
  auditTrail: EvolutionAuditLogEntry[];
  appliedAt?: number;
  rolledBackAt?: number;
  rollbackReason?: string;
}

// ==============================================================================
// ADVANCED LEARNING CAPABILITIES CONTRACTS
// ==============================================================================

export interface ContinuousLearningStats {
  totalExperiencesProcessed: number;
  totalFeedbacksIncorporated: number;
  totalFailuresAnalyzed: number;
  verifiedLessonsCount: number;
  activeSkillsCount: number;
  activeGuardsCount: number;
  lastCycleTimestamp: number;
}

export interface MetaLearningAnalysis {
  mostEffectiveLearningSource: string;
  lessonVerificationRate: number; // verified / total extracted
  feedbackActionabilityRate: number;
  averageTimeToResolutionMs: number;
  learningEfficiencyScore: number; // 0.0 to 1.0
  recommendedMetaAdjustments: string[];
}

export interface TransferLearningCandidate {
  sourceProjectId: string;
  targetProjectId: string;
  lessonId: string;
  title: string;
  sanitizedContent: string;
  safetyCheckPassed: boolean;
  isLeakageFree: boolean; // Verified to contain no secrets or private tokens
}

export interface SkillLibraryQuery {
  category?: string;
  query?: string;
  status?: SkillStatus;
  minSuccessRate?: number;
  requiredPermission?: string;
}

export interface EvolutionAnalyticsMetrics {
  versionTimeline: Array<{ version: string; timestamp: number; summary: string }>;
  successRateTrend: Array<{ epoch: number; rate: number }>;
  latencyTrendMs: Array<{ epoch: number; latency: number }>;
  activeSkillCount: number;
  totalRollbacks: number;
  regressionPreventionRate: number;
}
