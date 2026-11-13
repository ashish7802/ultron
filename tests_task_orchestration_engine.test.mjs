/**
 * @file tests_task_orchestration_engine.test.mjs
 * @description Comprehensive Test Suite & Independent Final Verification Batch for ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine (Blueprint Section 7) — Independent Final Verification.
 *
 * Covers All 14 Verification Batches (A through N):
 * - Verification A: Goal Understanding Engine
 * - Verification B: Intelligent Task Decomposition
 * - Verification C: Dependency Management Engine
 * - Verification D: Priority & Execution Planning
 * - Verification E: Workflow Management Engine
 * - Verification F: Parallel Task Coordination
 * - Verification G: Progress Tracking Engine
 * - Verification H: Failure & Retry Management
 * - Verification I: Task Verification Engine (Evidence & Zero False Completion)
 * - Verification J: Persistence, Checkpointing & Application Restart
 * - Verification K: Resource & Execution Management
 * - Verification L: Human Approval Coordination & Anti-Tampering
 * - Verification M: Task Reporting & Summary
 * - Verification N: End-to-End Real World Integration Scenarios (1 to 6)
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  understandGoal,
  decomposeGoal,
  defaultDependencyManagementEngine,
  defaultPriorityEngine,
  defaultExecutionPlanningEngine,
  defaultWorkflowManagementEngine,
  defaultParallelCoordinationEngine,
  defaultProgressTrackingEngine,
  defaultFailureRetryEngine,
  defaultTaskVerificationEngine,
  defaultPersistentStateEngine,
  defaultResourceManagementEngine,
  defaultHumanApprovalCoordinator,
  defaultTaskReportingEngine,
  defaultTaskOrchestrationEngine,
} from "./lib/orchestration/index.ts";

test.describe("ULTRON TASK ORCHESTRATION ENGINE — INDEPENDENT FINAL VERIFICATION", () => {

  // ============================================================================
  // VERIFICATION A: GOAL UNDERSTANDING ENGINE
  // ============================================================================
  test("Verification A — Goal Understanding: Clear, Ambiguous, Constraints & Success Criteria", () => {
    // 1. Clear Goal
    const clearPrompt = `Build and deploy a real-time WebSocket telemetry engine for host monitoring.
* Deliverable: WebSocket streaming server module
* Deliverable: Automated integration test suite
Must be local only with zero cloud API costs.`;

    const clearGoal = understandGoal(clearPrompt);
    assert.strictEqual(clearGoal.category, "ENGINEERING");
    assert.strictEqual(clearGoal.clarity, "HIGH");
    assert.strictEqual(clearGoal.requiresClarification, false);
    assert.ok(clearGoal.expectedOutcomes.length >= 2, "Expected at least 2 extracted outcomes");
    assert.ok(clearGoal.constraints.some((c) => c.type === "RESOURCE"), "Should identify resource constraint");
    assert.ok(clearGoal.successCriteria.length >= 2, "Should formulate quantitative success criteria");

    // 2. Ambiguous Goal
    const ambiguousPrompt = "fix it";
    const ambGoal = understandGoal(ambiguousPrompt);
    assert.ok(ambGoal.clarity === "AMBIGUOUS" || ambGoal.clarity === "INCOMPLETE");
    assert.strictEqual(ambGoal.requiresClarification, true);
    assert.ok(ambGoal.clarificationQuestions.length > 0, "Should generate clarification questions");

    // 3. Scope & Exclusion Identification
    const scopedPrompt = "Implement user authentication strictly excluding biometric modules and do not touch payment APIs.";
    const scopedGoal = understandGoal(scopedPrompt);
    assert.ok(scopedGoal.outOfScope.some((s) => s.toLowerCase().includes("biometric") || s.toLowerCase().includes("payment")));
  });

  // ============================================================================
  // VERIFICATION B: TASK DECOMPOSITION ENGINE
  // ============================================================================
  test("Verification B — Task Decomposition: Breakdown, Hierarchy, Milestones & Acceptance Criteria", () => {
    const goal = understandGoal("Implement distributed caching layer and run performance benchmarks");
    const result = decomposeGoal(goal, "wf_test_decomp_001");

    assert.ok(result.rootTaskIds.length > 0, "Should generate root task pointer");
    const rootTask = result.tasks[result.rootTaskIds[0]];
    assert.ok(rootTask, "Root task should exist");
    assert.ok(rootTask.subtaskIds.length >= 3, "Root task should possess decomposed child subtasks");

    // Verify Milestones
    assert.strictEqual(result.milestones.length, 3, "Must generate 3 lifecycle milestones");
    assert.ok(result.milestones[0].taskIds.length > 0, "Preparation milestone should have tasks");
    assert.ok(result.milestones[1].taskIds.length > 0, "Execution milestone should have tasks");
    assert.ok(result.milestones[2].taskIds.length > 0, "Verification milestone should have tasks");

    // Verify Leaf Task Acceptance Criteria & Complexity
    for (const subId of rootTask.subtaskIds) {
      const sub = result.tasks[subId];
      assert.ok(sub.complexity >= 1 && sub.complexity <= 10, "Complexity must be between 1 and 10");
      assert.ok(sub.acceptanceCriteria.length > 0, "Every decomposed subtask must have acceptance criteria");
      assert.ok(sub.estimatedDurationMs > 0, "Task must have estimated duration");
    }
  });

  // ============================================================================
  // VERIFICATION C: DEPENDENCY MANAGEMENT ENGINE
  // ============================================================================
  test("Verification C — Dependency Management: DAG, Cycles, Critical Path & Eligibility", () => {
    const tasks = {
      task_A: { id: "task_A", dependencies: [], estimatedDurationMs: 2000, status: "COMPLETED" },
      task_B: { id: "task_B", dependencies: ["task_A"], estimatedDurationMs: 5000, status: "READY" },
      task_C: { id: "task_C", dependencies: ["task_A"], estimatedDurationMs: 3000, status: "READY" },
      task_D: { id: "task_D", dependencies: ["task_B", "task_C"], estimatedDurationMs: 4000, status: "PENDING" },
    };

    // 1. Graph Validation & Critical Path
    const validation = defaultDependencyManagementEngine.validateGraph(tasks);
    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.hasCycles, false);
    assert.deepStrictEqual(validation.topologicalOrder[0], "task_A");
    assert.ok(validation.criticalPath.includes("task_B"), "Critical path should follow longer duration branch A->B->D");
    assert.deepStrictEqual(validation.criticalPath, ["task_A", "task_B", "task_D"]);

    // 2. Execution Eligibility Checking
    const checkB = defaultDependencyManagementEngine.canExecute("task_B", tasks);
    assert.strictEqual(checkB.eligible, true, "Task B is eligible since prerequisite Task A is COMPLETED");

    const checkD = defaultDependencyManagementEngine.canExecute("task_D", tasks);
    assert.strictEqual(checkD.eligible, false, "Task D is NOT eligible because Task B and Task C are not completed");
    assert.ok(checkD.blockingTaskIds.includes("task_B"));
    assert.ok(checkD.blockingTaskIds.includes("task_C"));

    // 3. Circular Dependency Detection & Rejection
    const cyclicTasks = {
      t1: { id: "t1", dependencies: ["t2"], estimatedDurationMs: 1000, status: "PENDING" },
      t2: { id: "t2", dependencies: ["t3"], estimatedDurationMs: 1000, status: "PENDING" },
      t3: { id: "t3", dependencies: ["t1"], estimatedDurationMs: 1000, status: "PENDING" },
    };

    const cyclicValidation = defaultDependencyManagementEngine.validateGraph(cyclicTasks);
    assert.strictEqual(cyclicValidation.isValid, false);
    assert.strictEqual(cyclicValidation.hasCycles, true);
    assert.ok(cyclicValidation.cycleNodes.length >= 3);

    // 4. Dynamic Dependency Modification with Cycle Prevention
    const addResult = defaultDependencyManagementEngine.addDependency(tasks, "task_A", "task_D");
    assert.strictEqual(addResult.success, false, "Adding reverse dependency creating cycle must be rejected");
  });

  // ============================================================================
  // VERIFICATION D: PRIORITY & EXECUTION PLANNING
  // ============================================================================
  test("Verification D — Priority & Execution Planning: Scoring, Deadlines, Waves & Alternatives", () => {
    const goal = understandGoal("Implement encrypted credential store with backup restore");
    const decomp = decomposeGoal(goal, "wf_plan_test");
    const depVal = defaultDependencyManagementEngine.validateGraph(decomp.tasks);

    // 1. Priority Calculation with Critical Path Boost
    const priorities = defaultPriorityEngine.calculatePriorities(decomp.tasks, {
      criticalPathTaskIds: depVal.criticalPath,
      founderOverrides: { [depVal.criticalPath[0]]: 95 },
    });

    const cpTaskScore = priorities[depVal.criticalPath[0]];
    assert.ok(cpTaskScore, "Critical path task must have score");
    assert.strictEqual(cpTaskScore.totalScore, 95, "Founder override must be respected");
    assert.strictEqual(cpTaskScore.level, "CRITICAL");

    // 2. Execution Plan Synthesis & Waves
    const plan = defaultExecutionPlanningEngine.generatePlan(goal, decomp.tasks, depVal, priorities);
    assert.strictEqual(plan.preExecutionValidationPassed, true);
    assert.ok(plan.waves.length >= 2, "Tasks should be partitioned into at least 2 execution waves");
    assert.ok(plan.steps.length === Object.keys(decomp.tasks).length);
    assert.ok(plan.totalEstimatedTimeMs > 0);
    assert.ok(plan.totalEstimatedTokens > 0);
  });

  // ============================================================================
  // VERIFICATION E: WORKFLOW MANAGEMENT ENGINE
  // ============================================================================
  test("Verification E — Workflow Management: State Transitions, Resumption & Cancellation", () => {
    const goal = understandGoal("Setup local redis-compatible embedded cache");
    const decomp = decomposeGoal(goal, "wf_state_test");
    const wf = defaultWorkflowManagementEngine.createWorkflow(goal, decomp.tasks, decomp.milestones);

    assert.strictEqual(wf.state, "CREATED");

    // Valid state transitions: CREATED -> PLANNING -> RUNNING -> PAUSED -> RUNNING
    const planningWf = defaultWorkflowManagementEngine.transitionState(wf, "PLANNING");
    assert.strictEqual(planningWf.state, "PLANNING");

    const runningWf = defaultWorkflowManagementEngine.transitionState(planningWf, "RUNNING");
    assert.strictEqual(runningWf.state, "RUNNING");
    assert.ok(runningWf.startedAt, "StartedAt should be stamped");

    const pausedWf = defaultWorkflowManagementEngine.transitionState(runningWf, "PAUSED");
    assert.strictEqual(pausedWf.state, "PAUSED");

    const resumedWf = defaultWorkflowManagementEngine.resumeWorkflow(pausedWf);
    assert.strictEqual(resumedWf.state, "RUNNING");

    // Invalid transition: CANCELLED -> RUNNING must throw
    const cancelledWf = defaultWorkflowManagementEngine.cancelWorkflow(resumedWf, "Founder aborted");
    assert.strictEqual(cancelledWf.state, "CANCELLED");

    assert.throws(
      () => defaultWorkflowManagementEngine.transitionState(cancelledWf, "RUNNING"),
      /Invalid workflow state transition/
    );
  });

  // ============================================================================
  // VERIFICATION F: PARALLEL TASK COORDINATION
  // ============================================================================
  test("Verification F — Parallel Task Coordination: Concurrency, Locks & Barrier Join", async () => {
    const parallelTasks = [
      {
        id: "p_task_1",
        workflowId: "wf_parallel",
        title: "Generate Database Schema",
        deliverables: ["schema.sql"],
        dependencies: [],
        complexity: 3,
        estimatedDurationMs: 100,
        requiredTools: ["system"],
        requiresApproval: false,
        riskLevel: "low",
        retryCount: 0,
        maxRetries: 1,
        createdAt: Date.now(),
        status: "READY",
      },
      {
        id: "p_task_2",
        workflowId: "wf_parallel",
        title: "Generate Frontend API Client",
        deliverables: ["apiClient.ts"],
        dependencies: [],
        complexity: 3,
        estimatedDurationMs: 100,
        requiredTools: ["system"],
        requiresApproval: false,
        riskLevel: "low",
        retryCount: 0,
        maxRetries: 1,
        createdAt: Date.now(),
        status: "READY",
      },
    ];

    // 1. Resource Lock Acquisition & Mutex Test
    const locked1 = defaultParallelCoordinationEngine.acquireResourceLock("res_db_file", "p_task_1");
    assert.strictEqual(locked1, true);

    const locked2 = defaultParallelCoordinationEngine.acquireResourceLock("res_db_file", "p_task_2");
    assert.strictEqual(locked2, false, "Second task cannot acquire already held exclusive resource lock");

    defaultParallelCoordinationEngine.releaseResourceLock("res_db_file", "p_task_1");
    const locked3 = defaultParallelCoordinationEngine.acquireResourceLock("res_db_file", "p_task_2");
    assert.strictEqual(locked3, true, "Can acquire lock once released");
    defaultParallelCoordinationEngine.releaseResourceLock("res_db_file", "p_task_2");

    // 2. Wave Execution with Barrier Join
    const waveRes = await defaultParallelCoordinationEngine.executeWave(
      parallelTasks,
      0,
      async (task) => {
        return { generated: true, taskId: task.id };
      }
    );

    assert.strictEqual(waveRes.successfulTasks.length, 2);
    assert.strictEqual(waveRes.failedTasks.length, 0);
    assert.ok(waveRes.aggregatedOutputs["p_task_1"]);
    assert.ok(waveRes.aggregatedOutputs["p_task_2"]);
  });

  // ============================================================================
  // VERIFICATION G: PROGRESS TRACKING ENGINE
  // ============================================================================
  test("Verification G — Progress Tracking: Status Aggregation, Milestones & Percentage", () => {
    const goal = understandGoal("Build and audit security dashboard");
    const decomp = decomposeGoal(goal, "wf_prog_test");
    const wf = defaultWorkflowManagementEngine.createWorkflow(goal, decomp.tasks, decomp.milestones);

    // Initial Progress (0%)
    const p1 = defaultProgressTrackingEngine.getProgressReport(wf);
    assert.strictEqual(p1.overallPercentage, 0);
    assert.strictEqual(p1.verifiedCount, 0);

    // Mark one task VERIFIED
    const firstTaskId = Object.keys(wf.tasks)[0];
    wf.tasks[firstTaskId].status = "VERIFIED";

    const p2 = defaultProgressTrackingEngine.getProgressReport(wf);
    assert.ok(p2.overallPercentage > 0, "Progress percentage should increase");
    assert.strictEqual(p2.verifiedCount, 1);
  });

  // ============================================================================
  // VERIFICATION H: FAILURE & RETRY MANAGEMENT
  // ============================================================================
  test("Verification H — Failure & Retry: Classification, Exponential Backoff & Cascade", () => {
    const task = {
      id: "f_task_1",
      workflowId: "wf_fail_test",
      title: "Fetch External API Feed",
      complexity: 3,
      status: "RUNNING",
      dependencies: [],
      deliverables: [],
      acceptanceCriteria: [],
      requiredTools: ["system"],
      requiresApproval: false,
      riskLevel: "low",
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
    };

    // 1. Transient Network Error -> Should Retry with Backoff
    const inc1 = defaultFailureRetryEngine.handleFailure(task, new Error("fetch failed: socket hang up"));
    assert.strictEqual(inc1.classification, "TRANSIENT_NETWORK");
    assert.strictEqual(inc1.willRetry, true);
    assert.ok(inc1.nextRetryDelayMs > 0);

    // 2. Fatal Security Error -> Non-retryable
    const incFatal = defaultFailureRetryEngine.handleFailure(
      task,
      new Error("Security violation: Permission denied by gateway")
    );
    assert.strictEqual(incFatal.classification, "PERMISSION_DENIED");
    assert.strictEqual(incFatal.willRetry, false);
    assert.strictEqual(incFatal.escalatedToFounder, true);

    // 3. Cascade Failure to Downstream Tasks
    const wf = {
      tasks: {
        f_task_1: task,
        downstream_task: { id: "downstream_task", dependencies: ["f_task_1"], status: "PENDING" },
      },
    };
    const affected = defaultFailureRetryEngine.cascadeFailure(wf, "f_task_1");
    assert.ok(affected.includes("downstream_task"));
    assert.strictEqual(wf.tasks.downstream_task.status, "BLOCKED");
  });

  // ============================================================================
  // VERIFICATION I: TASK VERIFICATION ENGINE (ZERO FALSE COMPLETIONS)
  // ============================================================================
  test("Verification I — Task Verification: Acceptance Criteria, Cryptographic Evidence & Anti-False-Completion", () => {
    const task = {
      id: "v_task_1",
      workflowId: "wf_verif_test",
      title: "Compile Core Library",
      complexity: 4,
      status: "COMPLETED",
      dependencies: [],
      deliverables: ["package.json"], // Existing real deliverable
      acceptanceCriteria: [
        {
          id: "c1",
          description: "Process exit code must equal 0",
          evaluator: "EXIT_CODE",
          expectedValue: 0,
        },
        {
          id: "c2",
          description: "Deliverable package.json must exist and be non-empty",
          evaluator: "FILE_NON_EMPTY",
        },
      ],
      requiredTools: ["system"],
      requiresApproval: false,
      riskLevel: "low",
      retryCount: 0,
      maxRetries: 1,
      createdAt: Date.now(),
    };

    // 1. Successful Verification
    const resSuccess = defaultTaskVerificationEngine.verifyTask(task, { exitCode: 0 });
    assert.strictEqual(resSuccess.isVerified, true);
    assert.strictEqual(task.status, "VERIFIED");
    assert.ok(resSuccess.evidence.evidenceHash.length === 64, "Evidence hash must be valid SHA-256");
    assert.strictEqual(resSuccess.passedCount, 2);

    // 2. Failed Verification (Exit code mismatch) -> MUST REVERT STATUS TO FAILED
    const failingTask = {
      ...task,
      id: "v_task_fail",
      status: "COMPLETED",
      acceptanceCriteria: [
        {
          id: "c_fail",
          description: "Must return exit code 0",
          evaluator: "EXIT_CODE",
          expectedValue: 0,
        },
      ],
    };

    const resFail = defaultTaskVerificationEngine.verifyTask(failingTask, { exitCode: 1 });
    assert.strictEqual(resFail.isVerified, false);
    assert.strictEqual(failingTask.status, "FAILED", "Execution alone must not pass verification if criteria fail");
    assert.ok(resFail.failureReasons.length > 0);
  });

  // ============================================================================
  // VERIFICATION J: PERSISTENCE, RESTART & IDEMPOTENCY
  // ============================================================================
  test("Verification J — Persistence & Restart: Checkpointing, Idempotency & Recovery", () => {
    const goal = understandGoal("Persistent state recovery test");
    const decomp = decomposeGoal(goal, "wf_persist_test");
    const wf = defaultWorkflowManagementEngine.createWorkflow(goal, decomp.tasks, decomp.milestones);

    // 1. Persistence & Checkpointing
    const checkpoint = defaultPersistentStateEngine.createCheckpoint(wf);
    assert.ok(checkpoint.checkpointId);
    assert.strictEqual(checkpoint.version, wf.version);

    // 2. Reload Workflow from Disk (Simulated Process Restart)
    const reloaded = defaultPersistentStateEngine.getWorkflow(wf.id);
    assert.ok(reloaded);
    assert.strictEqual(reloaded.id, wf.id);
    assert.strictEqual(reloaded.goal.title, wf.goal.title);

    // 3. Idempotency Protection
    const firstTaskId = Object.keys(wf.tasks)[0];
    wf.completedTaskIds.push(firstTaskId);
    defaultPersistentStateEngine.saveWorkflow(wf);

    assert.strictEqual(
      defaultPersistentStateEngine.isTaskExecuted(wf.id, firstTaskId),
      true,
      "Duplicate execution must be prevented"
    );

    // 4. Interrupted Workflow Discovery
    wf.state = "RUNNING";
    const runTask = wf.tasks[firstTaskId];
    runTask.status = "RUNNING";
    defaultPersistentStateEngine.saveWorkflow(wf);

    const recoverable = defaultPersistentStateEngine.recoverInterruptedWorkflows();
    assert.ok(recoverable.some((r) => r.workflow.id === wf.id));
  });

  // ============================================================================
  // VERIFICATION K: RESOURCE & EXECUTION MANAGEMENT
  // ============================================================================
  test("Verification K — Resource Management: Tool Availability, Model Selection & Timeouts", async () => {
    // 1. Tool Availability
    const taskValid = {
      id: "t_tool",
      requiredTools: ["system", "file_writer"],
    };
    const checkValid = defaultResourceManagementEngine.checkToolAvailability(taskValid);
    assert.strictEqual(checkValid.available, true);

    const taskMissing = {
      id: "t_tool_missing",
      requiredTools: ["uninstalled_exotic_compiler_xyz"],
    };
    const checkMissing = defaultResourceManagementEngine.checkToolAvailability(taskMissing);
    assert.strictEqual(checkMissing.available, false);
    assert.ok(checkMissing.missingTools.includes("uninstalled_exotic_compiler_xyz"));

    // 2. Model Selection by Complexity
    const mLow = defaultResourceManagementEngine.selectModelForTask(2);
    assert.strictEqual(mLow.tier, "FAST_LOCAL");

    const mHigh = defaultResourceManagementEngine.selectModelForTask(9);
    assert.strictEqual(mHigh.tier, "DEEP_REASONING");

    // 3. Timeout Handling
    const hangingTask = {
      id: "t_hang",
      estimatedDurationMs: 50,
    };
    await assert.rejects(
      async () => {
        await defaultResourceManagementEngine.executeWithTimeout(
          hangingTask,
          () => new Promise((resolve) => setTimeout(resolve, 500)),
          100 // 100ms timeout
        );
      },
      /timed out/
    );
  });

  // ============================================================================
  // VERIFICATION L: HUMAN APPROVAL COORDINATION & ANTI-TAMPERING
  // ============================================================================
  test("Verification L — Human Approval: Gating, Grant Tokens, Rejection & Anti-Tampering", async () => {
    const sensitiveTask = {
      id: "sec_task_1",
      workflowId: "wf_sec_approval",
      title: "Write System Configuration",
      description: "Write updated config to disk",
      actionType: "file_write",
      actionPayload: { target: "system.config", buffer: "mode=production" },
      complexity: 6,
      status: "PENDING",
      dependencies: [],
      deliverables: ["system.config"],
      acceptanceCriteria: [],
      requiredTools: ["file_writer"],
      requiresApproval: true,
      riskLevel: "high",
      riskExplanation: "Modifies persistent host system configuration.",
      retryCount: 0,
      maxRetries: 1,
      createdAt: Date.now(),
    };

    // 1. Detect Approval Requirement
    assert.strictEqual(defaultHumanApprovalCoordinator.requiresApproval(sensitiveTask), true);

    // 2. Request Approval via Gateway
    const approvalReq = await defaultHumanApprovalCoordinator.requestApproval(sensitiveTask);
    assert.strictEqual(approvalReq.status, "PENDING");
    assert.ok(approvalReq.planId);
    assert.ok(approvalReq.approvalToken);
    assert.strictEqual(sensitiveTask.status, "AWAITING_APPROVAL");

    // 3. Parameter Anti-Tampering Check
    const validParams = { target: "system.config", buffer: "mode=production" };
    const matchesOriginal = defaultHumanApprovalCoordinator.verifyParameterIntegrity(sensitiveTask, validParams);
    assert.strictEqual(matchesOriginal, true);

    const tamperedParams = { target: "system.config", buffer: "mode=MALICIOUS_INJECTION" };
    const tamperedMatches = defaultHumanApprovalCoordinator.verifyParameterIntegrity(sensitiveTask, tamperedParams);
    assert.strictEqual(tamperedMatches, false, "Modified parameters must fail integrity verification");

    // 4. Resolve Approval: Rejection Flow with authentic founder session token
    const { createAuthenticatedSession, FOUNDER_IDENTITY } = await import("./lib/security/identityEngine.ts");
    const testSession = createAuthenticatedSession("founder", FOUNDER_IDENTITY.userId);
    const rejectedReq = await defaultHumanApprovalCoordinator.resolveApproval(
      approvalReq.requestId,
      false,
      testSession.sessionToken,
      "founder",
      "Founder denied modification"
    );
    assert.strictEqual(rejectedReq.status, "REJECTED");
    assert.strictEqual(rejectedReq.executionGrantToken, null);
  });

  // ============================================================================
  // VERIFICATION M: TASK REPORTING & SUMMARY
  // ============================================================================
  test("Verification M — Task Reporting: Executive Brief, Deliverables & Formatted Markdown", () => {
    const goal = understandGoal("Implement distributed cache cluster");
    const decomp = decomposeGoal(goal, "wf_report_test");
    const wf = defaultWorkflowManagementEngine.createWorkflow(goal, decomp.tasks, decomp.milestones);

    // Complete all tasks with verification evidence
    for (const task of Object.values(wf.tasks)) {
      defaultTaskVerificationEngine.verifyTask(task, { exitCode: 0, success: true });
    }
    wf.state = "COMPLETED";

    const report = defaultTaskReportingEngine.generateReport(wf);
    assert.strictEqual(report.finalStatus, "VERIFIED_COMPLETE");
    assert.strictEqual(report.verifiedTasks, Object.keys(wf.tasks).length);
    assert.ok(report.founderExecutiveBrief.length > 50);

    const markdown = defaultTaskReportingEngine.formatMarkdownReport(report);
    assert.ok(markdown.includes("Task Orchestration Report"));
    assert.ok(markdown.includes("VERIFIED_COMPLETE"));
    assert.ok(markdown.includes("Execution Metrics"));
  });

  // ============================================================================
  // VERIFICATION N: END-TO-END REAL WORLD SCENARIOS (1 TO 6)
  // ============================================================================
  test("Verification N — E2E Scenario 1: Basic Task Full Lifecycle", async () => {
    const prompt = "Inspect workspace disk usage and compute telemetry report";
    const result = await defaultTaskOrchestrationEngine.orchestrateGoal(prompt);

    assert.ok(result.workflow);
    assert.strictEqual(result.workflow.state, "COMPLETED");
    assert.strictEqual(result.report.finalStatus, "VERIFIED_COMPLETE");
    assert.ok(result.report.verifiedTasks >= 2);
    assert.ok(result.markdownBrief.includes("VERIFIED_COMPLETE"));
  });

  test("Verification N — E2E Scenario 2: Complex Project Multi-Task Decomposition & Dependencies", async () => {
    const prompt = `Architect a multi-tier database migration system:
1. Validate PostgreSQL connection schemas
2. Generate idempotent DDL scripts
3. Execute dry-run schema validation
4. Finalize verification audit`;

    const result = await defaultTaskOrchestrationEngine.orchestrateGoal(prompt);
    assert.strictEqual(result.workflow.state, "COMPLETED");
    assert.ok(Object.keys(result.workflow.tasks).length >= 4);
    assert.strictEqual(result.workflow.completedTaskIds.length, Object.keys(result.workflow.tasks).length);
  });

  test("Verification N — E2E Scenario 3: Parallel Execution Waves & Synchronization", async () => {
    const goal = understandGoal("Build parallel frontend and backend services");
    const decomp = decomposeGoal(goal, "wf_e2e_parallel");

    // Make two subtasks independent (parallel wave) and make tasks non-sensitive
    for (const t of Object.values(decomp.tasks)) {
      t.requiresApproval = false;
      t.riskLevel = "low";
      delete t.actionType;
    }
    const tKeys = Object.keys(decomp.tasks);
    if (tKeys.length >= 3) {
      decomp.tasks[tKeys[1]].dependencies = [];
      decomp.tasks[tKeys[2]].dependencies = [];
    }

    const depVal = defaultDependencyManagementEngine.validateGraph(decomp.tasks);
    const waves = defaultDependencyManagementEngine.partitionExecutionWaves(decomp.tasks, depVal.topologicalOrder);

    assert.ok(waves.length >= 2);
    assert.ok(waves[0].length >= 2, "Wave 0 should contain at least 2 parallel tasks");

    const wf = defaultWorkflowManagementEngine.createWorkflow(goal, decomp.tasks, decomp.milestones);
    wf.executionPlan = defaultExecutionPlanningEngine.generatePlan(
      goal,
      decomp.tasks,
      depVal,
      defaultPriorityEngine.calculatePriorities(decomp.tasks)
    );
    defaultPersistentStateEngine.saveWorkflow(wf);

    const executed = await defaultTaskOrchestrationEngine.executeWorkflow(wf.id);
    assert.strictEqual(executed.state, "COMPLETED");
  });

  test("Verification N — E2E Scenario 4: Controlled Failure Recovery & Retry", async () => {
    const goal = understandGoal("Unreliable network task with controlled recovery");
    const decomp = decomposeGoal(goal, "wf_e2e_retry");
    const wf = defaultWorkflowManagementEngine.createWorkflow(goal, decomp.tasks, decomp.milestones);

    let attempts = 0;
    await defaultTaskOrchestrationEngine.executeWorkflow(wf.id, {
      customTaskExecutor: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("fetch failed: transient network drop");
        }
        return { success: true, exitCode: 0 };
      },
    });

    assert.ok(attempts >= 2, "Task should retry after transient failure");
  });

  test("Verification N — E2E Scenario 5: Simulated Application Restart & Checkpoint Continuity", async () => {
    const goal = understandGoal("Crash resilience and restart checkpoint continuity test");
    const decomp = decomposeGoal(goal, "wf_e2e_crash");
    let wf = defaultWorkflowManagementEngine.createWorkflow(goal, decomp.tasks, decomp.milestones);
    wf.state = "RUNNING";
    wf = defaultPersistentStateEngine.saveWorkflow(wf);

    // Save initial checkpoint
    defaultPersistentStateEngine.createCheckpoint(wf);

    // Simulate crash and process reboot by reading fresh from disk
    const reloaded = defaultPersistentStateEngine.getWorkflow(wf.id);
    assert.ok(reloaded);
    assert.strictEqual(reloaded.state, "RUNNING");

    // Safely resume execution
    const completed = await defaultTaskOrchestrationEngine.executeWorkflow(reloaded.id);
    assert.strictEqual(completed.state, "COMPLETED");
  });

  test("Verification N — E2E Scenario 6: Approval-Gated Action Lifecycle & Gateway Enforcement", async () => {
    const goal = understandGoal("Execute high-risk production file deletion");
    const decomp = decomposeGoal(goal, "wf_e2e_approval");

    // Mark task 2 as requiring high-risk approval
    const taskIds = Object.keys(decomp.tasks);
    const sensitiveTaskId = taskIds[1];
    decomp.tasks[sensitiveTaskId].requiresApproval = true;
    decomp.tasks[sensitiveTaskId].riskLevel = "critical";
    decomp.tasks[sensitiveTaskId].actionType = "file_delete";
    decomp.tasks[sensitiveTaskId].actionPayload = { target: "production.db" };

    const wf = defaultWorkflowManagementEngine.createWorkflow(goal, decomp.tasks, decomp.milestones);
    const executed = await defaultTaskOrchestrationEngine.executeWorkflow(wf.id);

    // Workflow must pause at PENDING_APPROVAL and NOT execute sensitive task
    assert.strictEqual(executed.state, "PENDING_APPROVAL");
    const pausedTask = executed.tasks[sensitiveTaskId];
    assert.strictEqual(pausedTask.status, "AWAITING_APPROVAL");
    assert.ok(pausedTask.approvalToken);

    // Verify rejection halts workflow
    await defaultTaskOrchestrationEngine.rejectTaskApproval(sensitiveTaskId, "Founder blocked deletion");
    const postRejectWf = defaultPersistentStateEngine.getWorkflow(wf.id);
    assert.strictEqual(postRejectWf.tasks[sensitiveTaskId].status, "FAILED");
  });

});
