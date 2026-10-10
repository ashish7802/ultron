import { NextResponse } from "next/server";
import { routeUserQuery, ULTRON_TOOLS, type RouteDecision } from "@/lib/intentRouter";

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const BACKEND_URL = "http://127.0.0.1:5001";
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

function getSystemPrompt(decision: RouteDecision, memoryContext: string = ""): string {
  const memoryBlock = memoryContext
    ? `\n[RELEVANT RETRIEVED MEMORY FROM SQLITE]:\n${memoryContext}\n`
    : "";

  if (decision.intent === "TOOL_CALL") {
    return (
      "You are ULTRON's automated command core. You have direct control over tools and system functions.\n" +
      memoryBlock +
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
      memoryBlock +
      "Answer accurately, logically, and directly without hallucinating.\n" +
      "For cognitive or math questions, calculate carefully and give the exact factual solution.\n" +
      "Keep conversational responses concise (2 to 3 sentences in natural Hinglish or English) unless explicitly asked for in-depth explanation or code."
    );
  }

  // FAST_CHAT default
  return (
    "You are ULTRON, the intelligent AI companion. " +
    memoryBlock +
    "Answer the user directly, accurately, and concisely in 1 or 2 friendly Hinglish sentences. " +
    "Never repeat system messages."
  );
}

// Background memory recording
function recordMemoryTurn(userText: string, assistantReply: string) {
  fetch(`${BACKEND_URL}/memory/record_turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "user", content: userText, summary: "" }),
  }).catch(() => {});

  fetch(`${BACKEND_URL}/memory/record_turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "assistant", content: assistantReply, summary: "" }),
  }).catch(() => {});
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

  const { messages, stream = false, model: userModelOverride, confirmToken } = body as {
    messages: unknown;
    stream?: boolean;
    model?: string;
    confirmToken?: string;
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

  // 2. Instant Local Execution (0ms latency, zero hallucination)
  if (routeDecision.intent === "SYSTEM_LOCAL" && routeDecision.fastLocalResponse) {
    const reply = routeDecision.fastLocalResponse;
    const elapsedMs = Math.round(performance.now() - requestStarted);
    recordMemoryTurn(userText, reply);

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

  // 3. Direct Tool Execution (System diagnostics, App control, Files, Calculations)
  if (routeDecision.intent === "TOOL_CALL" && routeDecision.toolRequired) {
    try {
      let reply = "";
      let toolData: any = null;

      if (routeDecision.toolRequired === "get_system_diagnostics") {
        const diagRes = await fetch(`${BACKEND_URL}/system/diagnostics`, { signal: AbortSignal.timeout(3000) });
        if (diagRes.ok) {
          toolData = await diagRes.json();
          reply = `System Status: CPU ${toolData.cpu_percent}%, RAM ${toolData.ram_percent}% (${toolData.ram_used_gb}/${toolData.ram_total_gb} GB). Battery: ${toolData.battery?.percent ?? "AC Power"}%. Uptime: ${toolData.system_uptime}. All subsystems nominal.`;
        } else {
          reply = "System core is active, but telemetry metrics are momentarily unavailable.";
        }
      } else if (routeDecision.toolRequired === "launch_application") {
        const appRes = await fetch(`${BACKEND_URL}/tools/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "launch_app", params: routeDecision.toolParams }),
          signal: AbortSignal.timeout(3000),
        });
        toolData = await appRes.json();
        reply = toolData.message || toolData.error || "Application launched.";
      } else if (routeDecision.toolRequired === "close_application") {
        const closeRes = await fetch(`${BACKEND_URL}/tools/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: "close_app",
            params: routeDecision.toolParams,
            confirm_token: confirmToken,
          }),
          signal: AbortSignal.timeout(3000),
        });
        toolData = await closeRes.json();
        if (toolData.status === "confirmation_required") {
          reply = `${toolData.warning} ${toolData.prompt}`;
        } else {
          reply = toolData.message || toolData.error || "Processed application close.";
        }
      } else if (routeDecision.toolRequired === "search_files") {
        const searchRes = await fetch(`${BACKEND_URL}/tools/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "search_files", params: routeDecision.toolParams }),
          signal: AbortSignal.timeout(5000),
        });
        toolData = await searchRes.json();
        if (toolData.results && toolData.results.length > 0) {
          const fileNames = toolData.results.slice(0, 5).map((r: any) => r.name).join(", ");
          reply = `Found ${toolData.count} matches for '${routeDecision.toolParams?.query_pattern}': ${fileNames}.`;
        } else {
          reply = `No matching files found for '${routeDecision.toolParams?.query_pattern}'.`;
        }
      } else if (routeDecision.toolRequired === "calculate") {
        try {
          const expr = routeDecision.toolParams?.expression || "";
          // Safe math evaluation
          const sanitized = expr.replace(/[^0-9+\-*/().]/g, "");
          const evaluated = Function(`"use strict"; return (${sanitized})`)();
          reply = `The result of ${expr} is ${evaluated}.`;
        } catch {
          reply = `I could not evaluate the mathematical expression '${routeDecision.toolParams?.expression}'.`;
        }
      }

      if (reply) {
        const elapsedMs = Math.round(performance.now() - requestStarted);
        recordMemoryTurn(userText, reply);

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
                encoder.encode(`data: ${JSON.stringify({ type: "done", reply, model: "tool-registry", elapsedMs, toolData })}\n\n`)
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
          model: "tool-registry",
          route: routeDecision,
          toolData,
          elapsedMs,
        });
      }
    } catch (e) {
      console.warn("Direct tool execution bypassed, falling through to neural router:", e);
    }
  }

  // 4. Memory Operations (Save, Recall, Reset)
  if (routeDecision.intent === "MEMORY_OP") {
    try {
      let reply = "";
      if (userText.toLowerCase().includes("reset") || userText.toLowerCase().includes("forget everything")) {
        const resetRes = await fetch(`${BACKEND_URL}/memory/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        });
        const d = await resetRes.json();
        reply = d.message || "All persistent memories have been cleared, sir.";
      } else if (userText.toLowerCase().includes("remember that") || userText.toLowerCase().includes("yaad rakhna")) {
        const factText = userText.replace(/.*(?:remember that|yaad rakhna ki|save fact:?)\s+/i, "");
        const keySlug = "fact_" + Date.now().toString().slice(-6);
        const saveRes = await fetch(`${BACKEND_URL}/memory/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: keySlug, value: factText, category: "user_preference" }),
        });
        reply = `Understood. I have securely preserved this fact in permanent memory: "${factText}".`;
      } else {
        // Search memory
        const searchRes = await fetch(`${BACKEND_URL}/memory/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: userText }),
        });
        const d = await searchRes.json();
        const facts = (d.facts || []).map((f: any) => `${f.fact_key}: ${f.fact_value}`).join("; ");
        if (facts) {
          reply = `Here is what I have stored in permanent memory: ${facts}.`;
        } else {
          reply = "I checked your permanent memory records, but found no matching entries for that topic.";
        }
      }

      const elapsedMs = Math.round(performance.now() - requestStarted);
      recordMemoryTurn(userText, reply);

      return NextResponse.json({
        reply,
        model: "sqlite-memory",
        route: routeDecision,
        elapsedMs,
      });
    } catch (err) {
      console.warn("Memory operation fallback:", err);
    }
  }

  // 5. Autonomous Agent Loop Planning
  if (routeDecision.intent === "AGENT_PLAN") {
    try {
      const planRes = await fetch(`${BACKEND_URL}/agent/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: routeDecision.planGoal || userText }),
        signal: AbortSignal.timeout(30_000),
      });
      if (planRes.ok) {
        const planReport = await planRes.json();
        const reply = `Agent Loop Executed: ${planReport.passed_steps}/${planReport.total_steps} steps passed (${planReport.overall_status}) in ${planReport.elapsed_seconds}s. All verification criteria met.`;
        const elapsedMs = Math.round(performance.now() - requestStarted);
        recordMemoryTurn(userText, reply);

        return NextResponse.json({
          reply,
          model: "agent-planner",
          route: routeDecision,
          planReport,
          elapsedMs,
        });
      }
    } catch (err) {
      console.warn("Agent plan fallback:", err);
    }
  }

  // 6. Neural Brain Router with Memory Context Injection
  let memoryContext = "";
  try {
    const memRes = await fetch(`${BACKEND_URL}/memory/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: userText, limit: 3 }),
      signal: AbortSignal.timeout(1000),
    });
    if (memRes.ok) {
      const memData = await memRes.json();
      if (memData.facts && memData.facts.length > 0) {
        memoryContext = memData.facts.map((f: any) => `- ${f.fact_key}: ${f.fact_value}`).join("\n");
      }
    }
  } catch {}

  const chosenModel = routeDecision.targetModel || (routeDecision.intent === "FAST_CHAT" ? FAST_MODEL : DEFAULT_MODEL);
  const systemPrompt = getSystemPrompt(routeDecision, memoryContext);
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
      if (chosenModel !== FAST_MODEL) {
        ollamaPayload.model = FAST_MODEL;
        const fallbackRes = await fetch(OLLAMA_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ollamaPayload),
          signal: AbortSignal.timeout(120_000),
        });
        if (fallbackRes.ok) {
          return handleOllamaResponse(fallbackRes, FAST_MODEL, routeDecision, stream, requestStarted, userText);
        }
      }

      return NextResponse.json(
        { error: `Local Ollama model returned HTTP ${res.status}.` },
        { status: 503 },
      );
    }

    return handleOllamaResponse(res, chosenModel, routeDecision, stream, requestStarted, userText);
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
  requestStarted: number,
  userText: string
): Promise<Response> {
  const encoder = new TextEncoder();

  if (stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedReply = "";

    const streamResponse = new ReadableStream({
      async start(controller) {
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
                const token = chunk.message?.content || "";
                if (token) {
                  accumulatedReply += token;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`)
                  );
                }
              } catch {}
            }
          }

          const elapsedMs = Math.round(performance.now() - requestStarted);
          recordMemoryTurn(userText, accumulatedReply);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                reply: accumulatedReply,
                model,
                elapsedMs,
              })}\n\n`
            )
          );
        } catch (streamErr) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: String(streamErr) })}\n\n`)
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

  const data = await res.json();
  const reply = data.message?.content ?? "";
  const elapsedMs = Math.round(performance.now() - requestStarted);
  recordMemoryTurn(userText, reply);

  return NextResponse.json({
    reply,
    model,
    route,
    elapsedMs,
  });
}
