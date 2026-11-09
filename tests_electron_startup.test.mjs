import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { waitForServerReady } from "./electron/serverStartup.js";

test("startup readiness rejects an unrelated service on the selected port", async () => {
  await assert.rejects(
    waitForServerReady(3000, { exitCode: null }, "private-startup-secret", {
      timeoutMs: 30,
      retryDelayMs: 5,
      requestReadiness: async () => ({ statusCode: 204, signature: "untrusted" }),
    }),
    /readiness|signature/i,
  );
});

test("startup readiness accepts the child server's challenge signature", async () => {
  const secret = "private-startup-secret";
  await waitForServerReady(3000, { exitCode: null }, secret, {
    timeoutMs: 500,
    retryDelayMs: 10,
    requestReadiness: async (_port, challenge) => ({
      statusCode: 204,
      signature: createHmac("sha256", secret).update(challenge).digest("hex"),
    }),
  });
});

test("startup readiness stops waiting when the child exits", async () => {
  const child = { exitCode: 1 };
  await assert.rejects(
    waitForServerReady(65534, child, "private-startup-secret", { timeoutMs: 500 }),
    /exited/i,
  );
});
