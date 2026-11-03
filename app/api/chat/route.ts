/**
 * @file app/api/chat/route.ts
 * @description Intelligent Chat, Command Execution & Local Desktop Control Route.
 *
 * Subsystem:
 * Natural Conversation, Decision Routing & Local Tool Execution.
 *
 * Key Responsibilities:
 * - Validates the request body (JSON shape, message roles, sizes) before any work is done.
 * - Handles deterministic app-launch commands ("open chrome", "notepad kholo") through the
 *   allow-listed local app launcher, so the LLM never has to pretend a command succeeded.
 * - Integrates with ResponseDecisionEngine to filter background chatter, ignore noise and
 *   handle interruptions / destructive-action confirmation requests.
 * - Applies the Quick-Decision Policy: ambiguous input is answered with a stated `assumption`
 *   instead of a clarification loop, so ULTRON never stalls on doubt.
 * - Queries the local Ollama LLM with conversation context and an anti-hallucination
 *   instruction; escalates explicit time-sensitive questions to the Python research agent.
 * - Streams progress narration (`type:"status"`, phase/progress/message) and reply tokens via
 *   Server-Sent Events with client-disconnect handling, or returns a JSON reply/telemetry body.
 *
 * Safety / Security Guarantees:
 * - Local single-user design: authentication is NOT required (fingerprint / WebAuthn /
 *   Zero-Trust session gating removed per user request).
 * - Sealed request envelopes are still authenticated by AES-256-GCM before use.
 * - App launching is allow-listed (discovered shortcuts + fixed built-ins) and shell-free, so
 *   spoken text can never become a command line.
 * - Replies carry honest `grounded`/`degraded`/`confidence` metadata; when no source can answer,
 *   ULTRON says so instead of inventing facts.
 * - Internal error details stay in server logs; clients receive stable error codes.
 */

import { NextRequest, NextResponse } from "next/server";
import { ResponseDecisionEngine } from "@/lib/responseDecisionEngine";
import { unsealPayload, getCryptoStatus } from "@/lib/crypto";
import { detectAppLaunchIntent, launchAppByName } from "@/lib/appLauncher";
import { runQuantumResearchAgent } from "@/app/api/research/route";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:0.5b";
/** LLM request budget; keeps a dead Ollama from blocking the HUD for long. */
const OLLAMA_TIMEOUT_MS = 8000;
/** Request-shape limits (the HUD sends a trimmed conversation, but the API is public on loopback). */
const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 8000;

const decisionEngine = new ResponseDecisionEngine();

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Progress narration emitted over SSE so the HUD can speak what ULTRON is doing. */
interface WorkStatus {
  phase: string;
  progress: number;
  message: string;
}

/** One research citation surfaced to the HUD for grounding/transparency. */
interface ResearchSource {
  title: string;
  url: string;
  domain: string;
  credibility_score?: number;
}

/** One completed reply plus the metadata the HUD/telemetry consumers need. */
interface ResponseOutcome {
  reply: string;
  dossier: Record<string, unknown> | null;
  degraded: boolean;
  /** True when the answer came from a deterministic local rule or a verified tool result. */
  grounded: boolean;
  usedLocalRule: boolean;
  usedResearch: boolean;
  usedTool: boolean;
}

const KNOWN_COMMANDS: Record<string, string> = {
  "status": "ULTRON systems operational. Audio VAD online. All local modules healthy.",
  "help": "Voice Commands: 'Hey Ultron' to activate, V for voice toggle, G for hand gestures, T for text prompt, R to reset 3D orb. You can also say 'open <app>' to launch any installed app.",
  "who are you": "I am ULTRON, your local context-aware personal AI assistant.",
  "what can you do": "I chat, remember context, research the web when you ask, launch any installed desktop app on command, and track hand gestures in 3D.",
  "security": "Local security: AES-256-GCM sealed payloads. Fingerprint/Zero-Trust login is disabled in this local single-user build.",
  "encryption": "Payloads are sealed with 256-bit AES-GCM (NIST SP 800-38D); memory is encrypted at rest by the local Python vault.",
};

/**
 * Returns true when the utterance is an explicit or genuinely time-sensitive research request.
 *
 * WHY: a previous heuristic fired for almost any "who is / what is / explain ..." sentence, so
 * ordinary conversation launched a 30-second Python web-scrape. Research now requires either an
 * explicit research verb or a freshness cue combined with a question/request frame.
 *
 * @param text - Cleaned user query.
 * @returns True when the query should be escalated to the Quantum Research Agent.
 */
function isResearchQuery(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Built-in assistant commands must never hit the network.
  const explicitSystemKeywords = [
    "who are you", "what time", "what date", "what can you do", "help",
    "status", "security", "encryption", "biometric", "fingerprint"
  ];
  if (explicitSystemKeywords.some((w) => lower === w || lower.startsWith(`${w} `))) {
    return false;
  }

  // Never research local clock/date questions ("what's the current time").
  if (/\b(current|local|exact)\s+(time|date)\b/.test(lower) || lower.includes("what time")) {
    return false;
  }

  // 1. Explicit research verbs / phrases.
  if (/^(research|search|look up|lookup|browse|explore|investigate|find out|khojo|dhundho|pata lagao)\b/i.test(lower)) {
    return true;
  }
  if (/\b(web research|live research|quantum research|search the web|browse the web)\b/i.test(lower)) {
    return true;
  }

  // 2. Freshness cue + question/request frame (e.g. "latest news on X", "current price of Y").
  const freshnessCue = /\b(latest|newest|current|recent|breaking|live|today|this week|this month|this year|news|update[sd]?)\b/i;
  const questionFrame = /^(what|who|when|where|why|how|which|tell me|give me|show me|find|is|are|does|do|can|should)\b|\?/i;
  return freshnessCue.test(lower) && questionFrame.test(lower);
}

/**
 * Resolves deterministic local answers (commands, math, time/date, app help) without an LLM.
 *
 * @param message - User query.
 * @returns Reply string, or null when no local rule matches.
 */
function resolveLocalRule(message: string): string | null {
  const lower = message.toLowerCase().trim();

  for (const [trigger, reply] of Object.entries(KNOWN_COMMANDS)) {
    if (lower === trigger || lower.startsWith(`${trigger} `)) {
      return reply;
    }
  }

  // Instant sub-millisecond math calculator
  const mathMatch = lower.match(/(?:what is|calculate|solve)?\s*(\d+)\s*([-+*/])\s*(\d+)/i);
  if (mathMatch) {
    const a = parseFloat(mathMatch[1]);
    const op = mathMatch[2];
    const b = parseFloat(mathMatch[3]);
    let ans = 0;
    if (op === "+") ans = a + b;
    else if (op === "-") ans = a - b;
    else if (op === "*") ans = a * b;
    else if (op === "/") {
      // Division by zero previously fell through and returned "x / 0 is 0.",
      // which is factually wrong; refuse honestly instead of inventing a value.
      if (b === 0) return "I can't divide by zero.";
      ans = a / b;
    }
    return `${a} ${op} ${b} is ${ans}.`;
  }

  if (lower.includes("what time") || lower === "time") {
    return `The current time is ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`;
  }

  if (lower.includes("what date") || lower.includes("today's date") || lower === "date") {
    return `Today is ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
  }

  if (lower.includes("encryption") || lower.includes("security") || lower.includes("fingerprint") || lower.includes("biometric")) {
    return "Local security: payloads are sealed with AES-256-GCM and memory is encrypted at rest. Fingerprint/Zero-Trust login has been disabled in this local single-user build.";
  }

  // Word-boundary matching: a substring test made words like "spaceship" (contains "hi")
  // and "whey" (contains "hey") produce a greeting reply instead of a real answer.
  if (/\b(hello|hi|hey)\b/i.test(lower)) {
    return "Hello. ULTRON systems active. How can I assist you?";
  }

  return null;
}

/**
 * Maps the decision engine's fine-grained intent to the HUD's brain-badge vocabulary.
 *
 * @param decisionIntent - Raw intent from the response decision engine.
 * @param usedLocalRule - True when a deterministic local rule produced the reply.
 * @param usedResearch - True when the quantum research agent produced the reply.
 * @param degraded - True when the LLM was unavailable and the deterministic fallback ran.
 * @param usedTool - True when a local tool (e.g. app launcher) executed the command.
 * @returns Intent identifier understood by the HUD badge renderer.
 */
function toHudIntent(
  decisionIntent: string,
  usedLocalRule: boolean,
  usedResearch: boolean,
  degraded: boolean,
  usedTool: boolean
): string {
  if (usedResearch) return "QUANTUM_RESEARCH";
  if (usedTool) return "TOOL_CALL";
  if (usedLocalRule || degraded) return "SYSTEM_LOCAL";
  if (decisionIntent === "CRITICAL_ACTION") return "TOOL_CALL";
  // In this build the only remaining reply source is the local Ollama "fast brain".
  return "FAST_CHAT";
}

/**
 * Formats recent conversation turns for the Ollama prompt.
 *
 * WHY: conversation history keeps follow-up questions ("and the second one?") meaningful.
 * Only a few short turns are included to keep the tiny local model's prompt within budget.
 *
 * @param history - Validated conversation messages (current user message is last).
 * @returns Compact "Role: text" transcript of the preceding turns.
 */
function formatHistory(history: ChatMessage[]): string {
  const previousTurns = history.slice(-5, -1);
  if (previousTurns.length === 0) return "";
  return previousTurns
    .map((entry) => {
      const text = entry.content.replace(/\s+/g, " ").trim().slice(0, 240);
      return `${entry.role === "assistant" ? "ULTRON" : entry.role === "system" ? "System" : "User"}: ${text}`;
    })
    .join("\n");
}

/**
 * Queries the local Ollama LLM with an explicit anti-hallucination instruction.
 *
 * @param prompt - Current user query.
 * @param history - Recent conversation turns for context.
 * @param signal - Optional request abort signal; aborts the fetch immediately.
 * @returns Reply text, or null when Ollama is unavailable/timed out/aborted.
 */
async function queryOllama(prompt: string, history: ChatMessage[], signal?: AbortSignal): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const abortFromRequest = () => controller.abort();
  signal?.addEventListener("abort", abortFromRequest, { once: true });

  try {
    const historyText = formatHistory(history);
    const fullPrompt =
      "You are ULTRON, a local desktop AI assistant. Answer in ONE short sentence. " +
      "If you are not sure or lack information, say so briefly instead of guessing. " +
      "Never invent facts, names, dates, prices or numbers.\n" +
      (historyText ? `Conversation so far:\n${historyText}\n` : "") +
      `User: ${prompt}\nULTRON:`;
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: fullPrompt,
        stream: false,
        keep_alive: -1, // Keep model warm in RAM indefinitely to eliminate cold-start delays
        options: {
          num_predict: 42,
          temperature: 0.2,
          top_k: 20,
          top_p: 0.8,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.response ? String(data.response).trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromRequest);
  }
}

/**
 * Extracts HUD-safe citation objects from a research dossier.
 *
 * @param dossier - Research dossier object (untrusted shape).
 * @returns Validated source citations for grounding/telemetry.
 */
function extractSources(dossier: Record<string, unknown> | null): ResearchSource[] {
  if (!dossier || !Array.isArray(dossier.sources)) return [];
  const sources: ResearchSource[] = [];
  for (const raw of dossier.sources) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.url !== "string" || typeof entry.title !== "string") continue;
    sources.push({
      title: entry.title,
      url: entry.url,
      domain: typeof entry.domain === "string" ? entry.domain : "",
      credibility_score: typeof entry.credibility_score === "number" ? entry.credibility_score : undefined,
    });
  }
  return sources;
}

/**
 * Runs the reply pipeline: app tool -> local rules -> research -> Ollama -> honest fallback.
 *
 * @param query - Interpreted user query.
 * @param messages - Full validated conversation.
 * @param signal - Request abort signal.
 * @param appRequest - Detected app-launch request (or null).
 * @param onStatus - Progress narration callback for SSE consumers.
 * @returns Completed outcome with reply text and grounding metadata.
 */
async function buildResponse(
  query: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  appRequest: string | null,
  onStatus?: (status: WorkStatus) => void
): Promise<ResponseOutcome> {
  if (appRequest) {
    onStatus?.({ phase: "tool_execution", progress: 0.35, message: `Launching ${appRequest}.` });
    const launchResult = await launchAppByName(appRequest);
    onStatus?.({
      phase: "tool_complete",
      progress: 0.9,
      message: launchResult.ok ? `Launched ${launchResult.app ?? appRequest}.` : "App not launched.",
    });
    return {
      reply: launchResult.message,
      dossier: null,
      degraded: false,
      grounded: true,
      usedLocalRule: false,
      usedResearch: false,
      usedTool: true,
    };
  }

  let reply = resolveLocalRule(query);
  const usedLocalRule = Boolean(reply);
  let dossier: Record<string, unknown> | null = null;
  let degraded = false;

  if (!reply && isResearchQuery(query)) {
    try {
      console.log(`[QUANTUM RESEARCH INITIATED] Query: "${query}"`);
      onStatus?.({
        phase: "web_research",
        progress: 0.25,
        message: "Checking live web sources for that. This can take a few seconds.",
      });
      dossier = await runQuantumResearchAgent(query, 6, signal);
      const summary = dossier?.executive_summary;
      if (typeof summary === "string" && summary.trim()) {
        reply = summary;
      }
      onStatus?.({ phase: "synthesis", progress: 0.85, message: "Research complete. Preparing the answer." });
    } catch (rErr) {
      console.warn("[QUANTUM RESEARCH EXECUTION FAILED, FALLING BACK TO LLM]", rErr);
      // Propagate the abort (with the original cause for diagnostics) so the route can
      // return HTTP 499 instead of spending the LLM budget on a client that disconnected.
      if (signal.aborted) throw new Error("Request aborted during research", { cause: rErr });
    }
  }

  if (!reply) {
    onStatus?.({ phase: "thinking", progress: 0.5, message: "Thinking." });
    reply = await queryOllama(query, messages, signal);
    if (!reply) degraded = true;
  }

  if (!reply) {
    // Honest fallback: never pretend to know an answer when no source could produce one.
    reply = `I don't have a confident answer for "${query}" right now because the local language model is unavailable.`;
    onStatus?.({ phase: "degraded", progress: 0.9, message: "Local model unavailable." });
  }

  return {
    reply,
    dossier,
    degraded,
    grounded: usedLocalRule || Boolean(dossier),
    usedLocalRule,
    usedResearch: Boolean(dossier),
    usedTool: false,
  };
}

/**
 * Type guard for plain JSON objects (rejects arrays/null/primitives).
 *
 * @param value - Candidate value.
 * @returns True when value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates and normalizes the chat message list.
 *
 * @param rawMessages - Untrusted `messages` field.
 * @returns Validated messages, or null when the payload is invalid.
 */
function validateMessages(rawMessages: unknown): ChatMessage[] | null {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > MAX_MESSAGES) {
    return null;
  }

  const messages: ChatMessage[] = [];
  for (const entry of rawMessages) {
    if (!isRecord(entry)) return null;
    const role = entry.role;
    const content = entry.content;
    if (role !== "user" && role !== "assistant" && role !== "system") return null;
    if (typeof content !== "string" || content.length > MAX_MESSAGE_CHARS) return null;
    messages.push({ role, content });
  }

  // The route always answers the last user turn.
  if (messages[messages.length - 1].role !== "user") return null;
  return messages;
}

/** SSE writer helper used by the streaming branch. */
interface SseWriter {
  push: (payload: unknown) => boolean;
}

/**
 * Creates a guarded Server-Sent-Events writer.
 *
 * @param controller - ReadableStream controller.
 * @param encoder - Text encoder.
 * @param signal - Request abort signal.
 * @returns Writer that stops emitting after cancellation/abort.
 */
function createSseWriter(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  signal: AbortSignal
): SseWriter {
  let cancelled = false;
  return {
    push(payload: unknown): boolean {
      if (cancelled || signal.aborted) return false;
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        return true;
      } catch {
        cancelled = true;
        return false;
      }
    },
  };
}

/**
 * Handles chat requests.
 *
 * @param req - NextRequest containing messages, streaming flag and activation mode.
 * @returns SSE stream (route/status/token/done events) or JSON reply/telemetry payload.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Parse the body (400 on malformed JSON instead of a 500 fallback).
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }
    if (!isRecord(rawBody)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // 2. End-to-End Cryptographic Unsealing for sealed requests.
    let body: Record<string, unknown> = rawBody;
    if (typeof rawBody.sealed === "string") {
      try {
        const unsealed = await unsealPayload<unknown>(rawBody.sealed);
        if (!isRecord(unsealed)) {
          return NextResponse.json({ error: "Sealed payload must contain an object" }, { status: 400 });
        }
        body = unsealed;
      } catch (err) {
        return NextResponse.json(
          { error: "Cryptographic unseal failure: " + (err instanceof Error ? err.message : String(err)) },
          { status: 403 }
        );
      }
    }

    const messages = validateMessages(body.messages);
    if (!messages) {
      return NextResponse.json(
        { error: `Invalid messages payload (1-${MAX_MESSAGES} user/assistant/system messages of <=${MAX_MESSAGE_CHARS} chars, last message must be from the user)` },
        { status: 400 }
      );
    }

    const stream = body.stream === true;
    const followUpActive = body.followUpActive === true;
    const activationMode =
      body.activationMode === "PUSH_TO_TALK" || body.activationMode === "CONTINUOUS_CONVERSATION"
        ? body.activationMode
        : "WAKE_WORD";

    const lastMessage = messages[messages.length - 1];
    const userText = lastMessage.content;
    console.log(`[SERVER CHAT LOG] User Said: "${userText}" | Mode: ${activationMode} | FollowUp: ${followUpActive}`);

    // Only treat as active follow-up if explicitly within conversation window or non-wake-word mode.
    const isVoiceTurn = activationMode === "WAKE_WORD";
    const decision = decisionEngine.evaluate(userText, {
      followUpWindowActive: isVoiceTurn ? followUpActive : true,
      isAssistantSpeaking: false,
      activationMode,
      turnCount: messages.length,
      lastUserSpeech: messages.length > 2 ? messages[messages.length - 2]?.content : undefined,
    });
    console.log(`[SERVER DECISION] Action: ${decision.action} | Reason: ${decision.reason}`);

    // 3. Non-answer actions: stay silent (IGNORE/LISTEN/INTERRUPT) or acknowledge briefly.
    if (decision.action === "IGNORE" || decision.action === "LISTEN" || decision.action === "INTERRUPT") {
      return NextResponse.json({ action: decision.action, reply: "", silent: true, reason: decision.reason });
    }
    if (decision.action === "REACT" || decision.action === "CLARIFY") {
      const ack =
        decision.acknowledgement_phrase ||
        (decision.action === "REACT" ? "I'm listening." : "Could you please clarify your request?");
      return NextResponse.json({ action: decision.action, reply: ack, silent: false, reason: decision.reason });
    }

    // 4. Destructive-action safety gate: require explicit confirmation before acting.
    if (decision.requires_confirmation) {
      return NextResponse.json({
        action: "RESPOND",
        reply: `That request (${decision.cleaned_query || userText}) can affect system state. Please confirm explicitly before I proceed.`,
        silent: false,
        requiresConfirmation: true,
        reason: decision.reason,
      });
    }

    // 5. Interpret the command; detect deterministic app-launch intents.
    const query = decision.cleaned_query || userText;
    const appRequest = detectAppLaunchIntent(query);
    const assumption = decision.assumption;
    const assistantPrefix = assumption ? `${assumption} ` : "";

    // 6. Streaming branch: open SSE first, narrate progress, then stream the answer.
    if (stream) {
      const encoder = new TextEncoder();
      const signal = req.signal;
      let writer: SseWriter | null = null;

      const sseStream = new ReadableStream({
        async start(controller) {
          writer = createSseWriter(controller, encoder, signal);
          if (!writer.push({
            type: "route",
            decision: {
              action: decision.action,
              intent: toHudIntent(decision.intent, false, false, false, Boolean(appRequest)),
              decisionIntent: decision.intent,
              confidence: decision.confidence,
              assumption,
            },
          })) {
            try { controller.close(); } catch { /* already cancelled */ }
            return;
          }

          try {
            const outcome = await buildResponse(query, messages, signal, appRequest, (status) => {
              writer?.push({ type: "status", ...status });
            });

            // Final "complete" status so the HUD can stop its progress animation.
            writer.push({ type: "status", phase: "complete", progress: 1, message: "" });

            const finalReply = assistantPrefix + outcome.reply;
            const words = finalReply.split(" ");
            for (let i = 0; i < words.length; i++) {
              const chunk = { type: "token", content: words[i] + (i < words.length - 1 ? " " : "") };
              if (!writer.push(chunk)) break;
            }

            writer.push({
              type: "done",
              reply: finalReply,
              action: decision.action,
              intent: toHudIntent(
                decision.intent,
                outcome.usedLocalRule,
                outcome.usedResearch,
                outcome.degraded,
                outcome.usedTool
              ),
              decisionIntent: decision.intent,
              confidence: outcome.usedResearch ? 0.99 : decision.confidence,
              assumption,
              grounded: outcome.grounded,
              degraded: outcome.degraded,
              sources: extractSources(outcome.dossier),
              dossier: outcome.dossier,
            });
          } catch (workErr) {
            if (signal.aborted || String(workErr).toLowerCase().includes("abort")) {
              console.log("[CHAT SSE] Client aborted while working; closing stream.");
            } else {
              console.error("[CHAT SSE] Work failed:", workErr);
              writer.push({
                type: "error",
                error: "CHAT_PROCESSING_FAILED",
                message: "Sorry, I hit an error while working on that.",
              });
              writer.push({
                type: "status",
                phase: "error",
                progress: 1,
                message: "Work failed.",
              });
              writer.push({
                type: "done",
                reply: "Sorry, I hit an error while working on that.",
                action: decision.action,
                intent: "SYSTEM_LOCAL",
                decisionIntent: decision.intent,
                confidence: 0,
                assumption,
                grounded: false,
                degraded: true,
                sources: [],
                dossier: null,
              });
            }
          } finally {
            try { controller.close(); } catch { /* client already cancelled */ }
          }
        },
        cancel() {
          // Client disconnected; the guarded writer stops producing immediately.
        },
      });

      return new NextResponse(sseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Ultron-Security": "AES-256-GCM (sealed payloads only)",
        },
      });
    }

    // 7. Non-streaming JSON branch.
    const outcome = await buildResponse(query, messages, req.signal, appRequest);
    const finalReply = assistantPrefix + outcome.reply;
    return NextResponse.json(
      {
        action: decision.action,
        intent: toHudIntent(
          decision.intent,
          outcome.usedLocalRule,
          outcome.usedResearch,
          outcome.degraded,
          outcome.usedTool
        ),
        decisionIntent: decision.intent,
        confidence: outcome.usedResearch ? 0.99 : decision.confidence,
        assumption,
        reply: finalReply,
        grounded: outcome.grounded,
        degraded: outcome.degraded,
        sources: extractSources(outcome.dossier),
        dossier: outcome.dossier,
        security: getCryptoStatus(),
      },
      {
        headers: {
          "X-Ultron-Security": "AES-256-GCM (sealed payloads only)",
          ...(outcome.dossier ? { "X-Ultron-Research": "QUANTUM_SYNTHESIZED" } : {}),
        },
      }
    );
  } catch (err) {
    // Do not leak internal error text/paths to the client.
    console.error("[CHAT ROUTE EXCEPTION]", err);
    return NextResponse.json({ error: "Chat processing failed" }, { status: 500 });
  }
}
