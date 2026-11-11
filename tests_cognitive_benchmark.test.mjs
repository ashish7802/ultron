/**
 * @file tests_cognitive_benchmark.test.mjs
 * @description Comprehensive Reasoning Benchmark Suite for the ULTRON Cognitive Intelligence Engine.
 *
 * Implements Phase 6 Benchmark Verification across 8 Cognitive Categories:
 * Category A: Mathematical Reasoning (Basic, multi-step, constraint numerical, flawed assumption)
 * Category B: Multi-Step Problem Solving (Root cause, 5-Why, alternatives, dependency steps)
 * Category C: Logical Deduction (Contradiction detection, deductive inference, circularity)
 * Category D: Critical Thinking (Premise audit, fallacy identification, Devil's Advocate)
 * Category E: Decision Intelligence (MCDA 7-factor, weights, disqualifications, all-disqualified)
 * Category F: Planning Intelligence (DAG sequencing, milestone pacing, contradictory deadlines)
 * Category G: Uncertainty & Hallucination Detection (Epistemic classification, missing info)
 * Category H: Self-Evaluation Engine (Invariant audit, arithmetic repair, negative constraint guard)
 *
 * Each benchmark case defines:
 * 1. Test ID
 * 2. Category
 * 3. Input
 * 4. Expected Behavior
 * 5. Pass/Fail Criteria
 * 6. Severity (CRITICAL | HIGH | MEDIUM)
 * 7. Actual Result & Evaluation Notes
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyzeContext } from "./lib/cognitive/contextEngine.ts";
import { performAdvancedReasoning } from "./lib/cognitive/reasoningEngine.ts";
import { performCriticalThinking } from "./lib/cognitive/criticalThinkingEngine.ts";
import { performProblemSolving } from "./lib/cognitive/problemSolvingEngine.ts";
import { performDecisionAnalysis } from "./lib/cognitive/decisionEngine.ts";
import { performPlanningAnalysis } from "./lib/cognitive/planningEngine.ts";
import { assessUncertaintyAndConfidence } from "./lib/cognitive/uncertaintyEngine.ts";
import { evaluateCandidateResponse, remediateCandidateResponse } from "./lib/cognitive/selfEvaluationEngine.ts";
import { determineTaskCategory } from "./lib/cognitive/multiModelEngine.ts";

console.log("=== EXECUTING ULTRON COGNITIVE BENCHMARK SUITE ===");

// ============================================================================
// BENCHMARK CATEGORY A: MATHEMATICAL REASONING
// ============================================================================

test("BM-MATH-01: Multi-Step Arithmetic & Boundary Calculation", () => {
  const query = "Calculate 25 * 40 / 2";
  const ctx = analyzeContext(query);
  const taskCat = determineTaskCategory(ctx);

  assert.equal(taskCat, "MATHEMATICAL_REASONING");

  // Arithmetic defect detection and automatic correction
  const flawedReply = "The total calculation is 20 + 15 = 42 ms.";
  const audit = evaluateCandidateResponse(flawedReply, ctx);
  assert.equal(audit.passed, false);
  assert.ok(audit.defects.some((d) => d.category === "LOGICAL_INCONSISTENCY"));

  const remediated = remediateCandidateResponse(flawedReply, audit, ctx);
  assert.equal(remediated.decision, "AUTOMATIC_CORRECTION_APPLIED");
  assert.ok(remediated.finalReply.includes("20 + 15 = 35 ms"));
});

test("BM-MATH-02: Detection of Incorrect Mathematical Assumptions", () => {
  const query = "We should delete all unit tests assuming velocity increases and zero defects occur";
  const ctx = analyzeContext(query);
  const crit = performCriticalThinking(ctx);

  assert.ok(crit.assumptions.length > 0);
  assert.ok(
    crit.assumptions.some((a) => a.validity === "UNSUPPORTED" || a.riskImpact === "CRITICAL")
  );
});

// ============================================================================
// BENCHMARK CATEGORY B: MULTI-STEP PROBLEM SOLVING
// ============================================================================

test("BM-PROB-01: 5-Why Root Cause Extraction & Verification Criteria", () => {
  const query = "Our SQLite memory store keeps throwing SQLITE_BUSY error when multiple background tasks write.";
  const ctx = analyzeContext(query);
  const prob = performProblemSolving(ctx);

  assert.ok(prob.rootCause.length > 10);
  assert.equal(prob.fiveWhyChain.length, 5);
  assert.ok(prob.recommendedSolution.name.length > 0);
  assert.ok(prob.validationCriteria.length > 0);
  assert.ok(prob.recoveryContingency.length > 0);
});

test("BM-PROB-02: Alternative Solution Generation with Trade-Offs", () => {
  const query = "Our SQLite memory store keeps throwing SQLITE_BUSY error when multiple background tasks write.";
  const ctx = analyzeContext(query);
  const prob = performProblemSolving(ctx);

  assert.ok(prob.candidateSolutions.length >= 3);
  for (const sol of prob.candidateSolutions) {
    assert.ok(sol.tradeOffs.length > 0);
    assert.ok(sol.complexity >= 1 && sol.complexity <= 5);
    assert.ok(sol.impact >= 1 && sol.impact <= 5);
  }
});

// ============================================================================
// BENCHMARK CATEGORY C: LOGICAL DEDUCTION
// ============================================================================

test("BM-LOGIC-01: Detection of Inherent Constraint Contradictions", () => {
  const query = "We want a 100% free offline solution, but connect to paid cloud Pinecone.";
  const ctx = analyzeContext(query);
  const unc = assessUncertaintyAndConfidence(ctx);

  assert.ok(unc.contradictionScore < 0.80);
  assert.ok(unc.uncertainties.some((u) => u.description.includes("Contradiction")));
});

test("BM-LOGIC-02: Deductive Causal Reasoning Graph", () => {
  const query = "Analyze our SQLite concurrency architecture and determine why multi-worker writes fail under load.";
  const ctx = analyzeContext(query);
  const reasoning = performAdvancedReasoning(ctx);

  assert.ok(reasoning.causalChain.length >= 2);
  assert.ok(reasoning.decomposedSubProblems.length >= 3);
  assert.ok(reasoning.topologicalOrder.length >= 3);
});

// ============================================================================
// BENCHMARK CATEGORY D: CRITICAL THINKING
// ============================================================================

test("BM-CRIT-01: Assumption Audit & Devil's Advocate Scenarios", () => {
  const query = "We must either rewrite the entire backend in Rust or our architecture is completely broken. Everyone is using Rust because modern tech is superior.";
  const ctx = analyzeContext(query);
  const crit = performCriticalThinking(ctx);

  assert.notEqual(crit.stance, "AGREES_WITH_PREMISE");
  assert.ok(crit.assumptions.length > 0);
  assert.ok(crit.weaknesses.length > 0);
  assert.ok(crit.devilsAdvocateScenarios.length > 0);
});

test("BM-CRIT-02: Objective Evidence-versus-Opinion Separation", () => {
  const query = "Everyone knows SQLite is slow for desktop applications compared to MongoDB";
  const ctx = analyzeContext(query);
  const unc = assessUncertaintyAndConfidence(ctx);

  assert.ok(unc.claims.some((c) => c.classification === "UNVERIFIED_ASSUMPTION" || c.classification === "ESTIMATE"));
});

// ============================================================================
// BENCHMARK CATEGORY E: DECISION INTELLIGENCE
// ============================================================================

test("BM-DEC-01: Multi-Criteria Decision Analysis (MCDA) Scoring", () => {
  const query = "Should we choose SQLite WAL mode or In-Memory Caching for desktop persistence under zero cost constraints?";
  const ctx = analyzeContext(query);
  const dec = performDecisionAnalysis(ctx);

  assert.ok(dec.candidates.length >= 2);
  assert.ok(dec.recommendedOption !== undefined);
  assert.ok(dec.recommendedOption.weightedScore > 0);
  assert.ok(dec.recommendedOption.alignmentWithConstraints);
});

test("BM-DEC-02: Strict Disqualification of Boundary-Breaching Candidates", () => {
  const query = "Should we choose Pinecone Cloud Vector DB or AWS OpenSearch under zero recurring cost constraints?";
  const ctx = analyzeContext(query);
  const dec = performDecisionAnalysis(ctx);

  assert.equal(dec.epistemicStatus, "DISQUALIFIED_BY_CONSTRAINTS");
  assert.equal(dec.recommendedOption, undefined);
  assert.ok(dec.candidates.every((c) => !c.alignmentWithConstraints));
});

// ============================================================================
// BENCHMARK CATEGORY F: PLANNING INTELLIGENCE
// ============================================================================

test("BM-PLAN-01: Task Decomposition & Dependency DAG Ordering", () => {
  const query = "Plan the implementation of a secure AES-256 encrypted database migration";
  const ctx = analyzeContext(query);
  const plan = performPlanningAnalysis(ctx);

  assert.ok(plan.tasks.length >= 3);
  assert.ok(plan.executionSequence.length >= 3);
  assert.ok(plan.milestones.length >= 2);
});

test("BM-PLAN-02: Personal Goal Planning without Software Artifact Contamination", () => {
  const query = "Plan a 16-week marathon training roadmap for a beginner runner";
  const ctx = analyzeContext(query);
  const plan = performPlanningAnalysis(ctx);

  assert.ok(plan.tasks.some((t) => t.title.toLowerCase().includes("run") || t.title.toLowerCase().includes("base") || t.title.toLowerCase().includes("mileage")));
  assert.ok(!plan.tasks.some((t) => t.title.includes("TypeScript") || t.title.includes("ESLint") || t.title.includes("npm")));
});

// ============================================================================
// BENCHMARK CATEGORY G: UNCERTAINTY & HALLUCINATION DETECTION
// ============================================================================

test("BM-UNC-01: Epistemic Stance Calibration & Missing Parameter Halting", () => {
  const query = "Can you optimize it?";
  const ctx = analyzeContext(query);
  const unc = assessUncertaintyAndConfidence(ctx);

  assert.equal(unc.requiresClarification, true);
  assert.ok(unc.missingInformation.length > 0);
  assert.equal(unc.epistemicPhrasing, "I need clarification before recommending a solution.");
});

test("BM-UNC-02: Hallucination Risk Detection for Unverified Cloud Claims", () => {
  const ctx = analyzeContext("How does memory work?");
  const hallucinatedReply =
    "Your memory is connected to the internet and calling external OpenAPI server for real-time sync.";
  const audit = evaluateCandidateResponse(hallucinatedReply, ctx);

  assert.equal(audit.passed, false);
  assert.ok(audit.defects.some((d) => d.category === "UNSUPPORTED_CLAIM"));
});

// ============================================================================
// BENCHMARK CATEGORY H: SELF-EVALUATION & INVARIANT REPAIR
// ============================================================================

test("BM-EVAL-01: Pre-Delivery Self-Evaluation Catches Negative Constraint Violations", () => {
  const ctx = analyzeContext("We must not use paid APIs. How should we store vectors?");
  const badReply = "To store vectors efficiently, you should sign up for a paid api key and use Pinecone.";
  const audit = evaluateCandidateResponse(badReply, ctx);

  assert.equal(audit.passed, false);
  assert.ok(audit.defects.some((d) => d.category === "NEGATIVE_CONSTRAINT_BREACH"));

  const remediated = remediateCandidateResponse(badReply, audit, ctx);
  assert.equal(remediated.decision, "AUTOMATIC_CORRECTION_APPLIED");
  assert.ok(remediated.finalReply.toLowerCase().includes("local sqlite"));
});

test("BM-EVAL-02: Deterministic Fast-Path Verification & Boundary Preservation", () => {
  const ctx = analyzeContext("Good morning Ultron");
  assert.ok(ctx.complexityScore < 0.30);
  assert.equal(ctx.intentCategory, "GREETING");
});
