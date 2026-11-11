/**
 * @file tests_cognitive_phase4.test.mjs
 * @description Comprehensive Test Suite for ULTRON Cognitive Intelligence Engine — Phase 4:
 * Uncertainty & Confidence Engine (Component 07) and Self-Evaluation Engine (Component 08).
 *
 * Mandatory Benchmark Scenarios:
 * 1. Fact vs Estimate vs Assumption Epistemic Classification.
 * 2. Missing-Information Detection & Targeted Clarification Decision.
 * 3. Ambiguity Detection & Stated Working Assumptions.
 * 4. Contradictory Input Detection (Zero-cost vs Paid cloud, impossible deadlines, skipping tests).
 * 5. Unsupported Factual Claims Detection in Proposed Responses.
 * 6. Incorrect Arithmetic Calculations Detection & Deterministic Remediation.
 * 7. Incomplete Answer Detection across Multi-Step Sub-Goals.
 * 8. Mandatory Negative Constraint Breach Detection & Automatic Remediation.
 * 9. False Certainty Prevention & Epistemic Honesty Phrasing ("I know this", "This is my best estimate", etc.).
 * 10. Infinite Loop Prevention in Remediation Workflow (Max Iteration Guard).
 * 11. Simple Query Fast-Path Latency (< 25ms benchmark).
 * 12. Full Pipeline Integration: Orchestrator routes Uncertainty & Pre-Delivery Self-Evaluation.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ============================================================================
// TEST 1: FACT VS ESTIMATE VS ASSUMPTION EPISTEMIC CLASSIFICATION
// ============================================================================
test("Cognitive Phase 4: Uncertainty Engine classifies claims into epistemic tiers", async () => {
  const { classifyEpistemicClaims } = await import("./lib/cognitive/uncertaintyEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const claims = [
    "User identity is Ashish and memory vault is encrypted with AES-256-GCM and DPAPI.",
    "Database operations execute on local SQLite with WAL mode.",
    "Estimated latency will be approximately 45ms per analytical turn.",
    "If we assume the host machine has 16GB RAM available.",
    "Presumably the background process is running without thread contention.",
  ];

  const context = analyzeContext("Check local system status");
  const classified = classifyEpistemicClaims(claims, context);

  assert.equal(classified.length, 5);

  // Claim 1 & 2: Verified measured facts
  assert.equal(classified[0].classification, "MEASURED_FACT");
  assert.equal(classified[1].classification, "MEASURED_FACT");
  assert.ok(classified[0].confidence >= 0.9);

  // Claim 3: Quantitative estimate
  assert.equal(classified[2].classification, "ESTIMATE");
  assert.ok(classified[2].confidence >= 0.6 && classified[2].confidence <= 0.85);

  // Claim 4 & 5: Unverified assumptions
  assert.equal(classified[3].classification, "UNVERIFIED_ASSUMPTION");
  assert.equal(classified[4].classification, "UNVERIFIED_ASSUMPTION");
  assert.ok(classified[3].confidence <= 0.5);
});

// ============================================================================
// TEST 2: MISSING INFORMATION & TARGETED CLARIFICATION
// ============================================================================
test("Cognitive Phase 4: Detects missing information and halts with clarification questions", async () => {
  const { detectMissingInformation, assessUncertaintyAndConfidence } = await import("./lib/cognitive/uncertaintyEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // Vague refactoring query without target or scope
  const vagueQuery = "Can you optimize it?";
  const context = analyzeContext(vagueQuery);
  const missingInfo = detectMissingInformation(context);

  assert.ok(missingInfo.missingParameters.length > 0, "Must detect missing target module/scope");
  assert.ok(missingInfo.clarificationQuestions.length > 0, "Must formulate targeted clarification question");
  assert.match(missingInfo.clarificationQuestions[0], /subsystem|module|file/i);

  // Uncertainty assessment must trigger clarification requirement
  const assessment = assessUncertaintyAndConfidence(context);
  assert.equal(assessment.requiresClarification, true);
  assert.equal(assessment.epistemicPhrasing, "I need clarification before recommending a solution.");
  assert.equal(assessment.calibrationCategory, "HIGH_UNCERTAINTY");
});

// ============================================================================
// TEST 3: AMBIGUITY DETECTION & STATED ASSUMPTIONS
// ============================================================================
test("Cognitive Phase 4: Detects ambiguity and documents working assumptions", async () => {
  const { assessUncertaintyAndConfidence } = await import("./lib/cognitive/uncertaintyEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const ambiguousQuery = "Debug the database deadlock error";
  const context = analyzeContext(ambiguousQuery);
  const assessment = assessUncertaintyAndConfidence(context);

  assert.ok(assessment.uncertainties.length > 0);
  assert.ok(assessment.overallCertaintyScore < 0.85, "Ambiguous context cannot claim HIGH_CERTAINTY");
  assert.match(assessment.calculationBreakdown, /Grounding.*Clarity.*Completeness/);
});

// ============================================================================
// TEST 4: CONTRADICTORY INPUT DETECTION
// ============================================================================
test("Cognitive Phase 4: Detects direct policy, timeline, and testing contradictions", async () => {
  const { detectContradictions, assessUncertaintyAndConfidence } = await import("./lib/cognitive/uncertaintyEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // Contradiction A: Zero cost vs Paid Pinecone Cloud
  const ctxA = analyzeContext("We want a 100% free offline solution, but connect to paid cloud Pinecone.");
  const contraA = detectContradictions(ctxA);
  assert.ok(contraA.some((c) => c.includes("Architectural Contradiction")));

  // Contradiction B: Rewrite in 5 seconds
  const ctxB = analyzeContext("Rewrite the entire multi-phase architecture in 5 seconds.");
  const contraB = detectContradictions(ctxB);
  assert.ok(contraB.some((c) => c.includes("Feasibility Contradiction")));

  // Contradiction C: Skip tests while demanding zero bugs
  const ctxC = analyzeContext("Delete the unit tests and ensure zero bugs for production.");
  const contraC = detectContradictions(ctxC);
  assert.ok(contraC.some((c) => c.includes("Verification Contradiction")));

  // Contradictions heavily penalize certainty score
  const assessC = assessUncertaintyAndConfidence(ctxC);
  assert.ok(assessC.contradictionScore < 0.7);
});

// ============================================================================
// TEST 5: UNSUPPORTED FACTUAL CLAIMS DETECTION
// ============================================================================
test("Cognitive Phase 4: Self-Evaluation detects unsupported external internet/cloud claims", async () => {
  const { evaluateCandidateResponse } = await import("./lib/cognitive/selfEvaluationEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const context = analyzeContext("How does memory work?");
  const hallucinatedReply =
    "Your memory is connected to the internet and calling external OpenAPI server for real-time sync.";

  const evaluation = evaluateCandidateResponse(hallucinatedReply, context);

  assert.equal(evaluation.passed, false, "Must fail pre-delivery evaluation on hallucinated claims");
  assert.ok(evaluation.defects.some((d) => d.category === "UNSUPPORTED_CLAIM"));
  const defect = evaluation.defects.find((d) => d.category === "UNSUPPORTED_CLAIM");
  assert.equal(defect?.severity, "CRITICAL");
  assert.match(defect?.remediationAction || "", /ULTRON operates 100% locally and offline/i);
});

// ============================================================================
// TEST 6: INCORRECT ARITHMETIC CALCULATIONS DETECTION & REMEDIATION
// ============================================================================
test("Cognitive Phase 4: Self-Evaluation detects arithmetic errors and deterministically repairs them", async () => {
  const { evaluateCandidateResponse, remediateCandidateResponse } = await import("./lib/cognitive/selfEvaluationEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const context = analyzeContext("Calculate response latency overhead");
  const flawedReply = "The total pipeline budget calculation is 20 + 15 = 42 ms.";

  const evaluation = evaluateCandidateResponse(flawedReply, context);

  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.defects.some((d) => d.category === "LOGICAL_INCONSISTENCY"));
  assert.match(evaluation.defects[0].description, /Arithmetic inconsistency detected/);

  // Remediation
  const remediated = remediateCandidateResponse(flawedReply, evaluation, context);
  assert.equal(remediated.decision, "AUTOMATIC_CORRECTION_APPLIED");
  assert.ok(remediated.finalReply.includes("20 + 15 = 35 ms"), `Expected corrected arithmetic, got: ${remediated.finalReply}`);
});

// ============================================================================
// TEST 7: INCOMPLETE ANSWER DETECTION ACROSS MULTI-STEP SUB-GOALS
// ============================================================================
test("Cognitive Phase 4: Self-Evaluation detects omitted multi-step instructions", async () => {
  const { evaluateCandidateResponse } = await import("./lib/cognitive/selfEvaluationEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const multiStepQuery = "First, configure SQLite WAL mode. Then, explain how thread concurrency is serialized.";
  const context = analyzeContext(multiStepQuery);

  // Response that only answers the first part and completely omits thread concurrency
  const partialReply = "Here is how you set SQLite WAL mode: execute PRAGMA journal_mode=WAL.";

  const evaluation = evaluateCandidateResponse(partialReply, context);
  assert.equal(evaluation.passed, false, "Must flag incomplete multi-step responses");
  assert.ok(evaluation.defects.some((d) => d.category === "INCOMPLETENESS"));
});

// ============================================================================
// TEST 8: MANDATORY NEGATIVE CONSTRAINT BREACH DETECTION & REMEDIATION
// ============================================================================
test("Cognitive Phase 4: Self-Evaluation remediates negative constraint breaches", async () => {
  const { evaluateCandidateResponse, remediateCandidateResponse } = await import("./lib/cognitive/selfEvaluationEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const query = "We must not use paid APIs. How should we store vectors?";
  const context = analyzeContext(query);

  const violatingReply =
    "To store vectors efficiently, you should sign up for a paid api key and use Pinecone.";

  const evaluation = evaluateCandidateResponse(violatingReply, context);
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.defects.some((d) => d.category === "NEGATIVE_CONSTRAINT_BREACH"));

  // Automated remediation must replace paid cloud references
  const remediated = remediateCandidateResponse(violatingReply, evaluation, context);
  assert.equal(remediated.decision, "AUTOMATIC_CORRECTION_APPLIED");
  assert.ok(!remediated.finalReply.toLowerCase().includes("pinecone"));
  assert.ok(remediated.finalReply.toLowerCase().includes("local sqlite"));
});

// ============================================================================
// TEST 9: FALSE CERTAINTY PREVENTION & EPISTEMIC PHRASING
// ============================================================================
test("Cognitive Phase 4: Selects transparent epistemic phrasing matching evidence level", async () => {
  const { assessUncertaintyAndConfidence } = await import("./lib/cognitive/uncertaintyEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // 1. Verified local architecture query -> High Certainty
  const ctxKnown = analyzeContext("Who is the user and how is the memory vault encrypted?");
  const knownAssess = assessUncertaintyAndConfidence(ctxKnown, [
    "User identity is Ashish.",
    "Memory vault is secured via AES-256-GCM and DPAPI.",
  ]);
  assert.equal(knownAssess.epistemicPhrasing, "I know this.");
  assert.equal(knownAssess.calibrationCategory, "HIGH_CERTAINTY");

  // 2. Vague query -> Missing information / needs clarification
  const ctxVague = analyzeContext("What should we decide?");
  const vagueAssess = assessUncertaintyAndConfidence(ctxVague);
  assert.equal(vagueAssess.epistemicPhrasing, "I need clarification before recommending a solution.");

  // 3. Assumption-heavy query -> Depends on assumption
  const ctxAssump = analyzeContext("Assuming we refactor the audio pipeline, what is the estimated latency?");
  const assumpAssess = assessUncertaintyAndConfidence(ctxAssump, [
    "Estimated latency is ~50ms.",
    "Assuming the Python child process is already warm.",
  ]);
  assert.equal(assumpAssess.epistemicPhrasing, "This depends on an assumption.");
});

// ============================================================================
// TEST 10: INFINITE LOOP PREVENTION IN REMEDIATION WORKFLOW
// ============================================================================
test("Cognitive Phase 4: Self-Evaluation halts and disclaims uncorrectable responses without infinite loops", async () => {
  const { remediateCandidateResponse } = await import("./lib/cognitive/selfEvaluationEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const context = analyzeContext("Test loop guard");
  const unfixableReply = "Critical defect that resists automated regex fixes";

  const artificialEvaluation = {
    passed: false,
    scoreCard: {
      instructionCompliance: 0,
      contextRelevance: 0,
      factualGrounding: 0,
      logicalConsistency: 0,
      completeness: 0,
      safetyAndConstraints: 0,
      overallScore: 0,
    },
    defects: [
      {
        category: "NEGATIVE_CONSTRAINT_BREACH",
        severity: "CRITICAL",
        description: "Unresolvable invariant contradiction",
        remediationAction: "Manual founder intervention required",
      },
    ],
    correctionDecision: "CANNOT_SAFELY_CORRECT",
    originalReply: unfixableReply,
    iterationCount: 1,
  };

  // Run with iteration 3 to trigger loop guard
  const result = remediateCandidateResponse(unfixableReply, artificialEvaluation, context, 3);

  assert.equal(result.decision, "CANNOT_SAFELY_CORRECT");
  assert.match(result.correctionSummary, /Loop limit reached/);
  assert.match(result.finalReply, /Self-Evaluation Limitation Warning/);
});

// ============================================================================
// TEST 11: SIMPLE QUERY FAST-PATH LATENCY BENCHMARK
// ============================================================================
test("Cognitive Phase 4: Simple conversations stay on TIER_1_FAST with < 25ms overhead", async () => {
  const { orchestrateCognitivePipeline } = await import("./lib/cognitive/orchestrator.ts");

  await orchestrateCognitivePipeline("ping"); // JIT warmup
  const start = performance.now();
  const result = await orchestrateCognitivePipeline("Hello Ultron, good morning!");
  const duration = performance.now() - start;

  assert.equal(result.tier, "TIER_1_FAST");
  assert.equal(result.reasoning, undefined, "Fast path must not invoke heavy reasoning decomposition");
  assert.equal(result.planning, undefined, "Fast path must not invoke heavy planning DAG");
  assert.ok(duration < 25, `Fast path expected < 25ms, got ${duration.toFixed(2)}ms`);
});

// ============================================================================
// TEST 12: ORCHESTRATOR PIPELINE INTEGRATION
// ============================================================================
test("Cognitive Phase 4: Orchestrator integrates Uncertainty Engine into system prompt", async () => {
  const { orchestrateCognitivePipeline } = await import("./lib/cognitive/orchestrator.ts");

  const query = "Analyze the trade-offs of switching from SQLite to Pinecone with zero paid API constraints.";
  const result = await orchestrateCognitivePipeline(query);

  assert.equal(result.tier, "TIER_2_ANALYTICAL");
  assert.ok(result.uncertainty, "Pipeline must return UncertaintyAssessmentResult");
  assert.ok(result.uncertainty.overallCertaintyScore >= 0 && result.uncertainty.overallCertaintyScore <= 1);
  assert.ok(result.uncertainty.epistemicPhrasing.length > 0);

  // System prompt must contain epistemic directives
  const prompt = result.cognitiveSystemPrompt;
  assert.match(prompt, /EPISTEMIC & UNCERTAINTY DIRECTIVES/);
  assert.match(prompt, /Epistemic Stance/);
});

// ============================================================================
// REMEDIATION TEST 13: ALL-DISQUALIFIED CANDIDATES EPISTEMIC STATUS
// ============================================================================
test("Cognitive Phase 4 Remediation: Decision Engine returns DISQUALIFIED_BY_CONSTRAINTS when all candidates violate invariants", async () => {
  const { performDecisionAnalysis } = await import("./lib/cognitive/decisionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // Scenario A: All candidates violate offline / zero-cost non-negotiable constraints
  const allDisqualifiedCtx = analyzeContext(
    "Choose between Pinecone Cloud Vector DB vs AWS Managed Aurora for storing our local vectors with zero cloud dependencies."
  );
  const resultAllDisqualified = performDecisionAnalysis(allDisqualifiedCtx);

  assert.equal(resultAllDisqualified.epistemicStatus, "DISQUALIFIED_BY_CONSTRAINTS");
  assert.equal(resultAllDisqualified.recommendedOption, undefined, "Must never recommend a disqualified option");
  assert.ok(resultAllDisqualified.candidates.length >= 2);
  assert.ok(resultAllDisqualified.candidates.every((c) => !c.alignmentWithConstraints));
  assert.ok(resultAllDisqualified.rejectedAlternatives.length === resultAllDisqualified.candidates.length);
  assert.match(resultAllDisqualified.rationaleSummary, /disqualified because they violate non-negotiable project constraints/i);

  // Scenario B: Partially feasible (one candidate satisfies constraints, one violates)
  const partiallyFeasibleCtx = analyzeContext(
    "Should we use SQLite WAL mode or Pinecone Cloud DB for vectors under zero-cost local constraints?"
  );
  const resultPartiallyFeasible = performDecisionAnalysis(partiallyFeasibleCtx);
  assert.notEqual(resultPartiallyFeasible.epistemicStatus, "DISQUALIFIED_BY_CONSTRAINTS");
  assert.ok(resultPartiallyFeasible.recommendedOption !== undefined);
  assert.match(resultPartiallyFeasible.recommendedOption.name, /sqlite/i);

  // Scenario C: Fully feasible (both candidates satisfy constraints)
  const fullyFeasibleCtx = analyzeContext(
    "Compare in-memory caching vs SQLite WAL transactions for session state."
  );
  const resultFullyFeasible = performDecisionAnalysis(fullyFeasibleCtx);
  assert.equal(resultFullyFeasible.epistemicStatus, "EVIDENCE_BACKED");
  assert.ok(resultFullyFeasible.recommendedOption !== undefined);
});

// ============================================================================
// REMEDIATION TEST 14: PERSONAL GOAL PLANNING DOMAIN DECOMPOSITION
// ============================================================================
test("Cognitive Phase 4 Remediation: Planning Engine decomposes personal goals without software artifacts", async () => {
  const { performPlanningAnalysis } = await import("./lib/cognitive/planningEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const personalScenarios = [
    {
      domain: "Marathon Training",
      query: "Create a 16-week marathon training plan for a sub-4 hour finish.",
      expectedKeywordInTask: /mileage|aerobic|running/i,
      expectedMilestone: /Aerobic Base|Volume Milestones|Target Race/i,
    },
    {
      domain: "Fitness Improvement",
      query: "Plan a progressive 12-week bodyweight workout and fitness program for strength.",
      expectedKeywordInTask: /fitness|aerobic|conditioning|workout/i,
      expectedMilestone: /Aerobic Base|Capacity Target|Goal Performance/i,
    },
    {
      domain: "Language Learning",
      query: "Develop a 6-month study path to learn Spanish conversational fluency.",
      expectedKeywordInTask: /vocabulary|immersion|language/i,
      expectedMilestone: /Language Diagnostic|Vocabulary & Grammar|Conversational Fluency/i,
    },
    {
      domain: "Habit Development",
      query: "Create a habit development routine to establish a daily meditation habit.",
      expectedKeywordInTask: /habit|trigger|routine/i,
      expectedMilestone: /Habit Triggers|Habit Consistency Streak|Automaticity/i,
    },
    {
      domain: "General Study Goals",
      query: "Design a comprehensive study plan for my final computer science algorithms exam.",
      expectedKeywordInTask: /syllabus|active recall|mock exam|study/i,
      expectedMilestone: /Syllabus Diagnostic|Active Recall|Mock Exam/i,
    },
  ];

  const forbiddenSoftwareArtifacts = [
    /\btypescript\b/i,
    /\beslint\b/i,
    /\beventbus\b/i,
    /\bsqlite\b/i,
    /\bpragma\b/i,
    /\bdpapi\b/i,
    /\bpython voice\b/i,
    /\bapi routes?\b/i,
    /\bunit tests?\b/i,
  ];

  for (const scenario of personalScenarios) {
    const ctx = analyzeContext(scenario.query);
    const plan = performPlanningAnalysis(ctx);

    assert.ok(plan.tasks.length >= 3, `Expected structured tasks for ${scenario.domain}`);
    assert.ok(plan.milestones.length >= 3, `Expected structured milestones for ${scenario.domain}`);

    // Verify domain relevance
    const taskTitles = plan.tasks.map((t) => t.title).join(" ");
    assert.match(taskTitles, scenario.expectedKeywordInTask, `Tasks must match ${scenario.domain} domain`);

    const milestoneTitles = plan.milestones.map((m) => m.title).join(" ");
    assert.match(milestoneTitles, scenario.expectedMilestone, `Milestones must match ${scenario.domain} domain`);

    // Verify absolute absence of software tasks/artifacts in personal plan
    for (const task of plan.tasks) {
      for (const pattern of forbiddenSoftwareArtifacts) {
        assert.ok(
          !pattern.test(task.title) && !pattern.test(task.description),
          `Task "${task.title}" in ${scenario.domain} must not contain software artifact matching ${pattern}`
        );
      }
    }

    // Verify risks and alternative plan do not mention EventBus or SQLite or code rollback
    const risksText = plan.risks.map((r) => `${r.risk} ${r.contingencyStrategy}`).join(" ");
    assert.ok(!risksText.includes("SQLite WAL"), `Risks in ${scenario.domain} must not mention SQLite`);
    assert.ok(!risksText.includes("EventBus"), `Risks in ${scenario.domain} must not mention EventBus`);
    assert.ok(!plan.alternativeFallbackPlan.includes("tsc --noEmit"), `Alternative plan in ${scenario.domain} must not mention tsc`);
  }

  // Verify software and business planning remains intact
  const softwareCtx = analyzeContext("Refactor SQLite database with WAL concurrency.");
  const softwarePlan = performPlanningAnalysis(softwareCtx);
  assert.ok(softwarePlan.tasks.some((t) => /sqlite|database/i.test(t.title)));

  const businessCtx = analyzeContext("Create a plan to open a retail coffee shop in downtown.");
  const businessPlan = performPlanningAnalysis(businessCtx);
  assert.ok(businessPlan.tasks.some((t) => /commercial|lease|market feasibility/i.test(t.title)));
});

// ============================================================================
// REMEDIATION TEST 15: UNSUPPORTED NON-NUMERIC CLAIM CLASSIFICATION
// ============================================================================
test("Cognitive Phase 4 Remediation: Uncertainty Engine classifies unsupported non-numeric claims as UNVERIFIED_ASSUMPTION", async () => {
  const { classifyEpistemicClaims } = await import("./lib/cognitive/uncertaintyEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const claims = [
    // 1. Verified repository fact
    "Database operations execute on local SQLite with WAL mode.",
    // 2. Supported quantitative estimate
    "Estimated latency will be approximately 45ms per analytical turn.",
    // 3. Unsupported non-numeric claim (Must NOT default to ESTIMATE!)
    "ULTRON has 500k active daily users across multiple enterprise sectors.",
    // 4. Another unsupported non-numeric claim
    "The user strictly prefers dark mode and minimalist desktop aesthetics.",
    // 5. Stated assumption
    "Assuming the background process is running without thread contention.",
  ];

  // Context without ambiguity (ambiguityScore = 0.0)
  const lowAmbiguityCtx = analyzeContext("Status report");
  const classified = classifyEpistemicClaims(claims, lowAmbiguityCtx);

  // Claim 1: Verified fact
  assert.equal(classified[0].classification, "MEASURED_FACT");

  // Claim 2: Quantitative estimate
  assert.equal(classified[1].classification, "ESTIMATE");

  // Claim 3: Unsupported non-numeric claim -> MUST be UNVERIFIED_ASSUMPTION
  assert.equal(
    classified[2].classification,
    "UNVERIFIED_ASSUMPTION",
    `Unsupported claim "${claims[2]}" must be UNVERIFIED_ASSUMPTION, but got ${classified[2].classification}`
  );
  assert.match(classified[2].sourceOrEvidence || "", /Unsupported assertion lacking verified repository grounding/);

  // Claim 4: Unsupported non-numeric claim -> MUST be UNVERIFIED_ASSUMPTION
  assert.equal(
    classified[3].classification,
    "UNVERIFIED_ASSUMPTION",
    `Unsupported claim "${claims[3]}" must be UNVERIFIED_ASSUMPTION, but got ${classified[3].classification}`
  );

  // Claim 5: Stated assumption
  assert.equal(classified[4].classification, "UNVERIFIED_ASSUMPTION");
});
