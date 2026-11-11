/**
 * @file tests_cognitive_phase5.test.mjs
 * @description Comprehensive Test Suite for ULTRON Cognitive Intelligence Engine — Phase 5:
 * Multi-Model Intelligence (Component 09) and Co-Founder Discussion Engine (Component 10).
 *
 * Mandatory Verification Tracks:
 * 1. Local Model Discovery & Capability Registry (offline Ollama, 0 models, 1 model, multiple models).
 * 2. Capability-Based Task Routing across 11 Task Categories (math, coding, discussion, planning, etc.).
 * 3. Resource-Aware Model Selection (single vs multi-model environment, memory footprint, timeouts).
 * 4. Multi-Model Inference & Consensus Analysis (unanimous, substantial agreement, divergence, failure fallback).
 * 5. Co-Founder Discussion Engine Activation Gate (fast path bypass for greetings vs analytical activation).
 * 6. 10-Stage Discussion Workflow Execution (Understand -> Independent -> Support -> Oppose -> Alternatives -> Risks -> Decision -> Uncertainty -> Self-Eval -> Final).
 * 7. Devil's Advocate Engine across Technical, Business, Product, and Financial risk categories.
 * 8. Constructive Disagreement vs Agreement (sound premise vs flawed premise).
 * 9. Constraint Disqualification in Co-Founder Alternatives (cloud vs local constraints).
 * 10. End-to-End Orchestrator Pipeline Integration (model routing + discussion briefing in system prompt).
 */

import test from "node:test";
import assert from "node:assert/strict";

// ============================================================================
// TEST TRACK 1: LOCAL MODEL DISCOVERY & REGISTRY
// ============================================================================
test("Cognitive Phase 5: Model Discovery handles offline Ollama gracefully", async () => {
  const { discoverLocalModels } = await import("./lib/cognitive/multiModelEngine.ts");

  // Point to a non-existent port to test offline behavior
  const status = await discoverLocalModels("http://127.0.0.1:59999", 500);

  assert.equal(status.isOnline, false);
  assert.equal(status.totalModelsFound, 0);
  assert.ok(Array.isArray(status.installedModels));
  assert.ok(status.error?.includes("Local Ollama service unreachable") || status.error?.includes("ECONNREFUSED"));
  assert.ok(typeof status.discoveryLatencyMs === "number");
});

test("Cognitive Phase 5: Model Discovery builds capability registry from model profiles", async () => {
  const { buildRegistryEntry } = await import("./lib/cognitive/multiModelEngine.ts");

  // 1. Qwen 2.5 Coder
  const coder = buildRegistryEntry("qwen2.5-coder:1.5b", 1024 * 1024 * 900, false);
  assert.equal(coder.contextCapacity, 32768);
  assert.ok(coder.capabilities.includes("CODE_GENERATION"));
  assert.ok(coder.taskSuitability.includes("CODE_EXPLANATION"));

  // 2. DeepSeek R1
  const reasoner = buildRegistryEntry("deepseek-r1:1.5b", 1024 * 1024 * 1100, false);
  assert.equal(reasoner.contextCapacity, 16384);
  assert.ok(reasoner.capabilities.includes("ANALYTICAL_REASONING"));
  assert.ok(reasoner.capabilities.includes("MATHEMATICAL_LOGIC"));
  assert.ok(reasoner.taskSuitability.includes("STRUCTURED_COFOUNDER_DISCUSSION"));

  // 3. Qwen 2.5 general
  const general = buildRegistryEntry("qwen2.5:0.5b", 1024 * 1024 * 400, true);
  assert.equal(general.isRecommendedDefault, true);
  assert.ok(general.capabilities.includes("FAST_CHAT"));
  assert.ok(general.taskSuitability.includes("SIMPLE_CONVERSATION"));
});

// ============================================================================
// TEST TRACK 2: TASK CATEGORY DETERMINATION
// ============================================================================
test("Cognitive Phase 5: Determines correct task categories across 11 domains", async () => {
  const { determineTaskCategory } = await import("./lib/cognitive/multiModelEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const testCases = [
    { query: "Calculate 25 * 40 / 2", expected: "MATHEMATICAL_REASONING" },
    { query: "Explain why this async TypeScript promise rejects with unhandled error", expected: "CODE_EXPLANATION" },
    { query: "What do you think of my startup proposal to build an offline local CRM?", expected: "STRUCTURED_COFOUNDER_DISCUSSION" },
    { query: "Should we choose SQLite WAL mode or in-memory caching?", expected: "DECISION_ANALYSIS" },
    { query: "Create an implementation roadmap and milestones for Phase 5", expected: "PLANNING" },
    { query: "Design the microservices database architecture and IPC bus", expected: "TECHNICAL_ARCHITECTURE" },
    { query: "Critique this proposal and challenge my underlying assumptions", expected: "CRITICAL_EVALUATION" },
    { query: "Troubleshoot why the database has high write latency and locks", expected: "ANALYTICAL_REASONING" },
    { query: "Audit this reply and check for negative constraint violations", expected: "RESPONSE_EVALUATION" },
    { query: "Hello Ultron, how are you today?", expected: "SIMPLE_CONVERSATION" },
  ];

  for (const tc of testCases) {
    const ctx = analyzeContext(tc.query);
    const category = determineTaskCategory(ctx);
    assert.equal(category, tc.expected, `Query "${tc.query}" expected ${tc.expected} but got ${category}`);
  }
});

// ============================================================================
// TEST TRACK 3: CAPABILITY-BASED MODEL SELECTION & ROUTING
// ============================================================================
test("Cognitive Phase 5: Routes coding requests to code models and math to reasoning models", async () => {
  const { selectModelForTask, buildRegistryEntry } = await import("./lib/cognitive/multiModelEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const availableModels = [
    buildRegistryEntry("qwen2.5:0.5b", 400 * 1024 * 1024, true),
    buildRegistryEntry("qwen2.5-coder:1.5b", 900 * 1024 * 1024, false),
    buildRegistryEntry("deepseek-r1:1.5b", 1100 * 1024 * 1024, false),
  ];

  // 1. Coding query -> Must select qwen2.5-coder
  const codeCtx = analyzeContext("Explain and refactor this TypeScript async function to fix memory leak");
  const codeRoute = selectModelForTask(codeCtx, availableModels);
  assert.equal(codeRoute.selectedModel.modelId, "qwen2.5-coder:1.5b");
  assert.equal(codeRoute.taskCategory, "CODE_EXPLANATION");
  assert.equal(codeRoute.isSingleModelEnvironment, false);
  assert.match(codeRoute.selectionRationale, /Specialized code generation capability matched/);

  // 2. Math / Co-founder query -> Must select deepseek-r1
  const cofounderCtx = analyzeContext("Co-founder strategic proposal: evaluate my startup idea for offline local AI");
  const cofounderRoute = selectModelForTask(cofounderCtx, availableModels);
  assert.equal(cofounderRoute.selectedModel.modelId, "deepseek-r1:1.5b");
  assert.equal(cofounderRoute.taskCategory, "STRUCTURED_COFOUNDER_DISCUSSION");

  // 3. Simple greeting -> Must select fast chat model (qwen2.5:0.5b)
  const chatCtx = analyzeContext("Good morning Ultron!");
  const chatRoute = selectModelForTask(chatCtx, availableModels);
  assert.equal(chatRoute.selectedModel.modelId, "qwen2.5:0.5b");
  assert.equal(chatRoute.taskCategory, "SIMPLE_CONVERSATION");
  assert.equal(chatRoute.complexityTier, "TIER_1_FAST");
});

test("Cognitive Phase 5: Single-model environment is honestly detected without fabricating alternatives", async () => {
  const { selectModelForTask, buildRegistryEntry } = await import("./lib/cognitive/multiModelEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const singleModelList = [buildRegistryEntry("qwen2.5:0.5b", 400 * 1024 * 1024, true)];
  const ctx = analyzeContext("Evaluate my new technical architecture");

  const route = selectModelForTask(ctx, singleModelList);
  assert.equal(route.isSingleModelEnvironment, true);
  assert.equal(route.selectedModel.modelId, "qwen2.5:0.5b");
  assert.equal(route.fallbackModel, undefined, "Single model environment must have no fake fallback");
  assert.match(route.selectionRationale, /Single local model operating mode/);
});

// ============================================================================
// TEST TRACK 4: MULTI-MODEL INFERENCE & CONSENSUS
// ============================================================================
test("Cognitive Phase 5: Multi-Model Inference handles consensus, divergence, and failure fallback", async () => {
  const { executeMultiModelInference, selectModelForTask, buildRegistryEntry } = await import("./lib/cognitive/multiModelEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const models = [
    buildRegistryEntry("model-a:1b", 500 * 1024 * 1024, true),
    buildRegistryEntry("model-b:1b", 500 * 1024 * 1024, false),
  ];
  const ctx = analyzeContext("Evaluate architectural options");
  const selection = selectModelForTask(ctx, models);

  // Scenario A: Unanimous consensus between models
  const unanimousExec = async () => ({
    content: "Both models agree SQLite WAL mode provides the optimal local zero-cost persistence.",
    latencyMs: 12,
  });
  const resA = await executeMultiModelInference("Compare persistence options", selection, unanimousExec);
  assert.equal(resA.executionMode, "MULTI_MODEL_CONSENSUS");
  assert.equal(resA.consensusLevel, "UNANIMOUS");
  assert.equal(resA.disagreementPoints.length, 0);

  // Scenario B: Divergent outputs
  const divergentExec = async (id) => ({
    content: id === "model-a:1b"
      ? "Recommend complete overhaul and immediate migration to external cloud service."
      : "Recommend strictly local in-process SQLite database with zero external dependencies.",
    latencyMs: 15,
  });
  const resB = await executeMultiModelInference("Strategy evaluation", selection, divergentExec);
  assert.equal(resB.consensusLevel, "DIVERGENT");
  assert.ok(resB.disagreementPoints.length > 0);

  // Scenario C: One model failure with graceful single-model fallback
  const partialFailExec = async (id) => {
    if (id === "model-b:1b") throw new Error("VRAM out of memory error");
    return { content: "Model A succeeded with local analysis.", latencyMs: 20 };
  };
  const resC = await executeMultiModelInference("Test failure guard", selection, partialFailExec);
  assert.ok(resC.primaryOutput.includes("Model A succeeded"));
  assert.equal(resC.modelResponses.find((r) => r.modelId === "model-b:1b")?.success, false);

  // Scenario D: All models fail
  const totalFailExec = async () => {
    throw new Error("Ollama connection aborted");
  };
  const resD = await executeMultiModelInference("Test total failure", selection, totalFailExec);
  assert.equal(resD.executionMode, "FALLBACK_MODE");
  assert.ok(resD.primaryOutput.includes("unsuccessful"));
});

// ============================================================================
// TEST TRACK 5: CO-FOUNDER DISCUSSION ACTIVATION GATE
// ============================================================================
test("Cognitive Phase 5: Discussion Engine activates only for strategic/proposal queries and guards fast path", async () => {
  const { isCoFounderDiscussionRequired } = await import("./lib/cognitive/discussionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // Fast path bypass queries (Must return FALSE)
  assert.equal(isCoFounderDiscussionRequired(analyzeContext("Hello Ultron")), false);
  assert.equal(isCoFounderDiscussionRequired(analyzeContext("What is the time right now?")), false);
  assert.equal(isCoFounderDiscussionRequired(analyzeContext("status")), false);

  // Proposal & strategic queries (Must return TRUE)
  assert.equal(
    isCoFounderDiscussionRequired(analyzeContext("What do you think of my startup proposal to launch a B2B AI tool?")),
    true
  );
  assert.equal(
    isCoFounderDiscussionRequired(analyzeContext("Should we choose SQLite WAL or Pinecone under zero-cost constraints?")),
    true
  );
  assert.equal(
    isCoFounderDiscussionRequired(analyzeContext("Create a roadmap and launch plan for our retail coffee shop")),
    true
  );
});

// ============================================================================
// TEST TRACK 6: 10-STAGE DISCUSSION WORKFLOW & DEVIL'S ADVOCATE RISKS
// ============================================================================
test("Cognitive Phase 5: Discussion Engine executes all 10 stages and categorizes Devil's Advocate risks", async () => {
  const { performCoFounderDiscussion } = await import("./lib/cognitive/discussionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const proposalQuery =
    "Co-founder strategic proposal: Let's launch a high-end specialty retail coffee shop in downtown with premium roasting.";
  const ctx = analyzeContext(proposalQuery);

  const discussion = performCoFounderDiscussion(ctx);

  // 1. All 10 stages completed
  assert.equal(discussion.stagesCompleted.length, 10);
  assert.equal(discussion.stagesCompleted[0], "STAGE_01_UNDERSTAND");
  assert.equal(discussion.stagesCompleted[9], "STAGE_10_FINAL_SYNTHESIS");

  // 2. Structured components populated
  assert.ok(discussion.proposalSummary.length > 0);
  assert.ok(discussion.independentAssessment.length > 0);
  assert.ok(discussion.supportingArguments.length >= 2);
  assert.ok(discussion.opposingArguments.length >= 2);
  assert.ok(discussion.devilAdvocateRisks.length >= 2);
  assert.ok(discussion.alternativeStrategies.length >= 2);
  assert.ok(discussion.finalRecommendation.length > 0);
  assert.ok(discussion.assumptionsAndUnknowns.length > 0);
  assert.ok(discussion.conditionsAlteringRecommendation.length > 0);
  assert.ok(discussion.suggestedNextSteps.length >= 2);
  assert.equal(discussion.isAdvisoryOnly, true);

  // 3. Devil's Advocate categorized risks
  const riskCategories = new Set(discussion.devilAdvocateRisks.map((r) => r.category));
  assert.ok(riskCategories.has("BUSINESS"), "Must identify business risks for retail proposal");
  assert.ok(riskCategories.has("FINANCIAL"), "Must identify financial runway risks for retail proposal");
  assert.ok(riskCategories.has("PRODUCT"), "Must identify product/market demographic risks");

  // 4. 11-section markdown report generated
  const report = discussion.structuredDiscussionReport;
  assert.match(report, /## 1\. Understanding of the Proposal/);
  assert.match(report, /## 2\. Independent Co-Founder Assessment/);
  assert.match(report, /## 3\. What Supports the Proposal/);
  assert.match(report, /## 4\. What Challenges the Proposal/);
  assert.match(report, /## 5\. Major Risk Breakdown/);
  assert.match(report, /## 6\. Alternative Strategic Approaches/);
  assert.match(report, /## 7\. Comparative Trade-Off Evaluation/);
  assert.match(report, /## 8\. Final Co-Founder Recommendation/);
  assert.match(report, /## 9\. Stated Working Assumptions/);
  assert.match(report, /## 10\. Conditions That Could Alter/);
  assert.match(report, /## 11\. Actionable Next Steps/);
});

// ============================================================================
// TEST TRACK 7: CONSTRUCTIVE DISAGREEMENT & CONSTRAINT DISQUALIFICATION
// ============================================================================
test("Cognitive Phase 5: Discussion Engine provides evidence-based disagreement and disqualifies boundary breaches", async () => {
  const { performCoFounderDiscussion } = await import("./lib/cognitive/discussionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // Infeasible proposal violating offline constraints
  const cloudProposalQuery =
    "Proposal: Let's migrate all vector memory to Pinecone Cloud API to get unlimited scale under zero paid API constraints.";
  const ctx = analyzeContext(cloudProposalQuery);
  const discussion = performCoFounderDiscussion(ctx);

  // Must constructively disagree with evidence
  assert.match(discussion.independentAssessment, /violates non-negotiable local-first privacy/i);
  assert.match(discussion.finalRecommendation, /Reject all proposed candidates due to invariant boundary violations/i);
  assert.ok(discussion.devilAdvocateRisks.some((r) => r.category === "TECHNICAL" && r.severity === "CRITICAL"));
});

// ============================================================================
// TEST TRACK 8: FULL ORCHESTRATOR PIPELINE INTEGRATION
// ============================================================================
test("Cognitive Phase 5: Orchestrator integrates model routing and discussion into system prompt", async () => {
  const { orchestrateCognitivePipeline } = await import("./lib/cognitive/orchestrator.ts");

  const query = "Co-founder discussion: Should we rewrite our database architecture or refactor with SQLite WAL concurrency?";
  const result = await orchestrateCognitivePipeline(query);

  assert.equal(result.tier, "TIER_2_ANALYTICAL");
  assert.ok(result.modelSelection, "Must include ModelSelectionResult");
  assert.ok(result.discussion, "Must include CoFounderDiscussionResult");
  assert.equal(result.discussion.stagesCompleted.length, 10);

  // System prompt must contain both new directives
  const prompt = result.cognitiveSystemPrompt;
  assert.match(prompt, /MULTI-MODEL ROUTING DIRECTIVE:/);
  assert.match(prompt, /CO-FOUNDER STRATEGIC DISCUSSION BRIEFING:/);
  assert.match(prompt, /Independent Assessment:/);
});

// ============================================================================
// TEST TRACK 9: STRONG VS WEAK PROPOSAL EVALUATION
// ============================================================================
test("Cognitive Phase 5: Discussion Engine differentiates strong vs financially risky proposals", async () => {
  const { performCoFounderDiscussion } = await import("./lib/cognitive/discussionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // 1. Strong Proposal: Local SQLite WAL refactoring with automated benchmarks
  const strongQuery = "Proposal: Refactor local SQLite to WAL mode with serialized write queues to eliminate database concurrency deadlocks under zero cost constraints.";
  const strongCtx = analyzeContext(strongQuery);
  const strongDiscussion = performCoFounderDiscussion(strongCtx);

  assert.ok(strongDiscussion.supportingArguments.length >= 2);
  assert.ok(strongDiscussion.supportingArguments.some((s) => s.includes("zero recurring cloud cost") || s.includes("concurrent reader")));
  assert.match(strongDiscussion.finalRecommendation, /Proceed with/i);

  // 2. Financially Risky Proposal: Massive upfront retail lease without validation
  const riskyQuery = "Proposal: Commit our entire $150k capital runway to sign a 3-year commercial retail lease without market foot-traffic data.";
  const riskyCtx = analyzeContext(riskyQuery);
  const riskyDiscussion = performCoFounderDiscussion(riskyCtx);

  assert.ok(riskyDiscussion.devilAdvocateRisks.some((r) => r.category === "FINANCIAL" && r.severity === "CRITICAL"));
  assert.ok(riskyDiscussion.opposingArguments.some((o) => o.includes("Working Capital Depletion") || o.includes("Cash reserves exhaust")));
});

// ============================================================================
// TEST TRACK 10: USER ASSUMPTION CORRECT VS INCORRECT
// ============================================================================
test("Cognitive Phase 5: Discussion Engine acknowledges sound user assumptions and challenges invalid ones", async () => {
  const { performCoFounderDiscussion } = await import("./lib/cognitive/discussionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // 1. Sound Assumption: WAL mode allows concurrent readers
  const soundCtx = analyzeContext(
    "Proposal: Use SQLite WAL mode assuming that readers do not block writers in WAL mode."
  );
  const soundDiscussion = performCoFounderDiscussion(soundCtx);
  assert.ok(soundDiscussion.supportingArguments.some((s) => s.includes("WAL") || s.includes("concurrent reader")));

  // 2. Unsound Assumption: Deleting unit tests makes the software bug-free
  const unsoundCtx = analyzeContext(
    "Proposal: Delete all automated test suites assuming that zero tests will increase velocity without introducing any regressions."
  );
  const unsoundDiscussion = performCoFounderDiscussion(unsoundCtx);
  assert.ok(unsoundDiscussion.opposingArguments.some((o) => o.includes("Skipping verification tests") || o.includes("technical debt")));
});

// ============================================================================
// TEST TRACK 11: MODEL DISCOVERY & ROUTING BOUNDARY CASES
// ============================================================================
test("Cognitive Phase 5: Model Selection handles context capacity overflow and resource guards", async () => {
  const { selectModelForTask, buildRegistryEntry } = await import("./lib/cognitive/multiModelEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // Small context model vs large prompt
  const tinyModel = buildRegistryEntry("tiny-chat:1b", 200 * 1024 * 1024, false);
  tinyModel.contextCapacity = 1000; // Artificially small context window

  const bigModel = buildRegistryEntry("qwen2.5:0.5b", 400 * 1024 * 1024, true);
  bigModel.contextCapacity = 32768;

  const longQuery = "Analyze this detailed proposal: " + "word ".repeat(500);
  const ctx = analyzeContext(longQuery);

  const route = selectModelForTask(ctx, [tinyModel, bigModel]);
  // Big model must win due to context capacity overflow penalty on tiny model
  assert.equal(route.selectedModel.modelId, "qwen2.5:0.5b");
  assert.ok(route.rankedCandidates.find((c) => c.model.modelId === "tiny-chat:1b")?.suitabilityScore < 0.6);
  assert.ok(route.diagnostics.recommendedTimeoutMs >= 10000);
});

// ============================================================================
// TEST TRACK 12: TASK 2 REGRESSION — MODEL AVAILABILITY & DISCOVERY
// ============================================================================
test("Cognitive Phase 5 Task 2: Model Availability distinguishes offline/empty vs installed models", async () => {
  const { discoverLocalModels, selectModelForTask, buildRegistryEntry, executeMultiModelInference } =
    await import("./lib/cognitive/multiModelEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const ctx = analyzeContext("Explain this async TypeScript function");

  // 1. Ollama unavailable
  const offlineStatus = await discoverLocalModels("http://127.0.0.1:59998", 200);
  assert.equal(offlineStatus.isOnline, false);
  assert.equal(offlineStatus.totalModelsFound, 0);
  assert.equal(offlineStatus.installedModels.length, 0);

  // 2. Ollama online with zero installed models (or offline selection fallback)
  const zeroInstalledRoute = selectModelForTask(ctx, []);
  assert.equal(zeroInstalledRoute.selectedModel.availability, "OFFLINE");
  assert.equal(zeroInstalledRoute.isSingleModelEnvironment, false, "Zero installed models must NOT report single-model environment");
  assert.match(zeroInstalledRoute.selectionRationale, /Zero local models verified/);

  // Inference against OFFLINE model must be bypassed cleanly without attempting execution
  const bypassedExec = await executeMultiModelInference("Prompt", zeroInstalledRoute);
  assert.equal(bypassedExec.executionMode, "FALLBACK_MODE");
  assert.equal(bypassedExec.modelsAttempted.length, 0);
  assert.match(bypassedExec.primaryOutput, /Execution bypassed: Model ".*" is not available/);

  // 3. One installed model
  const singleModelList = [buildRegistryEntry("qwen2.5:0.5b", 400 * 1024 * 1024, true)];
  const singleRoute = selectModelForTask(ctx, singleModelList);
  assert.equal(singleRoute.selectedModel.availability, "AVAILABLE");
  assert.equal(singleRoute.isSingleModelEnvironment, true);
  assert.equal(singleRoute.fallbackModel, undefined);
  assert.match(singleRoute.selectionRationale, /Single local model operating mode/);

  // 4. Multiple installed models
  const multiModelList = [
    buildRegistryEntry("qwen2.5:0.5b", 400 * 1024 * 1024, true),
    buildRegistryEntry("qwen2.5-coder:1.5b", 900 * 1024 * 1024, false),
  ];
  const multiRoute = selectModelForTask(ctx, multiModelList);
  assert.equal(multiRoute.selectedModel.modelId, "qwen2.5-coder:1.5b");
  assert.equal(multiRoute.isSingleModelEnvironment, false);
  assert.ok(multiRoute.fallbackModel);

  // 5. No eligible model for the requested task (all installed models UNAVAILABLE or FAILED)
  const unavailA = buildRegistryEntry("model-a:1b", 500 * 1024 * 1024, true, "UNAVAILABLE");
  const failedB = buildRegistryEntry("model-b:1b", 500 * 1024 * 1024, false, "FAILED");
  const noEligibleRoute = selectModelForTask(ctx, [unavailA, failedB]);
  assert.ok(noEligibleRoute.rankedCandidates.every((c) => c.suitabilityScore <= 0.10));
  assert.match(noEligibleRoute.selectionRationale, /No eligible or available models found/);
});

// ============================================================================
// TEST TRACK 13: TASK 3 REGRESSION — SHORT-RESPONSE CONSENSUS SAFETY
// ============================================================================
test("Cognitive Phase 5 Task 3: Consensus engine enforces minimum evidence threshold on short responses", async () => {
  const { executeMultiModelInference, selectModelForTask, buildRegistryEntry } =
    await import("./lib/cognitive/multiModelEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const models = [
    buildRegistryEntry("model-a:1b", 500 * 1024 * 1024, true),
    buildRegistryEntry("model-b:1b", 500 * 1024 * 1024, false),
  ];
  const selection = selectModelForTask(analyzeContext("Evaluate strategy"), models);

  // 1. Two-word responses with one shared generic word
  const twoWordExec = async (id) => ({
    content: id === "model-a:1b" ? "Code answer" : "Philosophical answer",
    latencyMs: 10,
  });
  const res1 = await executeMultiModelInference("Prompt", selection, twoWordExec);
  assert.equal(res1.consensusLevel, "INSUFFICIENT_EVIDENCE");
  assert.ok(res1.disagreementPoints.some((d) => d.includes("Insufficient textual evidence")));

  // 2. Empty responses
  const emptyExec = async () => ({ content: "", latencyMs: 5 });
  const res2 = await executeMultiModelInference("Prompt", selection, emptyExec);
  assert.equal(res2.consensusLevel, "INSUFFICIENT_EVIDENCE");

  // 3. Identical substantive multi-sentence responses
  const substantiveIdenticalExec = async () => ({
    content: "The database requires SQLite WAL mode with serialized write transactions to eliminate concurrency deadlocks. Automated benchmarks confirm this architecture is optimal for desktop workloads.",
    latencyMs: 20,
  });
  const res3 = await executeMultiModelInference("Prompt", selection, substantiveIdenticalExec);
  assert.equal(res3.consensusLevel, "UNANIMOUS");
  assert.equal(res3.disagreementPoints.length, 0);

  // 4. Substantially similar substantive responses
  const similarExec = async (id) => ({
    content: id === "model-a:1b"
      ? "SQLite WAL mode provides fast concurrent reader throughput while write queues serialize transactions safely across threads for high performance."
      : "We should implement SQLite WAL mode for fast concurrent queries and serialize transactions safely across worker threads for stability.",
    latencyMs: 25,
  });
  const res4 = await executeMultiModelInference("Prompt", selection, similarExec);
  assert.equal(res4.consensusLevel, "SUBSTANTIAL_AGREEMENT");

  // 5. Clearly divergent substantive responses
  const divergentExec = async (id) => ({
    content: id === "model-a:1b"
      ? "Migrate immediately to external cloud infrastructure for unlimited distributed scalability and managed server operations."
      : "Maintain strictly offline in-process local SQLite storage with zero network dependencies to guarantee complete user privacy.",
    latencyMs: 25,
  });
  const res5 = await executeMultiModelInference("Prompt", selection, divergentExec);
  assert.equal(res5.consensusLevel, "DIVERGENT");
  assert.ok(res5.disagreementPoints.some((d) => d.includes("diverged on recommendations")));
});


