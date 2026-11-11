/**
 * @file lib/cognitive/reasoningEngine.ts
 * @description Component 02: Advanced Reasoning Engine for ULTRON.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Multi-Step Analytical Reasoning Layer.
 *
 * Key Responsibilities:
 * - Decomposes multi-faceted problems into orthogonal sub-problems with clear dependencies and invariants.
 * - Performs rigorous cause-and-effect analysis, distinguishing direct effects from indirect cascading impacts.
 * - Formulates and balances competing hypotheses with empirical supporting and contradicting factors.
 * - Generates topological dependency orderings to ensure prerequisites are evaluated prior to dependent decisions.
 * - Produces concise, evidence-based analytical summaries without exposing raw model tokens.
 *
 * Architectural Role & Interactions:
 * - Invoked by `lib/cognitive/orchestrator.ts` when queries require analytical depth (Tier 2).
 * - Feeds structured reasoning outputs into `lib/cognitive/criticalThinkingEngine.ts` and `lib/cognitive/problemSolvingEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - Deterministic, bounded algorithmic processing with zero paid API dependencies.
 * - Memory-safe DAG topological sorting with cycle detection and fallback resolution.
 */

import type {
  ParsedContext,
  AdvancedReasoningResult,
  ReasoningSubProblem,
  CausalDriver,
  CompetingHypothesis,
} from "./types.ts";

/**
 * Decomposes an analytical query into structured sub-problems with dependencies.
 *
 * @param context - Parsed context from Context Understanding Engine.
 * @returns Array of ReasoningSubProblem objects.
 */
function decomposeQuery(context: ParsedContext): ReasoningSubProblem[] {
  const subProblems: ReasoningSubProblem[] = [];

  // Sub-problem 1: Foundations & Invariant Requirements
  subProblems.push({
    id: "sub_1_foundations",
    title: "Core Invariants & Requirements Validation",
    dependencies: [],
    prerequisites: ["Explicit user goals verified", "Non-negotiable constraints checked"],
    invariants: context.instructions
      .filter((i) => i.priority === "MANDATORY")
      .map((i) => i.normalizedText),
  });

  // Sub-problem 2: Technical/Architectural Feasibility
  if (
    context.intentCategory === "TECHNICAL_ANALYSIS" ||
    context.intentCategory === "PROBLEM_SOLVING" ||
    context.intentCategory === "STRATEGIC_DECISION"
  ) {
    subProblems.push({
      id: "sub_2_feasibility",
      title: "Technical Feasibility, Latency & Resource Consumption",
      dependencies: ["sub_1_foundations"],
      prerequisites: ["Hardware and library boundaries identified"],
      invariants: ["100% offline local execution", "Zero paid cloud API dependencies"],
    });
  }

  // Sub-problem 3: Operational Trade-offs & Security Impact
  subProblems.push({
    id: "sub_3_tradeoffs",
    title: "Operational Trade-offs, Failure Modes & Security Posture",
    dependencies: ["sub_1_foundations"],
    prerequisites: ["Candidate architectures identified"],
    invariants: ["Fail-closed security boundaries", "Zero unencrypted secrets at rest"],
  });

  // Sub-problem 4: Synthesis & Validation
  subProblems.push({
    id: "sub_4_synthesis",
    title: "Synthesis, Recommended Action Plan & Verification Criteria",
    dependencies: subProblems.map((p) => p.id),
    prerequisites: ["All candidate solutions evaluated against constraints"],
    invariants: ["Actionable recommendations justified with supporting evidence"],
  });

  return subProblems;
}

/**
 * Traces cause-and-effect drivers, distinguishing direct consequences from cascading downstream effects.
 *
 * @param context - Parsed context.
 * @returns Array of CausalDriver models.
 */
function traceCausalDrivers(context: ParsedContext): CausalDriver[] {
  const query = context.cleanedQuery.toLowerCase();
  const causalChain: CausalDriver[] = [];

  if (query.includes("sqlite") || query.includes("database") || query.includes("storage")) {
    causalChain.push({
      cause: "Multi-threaded concurrent writes to a single SQLite database file",
      directEffect: "Database file lock contention leading to SQLITE_BUSY or disk I/O errors",
      indirectEffects: [
        "Unresponsive API endpoints on concurrent desktop user requests",
        "Potential memory backup synchronization lag",
      ],
      reversibility: "HIGH",
    });
    causalChain.push({
      cause: "Adopting WAL (Write-Ahead Logging) mode and connection serialization",
      directEffect: "Concurrent read transactions execute without blocking active writes",
      indirectEffects: [
        "Eliminates disk I/O lock contention on multi-engine event bus",
        "Requires clean checkpointing on application termination",
      ],
      reversibility: "HIGH",
    });
  } else if (query.includes("microservice") || query.includes("monolith") || query.includes("architecture")) {
    causalChain.push({
      cause: "Premature microservice decomposition for a single-user desktop system",
      directEffect: "Substantial IPC/network overhead, complex port management, and process lifecycle failure modes",
      indirectEffects: [
        "High memory footprint across multiple child processes",
        "Fragmented logging and brittle startup dependencies",
      ],
      reversibility: "LOW",
    });
    causalChain.push({
      cause: "Modular in-process monolith with strict service boundaries",
      directEffect: "Zero network latency, shared in-memory event bus, and simplified atomic deployments",
      indirectEffects: [
        "Significantly lower CPU/RAM footprint on host laptop",
        "Preserves clean boundaries for future selective extraction if needed",
      ],
      reversibility: "HIGH",
    });
  } else if (query.includes("rust") || query.includes("rewrite")) {
    causalChain.push({
      cause: "Full rewrite in a new systems language (Rust) during active development",
      directEffect: "Immediate halt of feature velocity and high risk of re-introducing solved edge-case bugs",
      indirectEffects: [
        "Developer cognitive fatigue on memory management vs product logic",
        "Potential desynchronization with existing TypeScript frontend bindings",
      ],
      reversibility: "LOW",
    });
    causalChain.push({
      cause: "Targeted native extension modules via N-API / PyO3 for bottlenecks only",
      directEffect: "Delivers maximum performance on CPU-critical hot paths without disrupting stable orchestration",
      indirectEffects: [
        "Preserves existing test suites and verified security gates",
        "Incremental, verifiable optimization milestones",
      ],
      reversibility: "HIGH",
    });
  } else {
    // Dynamic user cause extraction if inquiry contains "because <cause> ..."
    const becauseMatch = query.match(/\bbecause\s+([^.]+?)(?:\.|\?|$)/i);
    if (becauseMatch && becauseMatch[1].trim().length > 10) {
      const userCause = becauseMatch[1].trim();
      causalChain.push({
        cause: `User-reported causal driver: "${userCause}"`,
        directEffect: `Cascading runtime blockage impacting "${context.primaryGoal.slice(0, 70)}"`,
        indirectEffects: [
          "Dependent startup services or API consumers encounter connection aborts or timeouts",
          "Inter-process synchronization blockages across child runtimes",
        ],
        reversibility: "HIGH",
      });
    }

    // General causal analysis fallback
    causalChain.push({
      cause: `Proposed course of action for "${context.primaryGoal.slice(0, 80)}"`,
      directEffect: "Primary objective addressed within current system constraints",
      indirectEffects: [
        "Resource allocation shift toward current proposal",
        "Subsequent operational dependencies created",
      ],
      reversibility: "MEDIUM",
    });
  }

  return causalChain;
}

/**
 * Dynamically extracts multiple candidate causes or hypotheses directly from user phrasing.
 * Matches clauses such as:
 * - "It could be A, B, or C"
 * - "could be driven by A, B, or C"
 * - "causes: A, B, or C"
 *
 * @param query - Raw or cleaned query string.
 * @returns Array of CompetingHypothesis models derived from user clauses, or empty if none found.
 */
function extractDynamicHypotheses(query: string): CompetingHypothesis[] {
  const dynamicHypotheses: CompetingHypothesis[] = [];
  
  const couldBeMatch = query.match(
    /(?:(?:it\s+)?could\s+be|suspect(?:ing)?|causes?\s+could\s+be|possible\s+causes?:?)\s+([^.?!]+)/i
  );
  let clause = couldBeMatch ? couldBeMatch[1] : null;

  if (!clause) {
    const orListMatch = query.match(
      /\b(?:either\s+)?([a-zA-Z0-9_\s-]{6,}),\s*([a-zA-Z0-9_\s-]{6,}),?\s*or\s*([a-zA-Z0-9_\s-]{6,})/i
    );
    if (orListMatch) {
      clause = orListMatch[0];
    }
  }

  if (clause) {
    const rawParts = clause
      .split(/,|;|\bor\b/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 5 && !/^(?:either|and|also)$/i.test(p));

    if (rawParts.length >= 2) {
      rawParts.forEach((part, idx) => {
        const cleanPart = part.replace(/^(?:it could be|perhaps|maybe|possibly)\s+/i, "");
        dynamicHypotheses.push({
          hypothesisId: `hyp_user_candidate_${idx + 1}`,
          statement: `Candidate Cause ${idx + 1}: ${cleanPart}`,
          likelihood: "MODERATE",
          supportingFactors: [
            `Explicitly identified by user as a candidate driver: "${cleanPart}"`,
            "Plausible failure mode within current application runtime profile",
          ],
          contradictingFactors: [
            "Requires isolated profiling and performance instrumentation to confirm causality",
          ],
          criticalAssumptions: [
            `Mechanism of "${cleanPart}" manifests during the reported failure window`,
          ],
        });
      });
    }
  }

  return dynamicHypotheses;
}

/**
 * Formulates competing hypotheses to prevent confirmation bias.
 * Prioritizes dynamic user-supplied alternatives, falling back to domain templates.
 *
 * @param context - Parsed context.
 * @returns Array of CompetingHypothesis models.
 */
function formulateHypotheses(context: ParsedContext): CompetingHypothesis[] {
  const query = context.cleanedQuery.toLowerCase();

  // 1. Prioritize dynamic candidate causes extracted from user prompt
  const dynamicCandidates = extractDynamicHypotheses(context.cleanedQuery);
  if (dynamicCandidates.length >= 2) {
    return dynamicCandidates;
  }

  const hypotheses: CompetingHypothesis[] = [];

  if (query.includes("why") || query.includes("error") || query.includes("slow") || query.includes("bug")) {
    hypotheses.push({
      hypothesisId: "hyp_root_concurrency",
      statement: "The observed issue is driven by resource lock contention or unhandled asynchronous race conditions.",
      likelihood: "HIGH",
      supportingFactors: [
        "Desktop environment operates concurrent EventBus engines and Next.js workers",
        "Shared state mutations without atomic locking produce intermittent failures under load",
      ],
      contradictingFactors: [
        "Single-threaded sequential test suites may not reproduce the race condition reliably",
      ],
      criticalAssumptions: ["Multiple processes attempt concurrent writes to the same local resource."],
    });

    hypotheses.push({
      hypothesisId: "hyp_root_configuration",
      statement: "The issue is caused by missing environment defaults or unhandled platform-specific OS path boundaries.",
      likelihood: "MODERATE",
      supportingFactors: [
        "Windows path backslashes and case-sensitivity differences frequently cause silent import failures",
        "Environment variables unset in child processes revert to fail-open/closed fallbacks",
      ],
      contradictingFactors: [
        "Standard test suites pass in the root directory",
      ],
      criticalAssumptions: ["Host OS security policies or permissions restrict child process access."],
    });
  } else {
    // Strategic decision hypotheses
    hypotheses.push({
      hypothesisId: "hyp_strategic_focused",
      statement: "Hypothesis A: An incremental, local-first optimization preserves stability and maximizes developer velocity.",
      likelihood: "HIGH",
      supportingFactors: [
        "Preserves verified security gates, DPAPI vaults, and existing test suites",
        "Zero additional infrastructure maintenance and zero monetary operational cost",
      ],
      contradictingFactors: [
        "May require custom algorithmic optimizations rather than relying on managed cloud services",
      ],
      criticalAssumptions: ["Local laptop hardware has sufficient CPU/RAM headroom for current workloads."],
    });

    hypotheses.push({
      hypothesisId: "hyp_strategic_radical",
      statement: "Hypothesis B: An aggressive architectural overhaul eliminates technical debt at the expense of short-term velocity.",
      likelihood: "LOW",
      supportingFactors: [
        "Provides a clean slate and modern idioms from day one",
      ],
      contradictingFactors: [
        "High risk of introducing regressions across the 15 verified test suites",
        "Extensive engineering time diverted from core intelligence capabilities",
      ],
      criticalAssumptions: ["The existing architecture is fundamentally bottlenecked (unsupported by empirical data)."],
    });
  }

  return hypotheses;
}

/**
 * Generates topological ordering for sub-problems using Kahn's algorithm with cycle recovery.
 *
 * @param subProblems - Array of sub-problems with dependency lists.
 * @returns Array of sub-problem IDs in valid execution order.
 */
function computeTopologicalOrder(subProblems: ReasoningSubProblem[]): string[] {
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();

  for (const p of subProblems) {
    inDegree.set(p.id, 0);
    graph.set(p.id, []);
  }

  for (const p of subProblems) {
    for (const dep of p.dependencies) {
      if (graph.has(dep)) {
        graph.get(dep)!.push(p.id);
        inDegree.set(p.id, (inDegree.get(p.id) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const neighbor of graph.get(node) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // Fallback: If cycle detected or incomplete, append remaining nodes
  for (const p of subProblems) {
    if (!result.includes(p.id)) result.push(p.id);
  }

  return result;
}

/**
 * Main execution entry point for Component 02: Advanced Reasoning Engine.
 *
 * @param context - Parsed context from Context Understanding Engine.
 * @returns AdvancedReasoningResult containing decomposed sub-problems, causal graph, and hypotheses.
 */
export function performAdvancedReasoning(context: ParsedContext): AdvancedReasoningResult {
  const decomposedSubProblems = decomposeQuery(context);
  const causalChain = traceCausalDrivers(context);
  const competingHypotheses = formulateHypotheses(context);
  const topologicalOrder = computeTopologicalOrder(decomposedSubProblems);

  const analyticalSummary =
    `Decomposed inquiry into ${decomposedSubProblems.length} architectural sub-problems across ` +
    `${causalChain.length} causal drivers and ${competingHypotheses.length} competing hypotheses. ` +
    `Dependency execution sequence: [${topologicalOrder.join(" -> ")}].`;

  return {
    decomposedSubProblems,
    causalChain,
    competingHypotheses,
    topologicalOrder,
    analyticalSummary,
  };
}
