/**
 * @file tests_cognitive_phase2.test.mjs
 * @description Test Suite for ULTRON Cognitive Intelligence Engine — Phase 2:
 * Advanced Reasoning, Critical Thinking & Problem Solving.
 *
 * Verifies:
 * 1. Advanced Reasoning: Structured decomposition, causal graphs, competing hypotheses & topological sorting.
 * 2. Critical Thinking: Unstated assumption detection, logical fallacy analysis (false dichotomy, causal leap, sunk cost),
 *    Devil's Advocate worst-case failure modes, and evidence-based disagreement.
 * 3. Problem-Solving: Symptom vs root cause distinction, structured 5-Why chains, multi-criteria solution ranking
 *    (Complexity, Impact, Reversibility), and measurable validation benchmarks.
 * 4. Orchestration: Seamless integration with Cognitive Orchestrator and dynamic prompt enrichment.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ============================================================================
// TEST 1: ADVANCED REASONING ENGINE
// ============================================================================
test("Cognitive Phase 2: Advanced Reasoning decomposes problems and computes dependency graph", async () => {
  const { performAdvancedReasoning } = await import("./lib/cognitive/reasoningEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const query = "Analyze our SQLite concurrency architecture and determine why multi-worker writes fail under load.";
  const context = analyzeContext(query);
  const reasoning = performAdvancedReasoning(context);

  // 1. Structured Sub-Problem Decomposition
  assert.ok(reasoning.decomposedSubProblems.length >= 3, "Must decompose into at least 3 sub-problems");
  const foundations = reasoning.decomposedSubProblems.find((p) => p.id === "sub_1_foundations");
  assert.ok(foundations, "Must contain foundational invariant sub-problem");
  assert.ok(Array.isArray(foundations.invariants), "Must identify invariants");

  // 2. Dependency Graph & Topological Sorting
  assert.ok(reasoning.topologicalOrder.length >= 3, "Must derive topological sequence");
  assert.equal(reasoning.topologicalOrder[0], "sub_1_foundations", "Foundations must be first in topological order");

  // 3. Cause-and-Effect Analysis
  assert.ok(reasoning.causalChain.length >= 2, "Must identify direct and indirect causal drivers");
  const lockDriver = reasoning.causalChain.find((c) => c.cause.toLowerCase().includes("sqlite") || c.cause.toLowerCase().includes("write"));
  assert.ok(lockDriver, "Must trace database lock contention cause");
  assert.ok(lockDriver.directEffect.length > 10, "Must specify direct effect");
  assert.ok(lockDriver.indirectEffects.length > 0, "Must specify indirect cascading effects");

  // 4. Competing Hypotheses
  assert.ok(reasoning.competingHypotheses.length >= 2, "Must formulate at least 2 competing hypotheses");
  const h1 = reasoning.competingHypotheses[0];
  assert.ok(h1.statement, "Hypothesis must contain statement");
  assert.ok(h1.supportingFactors.length > 0, "Hypothesis must list supporting factors");
  assert.ok(h1.contradictingFactors.length > 0, "Hypothesis must list contradicting factors");
});

// ============================================================================
// TEST 2: CRITICAL THINKING & DEVIL'S ADVOCATE ENGINE
// ============================================================================
test("Cognitive Phase 2: Critical Thinking challenges unstated assumptions and flags logical fallacies", async () => {
  const { performCriticalThinking } = await import("./lib/cognitive/criticalThinkingEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // Adversarial query with False Dichotomy and Novelty Appeal
  const flawedQuery = "We must either rewrite the entire backend in Rust or our architecture is completely broken. Everyone is using Rust because modern tech is superior.";
  const context = analyzeContext(flawedQuery);
  const critique = performCriticalThinking(context);

  // 1. Unstated Assumption Identification
  assert.ok(critique.assumptions.length > 0, "Must identify unstated premises");
  const noveltyAssumption = critique.assumptions.find((a) => !a.isStated && a.riskImpact === "CRITICAL");
  assert.ok(noveltyAssumption, "Must flag critical unstated assumption about rewrites");
  assert.equal(noveltyAssumption.validity, "QUESTIONABLE");

  // 2. Logical Fallacy Analysis (Non-keyword semantic structure)
  assert.ok(critique.weaknesses.length >= 2, "Must catch both False Dichotomy and Appeal to Novelty");
  const hasFalseDichotomy = critique.weaknesses.some((w) => w.fallacy === "FALSE_DICHOTOMY");
  const hasAppealToNovelty = critique.weaknesses.some((w) => w.fallacy === "APPEAL_TO_NOVELTY");
  assert.equal(hasFalseDichotomy, true, "Must flag false binary framing");
  assert.equal(hasAppealToNovelty, true, "Must flag appeal to technological novelty");

  // 3. Stance & Evidence-Based Disagreement
  assert.equal(critique.stance, "DISAGREES_WITH_EVIDENCE", "Must respectfully disagree when critical risk assumptions are present");
  assert.match(critique.executiveCritique, /respectfully push back/i, "Executive critique must explain disagreement");

  // 4. Devil's Advocate Failure Modes
  assert.ok(critique.devilsAdvocateScenarios.length >= 2, "Must outline operational and resource failure modes");
  assert.match(critique.devilsAdvocateScenarios[0], /Worst-Case Scenario/i);
});

// ============================================================================
// TEST 3: PROBLEM-SOLVING & 5-WHY ENGINE
// ============================================================================
test("Cognitive Phase 2: Problem-Solving separates symptoms, executes 5-Why, and ranks solutions", async () => {
  const { performProblemSolving } = await import("./lib/cognitive/problemSolvingEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const bugQuery = "Our SQLite memory store keeps throwing SQLITE_BUSY error when multiple background tasks write.";
  const context = analyzeContext(bugQuery);
  const problemResult = performProblemSolving(context);

  // 1. Symptom vs Root Cause
  assert.ok(problemResult.symptoms.length > 0, "Must capture observable symptoms");
  assert.match(problemResult.symptoms[0], /SQLITE_BUSY/i);
  assert.ok(problemResult.rootCause.length > 15, "Must formulate specific root cause");

  // 2. Structured 5-Why Chain
  assert.equal(problemResult.fiveWhyChain.length, 5, "Must execute exactly 5 levels of causal inquiry");
  for (let i = 0; i < 5; i++) {
    const step = problemResult.fiveWhyChain[i];
    assert.equal(step.level, i + 1, `Level must match ${i + 1}`);
    assert.ok(step.question.startsWith("Why"), "Question must begin with Why");
    assert.ok(step.answer.length > 10, "Answer must be specific");
    assert.ok(step.evidence.length > 10, "Evidence must be documented");
  }

  // Level 1: Surface symptom; Level 5: Systemic architecture
  assert.match(problemResult.fiveWhyChain[0].evidence, /rollback journal/i);
  assert.match(problemResult.fiveWhyChain[4].answer, /concurrency policy|initialization/i);

  // 3. Multi-Criteria Solution Ranking (Complexity vs Impact vs Reversibility)
  assert.ok(problemResult.candidateSolutions.length >= 3, "Must offer at least 3 distinct solution candidates");
  for (const sol of problemResult.candidateSolutions) {
    assert.ok(sol.complexity >= 1 && sol.complexity <= 5, "Complexity must be 1-5");
    assert.ok(sol.impact >= 1 && sol.impact <= 5, "Impact must be 1-5");
    assert.ok(["EASILY_REVERSIBLE", "MODERATE_EFFORT_TO_REVERT", "IRREVERSIBLE"].includes(sol.reversibility));
  }

  // Recommended Solution selection
  const rec = problemResult.recommendedSolution;
  assert.ok(rec, "Must designate recommended solution");
  assert.equal(rec.reversibility, "EASILY_REVERSIBLE", "Recommended solution should prefer high reversibility");
  assert.equal(rec.impact, 5, "Recommended solution should have maximum impact");
  assert.match(rec.name, /WAL/i, "Optimal fix for SQLite busy is WAL mode");

  // 4. Measurable Validation Benchmarks
  assert.ok(problemResult.validationCriteria.length >= 2, "Must define at least 2 measurable benchmarks");
  const metric = problemResult.validationCriteria[0];
  assert.ok(metric.metricName, "Metric must have name");
  assert.ok(metric.baselineValue, "Metric must have baseline value");
  assert.ok(metric.targetValue, "Metric must have target target value");
  assert.ok(metric.verificationMethod, "Metric must have verification method");

  // 5. Recovery Contingency
  assert.ok(problemResult.recoveryContingency.length > 20, "Must provide contingency recovery plan");
});

// ============================================================================
// TEST 4: ORCHESTRATOR PHASE 2 INTEGRATION
// ============================================================================
test("Cognitive Phase 2: Cognitive Orchestrator integrates reasoning, critique, and problem solving into pipeline", async () => {
  const { orchestrateCognitivePipeline } = await import("./lib/cognitive/orchestrator.ts");

  const statusPhases = [];
  const pipelineResult = await orchestrateCognitivePipeline(
    "We keep getting disk I/O busy errors in SQLite. Should we migrate the entire database to Postgres or rewrite in Rust?",
    [],
    {
      onStatus: (st) => statusPhases.push(st.phase),
    }
  );

  assert.equal(pipelineResult.tier, "TIER_2_ANALYTICAL", "Complex problem query must trigger analytical tier");
  assert.ok(statusPhases.includes("context_understanding"), "Must emit context understanding phase");
  assert.ok(statusPhases.includes("reasoning"), "Must emit reasoning phase");
  assert.ok(statusPhases.includes("critical_review"), "Must emit critical review phase");
  assert.ok(statusPhases.includes("problem_solving"), "Must emit problem solving phase");

  // Verify Phase 2 components are present in output
  assert.ok(pipelineResult.reasoning, "Orchestrator must return reasoning analysis");
  assert.ok(pipelineResult.criticalThinking, "Orchestrator must return critical thinking critique");
  assert.ok(pipelineResult.problemSolving, "Orchestrator must return problem solving 5-Why analysis");

  // Verify prompt injection contains co-founder intelligence
  const prompt = pipelineResult.cognitiveSystemPrompt;
  assert.match(prompt, /ONE HUMAN FOUNDER · ONE AI BRAIN/);
  assert.match(prompt, /CRITICAL THINKING AUDIT/);
  assert.match(prompt, /SYSTEMATIC PROBLEM-SOLVING/);
  assert.match(prompt, /CAUSAL FACTORS IDENTIFIED/);
});

// ============================================================================
// TEST 5: REMEDIATION & CRITICAL THINKING SECURITY BOUNDARIES
// ============================================================================
test("Cognitive Phase 2 Remediation: Critical Thinking blocks test deletion and security bypasses", async () => {
  const { performCriticalThinking } = await import("./lib/cognitive/criticalThinkingEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // 1. Proposal to delete all unit tests
  const testDeletionQuery = "We should delete all existing unit tests and test suites because they slow down our release cycle.";
  const critique1 = performCriticalThinking(analyzeContext(testDeletionQuery));
  assert.equal(critique1.stance, "DISAGREES_WITH_EVIDENCE", "Must disagree with proposal to delete unit tests");
  assert.ok(critique1.assumptions.some((a) => a.assumption.includes("tests") && a.riskImpact === "CRITICAL"));
  assert.ok(critique1.weaknesses.some((w) => w.fallacy === "OPTIMISM_BIAS"));
  assert.match(critique1.executiveCritique, /strongly push back|system integrity/i);

  // 2. Proposal to disable security gateways
  const disableSecurityQuery = "Let's remove security checks and disable the permission gateway to speed up execution.";
  const critique2 = performCriticalThinking(analyzeContext(disableSecurityQuery));
  assert.equal(critique2.stance, "DISAGREES_WITH_EVIDENCE", "Must disagree with disabling permission gateway");
  assert.ok(critique2.assumptions.some((a) => a.assumption.includes("permission gateway") && a.riskImpact === "CRITICAL"));

  // 3. Proposal to bypass permission verification / confirmation tokens
  const bypassTokenQuery = "Can we bypass confirmation tokens and approval prompts so desktop tasks run autonomously?";
  const critique3 = performCriticalThinking(analyzeContext(bypassTokenQuery));
  assert.equal(critique3.stance, "DISAGREES_WITH_EVIDENCE", "Must disagree with bypassing confirmation tokens");
  assert.ok(critique3.assumptions.some((a) => a.assumption.includes("confirmation token") && a.riskImpact === "CRITICAL"));

  // 4. Proposal to introduce paid cloud services
  const paidCloudQuery = "Should we migrate our local SQLite memory to a paid cloud hosted Pinecone vector database?";
  const critique4 = performCriticalThinking(analyzeContext(paidCloudQuery));
  assert.equal(critique4.stance, "DISAGREES_WITH_EVIDENCE", "Must disagree with violating zero-paid-API constraint");
  assert.ok(critique4.assumptions.some((a) => a.assumption.includes("paid cloud") && a.riskImpact === "CRITICAL"));

  // 5. Post-hoc causal fallacy
  const postHocQuery = "Because of the last Windows update, our app crashes on startup. Since Windows updated yesterday, the OS broke our executable.";
  const critique5 = performCriticalThinking(analyzeContext(postHocQuery));
  assert.ok(critique5.weaknesses.some((w) => w.fallacy === "CAUSAL_LEAP"), "Must flag post-hoc causal leap");
  assert.match(critique5.weaknesses[0].explanation, /Post Hoc Ergo Propter Hoc/i);

  // 6. False-positive check: Valid sound request must NOT trigger disagreement
  const soundQuery = "How can we configure SQLite in WAL mode with connection serialization to improve write throughput?";
  const critiqueSound = performCriticalThinking(analyzeContext(soundQuery));
  assert.equal(critiqueSound.stance, "AGREES_WITH_PREMISE", "Valid sound request must agree without false pushback");
  assert.equal(critiqueSound.weaknesses.length, 0, "Valid sound request must have zero logical weaknesses");
});

// ============================================================================
// TEST 6: REMEDIATION & DYNAMIC REASONING / UNCERTAINTY HANDLING
// ============================================================================
test("Cognitive Phase 2 Remediation: Dynamic multi-cause extraction and uncertainty handling", async () => {
  const { performAdvancedReasoning } = await import("./lib/cognitive/reasoningEngine.ts");
  const { performProblemSolving } = await import("./lib/cognitive/problemSolvingEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // 1. Three competing causes supplied in one query
  const multiCauseQuery =
    "The UI occasionally freezes for 2-3 seconds during streaming. It could be React state re-rendering too frequently, the EventBus blocking on IPC, or the local Ollama model starving CPU cores.";
  const reasoning = performAdvancedReasoning(analyzeContext(multiCauseQuery));

  assert.equal(reasoning.competingHypotheses.length, 3, "Must extract exactly 3 competing hypotheses from user clauses");
  assert.match(reasoning.competingHypotheses[0].statement, /React state re-rendering/i);
  assert.match(reasoning.competingHypotheses[1].statement, /EventBus blocking on IPC/i);
  assert.match(reasoning.competingHypotheses[2].statement, /Ollama model starving CPU cores/i);

  // 2. Unknown technical domain with insufficient evidence (Uncertainty Handling)
  const ambiguousQuery = "Fix the latency issue in the system.";
  const problemSolving = performProblemSolving(analyzeContext(ambiguousQuery));

  assert.ok(problemSolving.fiveWhyChain.length <= 2, "Must not fabricate a 5-step deep chain without causal evidence");
  assert.match(problemSolving.fiveWhyChain[0].answer, /UNCERTAIN: Insufficient diagnostic telemetry/i);
  assert.match(problemSolving.validationCriteria[0].metricName, /Diagnostic Telemetry/i);
  assert.match(problemSolving.candidateSolutions[0].name, /Diagnostic Profiling/i);

  // 3. Dynamic causal driver extraction with 'because'
  const startupTimeoutQuery =
    "Our Next.js API route times out when Electron desktop starts, because the Python voice engine takes 8 seconds to initialize and locks the shared port.";
  const startupProblem = performProblemSolving(analyzeContext(startupTimeoutQuery));

  assert.ok(startupProblem.fiveWhyChain.length === 5, "Supported causal chain must produce 5 steps");
  assert.match(startupProblem.fiveWhyChain[1].answer, /Python voice engine takes 8 seconds/i);
  assert.match(startupProblem.rootCause, /readiness coordination/i);
});

