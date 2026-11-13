/**
 * @file tests_learning_evolution_engine.test.mjs
 * @description Comprehensive Test Suite for the ULTRON Learning & Evolution Engine (Modules 01 - 10).
 *
 * Subsystem:
 * Learning & Evolution Engine (Master Feature Blueprint V1.0, Pages 71-79).
 *
 * Coverage:
 * - Module 01: Experience Learning Engine (Experience recording, anti-false completion, strategy comparison, lesson extraction)
 * - Module 02: Feedback Learning Engine (Polarity detection, explicit founder directives, preference adaptation, style profiling)
 * - Module 03: Mistake & Failure Learning Engine (Failure taxonomy, 5-Why root cause analysis, regression guards, recurring mistake prevention)
 * - Module 04: Knowledge Acquisition Engine (Document ingestion, provenance SHA-256, TTL expiration, validation evidence)
 * - Module 05: Skill Development Engine (Workflow identification, skill proposals, semver versioning, automated testing harness)
 * - Module 06: Strategy Optimization Engine (A/B comparison, latency & token deltas, workflow parallelization)
 * - Module 07: Performance Evaluation Engine (Objective benchmarks, non-reliance on self-confidence, category scoring, delta tracking)
 * - Module 08: Adaptive Intelligence Engine (Complexity tiers, host RAM-aware routing, non-weight-modifying adaptation)
 * - Module 09: Self-Improvement Engine (Capability gap detection, bottleneck analysis, structured proposals, proposal-before-change boundary)
 * - Module 10: Evolution Management Engine (5-stage pipeline, approval tokens, isolated testing, regression abort, instant rollback)
 * - Advanced Capabilities: Continuous learning, meta-learning, transfer learning with privacy fence, and evolution analytics.
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

test.describe("ULTRON LEARNING & EVOLUTION ENGINE — UNIT & FUNCTIONAL SUITE", () => {

  // Setup / Teardown
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
  // MODULE 01: EXPERIENCE LEARNING ENGINE
  // ============================================================================
  test("Module 01: Experience Learning — Anti-false completion & lesson extraction", () => {
    // 1. Task completed without test verification should NOT generate positive lesson
    const unverifiedExp = defaultExperienceEngine.recordTaskExperience({
      taskId: "task_unverified_01",
      goal: "Implement WebSocket telemetry endpoint",
      category: "ENGINEERING",
      strategyUsed: "FAST_DIRECT",
      outcome: "SUCCESS",
      executionDurationMs: 1200,
      verifiedByTest: false, // NOT verified
    });

    assert.equal(unverifiedExp.verifiedByTest, false);
    assert.equal(unverifiedExp.lessonsExtracted.length, 0, "Unverified task must not yield positive reusable lessons");

    // 2. Verified task with test evidence MUST generate verified lesson
    const verifiedExp = defaultExperienceEngine.recordTaskExperience({
      taskId: "task_verified_01",
      goal: "Build atomic file writer with checksum verification",
      category: "FILESYSTEM",
      strategyUsed: "ATOMIC_RENAME",
      outcome: "SUCCESS",
      executionDurationMs: 850,
      verifiedByTest: true,
      testEvidenceId: "test_run_9942",
    });

    assert.equal(verifiedExp.verifiedByTest, true);
    assert.equal(verifiedExp.lessonsExtracted.length, 1);
    const lessons = defaultExperienceEngine.listLessons();
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].verificationStatus, "VERIFIED");
    assert.ok(lessons[0].title.includes("ATOMIC_RENAME"));

    // 3. Recommendation engine should suggest verified strategy
    const rec = defaultExperienceEngine.getRecommendationForTask(
      "Write safe configuration file atomically",
      "FILESYSTEM"
    );
    assert.equal(rec.recommendedStrategy, "ATOMIC_RENAME");
    assert.ok(rec.confidence >= 0.7);
  });

  test("Module 01: Experience Learning — Strategy outcome comparison", () => {
    // Ingest sample data for two strategies
    for (let i = 0; i < 3; i++) {
      defaultExperienceEngine.recordTaskExperience({
        taskId: `task_a_${i}`,
        goal: `Process database batch ${i}`,
        category: "DATABASE",
        strategyUsed: "BATCH_TRANSACTION",
        outcome: "SUCCESS",
        executionDurationMs: 400,
        verifiedByTest: true,
      });
      defaultExperienceEngine.recordTaskExperience({
        taskId: `task_b_${i}`,
        goal: `Process database record ${i}`,
        category: "DATABASE",
        strategyUsed: "ROW_BY_ROW",
        outcome: i === 0 ? "SUCCESS" : "FAILURE",
        executionDurationMs: 1500,
        verifiedByTest: i === 0,
      });
    }

    const comparison = defaultExperienceEngine.compareOutcomes("BATCH_TRANSACTION", "ROW_BY_ROW", "DATABASE");
    assert.equal(comparison.recommended, "BATCH_TRANSACTION");
    assert.ok(comparison.strategyA.successRate > comparison.strategyB.successRate);
  });

  // ============================================================================
  // MODULE 02: FEEDBACK LEARNING ENGINE
  // ============================================================================
  test("Module 02: Feedback Learning — Explicit directives vs inferred preferences", () => {
    // 1. Ingest explicit founder directive
    const fb1 = defaultFeedbackEngine.ingestFeedback({
      rawText: "Always keep responses concise and avoid fluff",
    });

    assert.equal(fb1.isExplicitInstruction, true);
    assert.equal(fb1.priority, "CRITICAL");

    // Profile should adapt verbosity
    const profile = defaultFeedbackEngine.getCommunicationProfile();
    assert.equal(profile.verbosityLevel, "CONCISE");
    assert.ok(profile.customRules.includes("Always keep responses concise and avoid fluff"));

    // 2. Ingest response correction
    const fb2 = defaultFeedbackEngine.ingestFeedback({
      rawText: "That was wrong, use Postgres connection pool instead of opening new sockets",
      correctedResponse: "const pool = new Pool();",
      targetResponse: "new Client()",
    });

    assert.equal(fb2.polarity, "CORRECTION");
    const prefs = defaultFeedbackEngine.listPreferences();
    assert.ok(prefs.some((p) => p.isHardRule));

    // Steering guidelines should include both
    const steering = defaultFeedbackEngine.getSteeringPromptGuidelines();
    assert.ok(steering.some((s) => s.includes("Verbosity: CONCISE")));
    assert.ok(steering.some((s) => s.includes("FOUNDER DIRECTIVE")));
  });

  test("Module 02: Feedback Learning — Repeated pattern detection", () => {
    // Ingest 3 negative feedbacks on latency
    defaultFeedbackEngine.ingestFeedback({ rawText: "Tool execution was too slow", category: "LATENCY" });
    defaultFeedbackEngine.ingestFeedback({ rawText: "Latency is too high for this query", category: "LATENCY" });
    defaultFeedbackEngine.ingestFeedback({ rawText: "Took way too long to respond", category: "LATENCY" });

    const patterns = defaultFeedbackEngine.detectRepeatedFeedbackPatterns();
    assert.ok(patterns.length >= 1);
    assert.equal(patterns[0].category, "LATENCY");
    assert.equal(patterns[0].count, 3);
    assert.equal(patterns[0].isUrgent, true);
  });

  // ============================================================================
  // MODULE 03: MISTAKE & FAILURE LEARNING ENGINE
  // ============================================================================
  test("Module 03: Mistake Learning — 5-Why Analysis & Regression Guards", () => {
    // 1. Record a runtime exception
    const failRecord = defaultMistakeEngine.recordFailure({
      taskId: "task_fail_1",
      rawErrorMessage: "TypeError: Cannot read properties of undefined (reading 'token')",
      failedApproachDescription: "Directly reading headers.authorization.token without null check",
    });

    assert.equal(failRecord.taxonomy, "SCHEMA_MISMATCH");
    assert.ok(failRecord.rootCauseAnalysis);
    assert.ok(failRecord.rootCauseAnalysis.why1.includes("Symptom:"));
    assert.ok(failRecord.rootCauseAnalysis.why5.includes("Root Cause:"));

    // 2. Record second occurrence -> must install regression guard
    const failRecord2 = defaultMistakeEngine.recordFailure({
      taskId: "task_fail_2",
      rawErrorMessage: "TypeError: Cannot read properties of undefined (reading 'token')",
      failedApproachDescription: "Directly reading headers.authorization.token",
      recoveryApplied: "Add optional chaining: headers?.authorization?.token",
      recoverySuccessful: true,
    });

    assert.equal(failRecord2.recurrenceCount, 2);
    assert.ok(failRecord2.regressionGuardId, "Regression guard must be installed on repeated failure");

    // 3. Test Action Safety Check against installed guard
    const safetyCheck = defaultMistakeEngine.evaluateActionSafety("headers.authorization.token");
    assert.equal(safetyCheck.isSafe, false);
    assert.ok(safetyCheck.warningMessage?.includes("CRITICAL MISTAKE PREVENTION"));
    assert.ok(safetyCheck.recommendedFix?.includes("optional chaining"));

    // Verified recovery retrieval
    const recovery = defaultMistakeEngine.findVerifiedRecovery("TypeError: Cannot read properties of undefined (reading 'token')");
    assert.equal(recovery.found, true);
    assert.ok(recovery.recoveryApplied?.includes("optional chaining"));
  });

  // ============================================================================
  // MODULE 04: KNOWLEDGE ACQUISITION ENGINE
  // ============================================================================
  test("Module 04: Knowledge Acquisition — Provenance tracking & TTL expiration", () => {
    // 1. Ingest official technical documentation
    const item = defaultKnowledgeEngine.acquireKnowledge({
      topic: "Next.js 16 Server Components",
      summary: "Server Actions and async request cookies in Next.js 16",
      fullContent: "In Next.js 16, cookies() is strictly an asynchronous Promise that must be awaited.",
      sourceType: "OFFICIAL_API_SPEC",
      sourceUri: "https://nextjs.org/docs/app/api-reference/functions/cookies",
      timeToLiveSeconds: 1, // 1 second for instant TTL test
    });

    assert.equal(item.verificationStatus, "VERIFIED");
    assert.ok(item.provenance.contentSha256.length === 64);
    assert.ok(item.concepts.includes("cookies"));

    // Search knowledge
    const searchResults = defaultKnowledgeEngine.searchKnowledge("cookies async");
    assert.ok(searchResults.length >= 1);
    assert.equal(searchResults[0].knowledgeId, item.knowledgeId);

    // 2. Audit outdated knowledge after TTL
    item.lastValidatedAt = Date.now() - 5000; // artificially backdate
    const outdated = defaultKnowledgeEngine.auditOutdatedKnowledge();
    assert.ok(outdated.some((k) => k.knowledgeId === item.knowledgeId));
  });

  // ============================================================================
  // MODULE 05: SKILL DEVELOPMENT ENGINE
  // ============================================================================
  test("Module 05: Skill Development — Workflow synthesis, testing & versioning", () => {
    // 1. Create skill proposal
    const proposal = defaultSkillEngine.proposeNewSkill({
      name: "DockerComposeDeployment",
      description: "Automated compose file validation and container launch",
      category: "DEVOPS",
      motivation: "Observed 3 successful deployments",
      sourceExperienceIds: ["exp_1", "exp_2"],
      workflow: [
        { stepNumber: 1, stepName: "LintCompose", action: "docker-compose config", parameters: {}, expectedResult: "Valid YAML", canFailWithoutStopping: false },
        { stepNumber: 2, stepName: "LaunchServices", action: "docker-compose up -d", parameters: {}, expectedResult: "Containers started", canFailWithoutStopping: false },
      ],
      requiredPermissions: ["shell_exec"],
      inputs: [{ name: "composePath", type: "string", description: "Path to compose file", required: true }],
      outputs: [{ name: "containersRunning", type: "number", description: "Count of containers", required: true }],
      validationCriteria: ["Exit code 0", "Health check OK"],
      expectedImpact: "Saves 2 minutes per deployment",
    });

    assert.equal(proposal.status, "PENDING_APPROVAL");

    // 2. Approve proposal
    const skill = defaultSkillEngine.approveProposal(proposal.proposalId);
    assert.equal(skill.status, "ACTIVE");
    assert.equal(skill.version, "1.0.0");
    assert.ok(skill.documentationMarkdown.includes("# Skill: DockerComposeDeployment"));

    // 3. Test skill in harness
    const testRes = defaultSkillEngine.testSkill(skill.skillId);
    assert.equal(testRes.passed, true);

    // 4. Record execution & bump version
    defaultSkillEngine.recordExecution(skill.skillId, true, 420);
    assert.equal(skill.executionCount, 1);
    assert.equal(skill.successRate, 1.0);

    const bumped = defaultSkillEngine.bumpSkillVersion(skill.skillId, "minor");
    assert.equal(bumped.version, "1.1.0");
  });

  // ============================================================================
  // MODULE 06: STRATEGY OPTIMIZATION ENGINE
  // ============================================================================
  test("Module 06: Strategy Optimization — Empirical A/B testing & workflow parallelization", () => {
    // Record metrics for Strategy 1: Sequential
    defaultStrategyEngine.recordExecution({
      strategyName: "SEQUENTIAL_BUILD",
      taskCategory: "BUILD",
      durationMs: 12000,
      tokensUsed: 4000,
      success: true,
    });

    // Record metrics for Strategy 2: Parallel
    defaultStrategyEngine.recordExecution({
      strategyName: "PARALLEL_BUILD",
      taskCategory: "BUILD",
      durationMs: 4000,
      tokensUsed: 2500,
      success: true,
    });

    const comp = defaultStrategyEngine.compareStrategies("BUILD", "PARALLEL_BUILD", "SEQUENTIAL_BUILD");
    assert.equal(comp.recommendedStrategy, "PARALLEL_BUILD");
    assert.ok(comp.latencyDeltaPercent < -50, "Parallel build must show significant speedup");

    // Test workflow parallelization analysis
    const workflowOpt = defaultStrategyEngine.optimizeWorkflow([
      { name: "LintCSS", tool: "stylelint" },
      { name: "LintTS", tool: "eslint" },
      { name: "UnitTests", tool: "vitest", dependsOn: ["LintTS"] },
    ]);

    assert.equal(workflowOpt.originalStepCount, 3);
    assert.equal(workflowOpt.parallelGroups[0].length, 2, "Independent linting steps should be grouped in parallel");
    assert.ok(workflowOpt.estimatedLatencySavingsPercent > 0);
  });

  // ============================================================================
  // MODULE 07: PERFORMANCE EVALUATION ENGINE
  // ============================================================================
  test("Module 07: Performance Evaluation — Ground-truth benchmark battery", () => {
    const report = defaultPerformanceEngine.runFullBenchmarkBattery();

    assert.ok(report.overallScore > 0 && report.overallScore <= 100);
    assert.equal(report.benchmarkResults.length, 5);
    assert.equal(report.taskSuccessRate, 1.0);
    assert.ok(report.meanLatencyMs > 0);

    // Test deterministic rejection when ground-truth keywords are missing
    const tc = report.benchmarkResults[0];
    const failingResult = defaultPerformanceEngine.evaluateTestCase(
      {
        testId: "fail_test",
        name: "Keyword check",
        category: "SAFETY",
        inputPrompt: "Test",
        expectedKeywords: ["mandatory_security_token"],
        maxAllowedLatencyMs: 500,
        passCriteria: "Must pass",
      },
      "Output completely missing token",
      200
    );

    assert.equal(failingResult.passed, false);
    assert.ok(failingResult.score < 1.0);
  });

  // ============================================================================
  // MODULE 08: ADAPTIVE INTELLIGENCE ENGINE
  // ============================================================================
  test("Module 08: Adaptive Intelligence — Resource and complexity routing", () => {
    // 1. Simple task goal
    const simpleDec = defaultAdaptiveEngine.adaptTaskExecution({
      taskGoal: "check node version",
      projectId: "proj_1",
      urgency: "NORMAL",
      hostResourceState: { freeMemoryMb: 4096, cpuLoadPercent: 10 },
    });

    assert.equal(simpleDec.complexityTier, "SIMPLE");
    assert.equal(simpleDec.recommendedWorkflowType, "SPECULATIVE_FAST_PATH");
    assert.equal(simpleDec.selectedModel, "qwen2.5:0.5b");

    // 2. Highly complex task goal
    const complexDec = defaultAdaptiveEngine.adaptTaskExecution({
      taskGoal: "Architect a zero-downtime distributed consensus database migration across regions",
      projectId: "proj_1",
      urgency: "CRITICAL",
      hostResourceState: { freeMemoryMb: 4096, cpuLoadPercent: 10 },
    });

    assert.equal(complexDec.complexityTier, "HIGHLY_COMPLEX");
    assert.equal(complexDec.resourceAllocation.enableDeepVerification, true);
    assert.equal(complexDec.selectedModel, "qwen2.5:7b-instruct");
  });

  // ============================================================================
  // MODULE 09: SELF-IMPROVEMENT ENGINE
  // ============================================================================
  test("Module 09: Self-Improvement — Capability gap detection & proposals", () => {
    // Feed recurring failures to trigger capability gap
    const failures = [
      {
        failureId: "f1",
        taskId: "t1",
        errorSignature: "TIMEOUT",
        rawErrorMessage: "Operation timed out",
        taxonomy: "TIMEOUT_EXCEEDED",
        failedApproachDescription: "Slow synchronous query",
        recurrenceCount: 3,
        projectId: "p1",
        timestamp: Date.now(),
        recoverySuccessful: false,
      },
    ];

    const gaps = defaultSelfImprovementEngine.detectCapabilityGaps(failures);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].domain, "TIMEOUT_EXCEEDED");
    assert.equal(gaps[0].severity, "HIGH");

    // Propose improvement
    const proposal = defaultSelfImprovementEngine.proposeImprovement({
      title: "Query Streaming & Connection Pooling",
      type: "STRATEGY_TUNING",
      description: "Replace blocking queries with streaming pagination",
      motivation: "Eliminates TIMEOUT_EXCEEDED errors",
      expectedImpactMetric: "Latency",
      expectedImprovementDelta: 45.0,
      supportingEvidenceIds: ["f1"],
    });

    assert.equal(proposal.status, "PENDING_APPROVAL");
    assert.equal(proposal.isImplemented, false);
  });

  // ============================================================================
  // MODULE 10: EVOLUTION MANAGEMENT ENGINE
  // ============================================================================
  test("Module 10: Evolution Management — 5-stage pipeline & rollback support", () => {
    // 1. Initiate Evolution
    const proposal = defaultSelfImprovementEngine.proposeImprovement({
      title: "Introduce In-Memory Cache Layer",
      type: "PERFORMANCE_CACHE",
      description: "Cache frequent read operations",
      motivation: "Speed up benchmark score",
      expectedImpactMetric: "Overall Score",
      expectedImprovementDelta: 5.0,
    });

    const evo = defaultEvolutionEngine.initiateEvolution(proposal);
    assert.equal(evo.state, "PROPOSED");
    assert.equal(evo.capabilityVersion, "v1.1.0");

    // 2. Reject unauthenticated approval
    assert.throws(() => {
      defaultEvolutionEngine.approveEvolution(evo.evolutionId, ""); // invalid token
    });

    // 3. Valid Founder Approval
    const approved = defaultEvolutionEngine.approveEvolution(evo.evolutionId, "sec_grant_token_9999");
    assert.equal(approved.state, "APPROVED");

    // 4. Isolated Testing
    const testOutcome = defaultEvolutionEngine.executeIsolatedTesting(evo.evolutionId, 95.0);
    assert.equal(testOutcome.passed, true);
    assert.equal(approved.regressionTestPassed, true);

    // 5. Activation
    const active = defaultEvolutionEngine.activateEvolution(evo.evolutionId);
    assert.equal(active.state, "ACTIVE");
    assert.equal(defaultEvolutionEngine.getCurrentVersion(), "v1.1.0");

    // 6. Instant Rollback
    const rolledBack = defaultEvolutionEngine.rollbackEvolution(evo.evolutionId, "Unexpected cache invalidation bug");
    assert.equal(rolledBack.state, "REVERTED");
    assert.equal(defaultEvolutionEngine.getCurrentVersion(), "v1.0.0", "Must restore prior version upon rollback");

    // Audit log verification
    const auditTrail = defaultEvolutionEngine.getAuditTrail();
    assert.ok(auditTrail.some((a) => a.action === "ROLLBACK"));
    assert.ok(auditTrail.some((a) => a.action === "ACTIVATE"));
  });

  // ============================================================================
  // ADVANCED CAPABILITIES INTEGRATION
  // ============================================================================
  test("Advanced Capabilities: Continuous Learning & Memory Sync", () => {
    const res = defaultLearningCoordinator.ingestTaskOutcome({
      taskId: "task_e2e_01",
      goal: "Automate SSL cert rotation",
      category: "SECURITY",
      strategyUsed: "ACME_LETSENCRYPT",
      steps: [
        { stepId: "s1", name: "GenerateCSR", durationMs: 150, success: true, toolUsed: "openssl" },
        { stepId: "s2", name: "VerifyDNS", durationMs: 400, success: true, toolUsed: "dns_lookup" },
      ],
      outcome: "SUCCESS",
      executionDurationMs: 550,
      verifiedByTest: true,
      testEvidenceId: "cert_sha_verified",
    });

    assert.ok(res.experienceId);
    assert.ok(res.lessonsExtracted >= 1);
    assert.equal(res.syncedToMemory, true, "Verified lesson must be synced into Cognitive Memory Vault");

    // Continuous stats
    const stats = defaultLearningCoordinator.getContinuousLearningStats();
    assert.equal(stats.totalExperiencesProcessed, 1);
    assert.equal(stats.verifiedLessonsCount, 1);

    // Transfer learning with secret redaction
    const transfers = defaultLearningCoordinator.evaluateTransferLearning("proj_source", "proj_target");
    assert.ok(transfers.length >= 1);
    assert.equal(transfers[0].safetyCheckPassed, true);
    assert.equal(transfers[0].isLeakageFree, true);

    // Evolution analytics
    const analytics = defaultLearningCoordinator.getEvolutionAnalytics();
    assert.ok(analytics.regressionPreventionRate >= 0);
  });
});
