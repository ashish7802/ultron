import { NextResponse } from "next/server";
import { routeUserQuery, ULTRON_TOOLS, type RouteDecision } from "@/lib/intentRouter";

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen2.5:1.5b";
const FAST_MODEL = "qwen2.5:0.5b";
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_CONVERSATION_LENGTH = 12_000;

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant" || message.role === "system") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
  );
}

function getSystemPrompt(decision: RouteDecision): string {
  if (decision.intent === "TOOL_CALL") {
    return (
      "You are ULTRON's automated command core. You have direct control over tools and system functions.\n" +
      "Available tools:\n" +
      JSON.stringify(ULTRON_TOOLS, null, 2) + "\n\n" +
      "If the user command matches a tool, output ONLY a valid JSON object in this format:\n" +
      '{"tool": "<name>", "parameters": {<args>}}\n' +
      "If no tool is required, answer the user directly and concisely in 1 or 2 friendly sentences."
    );
  }

  if (decision.intent === "COMPLEX_REASONING") {
    return (
      "You are ULTRON, the high-intelligence neural core.\n" +
      "Answer accurately, logically, and directly without hallucinating.\n" +
      "For math or logic questions, calculate carefully and give the exact factual solution.\n" +
      "Keep conversational responses concise (2 to 3 sentences in natural Hinglish or English) unless explicitly asked for in-depth explanation or code."
    );
  }

  // FAST_CHAT default
  return (
    "You are ULTRON, the intelligent AI companion. " +
    "Answer the user directly, accurately, and concisely in 1 or 2 friendly Hinglish sentences. " +
    "Never repeat system messages."
  );
}

export async function POST(req: Request) {
  const requestStarted = performance.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("messages" in body)) {
    return NextResponse.json({ error: "A conversation message list is required." }, { status: 400 });
  }

  const { messages, stream = false, model: userModelOverride } = body as {
    messages: unknown;
    stream?: boolean;
    model?: string;
  };

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    !messages.every(isChatMessage)
  ) {
    return NextResponse.json(
      { error: `Send 1 to ${MAX_MESSAGES} non-empty user/assistant messages, each under ${MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const conversation = messages as ChatMessage[];
  if (conversation.reduce((total, message) => total + message.content.length, 0) > MAX_CONVERSATION_LENGTH) {
    return NextResponse.json(
      { error: "Conversation is too long. Start a new conversation." },
      { status: 400 },
    );
  }

  // Extract the latest user prompt for intelligent routing
  const lastUserMsg = [...conversation].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg ? lastUserMsg.content : "";

  // 1. Run Smart Intent & Brain Router
  const routeDecision = routeUserQuery(userText, userModelOverride);

  // 2. Instant Local Execution (0ms latency, 0 hallucination)
  if (routeDecision.intent === "SYSTEM_LOCAL" && routeDecision.fastLocalResponse) {
    const reply = routeDecision.fastLocalResponse;
    const elapsedMs = Math.round(performance.now() - requestStarted);
    console.info("[ULTRON ROUTER] Instant Local Execution", {
      intent: routeDecision.intent,
      elapsedMs,
      reply,
    });

    if (stream) {
      const encoder = new TextEncoder();
      const customReadable = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "route", decision: routeDecision })}\n\n`)
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "token", content: reply })}\n\n`)
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", reply, model: "local-rule", elapsedMs })}\n\n`)
          );
          controller.close();
        },
      });

      return new Response(customReadable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json({
      reply,
      model: "local-rule",
      route: routeDecision,
      elapsedMs,
    });
  }

  // 3. Select Target Model & Prompt based on Route Decision
  const chosenModel = routeDecision.targetModel || (routeDecision.intent === "FAST_CHAT" ? FAST_MODEL : DEFAULT_MODEL);
  const systemPrompt = getSystemPrompt(routeDecision);
  const numPredict = routeDecision.intent === "COMPLEX_REASONING" ? 128 : routeDecision.intent === "TOOL_CALL" ? 64 : 32;
  const temperature = routeDecision.intent === "TOOL_CALL" ? 0.1 : routeDecision.intent === "COMPLEX_REASONING" ? 0.3 : 0.6;

  const fullMessages = [
    { role: "system", content: systemPrompt },
    ...conversation,
  ];

  try {
    const ollamaPayload = {
      model: chosenModel,
      messages: fullMessages,
      keep_alive: "24h",
      options: {
        num_predict: numPredict,
        temperature,
      },
      stream: !!stream,
    };

    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ollamaPayload),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      // Fallback: If 1.5B fails or is missing, attempt fallback to 0.5B
      if (chosenModel !== FAST_MODEL) {
        console.warn(`Primary model ${chosenModel} returned HTTP ${res.status}. Falling back to ${FAST_MODEL}...`);
        ollamaPayload.model = FAST_MODEL;
        const fallbackRes = await fetch(OLLAMA_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ollamaPayload),
          signal: AbortSignal.timeout(120_000),
        });
        if (fallbackRes.ok) {
          return handleOllamaResponse(fallbackRes, FAST_MODEL, routeDecision, stream, requestStarted);
        }
      }

      const details = await res.text();
      console.error(`Ollama returned HTTP ${res.status}: ${details}`);
      return NextResponse.json(
        { error: `Local Ollama model returned HTTP ${res.status}.` },
        { status: 503 },
      );
    }

    return handleOllamaResponse(res, chosenModel, routeDecision, stream, requestStarted);
  } catch (error) {
    console.error("Ollama chat request failed:", error);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "Local Ollama took too long to respond. Please try again."
          : "Could not connect to the local Ollama server.",
      },
      { status: timedOut ? 504 : 503 },
    );
  }
}

async function handleOllamaResponse(
  res: Response,
  model: string,
  route: RouteDecision,
  stream: boolean,
  requestStarted: number
): Promise<Response> {
  const encoder = new TextEncoder();

  if (stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedReply = "";

    const streamResponse = new ReadableStream({
      async start(controller) {
        // Send routing decision first
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "route", decision: route, model })}\n\n`)
        );

        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const chunk = JSON.parse(trimmed);
                const content = chunk.message?.content || "";
                if (content) {
                  accumulatedReply += content;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "token", content })}\n\n`)
                  );
                }
                if (chunk.done) {
                  const elapsedMs = Math.round(performance.now() - requestStarted);
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "done",
                        reply: accumulatedReply.trim(),
                        model,
                        eval_count: chunk.eval_count,
                        elapsedMs,
                      })}\n\n`
                    )
                  );
                }
              } catch {
                // Ignore json parse error on fragmented lines
              }
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(streamResponse, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming response
  const data = await res.json();
  const reply = typeof data.message?.content === "string" ? data.message.content.trim() : "";
  if (!reply) {
    return NextResponse.json({ error: "Local Ollama returned an empty response." }, { status: 502 });
  }

  const elapsedMs = Math.round(performance.now() - requestStarted);
  console.info("[ULTRON TIMING] chat", {
    model,
    intent: route.intent,
    elapsedMs,
    generatedTokens: data.eval_count,
  });

  return NextResponse.json({
    reply,
    model,
    route,
    elapsedMs,
  });
}
