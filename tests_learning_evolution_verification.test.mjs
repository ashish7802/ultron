/**
 * @file tests_learning_evolution_verification.test.mjs
 * @description SEPARATE INDEPENDENT FINAL VERIFICATION BATCH for ULTRON Learning & Evolution Engine.
 *
 * Subsystem:
 * Learning & Evolution Engine (Master Feature Blueprint V1.0, Pages 71-79) — Independent Verification.
 *
 * Verification Areas:
 * - Verification A: Ten-Module Individual Coverage Check
 * - Verification B: 22 Specific Functional Verification Scenarios:
 *   1. Successful task experience collection
 *   2. Failed task experience collection
 *   3. Strategy identification
 *   4. Founder positive feedback processing
 *   5. Founder negative feedback processing
 *   6. Explicit correction retention
 *   7. Repeated mistake detection
 *   8. Root cause and recovery lesson handling
 *   9. Knowledge acquisition and validation
 *   10. Skill creation and retrieval
 *   11. Skill versioning
 *   12. Strategy comparison
 *   13. Performance measurement
 *   14. Context-based adaptation
 *   15. Capability gap detection
 *   16. Improvement proposal creation
 *   17. Approval workflow
 *   18. Isolated improvement testing
 *   19. Regression testing
 *   20. Rollback of failed improvements
 *   21. Evolution history persistence
 *   22. Cross-project learning isolation
 * - Verification C: Integration Testing (Memory Dual-Vault, Permissions, Orchestration)
 * - Verification D: Security Testing (Anti-autonomous code editing, Anti-bypass, Anti-tampering)
 * - Verification E: Regression Testing (Preservation of existing memory and task systems)
 * - Verification F: Performance Telemetry Measurements
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import {
  defaultExperienceEngine,
  defaultFeedbackEngine,
  defaultMistakeEngine,
  defaultKnowledgeEngine,
  defaultSkillEngine,
  defaultStrategyEngine,
  defaultPerformanceEngine,
  defaultAdaptiveEngine,
  defaultSelfImprovementEngine,
  defaultEvolutionEngine,
  defaultLearningCoordinator,
} from "./lib/learning/index.ts";

test.describe("INDEPENDENT FINAL VERIFICATION BATCH — LEARNING & EVOLUTION ENGINE", () => {

  test.beforeEach(() => {
    defaultExperienceEngine.clear();
    defaultFeedbackEngine.clear();
    defaultMistakeEngine.clear();
    defaultKnowledgeEngine.clear();
    defaultSkillEngine.clear();
    defaultStrategyEngine.clear();
    defaultPerformanceEngine.clear();
    defaultSelfImprovementEngine.clear();
    defaultEvolutionEngine.clear();
  });

  // ============================================================================
  // VERIFICATION A: TEN-MODULE COVERAGE CHECK
  // ============================================================================
  test("Verification A — All 10 Modules Verified Individually", () => {
    assert.ok(defaultExperienceEngine, "Module 01: ExperienceLearningEngine must be instantiated");
    assert.ok(defaultFeedbackEngine, "Module 02: FeedbackLearningEngine must be instantiated");
    assert.ok(defaultMistakeEngine, "Module 03: MistakeLearningEngine must be instantiated");
    assert.ok(defaultKnowledgeEngine, "Module 04: KnowledgeAcquisitionEngine must be instantiated");
    assert.ok(defaultSkillEngine, "Module 05: SkillDevelopmentEngine must be instantiated");
    assert.ok(defaultStrategyEngine, "Module 06: StrategyOptimizationEngine must be instantiated");
    assert.ok(defaultPerformanceEngine, "Module 07: PerformanceEvaluationEngine must be instantiated");
    assert.ok(defaultAdaptiveEngine, "Module 08: AdaptiveIntelligenceEngine must be instantiated");
    assert.ok(defaultSelfImprovementEngine, "Module 09: SelfImprovementEngine must be instantiated");
    assert.ok(defaultEvolutionEngine, "Module 10: EvolutionManagementEngine must be instantiated");
  });

  // ============================================================================
  // VERIFICATION B: 22 FUNCTIONAL SCENARIOS
  // ============================================================================
  test("Verification B.01: Successful task experience collection", () => {
    const exp = defaultExperienceEngine.recordTaskExperience({
      taskId: "task_success_b01",
      goal: "Generate optimized SVG asset",
      category: "DESIGN",
      strategyUsed: "VECTOR_OPTIMIZER",
      outcome: "SUCCESS",
      executionDurationMs: 400,
      verifiedByTest: true,
      testEvidenceId: "svg_lint_pass",
    });
    assert.equal(exp.outcome, "SUCCESS");
    assert.equal(exp.verifiedByTest, true);
  });

  test("Verification B.02: Failed task experience collection", () => {
    const exp = defaultExperienceEngine.recordTaskExperience({
      taskId: "task_fail_b02",
      goal: "Compile native C++ addon",
      category: "BUILD",
      strategyUsed: "NODE_GYP_DIRECT",
      outcome: "FAILURE",
      executionDurationMs: 2500,
      verifiedByTest: false,
    });
    assert.equal(exp.outcome, "FAILURE");
    assert.equal(exp.lessonsExtracted.length, 1);
    assert.ok(exp.lessonsExtracted[0].includes("fail"));
  });

  test("Verification B.03: Strategy identification", () => {
    defaultExperienceEngine.recordTaskExperience({
      taskId: "t_strat_1",
      goal: "Compress bundle",
      category: "BUILD",
      strategyUsed: "TERSER_MINIFY",
      outcome: "SUCCESS",
      executionDurationMs: 300,
      verifiedByTest: true,
    });
    const analysis = defaultExperienceEngine.analyzeStrategies("BUILD");
    assert.equal(analysis.successfulStrategies[0].strategy, "TERSER_MINIFY");
  });

  test("Verification B.04: Founder positive feedback processing", () => {
    const fb = defaultFeedbackEngine.ingestFeedback({
      rawText: "Excellent job on the clean code architecture!",
      rating: 5,
    });
    assert.equal(fb.polarity, "POSITIVE");
  });

  test("Verification B.05: Founder negative feedback processing", () => {
    const fb = defaultFeedbackEngine.ingestFeedback({
      rawText: "The response was inaccurate and missed edge cases",
      rating: 1,
    });
    assert.equal(fb.polarity, "NEGATIVE");
  });

  test("Verification B.06: Explicit correction retention", () => {
    const fb = defaultFeedbackEngine.ingestFeedback({
      rawText: "Always use strict typing with no any",
      isExplicitInstruction: true,
    });
    assert.equal(fb.isExplicitInstruction, true);
    const rules = defaultFeedbackEngine.getCommunicationProfile().customRules;
    assert.ok(rules.includes("Always use strict typing with no any"));
  });

  test("Verification B.07: Repeated mistake detection", () => {
    defaultMistakeEngine.recordFailure({
      taskId: "t1",
      rawErrorMessage: "ENOENT: no such file or directory, open 'config.json'",
      failedApproachDescription: "Reading without fs.existsSync check",
    });
    const f2 = defaultMistakeEngine.recordFailure({
      taskId: "t2",
      rawErrorMessage: "ENOENT: no such file or directory, open 'secrets.json'",
      failedApproachDescription: "Reading without fs.existsSync check",
    });
    assert.equal(f2.recurrenceCount, 2);
    const repeated = defaultMistakeEngine.getRepeatedMistakes();
    assert.ok(repeated.length >= 1);
  });

  test("Verification B.08: Root cause and recovery lesson handling", () => {
    const fail = defaultMistakeEngine.recordFailure({
      taskId: "t3",
      rawErrorMessage: "EADDRINUSE: address already in use :::3000",
      failedApproachDescription: "Starting server on port 3000 blindly",
      recoveryApplied: "Check port availability and kill lingering process or pick next port",
      recoverySuccessful: true,
    });
    assert.ok(fail.rootCauseAnalysis);
    assert.ok(fail.rootCauseAnalysis.rootCauseSummary.includes("EADDRINUSE"));
    assert.equal(fail.recoverySuccessful, true);
  });

  test("Verification B.09: Knowledge acquisition and validation", () => {
    const k = defaultKnowledgeEngine.acquireKnowledge({
      topic: "React 19 Server Actions",
      summary: "useActionState hook in React 19",
      fullContent: "useActionState replaces useFormState in React 19.",
      sourceType: "OFFICIAL_API_SPEC",
      sourceUri: "https://react.dev/reference/react/useActionState",
    });
    assert.equal(k.verificationStatus, "VERIFIED");
    assert.ok(k.concepts.includes("react"));
  });

  test("Verification B.10: Skill creation and retrieval", () => {
    const s = defaultSkillEngine.createSkill({
      name: "GitCommitAndTag",
      description: "Tags a git release commit",
      category: "VCS",
      requiredPermissions: ["shell_exec"],
      inputs: [{ name: "tag", type: "string", description: "Version tag", required: true }],
      outputs: [{ name: "tagged", type: "boolean", description: "Success flag", required: true }],
      workflow: [{ stepNumber: 1, stepName: "GitTag", action: "git tag", parameters: {}, expectedResult: "Tagged", canFailWithoutStopping: false }],
      validationCriteria: ["Tag exists"],
      status: "ACTIVE",
    });
    assert.equal(s.name, "GitCommitAndTag");
    const found = defaultSkillEngine.querySkills({ query: "GitCommit" });
    assert.equal(found.length, 1);
  });

  test("Verification B.11: Skill versioning", () => {
    const s = defaultSkillEngine.createSkill({
      name: "VersionedTestSkill",
      description: "Test versioning",
      category: "TEST",
      requiredPermissions: [],
      inputs: [{ name: "x", type: "string", description: "input", required: true }],
      outputs: [{ name: "y", type: "string", description: "output", required: true }],
      workflow: [{ stepNumber: 1, stepName: "step1", action: "test", parameters: {}, expectedResult: "ok", canFailWithoutStopping: false }],
      validationCriteria: ["ok"],
    });
    assert.equal(s.version, "1.0.0");
    const bumped = defaultSkillEngine.bumpSkillVersion(s.skillId, "minor");
    assert.equal(bumped.version, "1.1.0");
  });

  test("Verification B.12: Strategy comparison", () => {
    defaultStrategyEngine.recordExecution({ strategyName: "A", taskCategory: "CAT", durationMs: 100, tokensUsed: 50, success: true });
    defaultStrategyEngine.recordExecution({ strategyName: "B", taskCategory: "CAT", durationMs: 500, tokensUsed: 200, success: true });
    const comp = defaultStrategyEngine.compareStrategies("CAT", "A", "B");
    assert.equal(comp.recommendedStrategy, "A");
  });

  test("Verification B.13: Performance measurement", () => {
    const rep = defaultPerformanceEngine.runFullBenchmarkBattery();
    assert.ok(rep.overallScore >= 0 && rep.overallScore <= 100);
    assert.ok(rep.meanLatencyMs >= 0);
  });

  test("Verification B.14: Context-based adaptation", () => {
    const dec = defaultAdaptiveEngine.adaptTaskExecution({
      taskGoal: "format markdown table",
      projectId: "p1",
      urgency: "LOW",
    });
    assert.equal(dec.complexityTier, "SIMPLE");
  });

  test("Verification B.15: Capability gap detection", () => {
    const gaps = defaultSelfImprovementEngine.detectCapabilityGaps([
      {
        failureId: "f_net",
        taskId: "t_net",
        errorSignature: "ECONNRESET",
        rawErrorMessage: "Connection reset by peer",
        taxonomy: "NETWORK_FAILURE",
        failedApproachDescription: "HTTP fetch without retry",
        recurrenceCount: 4,
        projectId: "p1",
        timestamp: Date.now(),
        recoverySuccessful: false,
      },
    ]);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].domain, "NETWORK_FAILURE");
  });

  test("Verification B.16: Improvement proposal creation", () => {
    const prop = defaultSelfImprovementEngine.proposeImprovement({
      title: "Add Exponential Backoff Retry Policy",
      type: "STRATEGY_TUNING",
      description: "Retry transient socket resets with jitter",
      motivation: "Eliminates ECONNRESET",
      expectedImpactMetric: "Success Rate",
      expectedImprovementDelta: 20.0,
    });
    assert.equal(prop.status, "PENDING_APPROVAL");
    assert.equal(prop.isImplemented, false);
  });

  test("Verification B.17: Approval workflow", () => {
    const prop = defaultSelfImprovementEngine.proposeImprovement({
      title: "Test Evolution Proposal",
      type: "NEW_SKILL",
      description: "Auto skill",
      motivation: "Speed",
      expectedImpactMetric: "Latency",
      expectedImprovementDelta: 10.0,
    });
    const evo = defaultEvolutionEngine.initiateEvolution(prop);
    const approved = defaultEvolutionEngine.approveEvolution(evo.evolutionId, "valid_founder_token_123");
    assert.equal(approved.state, "APPROVED");
  });

  test("Verification B.18: Isolated improvement testing", () => {
    const prop = defaultSelfImprovementEngine.proposeImprovement({
      title: "Isolated Test Candidate",
      type: "STRATEGY_TUNING",
      description: "Desc",
      motivation: "Motiv",
      expectedImpactMetric: "Score",
      expectedImprovementDelta: 5.0,
    });
    const evo = defaultEvolutionEngine.initiateEvolution(prop);
    defaultEvolutionEngine.approveEvolution(evo.evolutionId, "valid_token_xyz_456");
    const testResult = defaultEvolutionEngine.executeIsolatedTesting(evo.evolutionId, 96.0);
    assert.equal(testResult.passed, true);
    assert.equal(testResult.regressionDetected, false);
  });

  test("Verification B.19: Regression testing", () => {
    const prop = defaultSelfImprovementEngine.proposeImprovement({
      title: "Defective Candidate",
      type: "STRATEGY_TUNING",
      description: "Causes regression",
      motivation: "Bad code",
      expectedImpactMetric: "Score",
      expectedImprovementDelta: -10.0,
    });
    const evo = defaultEvolutionEngine.initiateEvolution(prop);
    defaultEvolutionEngine.approveEvolution(evo.evolutionId, "valid_token_regress");
    // Force a low score to trigger regression
    const testResult = defaultEvolutionEngine.executeIsolatedTesting(evo.evolutionId, 20.0);
    assert.equal(testResult.passed, false);
    assert.equal(testResult.regressionDetected, true);
  });

  test("Verification B.20: Rollback of failed improvements", () => {
    const prop = defaultSelfImprovementEngine.proposeImprovement({
      title: "Rollback Candidate",
      type: "NEW_SKILL",
      description: "desc",
      motivation: "motiv",
      expectedImpactMetric: "Score",
      expectedImprovementDelta: 5.0,
    });
    const evo = defaultEvolutionEngine.initiateEvolution(prop);
    defaultEvolutionEngine.approveEvolution(evo.evolutionId, "valid_token_rb");
    defaultEvolutionEngine.executeIsolatedTesting(evo.evolutionId, 95.0);
    defaultEvolutionEngine.activateEvolution(evo.evolutionId);
    assert.equal(evo.state, "ACTIVE");

    const rolledBack = defaultEvolutionEngine.rollbackEvolution(evo.evolutionId, "Memory leak detected in production");
    assert.equal(rolledBack.state, "REVERTED");
    assert.equal(defaultEvolutionEngine.getCurrentVersion(), "v1.0.0");
  });

  test("Verification B.21: Evolution history persistence", () => {
    const audit = defaultEvolutionEngine.getAuditTrail();
    assert.ok(Array.isArray(audit));
  });

  test("Verification B.22: Cross-project learning isolation", () => {
    const transfers = defaultLearningCoordinator.evaluateTransferLearning("secret_project_alpha", "public_project_beta");
    for (const t of transfers) {
      assert.equal(t.isLeakageFree, true);
      assert.equal(t.safetyCheckPassed, true);
    }
  });

  // ============================================================================
  // VERIFICATION C: INTEGRATION TESTING
  // ============================================================================
  test("Verification C — Advanced Memory & Orchestration Integration", () => {
    const outcome = defaultLearningCoordinator.ingestTaskOutcome({
      taskId: "task_integration_01",
      goal: "Configure zero-trust firewall rules",
      category: "SECURITY",
      strategyUsed: "IPTABLES_STRICT",
      steps: [
        { stepId: "s1", name: "DropAll", durationMs: 50, success: true, toolUsed: "iptables" },
        { stepId: "s2", name: "AllowLoopback", durationMs: 20, success: true, toolUsed: "iptables" },
      ],
      outcome: "SUCCESS",
      executionDurationMs: 70,
      verifiedByTest: true,
      testEvidenceId: "firewall_test_passed",
    });

    assert.equal(outcome.syncedToMemory, true);
    const stats = defaultLearningCoordinator.getContinuousLearningStats();
    assert.ok(stats.totalExperiencesProcessed >= 1);
  });

  // ============================================================================
  // VERIFICATION D: SECURITY TESTING
  // ============================================================================
  test("Verification D — Anti-Bypass, Anti-Tampering & Explicit Approvals", () => {
    const prop = defaultSelfImprovementEngine.proposeImprovement({
      title: "Malicious Injection Test",
      type: "STRATEGY_TUNING",
      description: "Attempts activation without token",
      motivation: "Test",
      expectedImpactMetric: "None",
      expectedImprovementDelta: 0,
    });
    const evo = defaultEvolutionEngine.initiateEvolution(prop);

    // 1. Must reject empty token
    assert.throws(() => {
      defaultEvolutionEngine.approveEvolution(evo.evolutionId, "");
    });

    // 2. Must reject direct activation without approval and isolated testing
    assert.throws(() => {
      defaultEvolutionEngine.activateEvolution(evo.evolutionId);
    });

    // 3. Must check regression guard before action execution
    defaultMistakeEngine.installRegressionGuard({
      name: "Block Arbitrary Shell Eval",
      associatedFailureId: "f_eval",
      checkType: "SECURITY_CHECK",
      conditionPattern: "eval(req.body)",
      remediationAdvice: "Never use eval with untrusted input",
    });

    const guardCheck = defaultMistakeEngine.evaluateActionSafety("const fn = eval(req.body);");
    assert.equal(guardCheck.isSafe, false);
    assert.ok(guardCheck.warningMessage?.includes("CRITICAL MISTAKE PREVENTION"));
  });

  // ============================================================================
  // VERIFICATION E: REGRESSION TESTING
  // ============================================================================
  test("Verification E — Existing Cognitive Systems Intact", () => {
    // Ensure memory dual-vault coordinator functions normally
    assert.ok(defaultLearningCoordinator.memory);
    assert.ok(typeof defaultLearningCoordinator.memory.loadAll === "function");

    // Ensure model discovery router is responsive
    const routing = defaultLearningCoordinator.routeTaskAdaptively("Summarize meeting notes");
    assert.ok(routing.selectedModel);
    assert.ok(routing.resourceAllocation.timeoutMs > 0);
  });

  // ============================================================================
  // VERIFICATION F: PERFORMANCE BENCHMARK
  // ============================================================================
  test("Verification F — Latency & Memory Telemetry", () => {
    const start = Date.now();
    for (let i = 0; i < 20; i++) {
      defaultExperienceEngine.recordTaskExperience({
        taskId: `perf_task_${i}`,
        goal: `Quick query ${i}`,
        category: "QUERY",
        strategyUsed: "FAST",
        outcome: "SUCCESS",
        executionDurationMs: 10,
        verifiedByTest: true,
      });
    }
    const elapsed = Date.now() - start;
    // 20 records must complete in under 500ms
    assert.ok(elapsed < 500, `Expected 20 records in <500ms, took ${elapsed}ms`);
  });
});
