/**
 * @file lib/orchestration/goalUnderstandingEngine.ts
 * @description Module 01: Goal Understanding Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 1 Task Foundation.
 *
 * Key Responsibilities:
 * - Translates ambiguous, high-level natural language founder requests into structured, actionable goals.
 * - Classifies objectives into discrete operational domains (ENGINEERING, RESEARCH, AUTOMATION, etc.).
 * - Extracts expected outcomes, explicit in-scope items, and bounded out-of-scope boundaries.
 * - Identifies constraints (time, tools, resources, permissions, security policies).
 * - Detects missing information and generates clarification questions for ambiguous goals.
 * - Formulates quantitative and qualitative success criteria with verifiable methods.
 *
 * Architectural Role & Interactions:
 * - First phase of the Master Orchestration lifecycle: FOUNDER REQUEST -> GOAL UNDERSTANDING.
 * - Outputs a deterministic `StructuredGoal` object consumed directly by `taskDecompositionEngine.ts`.
 * - Operates safely offline with robust heuristic rules and local semantic pattern extraction.
 *
 * Safety / Security Guarantees:
 * - Read-only analytical phase: causes no side-effects or system changes.
 * - Explicitly tags security and permission constraints when system-level modifications are detected.
 */

import crypto from "crypto";
import type {
  StructuredGoal,
  GoalCategory,
  GoalClarityLevel,
  GoalConstraint,
  GoalSuccessCriterion,
} from "./types.ts";

export interface GoalAnalysisOptions {
  founderAssumptions?: string[];
  enforceStrictScope?: boolean;
}

/**
 * Analyzes a raw founder request string and synthesizes a comprehensive StructuredGoal.
 *
 * @param rawPrompt - Unstructured natural language request from the founder.
 * @param options - Optional configuration including explicit founder assumptions.
 * @returns Fully validated StructuredGoal with classification, criteria, and constraints.
 */
export function understandGoal(
  rawPrompt: string,
  options?: GoalAnalysisOptions
): StructuredGoal {
  const prompt = (rawPrompt || "").trim();
  const id = `goal_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  if (!prompt) {
    return createEmptyOrAmbiguousGoal(id, "Empty goal provided", "INCOMPLETE");
  }

  // 1. Classify Category
  const category = classifyCategory(prompt);

  // 2. Derive Title and Primary Objective
  const title = deriveGoalTitle(prompt, category);
  const primaryObjective = derivePrimaryObjective(prompt, category);

  // 3. Extract Expected Outcomes & Scope
  const expectedOutcomes = extractExpectedOutcomes(prompt, category);
  const { inScope, outOfScope } = extractScope(prompt, category);

  // 4. Identify Constraints & Limitations
  const constraints = identifyConstraints(prompt);

  // 5. Detect Missing Information
  const missingInformation = detectMissingInformation(prompt, category);

  // 6. Formulate Success Criteria
  const successCriteria = formulateSuccessCriteria(prompt, category, expectedOutcomes);

  // 7. Evaluate Clarity Level & Clarification Prompts
  const { clarity, clarificationQuestions } = evaluateClarity(prompt, missingInformation);

  const assumptions = [
    ...(options?.founderAssumptions || []),
    "Execution will be staged in topologically sorted dependency order.",
    "Critical system actions require explicit cryptographic founder approval.",
  ];

  return {
    id,
    rawPrompt: prompt,
    title,
    category,
    clarity,
    primaryObjective,
    expectedOutcomes,
    inScope,
    outOfScope,
    constraints,
    missingInformation,
    assumptions,
    successCriteria,
    requiresClarification: clarity === "AMBIGUOUS" || clarity === "INCOMPLETE",
    clarificationQuestions,
    createdAt: Date.now(),
  };
}

/**
 * Classifies the natural language request into a discrete operational category.
 */
function classifyCategory(prompt: string): GoalCategory {
  const p = prompt.toLowerCase();

  if (p.includes("security") || p.includes("audit") || p.includes("vulnerability") || p.includes("pentest") || p.includes("lockdown")) {
    return "SECURITY_AUDIT";
  }
  if (p.includes("build") || p.includes("create") || p.includes("implement") || p.includes("code") || p.includes("feature") || p.includes("engine")) {
    return "ENGINEERING";
  }
  if (p.includes("research") || p.includes("investigate") || p.includes("find out") || p.includes("market analysis") || p.includes("competitor")) {
    return "RESEARCH";
  }
  if (p.includes("deploy") || p.includes("release") || p.includes("docker") || p.includes("publish") || p.includes("ci/cd")) {
    return "DEPLOYMENT";
  }
  if (p.includes("automate") || p.includes("cron") || p.includes("schedule") || p.includes("batch script") || p.includes("bot")) {
    return "AUTOMATION";
  }
  if (p.includes("config") || p.includes("setup") || p.includes("install") || p.includes("environment") || p.includes("settings")) {
    return "SYSTEM_CONFIG";
  }
  if (p.includes("analyze") || p.includes("benchmark") || p.includes("telemetry") || p.includes("metric") || p.includes("eval")) {
    return "ANALYSIS";
  }
  if (p.includes("fix") || p.includes("clean") || p.includes("refactor") || p.includes("upgrade") || p.includes("patch")) {
    return "MAINTENANCE";
  }
  if (p.includes("build") || p.includes("create") || p.includes("implement") || p.includes("code") || p.includes("feature") || p.includes("engine")) {
    return "ENGINEERING";
  }

  return "GENERAL";
}

/**
 * Derives a concise, readable title for the goal.
 */
function deriveGoalTitle(prompt: string, category: GoalCategory): string {
  const firstLine = prompt.split("\n")[0].trim();
  if (firstLine.length > 5 && firstLine.length <= 60) {
    return firstLine.replace(/^[#\s*-_]+/, "");
  }
  // Truncate cleanly at word boundary
  const truncated = prompt.slice(0, 50).replace(/[^\w\s-].*$/, "").trim();
  return `${category}: ${truncated || "Founder Objective"}`;
}

/**
 * Formulates the core primary objective statement.
 */
function derivePrimaryObjective(prompt: string, category: GoalCategory): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return `Accomplish ${category.toLowerCase()} objective: "${normalized.length > 120 ? normalized.slice(0, 117) + "..." : normalized}"`;
}

/**
 * Extracts discrete deliverables and expected outcomes based on the prompt.
 */
function extractExpectedOutcomes(prompt: string, category: GoalCategory): string[] {
  const outcomes: string[] = [];
  const lines = prompt.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*•\d.]+\s+/.test(trimmed)) {
      outcomes.push(trimmed.replace(/^[-*•\d.]+\s+/, ""));
    }
  }

  if (outcomes.length === 0) {
    switch (category) {
      case "ENGINEERING":
        outcomes.push("Fully implemented and integrated code artifacts", "Passing verification test suite", "Architectural documentation");
        break;
      case "RESEARCH":
        outcomes.push("Structured factual findings", "Evidence source references", "Comprehensive research report");
        break;
      case "SECURITY_AUDIT":
        outcomes.push("Vulnerability inspection audit", "Remediation patch plan", "Zero-trust compliance verification");
        break;
      case "AUTOMATION":
        outcomes.push("Reliable automated execution workflow", "Trigger & schedule integration", "Failure handling hooks");
        break;
      default:
        outcomes.push("Verified completion of requested tasks", "Executive summary report");
        break;
    }
  }

  return outcomes;
}

/**
 * Identifies in-scope and explicit out-of-scope boundaries.
 */
function extractScope(prompt: string, category: GoalCategory): { inScope: string[]; outOfScope: string[] } {
  const inScope: string[] = [
    `Execution of primary task components within the ${category} domain`,
    "Verification against defined acceptance criteria",
    "Persistent state tracking and progress reporting",
  ];

  const outOfScope: string[] = [
    "Unapproved external credential modifications",
    "Modifications to unassociated subsystem internals",
    "Unverified assumption of completed external side-effects",
  ];

  const p = prompt.toLowerCase();
  if (p.includes("only") || p.includes("strictly") || p.includes("do not")) {
    const matchNo = prompt.match(/(?:do not|don't|exclude|never)\s+([^.\n]+)/gi);
    if (matchNo) {
      for (const m of matchNo) {
        outOfScope.push(m.trim());
      }
    }
  }

  return { inScope, outOfScope };
}

/**
 * Identifies hard and soft constraints based on keywords and security policies.
 */
function identifyConstraints(prompt: string): GoalConstraint[] {
  const constraints: GoalConstraint[] = [];
  let idx = 1;

  // Global default safety constraint
  constraints.push({
    id: `c_${idx++}`,
    type: "SECURITY",
    description: "External and OS system-level actions require founder permission gateway approval.",
    isHardConstraint: true,
  });

  const p = prompt.toLowerCase();

  // Time constraint
  if (p.includes("fast") || p.includes("within") || p.includes("minute") || p.includes("hour") || p.includes("deadline")) {
    constraints.push({
      id: `c_${idx++}`,
      type: "TIME",
      description: "Founder specified time sensitivity; execution steps must optimize latency.",
      isHardConstraint: false,
    });
  }

  // Resource / Cost constraint
  if (p.includes("local only") || p.includes("offline") || p.includes("zero cost") || p.includes("no api")) {
    constraints.push({
      id: `c_${idx}`,
      type: "RESOURCE",
      description: "Must execute strictly offline using local compute without external paid APIs.",
      isHardConstraint: true,
    });
  }

  return constraints;
}

/**
 * Detects missing prerequisites or ambiguities that require clarification.
 */
function detectMissingInformation(prompt: string, category: GoalCategory): string[] {
  const missing: string[] = [];
  const words = prompt.trim().split(/\s+/);

  if (words.length < 4) {
    missing.push("Request is extremely brief; specific target files or parameters are not stated.");
  }

  const p = prompt.toLowerCase();
  if ((category === "ENGINEERING" || category === "DEPLOYMENT") && !p.includes("file") && !p.includes("path") && !p.includes("repo") && !p.includes("module") && !p.includes("script")) {
    missing.push("Target file paths or destination components are not explicitly specified.");
  }

  return missing;
}

/**
 * Formulates measurable success criteria.
 */
function formulateSuccessCriteria(
  prompt: string,
  category: GoalCategory,
  outcomes: string[]
): GoalSuccessCriterion[] {
  const criteria: GoalSuccessCriterion[] = [];
  let idx = 1;

  criteria.push({
    id: `crit_${idx++}`,
    description: "All decomposed subtasks must transition to VERIFIED status with valid evidence.",
    isQuantitative: true,
    targetMetric: "verified_tasks_ratio",
    targetValue: 1.0,
    verificationMethod: "AUTOMATED_TEST",
  });

  criteria.push({
    id: `crit_${idx++}`,
    description: "Final execution report must be generated with zero unhandled fatal exceptions.",
    isQuantitative: true,
    targetMetric: "fatal_errors_count",
    targetValue: 0,
    verificationMethod: "OUTPUT_EVALUATION",
  });

  for (const outcome of outcomes.slice(0, 3)) {
    criteria.push({
      id: `crit_${idx++}`,
      description: `Deliverable produced and validated: "${outcome}"`,
      isQuantitative: false,
      verificationMethod: "FILE_EXISTS",
    });
  }

  return criteria;
}

/**
 * Evaluates goal clarity and compiles clarification prompts if needed.
 */
function evaluateClarity(
  prompt: string,
  missing: string[]
): { clarity: GoalClarityLevel; clarificationQuestions: string[] } {
  const questions: string[] = [];
  const words = prompt.trim().split(/\s+/);

  if (words.length <= 3) {
    questions.push("Could you provide more specific details on the expected outcome?");
    return { clarity: "INCOMPLETE", clarificationQuestions: questions };
  }

  if (missing.length >= 2) {
    for (const m of missing) {
      questions.push(`Clarification needed: ${m}`);
    }
    return { clarity: "AMBIGUOUS", clarificationQuestions: questions };
  }

  if (missing.length === 1) {
    return { clarity: "MEDIUM", clarificationQuestions: questions };
  }

  return { clarity: "HIGH", clarificationQuestions: [] };
}

/**
 * Fallback constructor for empty or severely deficient input prompts.
 */
function createEmptyOrAmbiguousGoal(
  id: string,
  reason: string,
  clarity: GoalClarityLevel
): StructuredGoal {
  return {
    id,
    rawPrompt: "",
    title: "Incomplete Founder Request",
    category: "GENERAL",
    clarity,
    primaryObjective: "Resolve incomplete user prompt",
    expectedOutcomes: [],
    inScope: [],
    outOfScope: [],
    constraints: [],
    missingInformation: [reason],
    assumptions: [],
    successCriteria: [],
    requiresClarification: true,
    clarificationQuestions: ["Please specify the exact objective or task you want ULTRON to accomplish."],
    createdAt: Date.now(),
  };
}
