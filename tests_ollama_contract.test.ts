/**
 * @file tests_ollama_contract.test.ts
 * @description Controlled Mock HTTP Contract Test Suite for ULTRON's Local Ollama Client.
 *
 * IMPORTANT VERIFICATION DISCLOSURE:
 * These tests exercise `lib/cognitive/localModelClient.ts` against an ephemeral in-process
 * loopback mock HTTP server to verify protocol contracts, error classification, timeout enforcement,
 * abort cancellation, and recovery behavior deterministically in cloud/CI environments.
 * They DO NOT constitute live verification against a real local Ollama daemon (`NOT VERIFIED IN CLOUD`).
 */

import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { inferLocalModel } from "./lib/cognitive/localModelClient.ts";

interface MockHandler {
  (req: http.IncomingMessage, res: http.ServerResponse, body: string): void;
}

async function startMockOllama(handler: MockHandler): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => handler(req, res, body));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind ephemeral loopback port");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("Ollama Contract [MOCK]: transmits chat messages and parses assistant reply", async () => {
  let receivedModel = "";
  let receivedCount = 0;

  const mock = await startMockOllama((req, res, body) => {
    assert.equal(req.url, "/api/chat");
    const parsed = JSON.parse(body);
    receivedModel = parsed.model;
    receivedCount = parsed.messages.length;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: { role: "assistant", content: "Namaste! System nominal hai." } }));
  });

  try {
    const result = await inferLocalModel({
      endpoint: mock.url,
      model: "qwen2.5:7b-instruct-q4_K_M",
      messages: [
        { role: "system", content: "You are ULTRON." },
        { role: "user", content: "Status check" },
      ],
      timeoutMs: 3000,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.text, "Namaste! System nominal hai.");
    }
    assert.equal(receivedModel, "qwen2.5:7b-instruct-q4_K_M");
    assert.equal(receivedCount, 2);
  } finally {
    await mock.close();
  }
});

test("Ollama Contract [MOCK]: classifies HTTP 404 invalid model cleanly", async () => {
  const mock = await startMockOllama((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model 'nonexistent:latest' not found" }));
  });

  try {
    const result = await inferLocalModel({
      endpoint: mock.url,
      model: "nonexistent:latest",
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 3000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "model_unavailable");
    }
  } finally {
    await mock.close();
  }
});

test("Ollama Contract [MOCK]: enforces timeout when daemon hangs", async () => {
  const mock = await startMockOllama((_req, _res) => {
    // Intentionally never respond
  });

  try {
    const result = await inferLocalModel({
      endpoint: mock.url,
      model: "qwen2.5:7b-instruct-q4_K_M",
      messages: [{ role: "user", content: "slow query" }],
      timeoutMs: 150,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "timeout");
    }
  } finally {
    await mock.close();
  }
});

test("Ollama Contract [MOCK]: handles malformed JSON and empty responses safely", async () => {
  let mode: "malformed" | "empty" = "malformed";
  const mock = await startMockOllama((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (mode === "malformed") {
      res.end("{not valid json");
    } else {
      res.end(JSON.stringify({ message: { role: "assistant", content: "   " } }));
    }
  });

  try {
    const badJson = await inferLocalModel({
      endpoint: mock.url,
      model: "qwen2.5:7b-instruct-q4_K_M",
      messages: [{ role: "user", content: "test" }],
      timeoutMs: 2000,
    });
    assert.equal(badJson.ok, false);

    mode = "empty";
    const emptyReply = await inferLocalModel({
      endpoint: mock.url,
      model: "qwen2.5:7b-instruct-q4_K_M",
      messages: [{ role: "user", content: "test" }],
      timeoutMs: 2000,
    });
    assert.equal(emptyReply.ok, false);
    if (!emptyReply.ok) {
      assert.equal(emptyReply.reason, "empty_response");
    }
  } finally {
    await mock.close();
  }
});

test("Ollama Contract [MOCK]: propagates caller AbortSignal cancellation", async () => {
  const mock = await startMockOllama((_req, res) => {
    setTimeout(() => {
      if (!res.writableEnded) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: { content: "too late" } }));
      }
    }, 500);
  });

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);

  try {
    const result = await inferLocalModel({
      endpoint: mock.url,
      model: "qwen2.5:7b-instruct-q4_K_M",
      messages: [{ role: "user", content: "cancel me" }],
      timeoutMs: 3000,
      signal: controller.signal,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "cancelled");
    }
  } finally {
    await mock.close();
  }
});

test("Ollama Contract [MOCK]: classifies unreachable loopback daemon cleanly", async () => {
  const result = await inferLocalModel({
    endpoint: "http://127.0.0.1:19999",
    model: "qwen2.5:7b-instruct-q4_K_M",
    messages: [{ role: "user", content: "ping" }],
    timeoutMs: 1000,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "unavailable");
  }
});
