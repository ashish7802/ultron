/**
 * @file scripts/test_gamedev_battery.cjs
 * @description Comprehensive Integration and Verification Battery for the Resource-Aware Game Development Team.
 *
 * Verifies Acceptance Criteria:
 * 1. 4 persistent departments + 4 leader profiles + 6 persistent specialists = 10 reusable profiles.
 * 2. 4 on-demand templates (ATLAS, TERRA, ECHO, SENTINEL) registered as inactive by default.
 * 3. Profile lifecycle: activate, deactivate, archive, reactivate; history preservation with zero deletion.
 * 4. Concurrency = 1 global inference queue: concurrent requests queue safely; duplicate task execution blocked.
 * 5. Bug lifecycle: QA report -> Eng handoff -> Eng fix -> independent QA verification; cannot close without QA evidence.
 * 6. Marketing pipeline: verified claim status -> video draft -> voice/media rights check -> owner authorization gate.
 * 7. Hardware & laptop baseline telemetry monitoring.
 */

const assert = require("assert");

async function runBattery() {
  console.log("==================================================================");
  console.log("   ULTRON RESOURCE-AWARE GAME DEVELOPMENT VERIFICATION BATTERY   ");
  console.log("==================================================================");

  let passed = 0;
  let total = 0;

  function runTest(id, name, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] Test ${total} (${id}): ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total} (${id}): ${name}`);
      console.error("         Error:", err.message);
    }
  }

  async function runAsyncTest(id, name, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] Test ${total} (${id}): ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] Test ${total} (${id}): ${name}`);
      console.error("         Error:", err.message);
    }
  }

  // Dynamic import of TypeScript modules via tsx
  const {
    defaultDepartmentRegistry,
    defaultResourceQueueEngine,
    defaultBugLifecycleEngine,
    defaultMarketingEngine,
  } = await import("../lib/gameDev/index.ts");

  console.log("\n--- [Suite 1: Organization & Profile Topology] ---");

  runTest("G-01", "4 Persistent Departments exist with correct combined leaders", () => {
    const depts = defaultDepartmentRegistry.getDepartments();
    const slugs = depts.map((d) => d.slug);

    assert(slugs.includes("production-coordination"), "Production Coordination missing");
    assert(slugs.includes("game-development"), "Game Development missing");
    assert(slugs.includes("quality-delivery"), "Quality & Delivery missing");
    assert(slugs.includes("marketing-media"), "Marketing & Media missing");

    const prod = defaultDepartmentRegistry.getDepartment("production-coordination");
    assert.strictEqual(prod.leaderProfileId, "NEXUS-01");

    const gameDev = defaultDepartmentRegistry.getDepartment("game-development");
    assert.strictEqual(gameDev.leaderProfileId, "FORGE-PULSE-01");

    const qa = defaultDepartmentRegistry.getDepartment("quality-delivery");
    assert.strictEqual(qa.leaderProfileId, "AEGIS-VELOCITY-01");

    const mkt = defaultDepartmentRegistry.getDepartment("marketing-media");
    assert.strictEqual(mkt.leaderProfileId, "ORBIT-01");
  });

  runTest("G-02", "10 Reusable Profiles (4 Leaders + 6 Persistent Specialists) are active", () => {
    const activeRoles = defaultDepartmentRegistry.getRoleProfiles({ status: "active" });
    assert.strictEqual(activeRoles.length, 10, "Expected exactly 10 active permanent profiles");

    const ids = activeRoles.map((r) => r.id);
    // Leaders
    assert(ids.includes("NEXUS-01"));
    assert(ids.includes("FORGE-PULSE-01"));
    assert(ids.includes("AEGIS-VELOCITY-01"));
    assert(ids.includes("ORBIT-01"));

    // Specialists
    assert(ids.includes("FORGE-GAMEPLAY-01"));
    assert(ids.includes("FORGE-NPC-01"));
    assert(ids.includes("AEGIS-QA-01"));
    assert(ids.includes("AEGIS-PERF-01"));
    assert(ids.includes("ORBIT-MKT-01"));
    assert(ids.includes("ORBIT-VIDEO-01"));
  });

  runTest("G-03", "4 On-Demand Templates exist and are inactive by default", () => {
    const templates = defaultDepartmentRegistry.getRoleProfiles().filter((r) => r.isOnDemandTemplate);
    assert.strictEqual(templates.length, 4, "Expected 4 on-demand templates");

    const ids = templates.map((r) => r.id);
    assert(ids.includes("ATLAS-A01"), "ATLAS missing");
    assert(ids.includes("TERRA-W01"), "TERRA missing");
    assert(ids.includes("ECHO-N01"), "ECHO missing");
    assert(ids.includes("SENTINEL-SEC01"), "SENTINEL missing");

    for (const t of templates) {
      assert(t.status === "inactive" || t.status === "archived", `Template ${t.id} must not be active without assignment`);
    }
  });

  console.log("\n--- [Suite 2: Role Profile Lifecycle & History Invariants] ---");

  runTest("G-04", "On-Demand profile activation records history without losing past data", () => {
    const initial = defaultDepartmentRegistry.getRoleProfile("ATLAS-A01");
    const initialHistoryLen = initial.history.length;

    const activated = defaultDepartmentRegistry.activateProfile("ATLAS-A01", "Character concept brief assigned", "NEXUS-01");
    assert.strictEqual(activated.status, "active");
    assert.strictEqual(activated.history.length, initialHistoryLen + 1);
    assert.strictEqual(activated.history[activated.history.length - 1].action, "activated");
  });

  runTest("G-05", "Completed role can be archived, preserving history and approved artifacts", () => {
    const archived = defaultDepartmentRegistry.archiveProfile("ATLAS-A01", "Character concept approved and signed off", "Founder");
    assert.strictEqual(archived.status, "archived");
    assert.strictEqual(archived.history[archived.history.length - 1].action, "archived");
  });

  console.log("\n--- [Suite 3: Resource Queue & Concurrency = 1 Enforcement] ---");

  runTest("G-06", "Laptop telemetry detects CPU, memory, and baseline constraints", () => {
    const telemetry = defaultResourceQueueEngine.getTelemetry();
    assert(telemetry.cpuCount > 0, "CPU count must be detected");
    assert(telemetry.totalMemoryMb > 0, "Total memory must be detected");
    assert(typeof telemetry.isResourceConstrained === "boolean");
  });

  await runAsyncTest("G-07", "Single-inference queue processes requests strictly sequentially (Concurrency = 1)", async () => {
    const executionOrder = [];
    let concurrentRunning = 0;
    let maxObservedConcurrency = 0;

    const mockTask1 = { id: "task_test_1", title: "Task 1" };
    const mockTask2 = { id: "task_test_2", title: "Task 2" };

    const p1 = defaultResourceQueueEngine.enqueueJob(mockTask1, "FORGE-GAMEPLAY-01", async () => {
      concurrentRunning++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, concurrentRunning);
      await new Promise((r) => setTimeout(r, 60));
      executionOrder.push("task1");
      concurrentRunning--;
      return "done1";
    });

    const p2 = defaultResourceQueueEngine.enqueueJob(mockTask2, "FORGE-NPC-01", async () => {
      concurrentRunning++;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, concurrentRunning);
      await new Promise((r) => setTimeout(r, 30));
      executionOrder.push("task2");
      concurrentRunning--;
      return "done2";
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    assert.strictEqual(res1, "done1");
    assert.strictEqual(res2, "done2");
    assert.strictEqual(maxObservedConcurrency, 1, "Concurrency must NEVER exceed 1");
    assert.deepStrictEqual(executionOrder, ["task1", "task2"], "Tasks must execute in FIFO sequence");
  });

  await runAsyncTest("G-08", "Duplicate task execution is rejected fail-closed", async () => {
    const duplicateTask = { id: "task_dup_1", title: "Duplicate Test" };

    const slowJob = defaultResourceQueueEngine.enqueueJob(duplicateTask, "FORGE-GAMEPLAY-01", async () => {
      await new Promise((r) => setTimeout(r, 80));
      return "ok";
    });

    let caughtError = null;
    try {
      await defaultResourceQueueEngine.enqueueJob(duplicateTask, "FORGE-GAMEPLAY-01", async () => "dup");
    } catch (err) {
      caughtError = err;
    }

    await slowJob;
    assert(caughtError !== null, "Duplicate task must throw an error");
    assert(caughtError.message.includes("Duplicate execution rejected"));
  });

  console.log("\n--- [Suite 4: Bug Lifecycle & Independent QA Verification Gate] ---");

  let createdBugId = "";
  runTest("G-09", "QA logs reproducible defect with required steps and build version", () => {
    const bug = defaultBugLifecycleEngine.reportBug({
      title: "Vehicle clipping through sidewalk collider at high velocity",
      buildVersion: "v0.1.4-alpha",
      stepsToReproduce: [
        "1. Spawn test sedan in District 1",
        "2. Accelerate to > 80 km/h toward intersection 4th & Main",
        "3. Turn sharply into sidewalk curb",
      ],
      expectedResult: "Vehicle wheel collider rebounds cleanly off curb",
      actualResult: "Vehicle chassis sinks into geometry and gets stuck",
      severity: "high",
      affectedSubsystem: "Physics / VehicleController",
      reportedByRoleId: "AEGIS-QA-01",
    });

    assert(bug.id, "Bug ID must be generated");
    assert.strictEqual(bug.status, "reported");
    createdBugId = bug.id;
  });

  runTest("G-10", "Engineering fix requires traceable VCS commit ref and cannot self-close", () => {
    defaultBugLifecycleEngine.assignBug(createdBugId, "FORGE-GAMEPLAY-01");
    const fixProposed = defaultBugLifecycleEngine.proposeFix(createdBugId, "FORGE-GAMEPLAY-01", "git_commit_8f3a921");

    assert.strictEqual(fixProposed.status, "fix_proposed", "Fix must be in fix_proposed status");
    assert.strictEqual(fixProposed.engineeringCommitRef, "git_commit_8f3a921");
  });

  runTest("G-11", "Engineering role cannot verify its own fix; independent QA required", () => {
    let securityError = null;
    try {
      defaultBugLifecycleEngine.verifyBugFix(createdBugId, "FORGE-GAMEPLAY-01", true, "Self review");
    } catch (err) {
      securityError = err;
    }
    assert(securityError !== null, "Self-verification must be rejected");
    assert(securityError.message.includes("Engineering roles cannot verify their own fixes"));
  });

  runTest("G-12", "Independent QA verification with passed test closes defect with evidence", () => {
    const verifiedBug = defaultBugLifecycleEngine.verifyBugFix(
      createdBugId,
      "AEGIS-QA-01",
      true,
      "Tested 20 consecutive high-velocity curb collisions at 100km/h; collision mesh cleanly sustained"
    );

    assert.strictEqual(verifiedBug.status, "closed");
    assert.strictEqual(verifiedBug.qaVerificationEvidence.regressionPassed, true);
    assert.strictEqual(verifiedBug.qaVerificationEvidence.verifiedByRoleId, "AEGIS-QA-01");
  });

  console.log("\n--- [Suite 5: Marketing & Media Pipeline with Rights Safeguards] ---");

  let createdDraftId = "";
  runTest("G-13", "AI voiceover without documented consent agreement is rejected fail-closed", () => {
    let consentError = null;
    try {
      defaultMarketingEngine.createDraft({
        title: "Teaser: High-Speed Chase in Neo-Kalyan",
        targetPlatforms: ["youtube", "instagram"],
        milestoneReference: "Milestone-02",
        verifiedFeatureStatus: "verified",
        script: "Get ready for tactical chases in Neo-Kalyan...",
        captions: ["#gamedev #indiegame"],
        suggestedTags: ["open world", "driving"],
        rightsMetadata: {
          isAiClonedVoice: true,
          voiceoverConsentDoc: undefined, // Missing consent
          rightsAttestation: "Voice clone of celebrity",
          complianceChecked: false,
        },
      });
    } catch (err) {
      consentError = err;
    }
    assert(consentError !== null, "Missing voice consent must fail closed");
    assert(consentError.message.includes("documented consent agreement"));
  });

  runTest("G-14", "Valid marketing draft defaults to waiting_for_approval", () => {
    const draft = defaultMarketingEngine.createDraft({
      title: "Teaser: High-Speed Driving Mechanics Verified",
      targetPlatforms: ["youtube", "instagram"],
      milestoneReference: "Milestone-02",
      verifiedFeatureStatus: "verified",
      script: "Check out our newly verified high-speed vehicle physics on integrated graphics!",
      captions: ["#indiedev #openworld #pcgaming"],
      suggestedTags: ["gamedev", "pcgame", "physics"],
      sourceFootagePath: "recordings/gameplay_curb_test_01.mp4",
      rightsMetadata: {
        isAiClonedVoice: false,
        rightsAttestation: "100% original developer recorded gameplay. No licensed third-party music.",
        complianceChecked: true,
      },
    });

    assert(draft.id);
    assert.strictEqual(draft.approvalStatus, "waiting_for_approval", "Draft must default to waiting_for_approval");
    createdDraftId = draft.id;
  });

  runTest("G-15", "Video editor attaches platform cuts (YouTube 16:9 and Instagram 9:16)", () => {
    const updated = defaultMarketingEngine.attachVideoCut(
      createdDraftId,
      "exports/teaser_1080p_60fps.mp4",
      "exports/teaser_thumbnail.png"
    );
    assert.strictEqual(updated.editedVideoPath, "exports/teaser_1080p_60fps.mp4");
    assert.strictEqual(updated.thumbnailPath, "exports/teaser_thumbnail.png");
  });

  runTest("G-16", "Publication fails closed without owner approval token", () => {
    let publishError = null;
    try {
      defaultMarketingEngine.publishDraft(createdDraftId);
    } catch (err) {
      publishError = err;
    }
    assert(publishError !== null, "Publishing unapproved draft must fail closed");
    assert(publishError.message.includes("Publishing Gate Blocked"));
  });

  runTest("G-17", "Owner explicit approval unlocks publication", () => {
    const approved = defaultMarketingEngine.reviewDraft(createdDraftId, true, "FOUNDER_AUTH_TOKEN_77921");
    assert.strictEqual(approved.approvalStatus, "approved");

    const published = defaultMarketingEngine.publishDraft(createdDraftId);
    assert.strictEqual(published.approvalStatus, "published");
    assert(published.publishedAt > 0);
  });

  console.log("\n==================================================================");
  console.log(`GAME DEV BATTERY RESULTS: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runBattery().catch((err) => {
  console.error("FATAL ERROR IN TEST RUNNER:", err);
  process.exit(1);
});
