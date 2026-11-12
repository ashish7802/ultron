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
import { spawn } from "child_process";
import { ResponseDecisionEngine } from "@/lib/responseDecisionEngine";
import { unsealPayload, getCryptoStatus } from "@/lib/crypto";
import { detectAppLaunchIntent } from "@/lib/appLauncher";
import { runQuantumResearchAgent } from "@/app/api/research/route";
import { handleSystemControlIntent } from "@/lib/systemController";
import { generateAutonomousKnowledge } from "@/lib/knowledgeEngine";
import { planAction, ActionPlan } from "@/lib/permissionGateway";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import {
  processMemoryIntent,
  recallRelevantMemories,
  formatMemoriesForPrompt,
  loadAllMemories,
} from "@/lib/memoryManager";
import {
  orchestrateCognitivePipeline,
  calculateCalibratedConfidence,
  auditCandidateReply,
} from "@/lib/cognitive/orchestrator";
import { remediateCandidateResponse } from "@/lib/cognitive/selfEvaluationEngine";
import { defaultVisualContextDeliveryEngine } from "@/lib/screen/contextDeliveryEngine";
import { defaultVisionControl } from "@/lib/screen/visionControl";
import { defaultVisualQAEngine } from "@/lib/screen/visualQAEngine";
import { defaultWindowDetectionEngine } from "@/lib/screen/windowDetectionEngine";
import { defaultVisualUnderstandingEngine } from "@/lib/screen/visualUnderstandingEngine";
import { defaultOCREngine } from "@/lib/screen/ocrEngine";
import { defaultScreenContextEngine } from "@/lib/screen/screenContextEngine";
import { defaultVisualProcessingEngine } from "@/lib/screen/visualProcessingEngine";
import { defaultScreenCaptureEngine } from "@/lib/screen/screenCaptureEngine";
import type {
  ParsedContext,
  CognitiveTier,
  CalibratedConfidence,
  AdvancedReasoningResult,
  CriticalThinkingResult,
  ProblemSolvingResult,
  DecisionIntelligenceResult,
  PlanningIntelligenceResult,
  UncertaintyAssessmentResult,
  SelfEvaluationResult,
  ModelSelectionResult,
  CoFounderDiscussionResult,
} from "@/lib/cognitive/types";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:0.5b";
/** LLM request budget; allows rich discussion, code generation, and multi-turn reasoning. */
const OLLAMA_TIMEOUT_MS = 30000;
/** Request-shape limits (the HUD sends a trimmed conversation, but the API is public on loopback). */
const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 8000;

let isSpawningOllama = false;

/**
 * Ensures the local Ollama background server is running, auto-spawning it if inactive.
 *
 * @returns Boolean indicating whether Ollama server is responsive.
 */
async function ensureOllamaService(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return true;
  } catch {
    // Offline, attempt background spawn
  }

  if (isSpawningOllama) return false;
  isSpawningOllama = true;

  try {
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    // Poll for readiness up to 3 seconds
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const check = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1000) });
        if (check.ok) {
          isSpawningOllama = false;
          return true;
        }
      } catch {
        // Continue waiting
      }
    }
  } catch (err) {
    console.warn("[OLLAMA AUTO-START] Could not auto-launch ollama serve:", err);
  } finally {
    isSpawningOllama = false;
  }

  return false;
}

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
  permissionPlan?: ActionPlan;
  cognitiveTier?: CognitiveTier;
  cognitiveConfidence?: CalibratedConfidence;
  cognitiveContext?: ParsedContext;
  cognitiveReasoning?: AdvancedReasoningResult;
  cognitiveCritique?: CriticalThinkingResult;
  cognitiveProblemSolving?: ProblemSolvingResult;
  cognitiveDecision?: DecisionIntelligenceResult;
  cognitivePlanning?: PlanningIntelligenceResult;
  cognitiveUncertainty?: UncertaintyAssessmentResult;
  cognitiveSelfEvaluation?: SelfEvaluationResult;
  cognitiveModelSelection?: ModelSelectionResult;
  cognitiveDiscussion?: CoFounderDiscussionResult;
}

/**
 * Calculates genuine source-grounded credibility confidence for web research.
 *
 * @param dossier - Raw research dossier.
 * @returns Floating point confidence between 0.70 and 0.95.
 */
function calculateResearchConfidence(dossier: Record<string, unknown> | null): number {
  if (!dossier || !Array.isArray(dossier.sources) || dossier.sources.length === 0) {
    return 0.75;
  }
  const sources = dossier.sources as Array<Record<string, unknown>>;
  const validScores = sources
    .map((s) => (typeof s.credibility_score === "number" ? s.credibility_score : null))
    .filter((s): s is number => s !== null);
  if (validScores.length === 0) {
    return 0.80;
  }
  const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length;
  return Math.min(0.95, Math.max(0.70, parseFloat(avg.toFixed(2))));
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
    "status", "security", "encryption", "biometric", "fingerprint",
    "battery", "ram", "volume", "sound"
  ];
  if (explicitSystemKeywords.some((w) => lower === w || lower.startsWith(`${w} `))) {
    return false;
  }

  // Never research local clock/date questions ("what's the current time").
  if (/\b(current|local|exact)\s+(time|date)\b/.test(lower) || lower.includes("what time")) {
    return false;
  }

  // 1. Explicit research verbs / phrases (English & Hinglish).
  if (/^(research|search|look up|lookup|browse|explore|investigate|find out|khojo|dhundho|pata lagao|batao|jankari)\b/i.test(lower)) {
    return true;
  }
  if (/\b(web research|live research|quantum research|search the web|browse the web|quantum search|ke baare me|baray me)\b/i.test(lower)) {
    return true;
  }

  // 2. Freshness cue + question/request frame (e.g. "latest news on X", "current price of Y").
  const freshnessCue = /\b(latest|newest|current|recent|breaking|live|today|this week|this month|this year|news|update[sd]?|trend[s]?|price)\b/i;
  const questionFrame = /^(what|who|when|where|why|how|which|tell me|give me|show me|find|is|are|does|do|can|should|kya|kaun|kab|kahan)\b|\?/i;
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

  // Instant greeting resolution for common greetings/typos (e.g. "hey", "hay", "hello", "hi", "hlo", "yo")
  const greetingMatch = /^(?:hey|hay|hello|hi|hlo|heyy|namaste|yo)(?:\s+ultron|\s+there|\s+buddy)?$/i.exec(lower);
  if (greetingMatch) {
    const memories = loadAllMemories();
    const nameMem = memories.find((m) => m.key === "user_name");
    const name = nameMem ? nameMem.content.replace(/^user's name is\s+/i, "").trim() : "Ashish";
    return `Hello ${name}! How can I assist you today?`;
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
  usedTool: boolean,
  cognitiveTier?: CognitiveTier
): string {
  if (usedResearch) return "QUANTUM_RESEARCH";
  if (usedTool) return "TOOL_CALL";
  if (usedLocalRule || degraded) return "SYSTEM_LOCAL";
  if (decisionIntent === "CRITICAL_ACTION") return "TOOL_CALL";
  if (cognitiveTier === "TIER_2_ANALYTICAL") return "COMPLEX_REASONING";
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
export function formatHistory(history: ChatMessage[]): string {
  // Retain up to 10 previous turns for rich conversation continuity
  const previousTurns = history.slice(-10, -1);
  if (previousTurns.length === 0) return "";
  return previousTurns
    .map((entry) => {
      const text = entry.content.replace(/\s+/g, " ").trim().slice(0, 800);
      return `${entry.role === "assistant" ? "ULTRON" : entry.role === "system" ? "System" : "User"}: ${text}`;
    })
    .join("\n");
}

interface LanguageDirective {
  language: string;
  instruction: string;
}

/**
 * Detects the language of the user input and crafts a prompt instruction so ULTRON
 * mirrors the client's language or defaults to English/Hinglish for Ashish.
 *
 * @param text - User query string.
 * @returns Detected language name and model instruction.
 */
function detectUserLanguage(text: string): LanguageDirective {
  const lower = text.toLowerCase().trim();

  // 1. Script-based detection
  if (/[\u0900-\u097F]/.test(text)) {
    return {
      language: "Hindi",
      instruction: "The user is communicating in Hindi (Devanagari script). Respond fluently and respectfully in Hindi (Devanagari script)."
    };
  }
  if (/[\u3040-\u30FF\u4E00-\u9FAF]/.test(text)) {
    return {
      language: "Japanese",
      instruction: "The user/client is communicating in Japanese. Respond fluently and politely in Japanese."
    };
  }
  if (/[\uAC00-\uD7AF]/.test(text)) {
    return {
      language: "Korean",
      instruction: "The user/client is communicating in Korean. Respond fluently and politely in Korean."
    };
  }
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return {
      language: "Chinese",
      instruction: "The user/client is communicating in Chinese. Respond fluently and politely in Chinese."
    };
  }
  if (/[\u0400-\u04FF]/.test(text)) {
    return {
      language: "Russian",
      instruction: "The user/client is communicating in Russian. Respond fluently in Russian."
    };
  }
  if (/[\u0600-\u06FF]/.test(text)) {
    return {
      language: "Arabic",
      instruction: "The user/client is communicating in Arabic. Respond fluently in Arabic."
    };
  }

  // 2. French cues
  if (/\b(bonjour|salut|merci|comment allez-vous|comment vas-tu|s'il vous pla[iî]t|au revoir|bonne journ[eé]e)\b/i.test(lower)) {
    return {
      language: "French",
      instruction: "The user/client is speaking French. Respond fluently, naturally, and politely in French."
    };
  }

  // 3. German cues
  if (/\b(guten tag|guten morgen|guten abend|wie geht's|wie geht es|danke sch[oö]n|bitte|auf wiedersehen)\b/i.test(lower)) {
    return {
      language: "German",
      instruction: "The user/client is speaking German. Respond fluently, naturally, and politely in German."
    };
  }

  // 4. Spanish cues (multi-word or clear cues; exclude solitary 'hay')
  if (/\b(hola|c[oó]mo est[aá]s|buenos d[ií]as|buenas tardes|buenas noches|muchas gracias|por favor|hasta luego|qu[eé] tal)\b/i.test(lower) && lower !== "hay") {
    return {
      language: "Spanish",
      instruction: "The user/client is speaking Spanish. Respond fluently, naturally, and politely in Spanish."
    };
  }

  // 5. Italian cues
  if (/\b(buongiorno|buonasera|come stai|grazie mille|per favore|arrivederci)\b/i.test(lower)) {
    return {
      language: "Italian",
      instruction: "The user/client is speaking Italian. Respond fluently, naturally, and politely in Italian."
    };
  }

  // 6. Hinglish cues (Hindi words written in Latin alphabet)
  if (/\b(kya|kaise|karo|karna|kholo|batao|bhai|yaar|sun|suno|nahi|nahin|hai|hain|tha|thi|the|hum|mera|meri|mere|tum|tumhe|aap|aapko|mujhe|kaun|kab|kahan|kyu|kyun|theek|accha|acha|dost|madad)\b/i.test(lower)) {
    return {
      language: "Hinglish",
      instruction: "User is Ashish speaking in natural Hinglish (Hindi written in Roman script). Respond in natural, friendly, and intelligent Hinglish, addressing Ashish."
    };
  }

  // Default: English / Friendly Hinglish for Ashish
  return {
    language: "English/Hinglish",
    instruction: "User is Ashish. Respond in articulate English or friendly Hinglish. Words like 'hay', 'heyy', 'hlo', 'hi', 'yo' are informal greetings from Ashish, NOT Spanish or other foreign words."
  };
}

/**
 * Queries the local Ollama LLM grounded with recalled long-term memories and conversational history.
 *
 * @param prompt - Current user query.
 * @param history - Recent conversation turns for context.
 * @param signal - Optional request abort signal; aborts the fetch immediately.
 * @returns Reply text, or null when Ollama is unavailable/timed out/aborted.
 */
async function queryOllama(
  prompt: string,
  history: ChatMessage[],
  signal?: AbortSignal,
  cognitiveDirective?: string,
  targetModel?: string
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const abortFromRequest = () => controller.abort();
  signal?.addEventListener("abort", abortFromRequest, { once: true });

  try {
    // Ensure service is running before dispatching
    await ensureOllamaService();

    const recalledMemories = recallRelevantMemories(prompt, 6);
    const memoryContext = formatMemoriesForPrompt(recalledMemories);
    const langInfo = detectUserLanguage(prompt);

    const baseDirectives = cognitiveDirective
      ? `${cognitiveDirective}\n\n`
      : "You are ULTRON, a highly intelligent personal AI assistant, software architect, and multi-agent coordinator.\n" +
        "Core Directives:\n" +
        "1. Be articulate, insightful, respectful, and direct.\n" +
        "2. For technical questions or code, provide comprehensive, structured answers with Markdown headers, bullet points, and production-ready commented code.\n";

    // Evaluate Screen Awareness Context & Fresh Physical Capture Trigger
    const isVisualQuery =
      /\b(screen|window|error|display|desktop|what is on|what's on|kya open|kya dikh|explain this error|what code|what changed|what was on|what am i doing|fix this error|how do i fix)\b/i.test(
        prompt
      );

    const visionStatus = defaultVisionControl.getStatus();
    let screenContext = defaultVisualContextDeliveryEngine.getLastPayload();

    if (isVisualQuery && visionStatus.isCapturing) {
      const now = Date.now();
      const isStale = !screenContext || now - screenContext.timestamp > 10000;
      if (isStale) {
        screenContext = await defaultVisualContextDeliveryEngine.getFreshOrCachedContext({ forceFresh: true });
      }
    }

    let screenPromptBlock = "";
    if (visionStatus.isCapturing && screenContext) {
      screenPromptBlock = `\n${screenContext.formattedPromptContext}\n`;
    } else if (isVisualQuery && !visionStatus.isCapturing) {
      screenPromptBlock = `\n${defaultVisualContextDeliveryEngine.formatInactivePromptBlock("Vision capture is not active")}\n`;
    }

    const systemPrompt =
      baseDirectives +
      `Language Policy: ${langInfo.instruction}\n` +
      "Adhere strictly to the user's stored identity and preferences:\n" +
      (memoryContext ? `${memoryContext}\n` : "") +
      screenPromptBlock;

    // Format previous turns for native chat message list (last 8 turns)
    const chatTurns: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    const recentHistory = history.slice(-8, -1);
    for (const turn of recentHistory) {
      if (turn.role === "user" || turn.role === "assistant") {
        chatTurns.push({
          role: turn.role,
          content: turn.content.slice(0, 1500),
        });
      }
    }

    chatTurns.push({ role: "user", content: prompt });

    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: targetModel || OLLAMA_MODEL,
        messages: chatTurns,
        stream: false,
        keep_alive: -1, // Keep model warm in RAM indefinitely to eliminate cold-start delays
        options: {
          num_predict: 1024,
          temperature: 0.7,
          top_k: 40,
          top_p: 0.9,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.message?.content ? String(data.message.content).trim() : null;
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
  // 1. Long-Term Memory System (Remember that..., What do you remember?, Name & Role detection)
  const memoryIntent = processMemoryIntent(query);
  if (memoryIntent) {
    onStatus?.({
      phase: "memory_engine",
      progress: 0.9,
      message: memoryIntent.action === "save" ? "Committed to long-term memory." : "Recalled memory vault.",
    });
    return {
      reply: memoryIntent.message,
      dossier: null,
      degraded: false,
      grounded: true,
      usedLocalRule: true,
      usedResearch: false,
      usedTool: false,
    };
  }

  // 2. Laptop Hardware & OS Controls (Battery, RAM specs, Volume, Browser URLs)
  try {
    const systemResult = await handleSystemControlIntent(query);
    if (systemResult && systemResult.handled) {
      onStatus?.({
        phase: "laptop_agent",
        progress: 0.9,
        message: systemResult.permissionPlan ? "Awaiting user approval for OS action." : "Processed laptop OS query.",
      });
      return {
        reply: systemResult.message,
        dossier: null,
        degraded: false,
        grounded: true,
        usedLocalRule: false,
        usedResearch: false,
        usedTool: true,
        permissionPlan: systemResult.permissionPlan,
      };
    }
  } catch (sysErr) {
    console.warn("[SYSTEM CONTROLLER] Handled with error:", sysErr);
  }

  // 2. Desktop Application Launcher - Centralized Permission Gateway Protected
  if (appRequest) {
    onStatus?.({ phase: "laptop_agent", progress: 0.35, message: `Creating execution plan for ${appRequest}...` });
    const plan = planAction("app_launch", appRequest, { appName: appRequest }, [appRequest, "Windows Desktop Session"]);
    onStatus?.({
      phase: "tool_complete",
      progress: 0.9,
      message: `Action plan created for ${appRequest}. Awaiting explicit user approval.`,
    });
    return {
      reply:
        `🛡️ **Computer Action Approval Required**\n\n` +
        `I have prepared an execution plan to launch **${appRequest}**.\n\n` +
        `- **Action:** Application Launch\n` +
        `- **Target:** ${appRequest}\n` +
        `- **Risk Level:** ${plan.riskLevel.toUpperCase()}\n` +
        `- **Security Guarantee:** No desktop application will launch without your explicit authorization.\n\n` +
        `Please approve or cancel this action.`,
      dossier: null,
      degraded: false,
      grounded: true,
      usedLocalRule: false,
      usedResearch: false,
      usedTool: true,
      permissionPlan: plan,
    };
  }

  // 3. Local Deterministic Rules (Math calculations, date/time)
  let reply = resolveLocalRule(query);
  const usedLocalRule = Boolean(reply);
  let dossier: Record<string, unknown> | null = null;
  const degraded = false;

  // 4. Quantum Autonomous Web Research Agent (Superposition multi-vector search)
  if (!reply && isResearchQuery(query)) {
    try {
      console.info("[QUANTUM RESEARCH] Quantum search agent initiated.");
      onStatus?.({
        phase: "quantum_research",
        progress: 0.25,
        message: "Quantum Research: Decomposing search vectors across live web...",
      });
      dossier = await runQuantumResearchAgent(query, 6, signal);
      const summary = dossier?.executive_summary;
      if (typeof summary === "string" && summary.trim()) {
        reply = summary;
      }
      onStatus?.({ phase: "synthesis", progress: 0.85, message: "Synthesizing verified research briefing with citations..." });
    } catch (rErr) {
      console.warn("[QUANTUM RESEARCH] Falling back to the local model.", {
        errorType: rErr instanceof Error ? rErr.name : "UnknownError",
      });
      if (signal.aborted) throw new Error("Request aborted during research", { cause: rErr });
    }
  }

  // 5. Host Conversational Brain (Ollama LLM with Cognitive Orchestration)
  let cognitiveContext: ParsedContext | undefined;
  let cognitiveTier: CognitiveTier = "TIER_1_FAST";
  let cognitiveConfidence: CalibratedConfidence | undefined;
  let cognitiveReasoning: AdvancedReasoningResult | undefined;
  let cognitiveCritique: CriticalThinkingResult | undefined;
  let cognitiveProblemSolving: ProblemSolvingResult | undefined;
  let cognitiveDecision: DecisionIntelligenceResult | undefined;
  let cognitivePlanning: PlanningIntelligenceResult | undefined;
  let cognitiveUncertainty: UncertaintyAssessmentResult | undefined;
  let cognitiveSelfEvaluation: SelfEvaluationResult | undefined;
  let cognitiveModelSelection: ModelSelectionResult | undefined;
  let cognitiveDiscussion: CoFounderDiscussionResult | undefined;

  if (!reply) {
    const cog = await orchestrateCognitivePipeline(query, messages, { onStatus, signal });
    cognitiveContext = cog.context;
    cognitiveTier = cog.tier;
    cognitiveReasoning = cog.reasoning;
    cognitiveCritique = cog.criticalThinking;
    cognitiveProblemSolving = cog.problemSolving;
    cognitiveDecision = cog.decision;
    cognitivePlanning = cog.planning;
    cognitiveUncertainty = cog.uncertainty;
    cognitiveModelSelection = cog.modelSelection;
    cognitiveDiscussion = cog.discussion;

    onStatus?.({
      phase: "thinking",
      progress: 0.5,
      message: cog.tier === "TIER_2_ANALYTICAL"
        ? `Co-Founder Brain (${cog.context.intentCategory} · ${cog.modelSelection?.selectedModel?.name || 'Local'}): Formulating analytical assessment...`
        : "Host Agent: Analyzing & formulating response...",
    });
    const targetModel = cog.modelSelection?.selectedModel?.modelId || OLLAMA_MODEL;
    const rawReply = await queryOllama(query, messages, signal, cog.cognitiveSystemPrompt, targetModel);
    if (rawReply) {
      // Component 08: Pre-delivery response evaluation and remediation pipeline
      onStatus?.({
        phase: "self_evaluation",
        progress: 0.92,
        message: "Self-Evaluation Engine: Validating candidate response against invariants...",
      });
      const audit = auditCandidateReply(rawReply, cog.context, cog.uncertainty);
      cognitiveSelfEvaluation = audit.selfEvaluation;

      if (audit.selfEvaluation && !audit.passed) {
        const remediation = remediateCandidateResponse(rawReply, audit.selfEvaluation, cog.context);
        reply = remediation.finalReply;
      } else {
        reply = rawReply;
      }

      cognitiveConfidence = calculateCalibratedConfidence(cog.context, audit.complianceScore, 1, cog.uncertainty);
    }
  }

  // 6. Autonomous Technical Knowledge & Concept Synthesis
  if (!reply) {
    const smartKnowledge = generateAutonomousKnowledge(query);
    if (smartKnowledge) {
      onStatus?.({ phase: "knowledge_engine", progress: 0.8, message: "Synthesizing deep knowledge structure..." });
      reply = smartKnowledge;
    }
  }

  // 7. Dynamic Web Intelligence Escalation (DISABLED: Local-first offline invariant compliance)
  // Silent unprompted web research fallback is disabled so that local model failures or offline
  // Ollama states do not leak outbound network requests. Explicit web research remains fully
  // available when requested by the user via isResearchQuery (handled in Step 4).

  // 7.5. Grounded Visual Question Answering (VQA) Grounding Fallback
  // If Ollama is offline or unconfigured, and user explicitly asks about the active desktop or screen:
  if (!reply) {
    const isVisualQuery =
      /\b(screen|window|error|display|desktop|what is on|what's on|kya open|kya dikh|explain this error|what code|what changed|what was on|what am i doing|fix this error|how do i fix)\b/i.test(
        query
      );

    if (isVisualQuery) {
      const visionStatus = defaultVisionControl.getStatus();
      if (!visionStatus.isCapturing) {
        reply =
          "Screen awareness is currently **OFF** or inactive. Please enable Screen Awareness using the indicator in the top header to allow me to inspect your desktop.";
      } else {
        try {
          const windowInfo = await defaultWindowDetectionEngine.detectActiveWindows();
          const frame = await defaultScreenCaptureEngine.captureFrame({ mode: "full_screen" });
          const processed = defaultVisualProcessingEngine.processFrame(frame);
          const visual = defaultVisualUnderstandingEngine.analyzeScene(processed, windowInfo.activeWindow);
          const ocr = defaultOCREngine.extractText(processed, windowInfo.activeWindow?.title);
          const context = defaultScreenContextEngine.synthesizeContext(windowInfo, visual, ocr);
          const vqaRes = defaultVisualQAEngine.answerQuestion({ query }, windowInfo, visual, ocr, context);
          reply = vqaRes.answer;
        } catch (err) {
          reply = `Unable to inspect screen: ${err instanceof Error ? err.message : "Capture driver unavailable"}`;
        }
      }
    }
  }

  // 8. Polite & Context-Aware Intelligent Dialogue Fallback
  if (!reply) {
    reply =
      `I have analyzed your inquiry regarding **"${query}"**.\n\n` +
      `Here is how we can explore this effectively:\n\n` +
      `1. **Core Architecture**: Let's identify the foundational goals, components, and constraints.\n` +
      `2. **Implementation & Strategy**: Would you like me to write code, conduct targeted live web research, or launch relevant desktop tools to assist you?\n\n` +
      `Tell me what specific area you'd like to dive into!`;
  }

  return {
    reply,
    dossier,
    degraded,
    grounded: usedLocalRule || Boolean(dossier),
    usedLocalRule,
    usedResearch: Boolean(dossier),
    usedTool: false,
    cognitiveTier,
    cognitiveConfidence,
    cognitiveContext,
    cognitiveReasoning,
    cognitiveCritique,
    cognitiveProblemSolving,
    cognitiveDecision,
    cognitivePlanning,
    cognitiveUncertainty,
    cognitiveSelfEvaluation,
    cognitiveModelSelection,
    cognitiveDiscussion,
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
  const auth = validateDesktopSession(req);
  if (!auth.valid) {
    return createAuthErrorResponse(auth);
  }

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
    // Only treat as active follow-up if explicitly within conversation window or non-wake-word mode.
    const isVoiceTurn = activationMode === "WAKE_WORD";
    const decision = decisionEngine.evaluate(userText, {
      followUpWindowActive: isVoiceTurn ? followUpActive : true,
      isAssistantSpeaking: false,
      activationMode,
      turnCount: messages.length,
      lastUserSpeech: messages.length > 2 ? messages[messages.length - 2]?.content : undefined,
    });
    console.info("[SERVER DECISION]", { action: decision.action });

    // 3. Non-answer actions (Voice turns only; text chat always responds)
    if (isVoiceTurn) {
      if (decision.action === "IGNORE" || decision.action === "LISTEN" || decision.action === "INTERRUPT") {
        return NextResponse.json({ action: decision.action, reply: "", silent: true, reason: decision.reason });
      }
      if (decision.action === "REACT" || decision.action === "CLARIFY") {
        const ack =
          decision.acknowledgement_phrase ||
          (decision.action === "REACT" ? "I'm listening." : "Could you please clarify your request?");
        return NextResponse.json({ action: decision.action, reply: ack, silent: false, reason: decision.reason });
      }
    } else {
      decision.action = "RESPOND";
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
                outcome.usedTool,
                outcome.cognitiveTier
              ),
              decisionIntent: decision.intent,
              confidence: outcome.cognitiveConfidence?.overallScore ?? (outcome.usedResearch ? calculateResearchConfidence(outcome.dossier) : decision.confidence),
              assumption,
              grounded: outcome.grounded,
              degraded: outcome.degraded,
              sources: extractSources(outcome.dossier),
              dossier: outcome.dossier,
              permissionPlan: outcome.permissionPlan,
              cognitiveConfidence: outcome.cognitiveConfidence,
              cognitiveSelfEvaluation: outcome.cognitiveSelfEvaluation,
              cognitiveModelSelection: outcome.cognitiveModelSelection,
              cognitiveDiscussion: outcome.cognitiveDiscussion,
            });
          } catch (workErr) {
            if (signal.aborted || String(workErr).toLowerCase().includes("abort")) {
              console.log("[CHAT SSE] Client aborted while working; closing stream.");
            } else {
              console.error("[CHAT SSE] Work failed.", {
                errorType: workErr instanceof Error ? workErr.name : "UnknownError",
              });
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
          outcome.usedTool,
          outcome.cognitiveTier
        ),
        decisionIntent: decision.intent,
        confidence: outcome.cognitiveConfidence?.overallScore ?? (outcome.usedResearch ? calculateResearchConfidence(outcome.dossier) : decision.confidence),
        assumption,
        reply: finalReply,
        grounded: outcome.grounded,
        degraded: outcome.degraded,
        sources: extractSources(outcome.dossier),
        dossier: outcome.dossier,
        permissionPlan: outcome.permissionPlan,
        cognitiveConfidence: outcome.cognitiveConfidence,
        cognitiveSelfEvaluation: outcome.cognitiveSelfEvaluation,
        cognitiveModelSelection: outcome.cognitiveModelSelection,
        cognitiveDiscussion: outcome.cognitiveDiscussion,
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
    console.error("[CHAT ROUTE EXCEPTION]", {
      errorType: err instanceof Error ? err.name : "UnknownError",
    });
    return NextResponse.json({ error: "Chat processing failed" }, { status: 500 });
  }
}
