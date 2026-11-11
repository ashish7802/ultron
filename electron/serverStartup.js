/**
 * Waits for the embedded ULTRON server to prove its identity before it is loaded.
 */

const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const http = require("node:http");

function requestReadiness(port, challenge, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/desktop-ready",
        method: "POST",
        headers: { "X-Ultron-Challenge": challenge },
      },
      (response) => {
        response.resume();
        response.once("end", () => {
          resolve({
            statusCode: response.statusCode,
            signature: response.headers["x-ultron-ready"] || "",
          });
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Readiness request timed out")));
    request.once("error", reject);
    request.end();
  });
}

/**
 * Polls the loopback server until it returns a valid startup challenge signature.
 *
 * @param {number} port - Port selected for the standalone Next.js server.
 * @param {import("node:child_process").ChildProcess} child - Spawned server process.
 * @param {string} secret - Random secret shared only with this child process.
 * @param {{ timeoutMs?: number; retryDelayMs?: number; requestReadiness?: (port: number, challenge: string, timeoutMs: number) => Promise<{ statusCode: number; signature: string }> }} options - Readiness timing and optional test transport.
 * @returns {Promise<void>} Resolves only after ULTRON's API proves server identity.
 * @throws {Error} If the child exits, returns an invalid signature, or times out.
 */
async function waitForServerReady(port, child, secret, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const retryDelayMs = options.retryDelayMs ?? 100;
  const sendReadinessRequest = options.requestReadiness || requestReadiness;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.spawnError) {
      throw new Error("Next.js server failed to spawn", { cause: child.spawnError });
    }
    if (child.exitCode !== null || child.signalCode) {
      throw new Error(`Next.js server exited before readiness (code ${child.exitCode})`);
    }

    const challenge = randomBytes(32).toString("hex");
    try {
      const response = await sendReadinessRequest(
        port,
        challenge,
        Math.min(1000, Math.max(1, deadline - Date.now())),
      );
      const signature = response.signature;
      const expected = createHmac("sha256", secret).update(challenge).digest("hex");
      if (
        response.statusCode === 204 &&
        signature.length === expected.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      ) {
        return;
      }
    } catch (error) {
      if (child.spawnError) {
        throw new Error("Next.js server failed to spawn", { cause: error });
      }
      if (child.exitCode !== null || child.signalCode) {
        throw new Error(`Next.js server exited before readiness (code ${child.exitCode})`, { cause: error });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  throw new Error("Timed out waiting for the ULTRON Next.js readiness signature");
}

module.exports = { waitForServerReady };
