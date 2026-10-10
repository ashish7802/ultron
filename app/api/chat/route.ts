import { NextResponse } from "next/server";

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "qwen2.5:0.5b";
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_CONVERSATION_LENGTH = 12_000;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
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

  const { messages } = body as { messages: unknown };
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

  const fullMessages = [
    {
      role: "system",
      content:
        "You are ULTRON, the intelligent AI companion. " +
        "Answer the user's specific question directly, accurately, and concisely in 1 or 2 friendly Hinglish sentences. " +
        "Use previous turns as conversation context. Never repeat system messages.",
    },
    ...conversation,
  ];

  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: fullMessages,
        keep_alive: "24h",
        options: {
          num_predict: 32,
          temperature: 0.6,
        },
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const details = await res.text();
      console.error(`Ollama returned HTTP ${res.status}: ${details}`);
      return NextResponse.json(
        { error: `Local Ollama model returned HTTP ${res.status}.` },
        { status: 503 },
      );
    }

    const data: {
      message?: { content?: unknown };
      total_duration?: number;
      load_duration?: number;
      prompt_eval_duration?: number;
      eval_duration?: number;
      eval_count?: number;
    } = await res.json();
    const reply = typeof data.message?.content === "string"
      ? data.message.content.trim()
      : "";
    if (!reply) {
      console.error("Ollama returned an empty or invalid assistant message.");
      return NextResponse.json(
        { error: "Local Ollama returned an empty response." },
        { status: 502 },
      );
    }

    console.info("[ULTRON TIMING] chat", {
      elapsedMs: Math.round(performance.now() - requestStarted),
      ollamaTotalMs: data.total_duration
        ? Math.round(data.total_duration / 1_000_000)
        : undefined,
      modelLoadMs: data.load_duration
        ? Math.round(data.load_duration / 1_000_000)
        : undefined,
      promptEvalMs: data.prompt_eval_duration
        ? Math.round(data.prompt_eval_duration / 1_000_000)
        : undefined,
      generationMs: data.eval_duration
        ? Math.round(data.eval_duration / 1_000_000)
        : undefined,
      generatedTokens: data.eval_count,
    });
    return NextResponse.json({ reply, model: MODEL });
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
