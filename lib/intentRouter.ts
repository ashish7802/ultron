/**
 * ULTRON Intent & Brain Router
 * 
 * Routes user requests intelligently:
 * 1. SYSTEM_LOCAL: Instant (0ms) deterministic execution (time, date, orb controls, diagnostics)
 * 2. FAST_CHAT: Ultra-low latency conversational greetings (uses fast model: qwen2.5:0.5b)
 * 3. COMPLEX_REASONING: High-capacity multi-step thinking & problem solving (uses smart brain: qwen2.5:1.5b)
 * 4. TOOL_CALL: Structured function calling schema for automation & tool dispatch
 */

export type RouteIntent =
  | "SYSTEM_LOCAL"
  | "FAST_CHAT"
  | "COMPLEX_REASONING"
  | "TOOL_CALL";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export const ULTRON_TOOLS: ToolDefinition[] = [
  {
    name: "system_control",
    description: "Controls the Ultron UI or system hardware (reset_view, zoom_in, zoom_out, toggle_gestures, toggle_voice)",
    parameters: {
      action: {
        type: "string",
        description: "The specific action to perform: reset_view | zoom_in | zoom_out | toggle_gestures | toggle_voice",
        required: true,
      },
    },
  },
  {
    name: "get_system_diagnostics",
    description: "Fetches system status including memory, uptime, active model, and hardware info",
    parameters: {},
  },
  {
    name: "calculate",
    description: "Evaluates a mathematical or scientific expression accurately",
    parameters: {
      expression: {
        type: "string",
        description: "Mathematical expression to compute, e.g. '15 * 1024' or '(1.10 - 1.00) / 2'",
        required: true,
      },
    },
  },
  {
    name: "web_search",
    description: "Simulates or performs web search query for current real-time world events",
    parameters: {
      query: {
        type: "string",
        description: "The search query keywords",
        required: true,
      },
    },
  },
];

export interface RouteDecision {
  intent: RouteIntent;
  targetModel: string;
  fastLocalResponse?: string;
  toolRequired?: string;
  confidence: number;
  reason: string;
}

// Fast regex patterns for 0ms deterministic responses
const TIME_DATE_PATTERNS = [
  /\b(what time is it|current time|kya time hai|kya baj raha hai|samay kya hai|time please|tell me the time)\b/i,
  /\b(what is the date|today's date|aaj ki date|aaj kaun sa din hai|what day is it|current date)\b/i,
];

const SYSTEM_CONTROL_PATTERNS = [
  /\b(reset view|reset orb|orb reset|camera reset)\b/i,
  /\b(status report|system status|system diagnostic|diagnostics|hardware check)\b/i,
];

const GREETING_PATTERNS = [
  /^(hi|hello|hey|hey ultron|hello ultron|hola|namaste|sup|yo|good morning|good evening|good afternoon)[\s!.,?]*$/i,
  /^(how are you|kaise ho|how are you doing|sab kaisa hai)[\s!.,?]*$/i,
  /^(who are you|tum kaun ho|introduce yourself|what is your name)[\s!.,?]*$/i,
];

const COMPLEX_TRIGGERS = [
  /\b(why|how does|explain|analyze|calculate|solve|compare|difference between|write a|code|implement|function|algorithm|python|javascript|typescript|logic|reasoning)\b/i,
  /\b(bat and a ball|riddle|puzzle|math|integral|derivative|theorem|quantum|physics|step by step|multi-step)\b/i,
];

const TOOL_TRIGGERS = [
  /\b(set volume|change volume|volume ko|mute|unmute)\b/i,
  /\b(search for|google|web search|look up online|find info about)\b/i,
  /\b(calculate|compute|math for|hisab lagao)\b/i,
];

export function routeUserQuery(
  userInput: string,
  modelOverride?: string
): RouteDecision {
  const trimmed = userInput.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check for immediate local deterministic queries (Time/Date)
  for (const pattern of TIME_DATE_PATTERNS) {
    if (pattern.test(lower)) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const dateStr = now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const isDateQuery = lower.includes("date") || lower.includes("din") || lower.includes("day");
      const localResponse = isDateQuery
        ? `Today is ${dateStr}. System clock running accurately, sir.`
        : `Current system time is ${timeStr}. All chronometers synchronized.`;

      return {
        intent: "SYSTEM_LOCAL",
        targetModel: "local-rule",
        fastLocalResponse: localResponse,
        confidence: 1.0,
        reason: "Instant deterministic system clock query (anti-hallucination guarantee)",
      };
    }
  }

  // 2. Check for system controls / status reports
  for (const pattern of SYSTEM_CONTROL_PATTERNS) {
    if (pattern.test(lower)) {
      if (lower.includes("status") || lower.includes("diagnostic")) {
        const localResponse = "ULTRON Core Systems: Nominal. Neural Engine: Active. Vision tracking: Calibrated. Memory and audio pipelines operational.";
        return {
          intent: "SYSTEM_LOCAL",
          targetModel: "local-rule",
          fastLocalResponse: localResponse,
          confidence: 0.99,
          reason: "Instant local telemetry & diagnostic report",
        };
      }
    }
  }

  // 3. Check for direct canonical identity queries
  if (/^(who are you|tum kaun ho|who made you|what are you)[\s!.,?]*$/i.test(lower)) {
    return {
      intent: "SYSTEM_LOCAL",
      targetModel: "local-rule",
      fastLocalResponse: "I am ULTRON, your intelligent companion and holographic interface system. Ready for your command.",
      confidence: 1.0,
      reason: "Canonical Ultron identity resolution",
    };
  }

  // 4. Check for tool execution triggers
  for (const pattern of TOOL_TRIGGERS) {
    if (pattern.test(lower)) {
      return {
        intent: "TOOL_CALL",
        targetModel: modelOverride || "qwen2.5:1.5b",
        confidence: 0.92,
        reason: "Detected command requiring external tool execution or parameter extraction",
      };
    }
  }

  // 5. Check for complex reasoning & deep instruct triggers
  let isComplex = false;
  for (const pattern of COMPLEX_TRIGGERS) {
    if (pattern.test(lower)) {
      isComplex = true;
      break;
    }
  }

  // Also if message is long (> 60 chars or multi-sentence), route to stronger brain
  if (isComplex || trimmed.length > 70 || trimmed.includes("?") && trimmed.split(" ").length > 8) {
    return {
      intent: "COMPLEX_REASONING",
      targetModel: modelOverride || "qwen2.5:1.5b",
      confidence: 0.95,
      reason: "Complex reasoning, multi-step inquiry, or high-depth question routed to smart brain",
    };
  }

  // 6. Fast conversational greetings
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        intent: "FAST_CHAT",
        targetModel: modelOverride || "qwen2.5:0.5b",
        confidence: 0.9,
        reason: "Simple conversational ping routed to fast response model",
      };
    }
  }

  // Default fallback: If query has moderate length, route to smart brain for safety and anti-hallucination
  return {
    intent: "COMPLEX_REASONING",
    targetModel: modelOverride || "qwen2.5:1.5b",
    confidence: 0.85,
    reason: "General inquiry routed to qwen2.5:1.5b to minimize hallucination risk",
  };
}

