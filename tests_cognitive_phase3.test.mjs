/**
 * @file tests_cognitive_phase3.test.mjs
 * @description Comprehensive Test Suite for ULTRON Cognitive Intelligence Engine — Phase 3:
 * Decision Intelligence Engine & Planning Intelligence Engine.
 *
 * Verifies:
 * 1. Choosing between two technical architectures (MCDA scoring, short vs long-term trade-offs).
 * 2. Comparing a local solution against a paid cloud solution (strict zero-paid-API constraint enforcement).
 * 3. Choosing between a quick fix and a long-term solution (maintainability penalty and technical debt).
 * 4. Making a decision with incomplete information (clarification request rather than guessing).
 * 5. Planning a complex software project (actionable task decomposition).
 * 6. Building a dependency graph with multiple milestones (DAG topological sort).
 * 7. Handling circular task dependencies (cycle detection, contradiction reporting, sequential fallback).
 * 8. Handling an impossible or contradictory deadline (unrealistic timeframe detection).
 * 9. Replanning when a critical dependency becomes unavailable (contingency fallback roadmap).
 * 10. Ensuring recommendations respect existing constraints (local-first, fail-closed boundaries).
 * 11. Epistemic segregation of facts, estimates, and assumptions across both engines.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ============================================================================
// TEST 1: CHOOSING BETWEEN TWO TECHNICAL ARCHITECTURES
// ============================================================================
test("Cognitive Phase 3: Decision Engine compares technical architectures via MCDA", async () => {
  const { performDecisionAnalysis } = await import("./lib/cognitive/decisionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const query = "Should we choose in-process modular monolith or distributed microservices for our desktop app?";
  const context = analyzeContext(query);
  const decision = performDecisionAnalysis(context);

  assert.equal(decision.requiresClarification, false, "Must not require clarification when options are clear");
  assert.equal(decision.candidates.length, 2, "Must evaluate exactly 2 candidate architectures");

  const monolith = decision.candidates.find((c) => c.name.toLowerCase().includes("monolith"));
  const microservices = decision.candidates.find((c) => c.name.toLowerCase().includes("microservice"));

  assert.ok(monolith, "Must include monolith candidate");
  assert.ok(microservices, "Must include microservices candidate");

  // Multi-criteria verification
  assert.ok(monolith.expectedImpact >= 1 && monolith.expectedImpact <= 5);
  assert.ok(microservices.implementationComplexity > monolith.implementationComplexity);
  assert.equal(monolith.reversibility, "EASILY_REVERSIBLE");

  // Recommendation
  assert.ok(decision.recommendedOption, "Must select a recommended option");
  assert.match(decision.recommendedOption.name, /monolith/i, "Monolith must be recommended over desktop microservices");

  // Rejection explanation
  assert.equal(decision.rejectedAlternatives.length, 1);
  assert.match(decision.rejectedAlternatives[0].reasonForRejection, /complexity|maintainability/i);

  // Scenario analysis
  assert.ok(monolith.scenarioAnalysis.bestCase.length > 10);
  assert.ok(monolith.scenarioAnalysis.worstCase.length > 10);
});

// ============================================================================
// TEST 2: LOCAL SOLUTION VS PAID CLOUD SOLUTION (CONSTRAINT ENFORCEMENT)
// ============================================================================
test("Cognitive Phase 3: Decision Engine disqualifies paid cloud services violating constraints", async () => {
  const { performDecisionAnalysis } = await import("./lib/cognitive/decisionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const query = "Compare local SQLite vector storage vs paid cloud Pinecone database for memory.";
  const context = analyzeContext(query);
  const decision = performDecisionAnalysis(context);

  const localOpt = decision.candidates.find((c) => c.name.toLowerCase().includes("sqlite") || c.name.toLowerCase().includes("local"));
  const cloudOpt = decision.candidates.find((c) => c.name.toLowerCase().includes("pinecone") || c.name.toLowerCase().includes("cloud"));

  assert.ok(localOpt, "Must evaluate local candidate");
  assert.ok(cloudOpt, "Must evaluate cloud candidate");

  // Constraint violation check
  assert.equal(cloudOpt.alignmentWithConstraints, false, "Paid cloud option must be flagged as non-aligned");
  assert.ok(cloudOpt.constraintViolations.length > 0, "Must list specific invariant violated");
  assert.match(cloudOpt.constraintViolations[0], /zero paid cloud/i);

  // Recommendation must prefer local-first
  assert.equal(decision.recommendedOption?.id, localOpt.id, "Recommended option must be local SQLite");

  // Rejected alternative must explain disqualification
  const rejectedCloud = decision.rejectedAlternatives.find((r) => r.id === cloudOpt.id);
  assert.ok(rejectedCloud, "Cloud alternative must be rejected");
  assert.match(rejectedCloud.reasonForRejection, /Disqualified/i);
});

// ============================================================================
// TEST 3: QUICK FIX VS LONG-TERM SOLUTION
// ============================================================================
test("Cognitive Phase 3: Decision Engine evaluates quick hotfix vs architectural root fix", async () => {
  const { performDecisionAnalysis } = await import("./lib/cognitive/decisionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const query = "Should we apply a quick fix temporary patch or do an architectural root refactoring for the busy error?";
  const context = analyzeContext(query);
  const decision = performDecisionAnalysis(context);

  assert.equal(decision.candidates.length, 2);
  const quickFix = decision.candidates.find((c) => c.name.toLowerCase().includes("hotfix") || c.name.toLowerCase().includes("quick"));
  const rootFix = decision.candidates.find((c) => c.name.toLowerCase().includes("refactor") || c.name.toLowerCase().includes("root"));

  assert.ok(quickFix);
  assert.ok(rootFix);

  // Trade-off evaluation
  assert.match(quickFix.shortVsLongTermTradeoff, /Short-Term.*Long-Term/i);
  assert.ok(quickFix.longTermMaintainability < rootFix.longTermMaintainability, "Quick fix must have lower maintainability");
});

// ============================================================================
// TEST 4: INCOMPLETE INFORMATION (CLARIFICATION REQUEST)
// ============================================================================
test("Cognitive Phase 3: Decision Engine requests clarification on underspecified queries", async () => {
  const { performDecisionAnalysis } = await import("./lib/cognitive/decisionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const vagueQuery = "What should I do?";
  const context = analyzeContext(vagueQuery);
  const decision = performDecisionAnalysis(context);

  assert.equal(decision.requiresClarification, true, "Must require clarification on vague decision");
  assert.equal(decision.epistemicStatus, "INSUFFICIENT_INFORMATION");
  assert.ok(decision.clarificationPrompt, "Must provide targeted clarification prompt");
  assert.match(decision.clarificationPrompt, /candidate alternatives|primary priority|constraints/i);
  assert.equal(decision.candidates.length, 0, "Must not fabricate candidates without criteria");
});

// ============================================================================
// TEST 5 & 6: PLANNING COMPLEX PROJECT & TASK DAG WITH MILESTONES
// ============================================================================
test("Cognitive Phase 3: Planning Engine decomposes goal into task DAG and milestones", async () => {
  const { performPlanningAnalysis } = await import("./lib/cognitive/planningEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const query = "Plan the implementation of SQLite WAL concurrency and multi-worker serialization.";
  const context = analyzeContext(query);
  const plan = performPlanningAnalysis(context);

  // 1. Task Decomposition
  assert.ok(plan.tasks.length >= 4, "Must decompose into at least 4 structured tasks");
  const preflight = plan.tasks.find((t) => t.id === "task_01_preflight");
  const impl = plan.tasks.find((t) => t.id === "task_02_implementation");
  const verification = plan.tasks.find((t) => t.id === "task_04_verification");

  assert.ok(preflight && impl && verification);
  assert.equal(preflight.dependencies.length, 0, "Preflight has no dependencies");
  assert.ok(impl.dependencies.includes("task_01_preflight"), "Implementation depends on preflight");

  // 2. Execution Sequence (Topological Order)
  assert.ok(plan.executionSequence.length >= 4);
  assert.equal(plan.executionSequence[0], "task_01_preflight");
  assert.equal(plan.executionSequence[plan.executionSequence.length - 1], "task_04_verification");

  // 3. Milestones
  assert.equal(plan.milestones.length, 3, "Must formulate 3 discrete milestones");
  assert.ok(plan.milestones[0].successCriteria.length > 10);
  assert.ok(plan.milestones[0].deliverable.length > 5);

  // 4. Advisory Safety
  assert.equal(plan.isAdvisoryOnly, true, "Plan must be strictly advisory");
});

// ============================================================================
// TEST 7: CIRCULAR TASK DEPENDENCIES (CYCLE DETECTION)
// ============================================================================
test("Cognitive Phase 3: Planning Engine detects and recovers from circular dependencies", async () => {
  const { performPlanningAnalysis, computeTaskExecutionSequence } = await import("./lib/cognitive/planningEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // In standard plan, inject artificial circular dependencies to verify Kahn's cycle detector
  const context = analyzeContext("Plan architectural refactoring");
  const plan = performPlanningAnalysis(context);

  // Artificially create a cycle: task 2 depends on task 3, task 3 depends on task 2
  const task2 = plan.tasks.find((t) => t.id === "task_02_implementation");
  const task3 = plan.tasks.find((t) => t.id === "task_03_integration");
  if (task2 && task3) {
    task2.dependencies.push("task_03_integration");
  }

  // Run cycle detection directly
  const result = computeTaskExecutionSequence(plan.tasks);

  assert.equal(result.hasCircularDependency, true, "Must flag cycle when tasks have circular prerequisites");
  assert.ok(result.circularDetails, "Must provide details about circular deadlock");
  assert.equal(result.sequence.length, plan.tasks.length, "Must still recover all tasks into sequence");
});

// ============================================================================
// TEST 8: IMPOSSIBLE / CONTRADICTORY DEADLINE
// ============================================================================
test("Cognitive Phase 3: Planning Engine detects unrealistic or contradictory deadlines", async () => {
  const { performPlanningAnalysis } = await import("./lib/cognitive/planningEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const impossibleQuery = "Rewrite the entire multi-phase architecture in 10 minutes.";
  const context = analyzeContext(impossibleQuery);
  const plan = performPlanningAnalysis(context);

  assert.equal(plan.hasContradictions, true, "Must flag contradiction for impossible timeframe");
  assert.ok(plan.contradictions.some((c) => c.includes("Unrealistic Deadline")));
});

// ============================================================================
// TEST 9: REPLANNING WHEN A DEPENDENCY BECOMES UNAVAILABLE
// ============================================================================
test("Cognitive Phase 3: Planning Engine generates alternative fallback plan", async () => {
  const { performPlanningAnalysis } = await import("./lib/cognitive/planningEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const query = "Plan the implementation of our memory manager.";
  const context = analyzeContext(query);
  const plan = performPlanningAnalysis(context);

  assert.ok(plan.alternativeFallbackPlan, "Must generate alternative fallback plan");
  assert.match(plan.alternativeFallbackPlan, /Contingency Fallback Roadmap|Replanning Protocol/i);
  assert.match(plan.alternativeFallbackPlan, /defensive validation guard/i);
});

// ============================================================================
// TEST 10: EPISTEMIC SEGREGATION OF FACTS, ESTIMATES, AND ASSUMPTIONS
// ============================================================================
test("Cognitive Phase 3: Distinguishes facts from estimates and assumptions", async () => {
  const { performDecisionAnalysis } = await import("./lib/cognitive/decisionEngine.ts");
  const { performPlanningAnalysis } = await import("./lib/cognitive/planningEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const query = "Should we use local SQLite or external Postgres?";
  const context = analyzeContext(query);
  const decision = performDecisionAnalysis(context);
  const plan = performPlanningAnalysis(context);

  // Decision Engine Segregation
  assert.ok(decision.facts.length > 0, "Must provide verified facts");
  assert.ok(decision.estimates.length > 0, "Must provide documented estimates");
  assert.ok(decision.assumptions.length > 0, "Must provide explicit assumptions");

  // Verify financial cost classification
  const localCandidate = decision.candidates.find((c) => c.name.toLowerCase().includes("sqlite"));
  assert.equal(localCandidate?.financialCost.classification, "MEASURED_FACT");

  // Planning Engine Segregation
  const preflightTask = plan.tasks.find((t) => t.id === "task_01_preflight");
  assert.equal(preflightTask?.effortClassification, "ESTIMATE");
  assert.ok(plan.successMetrics.length >= 3);
});

// ============================================================================
// TEST 11: ORCHESTRATOR INTEGRATION WITH DECISION & PLANNING
// ============================================================================
test("Cognitive Phase 3: Orchestrator routes decision and planning through pipeline", async () => {
  const { orchestrateCognitivePipeline } = await import("./lib/cognitive/orchestrator.ts");

  const statusPhases = [];
  const pipelineResult = await orchestrateCognitivePipeline(
    "Should we choose local SQLite or external Postgres? Plan the implementation steps.",
    [],
    {
      onStatus: (st) => statusPhases.push(st.phase),
    }
  );

  assert.equal(pipelineResult.tier, "TIER_2_ANALYTICAL");
  assert.ok(statusPhases.includes("decision_analysis"), "Must emit decision analysis phase");
  assert.ok(statusPhases.includes("planning"), "Must emit planning phase");

  // Check presence of Phase 3 outputs
  assert.ok(pipelineResult.decision, "Pipeline must return decision analysis");
  assert.ok(pipelineResult.planning, "Pipeline must return planning analysis");

  // Check prompt enrichment
  const prompt = pipelineResult.cognitiveSystemPrompt;
  assert.match(prompt, /DECISION INTELLIGENCE/);
  assert.match(prompt, /PLANNING INTELLIGENCE/);
});
