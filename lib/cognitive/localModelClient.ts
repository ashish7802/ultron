/**
 * @file lib/cognitive/localModelClient.ts
 * @description Typed, bounded client for streaming and non-streaming local Ollama inference.
 *
 * Subsystem:
 * Local model transport used by the chat response pipeline and cognitive intelligence layers.
 *
 * Key Responsibilities:
 * - Applies request cancellation and an inference timeout.
 * - Supports genuine token-by-token streaming via Ollama's NDJSON response format.
 * - Supports clean non-streaming fallback inference with full response validation.
 * - Propagates runtime options (temperature, num_predict, top_k, top_p) to Ollama.
 * - Accurately classifies failure reasons: availability, timeout, cancellation,
 *   model unavailability (404), http error, empty response, or invalid response.
 *
 * Architectural Role & Safety Guarantees:
 * - Called by the chat route after local service readiness has been checked.
 * - Sends prompts only to the caller-configured loopback endpoint and performs no unbounded retries.
 * - Does not execute tools, access persistent memory, or claim task completion.
 */

import type { InferenceFailureReason } from "./conversationIntelligence";

export interface LocalModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LocalModelResult =
  | { ok: true; text: string }
  | { ok: false; reason: InferenceFailureReason; httpStatus?: number };

export interface LocalModelInferenceOptions {
  temperature?: number;
  num_predict?: number;
  top_k?: number;
  top_p?: number;
}

export interface LocalModelRequest {
  endpoint: string;
  model: string;
  messages: LocalModelMessage[];
  timeoutMs: number;
  signal?: AbortSignal;
  options?: LocalModelInferenceOptions;
  stream?: boolean;
  onToken?: (token: string) => void;
  fetcher?: typeof fetch;
}

/**
 * Runs one bounded Ollama inference request (streaming or non-streaming) and validates its response.
 *
 * @param request - Endpoint, model, messages, timeout, options, streaming preference, and optional callbacks.
 * @returns Model text or an explicit failure classification.
 *
 * State & Side Effects:
 * Sends one HTTP request to the local Ollama daemon; does not mutate persistent application state.
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

  const shouldStream = Boolean(request.stream && request.onToken);

  const inferenceOptions = {
    num_predict: request.options?.num_predict ?? 1024,
    temperature: request.options?.temperature ?? 0.7,
    top_k: request.options?.top_k ?? 40,
    top_p: request.options?.top_p ?? 0.9,
  };

  try {
    if (request.signal?.aborted) return { ok: false, reason: "cancelled" };

    const response = await (request.fetcher || fetch)(`${request.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: shouldStream,
        keep_alive: -1,
        options: inferenceOptions,
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

    // --------------------------------------------------------------------------
    // STREAMING INFERENCE PATH
    // --------------------------------------------------------------------------
    if (shouldStream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulated = "";
      let lineBuffer = "";

      try {
        while (true) {
          if (controller.signal.aborted || request.signal?.aborted) {
            return { ok: false, reason: "cancelled" };
          }

          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          lineBuffer += chunk;

          const lines = lineBuffer.split("\n");
          // Keep the last incomplete slice in buffer
          lineBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const parsed = JSON.parse(trimmed);
              if (parsed && typeof parsed === "object") {
                const token = parsed.message?.content;
                if (typeof token === "string" && token.length > 0) {
                  accumulated += token;
                  request.onToken?.(token);
                }
                if (parsed.done === true) {
                  break;
                }
              }
            } catch {
              // Ignore partial JSON parse errors for split chunk boundaries
            }
          }
        }

        // Flush remaining buffer if present
        if (lineBuffer.trim()) {
          try {
            const parsed = JSON.parse(lineBuffer.trim());
            const token = parsed.message?.content;
            if (typeof token === "string" && token.length > 0) {
              accumulated += token;
              request.onToken?.(token);
            }
          } catch {
            // End of stream
          }
        }

        const finalText = accumulated.trim();
        return finalText
          ? { ok: true, text: finalText }
          : { ok: false, reason: "empty_response" };
      } finally {
        reader.releaseLock();
      }
    }

    // --------------------------------------------------------------------------
    // NON-STREAMING INFERENCE PATH
    // --------------------------------------------------------------------------
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
  } catch (error) {
    if (request.signal?.aborted) return { ok: false, reason: "cancelled" };
    if (timedOut) return { ok: false, reason: "timeout" };
    console.error("[LOCAL MODEL INFERENCE ERROR]", error);
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abortFromRequest);
  }
}
