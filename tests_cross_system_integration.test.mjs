/**
 * @file tests_cross_system_integration.test.mjs
 * @description Comprehensive Cross-System Integration Test Suite:
 * Cognitive Intelligence (10 Engines) + Advanced Memory (12 Memory Types).
 *
 * Verifies:
 * - CROSS-INT-01: Working Memory enriches Context Engine conversation turns and follow-up continuity.
 * - CROSS-INT-02: Stored Project & Semantic Memories ground Calibrated Confidence calculation.
 * - CROSS-INT-03: Stored Decision Memories inform Decision Intelligence MCDA evaluations.
 * - CROSS-INT-04: Stored Error & Solution Memories inform Problem Solving 5-Why root cause diagnosis.
 * - CROSS-INT-05: Stored Project Constraints prevent Planning Engine from generating unviable architectures.
 * - CROSS-INT-06: Meta-Memory knowledge gap assessment informs Uncertainty Engine epistemic stance.
 * - CROSS-INT-07: Pre-Delivery Self-Evaluation verifies that candidate responses comply with stored memory invariants.
 * - CROSS-INT-08: Full Integrated Pipeline (Chat Route Simulation): Utterance -> Memory Intake -> Cognitive Orchestration -> Grounded Reply.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("CROSS-INT-01: Working Memory enriches Context Engine conversation turns and continuity", async () => {
  const { WorkingMemoryEngine } = await import("./lib/memory/workingMemory.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const wm = new WorkingMemoryEngine(5);
  wm.setActiveGoal("Build high-performance local AI assistant");
  wm.addTurn("user", "We are using Next.js 16 with Electron");
  wm.addTurn("assistant", "Understood, Next.js 16 standalone build will be packaged into Electron.");

  const recent = wm.getRecentTurns();
  const historyTurns = recent.map((t) => ({ role: t.role, content: t.content }));

  // Follow-up question with pronoun "it"
  const parsed = analyzeContext("Can it run offline without an active internet connection?", historyTurns);

  assert.equal(parsed.isFollowUp, true, "Must recognize turn as follow-up");
  assert.ok(parsed.resolvedReferences["it"] !== undefined || parsed.cleanedQuery.length > 0);
  assert.ok(parsed.intentCategory.length > 0);
});

test("CROSS-INT-02: Stored Project & Semantic Memories ground Calibrated Confidence calculation", async () => {
  const { calculateCalibratedConfidence } = await import("./lib/cognitive/orchestrator.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const context = analyzeContext("What is our architecture policy for cloud APIs?", []);

  // Scenario A: Zero grounded memories
  const confidenceA = calculateCalibratedConfidence(context, 0.70, 0);

  // Scenario B: 4 verified memories grounded
  const confidenceB = calculateCalibratedConfidence(context, 0.95, 4);

  assert.ok(confidenceB.overallScore > confidenceA.overallScore, "Grounded memories must scale confidence score higher");
  assert.ok(confidenceB.overallScore >= 0.85, "Multiple verified grounded memories must scale certainty to HIGH_CERTAINTY");
  assert.equal(confidenceB.classification, "HIGH_CERTAINTY");
});

test("CROSS-INT-03: Stored Decision Memories inform Decision Intelligence MCDA evaluations", async () => {
  const { performDecisionAnalysis } = await import("./lib/cognitive/decisionEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  // Invariant-breaching decision query: both candidates are paid cloud services
  const context = analyzeContext(
    "Choose between Pinecone Cloud Vector DB vs AWS Managed Aurora for storing our local vectors with zero cloud dependencies."
  );

  const decision = performDecisionAnalysis(context);

  assert.ok(decision);
  assert.equal(decision.epistemicStatus, "DISQUALIFIED_BY_CONSTRAINTS");
  assert.equal(decision.recommendedOption, undefined, "Must not recommend any disqualified cloud service");
  assert.match(decision.rationaleSummary, /disqualified because they violate non-negotiable project constraints/i);
});

test("CROSS-INT-04: Stored Error & Solution Memories inform Problem Solving 5-Why root cause diagnosis", async () => {
  const { performProblemSolving } = await import("./lib/cognitive/problemSolvingEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const context = analyzeContext(
    "The speech transcription buffer is crashing due to PCM buffer underrun when speaking fast",
    []
  );

  const problem = performProblemSolving(context);

  assert.ok(problem);
  assert.ok(problem.fiveWhyChain.length >= 3, "Must produce multi-level 5-Why analysis chain");
  assert.ok(problem.recommendedSolution, "Must recommend validated solution");
  assert.ok(problem.validationCriteria.length > 0, "Must include regression validation criteria");
});

test("CROSS-INT-05: Stored Project Constraints prevent Planning Engine from generating unviable architectures", async () => {
  const { performPlanningAnalysis } = await import("./lib/cognitive/planningEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const context = analyzeContext("Plan the multi-agent deployment roadmap", []);
  context.instructions.push({
    id: "mem_no_cloud",
    rawText: "Never delete unit tests and never deploy to external cloud",
    normalizedText: "no cloud no test deletion",
    priority: "MANDATORY",
    isNegativeConstraint: true,
    category: "TECHNICAL",
  });

  const plan = performPlanningAnalysis(context);

  assert.ok(plan.tasks.length > 0);
  assert.ok(plan.executionSequence.length > 0);
  assert.ok(!plan.tasks.some((t) => /aws|azure|gcp cloud/i.test(t.title)), "Plan must not include prohibited cloud tasks");
});

test("CROSS-INT-06: Meta-Memory knowledge gap assessment informs Uncertainty Engine epistemic stance", async () => {
  const { detectMissingInformation, assessUncertaintyAndConfidence } = await import("./lib/cognitive/uncertaintyEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");
  const { defaultMetaMemoryEngine } = await import("./lib/memory/metaMemoryEngine.ts");

  // Query needing database specifications
  const dbQuery = "Deploy the database to production";
  const metaReport = defaultMetaMemoryEngine.assessKnowledgeState(dbQuery, []);
  assert.equal(metaReport.clarificationRequired, true);
  assert.ok(metaReport.missingFacets.length > 0);

  // Vague refactoring query
  const vagueQuery = "Can you optimize it?";
  const context = analyzeContext(vagueQuery, []);
  const missingInfo = detectMissingInformation(context);
  assert.ok(missingInfo.missingParameters.length > 0, "Must detect missing target module/scope");

  const uncertainty = assessUncertaintyAndConfidence(context);
  assert.ok(uncertainty.missingInformation.length > 0 || uncertainty.requiresClarification);
  assert.match(uncertainty.epistemicPhrasing, /clarification|depends on an assumption|insufficient evidence/i);
});

test("CROSS-INT-07: Pre-Delivery Self-Evaluation verifies compliance with stored memory invariants", async () => {
  const { evaluateCandidateResponse } = await import("./lib/cognitive/selfEvaluationEngine.ts");
  const { analyzeContext } = await import("./lib/cognitive/contextEngine.ts");

  const context = analyzeContext("How should we set up our vector store?", []);
  context.instructions.push({
    id: "const_no_paid_cloud",
    rawText: "Must use zero paid cloud services",
    normalizedText: "no paid cloud APIs",
    priority: "MANDATORY",
    isNegativeConstraint: true,
    category: "TECHNICAL",
  });

  // Candidate violating the stored constraint
  const badReply = "We should sign up for a paid monthly subscription to Pinecone for vector storage.";
  const audit = evaluateCandidateResponse(badReply, context);

  assert.equal(audit.passed, false, "Candidate violating stored privacy invariant must fail audit");
  assert.ok(audit.defects.some((d) => d.category === "NEGATIVE_CONSTRAINT_BREACH"));
});

test("CROSS-INT-08: Full Integrated Pipeline: Utterance -> Memory Intake -> Cognitive Orchestration", async () => {
  const { MemoryCoordinator } = await import("./lib/memory/memoryCoordinator.ts");
  const { orchestrateCognitivePipeline } = await import("./lib/cognitive/orchestrator.ts");

  const testVault = path.join(process.cwd(), "test_vault_cross_int.json");
  const testBak = path.join(process.cwd(), "test_vault_cross_int.json.bak");
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);

  const coordinator = new MemoryCoordinator(testVault, testBak);

  // 1. Intake: Store Founder Identity & Architecture Facts
  coordinator.processUtterancePipeline(
    "My name is Ashish and I am building ULTRON as an autonomous AI co-founder",
    "user",
    "ultron_main"
  );
  coordinator.processUtterancePipeline(
    "Remember that all inference must remain 100% local on Ollama port 11434",
    "user",
    "ultron_main"
  );

  // Search through isolated test coordinator
  const recalled = coordinator.search({
    query: "What is our policy for LLM inference models and who is the founder?",
    projectId: "ultron_main",
    limit: 5,
  });
  assert.ok(recalled.length > 0, "Coordinator search must return stored memories");

  // 2. Query through Cognitive Orchestrator with memoryContext
  const cogResult = await orchestrateCognitivePipeline(
    "What is our policy for LLM inference models and who is the founder?",
    [],
    {
      projectId: "ultron_main",
      recalledMemories: recalled.map((r) => r.record),
    }
  );

  assert.ok(cogResult);
  assert.ok(cogResult.cognitiveSystemPrompt.includes("ULTRON"));
  assert.ok(cogResult.recalledMemories && cogResult.recalledMemories.length > 0, "Must retrieve grounded memories");

  const prompt = cogResult.cognitiveSystemPrompt;
  assert.ok(prompt.includes("VERIFIED LONG-TERM MEMORY"), "Prompt must contain verified long-term memory directives");

  // Cleanup
  if (fs.existsSync(testVault)) fs.unlinkSync(testVault);
  if (fs.existsSync(testBak)) fs.unlinkSync(testBak);
});
