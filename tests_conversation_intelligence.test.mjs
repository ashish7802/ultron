/**
 * @file tests_conversation_intelligence.test.mjs
 * @description Regression tests for reusable conversation and local inference behavior.
 *
 * Subsystem:
 * Cognitive context resolution and the local Ollama adapter.
 *
 * Key Responsibilities:
 * - Verify normalized identity and context intents.
 * - Protect project isolation and read-only workflow reporting.
 * - Ensure model failures remain explicit and bounded.
 *
 * Architectural Role & Safety Guarantees:
 * - Exercises pure cognitive helpers and an injected local-model transport.
 * - Uses in-memory fixtures only; it performs no persistent writes or desktop actions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("conversation intents normalize case and punctuation", async () => {
  const { detectSystemConversationIntent } = await import("./lib/cognitive/conversationIntelligence.ts");

  assert.equal(detectSystemConversationIntent("WHO are you?!"), "identity");
  assert.equal(detectSystemConversationIntent("What can ULTRON do?"), "capabilities");
  assert.equal(detectSystemConversationIntent("Can you help me choose a model?"), null);
});

test("project resolution uses a unique recent project and reports conflicting context", async () => {
  const { resolveProjectContext } = await import("./lib/cognitive/conversationIntelligence.ts");
  const projects = [
    { projectId: "game", projectName: "Nebula Game", aliases: ["Nebula"] },
    { projectId: "shop", projectName: "Kelvyra Shop", aliases: ["Kelvyra"] },
  ];

  assert.deepEqual(
    resolveProjectContext("What about the game?", [
      { role: "user", content: "We are planning Nebula Game." },
      { role: "assistant", content: "Nebula is an active game project." },
    ], projects),
    { projectId: "game", projectName: "Nebula Game", ambiguous: false }
  );
  assert.equal(
    resolveProjectContext("Compare Nebula and Kelvyra", [], projects).ambiguous,
    true
  );
  assert.deepEqual(resolveProjectContext("Continue", [], projects), { ambiguous: false });
});

test("memory retrieval excludes records from unrelated projects", async () => {
  const { MemoryRetrievalEngine } = await import("./lib/memory/retrievalEngine.ts");
  const now = Date.now();
  const records = ["game", "business", "default"].map((projectId) => ({
    id: `${projectId}-record`,
    key: `${projectId} release plan`,
    memoryType: "semantic",
    content: "release plan for the shared launch schedule",
    projectId,
    sensitivity: "INTERNAL",
    confidence: 1,
    importance: 5,
    createdAt: now,
    updatedAt: now,
    temporal: { isObsolescent: false },
  }));
  const engine = new MemoryRetrievalEngine();
  const gameResults = engine.retrieveMemories(records, {
    query: "release launch schedule",
    projectId: "game",
  });

  assert.ok(gameResults.some((result) => result.record.projectId === "game"));
  assert.ok(gameResults.some((result) => result.record.projectId === "default"));
  assert.ok(gameResults.every((result) => result.record.projectId !== "business"));
});

test("workflow status reporting is honest and never changes workflow state", async () => {
  const { summarizePersistedWorkflow } = await import("./lib/cognitive/conversationIntelligence.ts");
  const workflow = {
    state: "PAUSED",
    goal: { title: "Repair game input", rawPrompt: "Fix input latency" },
    tasks: {
      first: { title: "Reproduce latency", description: "Measure input delay", status: "COMPLETED" },
      next: { title: "Inspect event queue", description: "Find the bottleneck", status: "READY" },
    },
    completedTaskIds: ["first"],
    updatedAt: 10,
  };
  const before = JSON.stringify(workflow);

  const report = summarizePersistedWorkflow([workflow], "Continue the game task", [
    { role: "user", content: "Fix input latency in the game." },
  ]);

  assert.match(report, /Repair game input/);
  assert.match(report, /Inspect event queue/);
  assert.match(report, /has not been started/);
  assert.equal(JSON.stringify(workflow), before);
});

test("unknown task and unavailable decision information are not invented", async () => {
  const {
    summarizePersistedWorkflow,
    buildInferenceFailureReply,
    isPersistedTaskStatusRequest,
    isYesterdayDecisionQuery,
  } = await import("./lib/cognitive/conversationIntelligence.ts");

  assert.match(summarizePersistedWorkflow([], "Continue previous task", []), /couldn't find an unfinished task/i);
  assert.equal(isPersistedTaskStatusRequest("Continue the previous task"), true);
  assert.equal(isPersistedTaskStatusRequest("Handle my business tasks today"), true);
  assert.equal(isYesterdayDecisionQuery("What did we decide yesterday?"), true);
  const failed = buildInferenceFailureReply("timeout", "Explain the current project");
  assert.match(failed, /exceeded its inference time limit/);
  assert.match(failed, /have not completed or executed/);
  assert.doesNotMatch(failed, /I have analyzed your inquiry/i);
});

test("local model adapter classifies unavailable, malformed and empty results", async () => {
  const { inferLocalModel } = await import("./lib/cognitive/localModelClient.ts");
  const base = {
    endpoint: "http://127.0.0.1:11434",
    model: "test-model",
    messages: [{ role: "user", content: "hello" }],
    timeoutMs: 100,
  };

  const unavailableModel = await inferLocalModel({
    ...base,
    fetcher: async () => new Response("", { status: 404 }),
  });
  assert.deepEqual(unavailableModel, { ok: false, reason: "model_unavailable", httpStatus: 404 });

  const malformed = await inferLocalModel({
    ...base,
    fetcher: async () => Response.json({ response: "wrong shape" }),
  });
  assert.deepEqual(malformed, { ok: false, reason: "invalid_response" });

  const empty = await inferLocalModel({
    ...base,
    fetcher: async () => Response.json({ message: { content: "  " } }),
  });
  assert.deepEqual(empty, { ok: false, reason: "empty_response" });

  const success = await inferLocalModel({
    ...base,
    fetcher: async () => Response.json({ message: { content: "  grounded reply  " } }),
  });
  assert.deepEqual(success, { ok: true, text: "grounded reply" });

  let requestCount = 0;
  const unavailable = await inferLocalModel({
    ...base,
    fetcher: async () => {
      requestCount++;
      throw new Error("offline");
    },
  });
  assert.deepEqual(unavailable, { ok: false, reason: "unavailable" });
  assert.equal(requestCount, 1, "The local model adapter must not retry an unavailable endpoint.");
});

test("local model adapter enforces timeout and propagates caller cancellation", async () => {
  const { inferLocalModel } = await import("./lib/cognitive/localModelClient.ts");
  const base = {
    endpoint: "http://127.0.0.1:11434",
    model: "test-model",
    messages: [{ role: "user", content: "hello" }],
  };
  const timeout = await inferLocalModel({
    ...base,
    timeoutMs: 5,
    fetcher: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  });
  assert.deepEqual(timeout, { ok: false, reason: "timeout" });

  const controller = new AbortController();
  controller.abort();
  const cancelled = await inferLocalModel({
    ...base,
    timeoutMs: 100,
    signal: controller.signal,
    fetcher: async () => {
      throw new Error("must not fetch after cancellation");
    },
  });
  assert.deepEqual(cancelled, { ok: false, reason: "cancelled" });
});

test("unknown topics do not receive generic fabricated knowledge", async () => {
  const { generateAutonomousKnowledge } = await import("./lib/knowledgeEngine.ts");

  assert.equal(generateAutonomousKnowledge("Explain community management"), null);
});

test("desktop app launch remains pending until explicit approval", async () => {
  const { ComputerToolRegistry } = await import("./lib/computer/toolRegistry.ts");
  const { defaultSafetyControls } = await import("./lib/computer/safetyControls.ts");
  const registry = new ComputerToolRegistry();
  const result = await registry.executeTool("launch_application", { appName: "notepad" });

  assert.equal(result.success, false);
  assert.equal(result.verified, false);
  if (await defaultSafetyControls.isEmergencyStopActive()) {
    assert.match(result.error, /Emergency Stop/i);
    return;
  }
  assert.equal(result.permissionPlan?.status, "pending");
});

test("memory vault corruption is reported instead of appearing as an empty vault", async () => {
  const { MemoryCoordinator } = await import("./lib/memory/memoryCoordinator.ts");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ultron-memory-status-"));
  const primaryPath = path.join(temporaryDirectory, "vault.json");
  const backupPath = path.join(temporaryDirectory, "vault.json.bak");

  try {
    fs.writeFileSync(primaryPath, "not a valid vault");
    const coordinator = new MemoryCoordinator(primaryPath, backupPath);

    assert.deepEqual(coordinator.loadAll(), []);
    assert.equal(coordinator.getLoadStatus(), "UNAVAILABLE");
  } finally {
    if (fs.existsSync(primaryPath)) fs.unlinkSync(primaryPath);
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    fs.rmdirSync(temporaryDirectory);
  }
});
