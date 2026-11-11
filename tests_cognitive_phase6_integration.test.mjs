/**
 * @file tests_cognitive_phase6_integration.test.mjs
 * @description Comprehensive Cross-Phase Integration & Phase 6 Capability Verification Suite.
 *
 * Verifies:
 * 1. Founder Feedback Integration (Capture, influence on trade-offs, bounded scope, no permanent learning claim).
 * 2. Multi-Criteria Response Quality Comparison (Agreement, disagreement, complementary, insufficient evidence).
 * 3. Latency & Resource Monitoring (Truthful metrics, null GPU, non-zero memory/CPU, no fabrication).
 * 4. Local Inference Cost & Resource Analysis (Zero monetary cost guarantee, estimated TDP watt-hours).
 * 5. All 10 Cross-Phase Integration Scenarios:
 *    - Scenario 1: Complex business decision with multiple alternatives and risks.
 *    - Scenario 2: Technically attractive proposal with serious financial constraints.
 *    - Scenario 3: Founder assumption that ULTRON respectfully challenges.
 *    - Scenario 4: Plan containing circular or impossible dependencies.
 *    - Scenario 5: User instruction with conflicting constraints.
 *    - Scenario 6: Insufficient information requiring clarification halting.
 *    - Scenario 7: Divergent local models with quality comparison.
 *    - Scenario 8: Single-model environment honest reporting.
 *    - Scenario 9: Ollama unavailable during execution with graceful fallback.
 *    - Scenario 10: Invariant-violating recommendation rejected.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { analyzeContext } from "./lib/cognitive/contextEngine.ts";
import { orchestrateCognitivePipeline } from "./lib/cognitive/orchestrator.ts";
import { performCoFounderDiscussion } from "./lib/cognitive/discussionEngine.ts";
import {
  selectModelForTask,
  executeMultiModelInference,
  buildRegistryEntry,
  evaluateResponseQuality,
  measureOperationalMetrics,
  computeLocalResourceProfile,
} from "./lib/cognitive/multiModelEngine.ts";
import { performPlanningAnalysis } from "./lib/cognitive/planningEngine.ts";
import { assessUncertaintyAndConfidence } from "./lib/cognitive/uncertaintyEngine.ts";

console.log("=== EXECUTING PHASE 6 CROSS-PHASE INTEGRATION TESTS ===");

// ============================================================================
// TRACK 1: FOUNDER FEEDBACK INTEGRATION
// ============================================================================

test("Phase 6 Track A: Founder feedback is captured, factored into discussion, and not treated as immutable ground truth", () => {
  const query = "Proposal: Launch a high-end specialty retail coffee shop in downtown with premium roasting.";
  const ctx = analyzeContext(query);

  const feedback = [
    {
      feedbackId: "fb-101",
      timestamp: new Date().toISOString(),
      category: "INCORRECT_ASSUMPTION",
      targetTopic: "Downtown Retail Foot Traffic",
      comment: "Downtown commercial foot traffic dropped 40% post-remote work; morning foot-traffic counts are inadequate.",
      suggestedAlternative: "Hybrid pop-up kiosk inside tech co-working spaces with 80% lower capital expense.",
    },
  ];

  const discussion = performCoFounderDiscussion(ctx, undefined, undefined, undefined, undefined, feedback);

  // 1. Feedback context populated
  assert.ok(discussion.founderFeedbackContext !== undefined);
  assert.equal(discussion.founderFeedbackContext.feedbackCount, 1);
  assert.equal(discussion.founderFeedbackContext.isTreatedAsGroundTruth, false);
  assert.equal(discussion.founderFeedbackContext.learningScope, "CURRENT_SESSION_ONLY");

  // 2. Influence reflected in opposing arguments & alternatives
  assert.ok(
    discussion.opposingArguments.some((o) => o.includes("Founder Observation") && o.includes("dropped 40%"))
  );
  assert.ok(
    discussion.alternativeStrategies.some((a) => a.includes("Hybrid pop-up kiosk"))
  );

  // 3. Structured report acknowledges feedback
  assert.match(discussion.structuredDiscussionReport, /Human Co-Founder Guidance & Feedback Integration/);
  assert.match(discussion.structuredDiscussionReport, /Downtown Retail Foot Traffic/);
});

// ============================================================================
// TRACK 2: RESPONSE QUALITY COMPARISON
// ============================================================================

test("Phase 6 Track B: Quality comparison accurately categorizes factual agreement, disagreement, and insufficient evidence", () => {
  const ctx = analyzeContext("Evaluate database options for ULTRON");

  // Case 1: Insufficient Evidence (< 5 words)
  const shortComp = evaluateResponseQuality("Code answer", "Philosophical answer", ctx, "CODE_EXPLANATION", false);
  assert.equal(shortComp.comparisonCategory, "INSUFFICIENT_EVIDENCE");
  assert.ok(shortComp.comparativeSummary.includes("Insufficient evidence"));

  // Case 2: Factual Agreement (Substantive multi-sentence agreeing outputs)
  const primaryAgree = "We recommend SQLite WAL mode because it provides serialized write transactions and concurrent reader access without recurring fees. All data remains 100% offline.";
  const secondaryAgree = "SQLite WAL mode is the optimal persistence architecture for local-first desktop apps. It guarantees zero cloud dependencies and serialized transaction integrity.";
  const agreeComp = evaluateResponseQuality(primaryAgree, secondaryAgree, ctx, "TECHNICAL_ARCHITECTURE", false);
  assert.equal(agreeComp.comparisonCategory, "FACTUAL_AGREEMENT");
  assert.ok(agreeComp.primaryQuality.overallQualityScore >= 0.80);
  assert.ok(agreeComp.secondaryQuality.overallQualityScore >= 0.80);

  // Case 3: Factual Disagreement (Cloud vs Offline rejection)
  const primaryCloud = "We strongly recommend deploying Pinecone Cloud vector API to achieve unlimited scalability and remote synchronization across external cloud infrastructure.";
  const secondaryLocal = "We reject all external cloud APIs and recommend strictly local in-process SQLite storage to preserve user privacy and zero recurring cloud costs.";
  const disagreeComp = evaluateResponseQuality(primaryCloud, secondaryLocal, ctx, "TECHNICAL_ARCHITECTURE", false);
  assert.equal(disagreeComp.comparisonCategory, "FACTUAL_DISAGREEMENT");
  assert.ok(disagreeComp.detectedDivergences.length > 0);

  // Case 4: Single-model environment
  const singleComp = evaluateResponseQuality(primaryAgree, undefined, ctx, "TECHNICAL_ARCHITECTURE", true);
  assert.equal(singleComp.isSingleModel, true);
  assert.equal(singleComp.comparisonCategory, "INSUFFICIENT_EVIDENCE");
  assert.match(singleComp.comparativeSummary, /Single local model operating mode/);
});

// ============================================================================
// TRACK 3: LATENCY & RESOURCE MONITORING
// ============================================================================

test("Phase 6 Track C: Operational metrics truthfully report latency and hardware memory without fabricating GPU stats", () => {
  const metrics = measureOperationalMetrics("qwen2.5:0.5b", 12.5, 1.8, 145.2, 160.0, false);

  assert.equal(metrics.modelId, "qwen2.5:0.5b");
  assert.equal(metrics.inferenceLatencyMs, 145.2);
  assert.equal(metrics.totalTurnLatencyMs, 160.0);
  assert.equal(metrics.fallbackActivated, false);

  // Hardware metrics
  assert.ok(metrics.hardware.ramHeapUsedMb > 0, "Must record actual V8 heap memory");
  assert.ok(metrics.hardware.ramRssMb > 0, "Must record actual RSS memory");
  assert.equal(metrics.hardware.gpuVramUsedMb, null, "Must NOT fabricate GPU memory in headless environment");
  assert.equal(metrics.hardware.gpuAccessible, false);
  assert.equal(metrics.metricsCollectionFailed, false);
});

// ============================================================================
// TRACK 4: LOCAL INFERENCE COST PROFILE
// ============================================================================

test("Phase 6 Track D: Local inference cost profile guarantees $0.00 and calculates TDP energy consumption", () => {
  const profile = computeLocalResourceProfile(250.0, 120.0);

  assert.equal(profile.monetaryCostUsd, 0, "Must guarantee exact $0.00 monetary cost");
  assert.equal(profile.isZeroPaidApiGuaranteed, true);
  assert.equal(profile.measurementMethod, "MEASURED_LOCAL_RUNTIME_METRICS");
  assert.ok(profile.estimatedWattHours > 0, "Must calculate non-zero energy consumption based on TDP formula");
  assert.equal(profile.resourceFootprintRating, "LOW");
});

// ============================================================================
// TRACK 5: 10 CROSS-PHASE INTEGRATION SCENARIOS
// ============================================================================

// Scenario 1: Complex business decision with multiple alternatives and risks
test("Cross-Phase Scenario 1: Complex business decision with alternatives & MCDA", async () => {
  const res = await orchestrateCognitivePipeline("Should we open a specialty coffee shop retail location or start an online coffee bean subscription?");
  assert.equal(res.tier, "TIER_2_ANALYTICAL");
  assert.ok(res.decision !== undefined);
  assert.ok(res.decision.candidates.length >= 2);
  assert.ok(res.discussion !== undefined);
  assert.equal(res.discussion.stagesCompleted.length, 10);
});

// Scenario 2: Technically attractive proposal with serious financial constraints
test("Cross-Phase Scenario 2: Attractive proposal with severe financial runway constraints", async () => {
  const res = await orchestrateCognitivePipeline("Proposal: Commit our entire $150k cash reserve to build an enterprise multi-region Kubernetes cluster.");
  assert.equal(res.tier, "TIER_2_ANALYTICAL");
  assert.ok(res.discussion !== undefined);
  assert.ok(res.discussion.devilAdvocateRisks.some((r) => r.category === "FINANCIAL" && (r.severity === "CRITICAL" || r.severity === "HIGH")));
});

// Scenario 3: Founder assumption that ULTRON respectfully challenges
test("Cross-Phase Scenario 3: Founder assumption challenged respectfully", async () => {
  const res = await orchestrateCognitivePipeline("Proposal: Delete our test suites because zero tests will triple development velocity.");
  assert.equal(res.tier, "TIER_2_ANALYTICAL");
  assert.ok(res.criticalThinking !== undefined);
  assert.notEqual(res.criticalThinking.stance, "AGREES_WITH_PREMISE");
  assert.ok(res.discussion !== undefined);
  assert.ok(res.discussion.opposingArguments.some((o) => o.includes("Skipping verification tests") || o.includes("technical debt")));
});

// Scenario 4: Plan containing circular or impossible dependencies
test("Cross-Phase Scenario 4: Plan recovers gracefully from circular dependencies", () => {
  const ctx = analyzeContext("Plan database schema migration where task A depends on task B and task B depends on task A");
  const plan = performPlanningAnalysis(ctx);
  assert.ok(plan.tasks.length >= 2);
  assert.ok(plan.executionSequence.length >= 2);
});

// Scenario 5: User instruction with conflicting constraints
test("Cross-Phase Scenario 5: Conflicting constraints detected and penalized in certainty", () => {
  const ctx = analyzeContext("Build a 100% offline local desktop app that connects to Pinecone cloud for real-time indexing.");
  const unc = assessUncertaintyAndConfidence(ctx);
  assert.ok(unc.contradictionScore < 0.85);
  assert.ok(unc.uncertainties.some((u) => u.description.includes("Contradiction")));
});

// Scenario 6: Insufficient information requiring clarification halting
test("Cross-Phase Scenario 6: Vague request halts with clarification questions", () => {
  const ctx = analyzeContext("Can you optimize it?");
  const unc = assessUncertaintyAndConfidence(ctx);
  assert.equal(unc.requiresClarification, true);
  assert.equal(unc.epistemicPhrasing, "I need clarification before recommending a solution.");
});

// Scenario 7: Divergent local models with quality comparison
test("Cross-Phase Scenario 7: Two local models diverge and quality comparison highlights trade-offs", async () => {
  const models = [
    buildRegistryEntry("model-a:1b", 500 * 1024 * 1024, true),
    buildRegistryEntry("model-b:1b", 500 * 1024 * 1024, false),
  ];
  const selection = selectModelForTask(analyzeContext("Architecture choice"), models);

  const divergentExec = async (id) => ({
    content: id === "model-a:1b"
      ? "Recommend complete migration to external cloud infrastructure for scalability."
      : "Recommend maintaining strictly offline in-process SQLite storage to preserve privacy.",
    latencyMs: 20,
  });

  const multiRes = await executeMultiModelInference("Architecture choice", selection, divergentExec, analyzeContext("Architecture choice"));
  assert.equal(multiRes.consensusLevel, "DIVERGENT");
  assert.ok(multiRes.qualityComparison !== undefined);
  assert.equal(multiRes.qualityComparison.comparisonCategory, "FACTUAL_DISAGREEMENT");
});

// Scenario 8: Single-model environment honest reporting
test("Cross-Phase Scenario 8: Single-model environment honestly reported without synthetic consensus", () => {
  const singleList = [buildRegistryEntry("qwen2.5:0.5b", 400 * 1024 * 1024, true)];
  const selection = selectModelForTask(analyzeContext("Hello"), singleList);
  assert.equal(selection.isSingleModelEnvironment, true);
  assert.equal(selection.fallbackModel, undefined);
  assert.match(selection.selectionRationale, /Single local model operating mode/);
});

// Scenario 9: Ollama unavailable during execution with graceful fallback
test("Cross-Phase Scenario 9: Offline Ollama sets OFFLINE status and bypasses execution safely", async () => {
  const zeroInstalledSelection = selectModelForTask(analyzeContext("Explain code"), []);
  assert.equal(zeroInstalledSelection.selectedModel.availability, "OFFLINE");
  assert.equal(zeroInstalledSelection.isSingleModelEnvironment, false);

  const res = await executeMultiModelInference("Explain code", zeroInstalledSelection);
  assert.equal(res.executionMode, "FALLBACK_MODE");
  assert.equal(res.modelsAttempted.length, 0);
  assert.match(res.primaryOutput, /Execution bypassed: Model ".*" is not available/);
});

// Scenario 10: Invariant-violating recommendation rejected
test("Cross-Phase Scenario 10: Boundary-breaching proposals strictly disqualified", async () => {
  const res = await orchestrateCognitivePipeline("Should we adopt Pinecone Cloud API or AWS OpenSearch under zero-cost constraints?");
  assert.ok(res.decision !== undefined);
  assert.equal(res.decision.epistemicStatus, "DISQUALIFIED_BY_CONSTRAINTS");
  assert.equal(res.decision.recommendedOption, undefined);
  assert.match(res.cognitiveSystemPrompt, /DISQUALIFIED_BY_CONSTRAINTS/);
});
