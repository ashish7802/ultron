/**
 * @file lib/cognitive/localModelClient.ts
 * @description Typed, bounded client for non-streaming local Ollama inference.
 *
 * Subsystem:
 * Local model transport used by the chat response pipeline.
 *
 * Key Responsibilities:
 * - Applies request cancellation and an inference timeout.
 * - Validates Ollama's HTTP and JSON response shape.
 * - Distinguishes availability, timeout, cancellation, and malformed-output failures.
 *
 * Architectural Role & Safety Guarantees:
 * - Called by the chat route after local service readiness has been checked.
 * - Sends prompts only to the caller-configured endpoint and performs no retries.
 * - Does not execute tools, access persistent memory, or claim task completion.
 */

import type { InferenceFailureReason } from "./conversationIntelligence.ts";

export interface LocalModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LocalModelResult =
  | { ok: true; text: string }
  | { ok: false; reason: InferenceFailureReason; httpStatus?: number };

export interface LocalModelRequest {
  endpoint: string;
  model: string;
  messages: LocalModelMessage[];
  timeoutMs: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

/**
 * Runs one bounded, non-streaming Ollama request and validates its response.
 *
 * @param request - Endpoint, model, conversation prompt, timeout, and optional cancellation.
 * @returns Model text or an explicit failure classification.
 *
 * State & Side Effects:
 * Sends one HTTP request; it does not retry or mutate persistent application state.
 */
export async function inferLocalModel(request: LocalModelRequest): Promise<LocalModelResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, request.timeoutMs);
  const abortFromRequest = () => controller.abort();
  request.signal?.addEventListener("abort", abortFromRequest, { once: true });

  try {
    if (request.signal?.aborted) return { ok: false, reason: "cancelled" };
    const response = await (request.fetcher || fetch)(`${request.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
        keep_alive: -1,
        options: {
          num_predict: 1024,
          temperature: 0.7,
          top_k: 40,
          top_p: 0.9,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: response.status === 404 ? "model_unavailable" : "http_error",
        httpStatus: response.status,
      };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { ok: false, reason: "invalid_response" };
    }

    if (
      typeof data !== "object" ||
      data === null ||
      !("message" in data) ||
      typeof data.message !== "object" ||
      data.message === null ||
      !("content" in data.message) ||
      typeof data.message.content !== "string"
    ) {
      return { ok: false, reason: "invalid_response" };
    }

    const text = data.message.content.trim();
    return text
      ? { ok: true, text }
      : { ok: false, reason: "empty_response" };
  } catch {
    if (request.signal?.aborted) return { ok: false, reason: "cancelled" };
    if (timedOut) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abortFromRequest);
  }
}
