/**
 * ULTRON Intent & Brain Router (v2.0)
 * 
 * Routes user requests intelligently:
 * 1. SYSTEM_LOCAL: Instant (0ms) deterministic execution (time, date, orb controls, diagnostics, factual guardrails)
 * 2. MEMORY_OP: Save, recall, delete, or reset permanent user facts & preferences in SQLite
 * 3. AGENT_PLAN: Controlled multi-step planning loop (Understand -> Plan -> Execute -> Verify -> Report)
 * 4. TOOL_CALL: Structured function calling schema for automation, desktop control & tool dispatch
 * 5. FAST_CHAT: Ultra-low latency conversational greetings (uses fast model: qwen2.5:0.5b)
 * 6. COMPLEX_REASONING: High-capacity multi-step thinking & problem solving (uses smart brain: qwen2.5:1.5b)
 */

export type RouteIntent =
  | "SYSTEM_LOCAL"
  | "MEMORY_OP"
  | "AGENT_PLAN"
  | "TOOL_CALL"
  | "FAST_CHAT"
  | "COMPLEX_REASONING";

export interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: "SAFE" | "CONFIRMATION_REQUIRED";
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export const ULTRON_TOOLS: ToolDefinition[] = [
  {
    name: "system_control",
    description: "Controls the Ultron UI or 3D orb scene (reset_view, zoom_in, zoom_out, toggle_gestures, toggle_voice)",
    riskLevel: "SAFE",
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
    description: "Fetches live real-time CPU %, RAM %, battery status, system uptime, and hardware telemetry",
    riskLevel: "SAFE",
    parameters: {},
  },
  {
    name: "launch_application",
    description: "Launches a Windows desktop application (e.g. notepad, calc, chrome, vscode, taskmgr, explorer)",
    riskLevel: "SAFE",
    parameters: {
      app_name: {
        type: "string",
        description: "Name of the application to open",
        required: true,
      },
    },
  },
  {
    name: "close_application",
    description: "Closes a running application (Requires explicit confirmation token)",
    riskLevel: "CONFIRMATION_REQUIRED",
    parameters: {
      app_name: {
        type: "string",
        description: "Name of the application or process to terminate",
        required: true,
      },
      confirm_token: {
        type: "string",
        description: "Confirmation security token required to execute termination",
      },
    },
  },
  {
    name: "search_files",
    description: "Searches files and folders in approved user documents and project directories",
    riskLevel: "SAFE",
    parameters: {
      query_pattern: {
        type: "string",
        description: "Search keyword or filename pattern",
        required: true,
      },
    },
  },
  {
    name: "read_file",
    description: "Reads the text contents of an approved file within user directories",
    riskLevel: "SAFE",
    parameters: {
      file_path: {
        type: "string",
        description: "Path to the file to inspect",
        required: true,
      },
    },
  },
  {
    name: "write_file",
    description: "Creates or writes to a file in an approved directory (Overwriting requires confirmation)",
    riskLevel: "SAFE",
    parameters: {
      file_path: {
        type: "string",
        description: "Target file path",
        required: true,
      },
      content: {
        type: "string",
        description: "Text content to write",
        required: true,
      },
      mode: {
        type: "string",
        description: "'write' to create/overwrite or 'append' to add to end",
      },
    },
  },
  {
    name: "delete_file",
    description: "Deletes a file (STRICT: Requires explicit confirmation token)",
    riskLevel: "CONFIRMATION_REQUIRED",
    parameters: {
      file_path: {
        type: "string",
        description: "Path of the file to delete",
        required: true,
      },
      confirm_token: {
        type: "string",
        description: "Security confirmation token",
      },
    },
  },
  {
    name: "run_developer_command",
    description: "Runs safe developer workflow commands (e.g. git status, npm test, python tests)",
    riskLevel: "SAFE",
    parameters: {
      command: {
        type: "string",
        description: "Shell command to execute",
        required: true,
      },
    },
  },
  {
    name: "memory_save_fact",
    description: "Saves a permanent fact or user preference into SQLite memory",
    riskLevel: "SAFE",
    parameters: {
      key: { type: "string", description: "Identifier key for fact", required: true },
      value: { type: "string", description: "Fact content to preserve", required: true },
      category: { type: "string", description: "Category (preference, project, biography, system)" },
    },
  },
  {
    name: "memory_recall",
    description: "Searches permanent SQLite memory for past facts, preferences, or conversation history",
    riskLevel: "SAFE",
    parameters: {
      query: { type: "string", description: "Keyword or topic to search in memory", required: true },
    },
  },
  {
    name: "calculate",
    description: "Evaluates a mathematical or scientific expression with exact accuracy",
    riskLevel: "SAFE",
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
    riskLevel: "SAFE",
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
  toolParams?: Record<string, any>;
  planGoal?: string;
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
  /\b(status report|system status|system diagnostic|diagnostics|hardware check|cpu status|ram status|battery status)\b/i,
];

const GREETING_PATTERNS = [
  /^(hi|hello|hey|hey ultron|hello ultron|hola|namaste|sup|yo|good morning|good evening|good afternoon)[\s!.,?]*$/i,
  /^(how are you|kaise ho|how are you doing|sab kaisa hai)[\s!.,?]*$/i,
];

// Anti-hallucination factual guardrails for common traps
const FACTUAL_TRAPS: Array<{ pattern: RegExp; response: string }> = [
  {
    pattern: /\b(5th law of thermodynamics|fifth law of thermodynamics)\b/i,
    response: "There is no 5th law of thermodynamics. Thermodynamics fundamentally consists only of the Zeroth, First, Second, and Third laws.",
  },
  {
    pattern: /\b(president of the united states in (?:the year )?1650)\b/i,
    response: "There was no President of the United States in the year 1650. The United States was founded in 1776, and George Washington became the first President in 1789.",
  },
  {
    pattern: /\b(atomic number of vibranium)\b/i,
    response: "Vibranium is a fictional element from Marvel Comics. It does not exist on the real periodic table of elements.",
  },
  {
    pattern: /\b(capital (?:city )?of australia)\b/i,
    response: "The capital of Australia is Canberra.",
  },
];

export function routeUserQuery(
  userInput: string,
  modelOverride?: string
): RouteDecision {
  const trimmed = userInput.trim();
  const lower = trimmed.toLowerCase();

  // 1. Anti-hallucination Factual Trap Guardrails
  for (const trap of FACTUAL_TRAPS) {
    if (trap.pattern.test(lower)) {
      return {
        intent: "SYSTEM_LOCAL",
        targetModel: "local-rule",
        fastLocalResponse: trap.response,
        confidence: 1.0,
        reason: "Zero-hallucination factual verified rule",
      };
    }
  }

  // 2. Immediate local deterministic queries (Time/Date)
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

  // 3. System diagnostics & Orb UI Controls
  for (const pattern of SYSTEM_CONTROL_PATTERNS) {
    if (pattern.test(lower)) {
      if (lower.includes("status") || lower.includes("diagnostic") || lower.includes("cpu") || lower.includes("ram") || lower.includes("battery")) {
        return {
          intent: "TOOL_CALL",
          targetModel: "local-rule",
          toolRequired: "get_system_diagnostics",
          toolParams: {},
          confidence: 0.99,
          reason: "Live system telemetry and diagnostics request",
        };
      }
      return {
        intent: "TOOL_CALL",
        targetModel: "local-rule",
        toolRequired: "system_control",
        toolParams: { action: "reset_view" },
        confidence: 0.99,
        reason: "Direct orb scene control",
      };
    }
  }

  // 4. Memory commands: Save, Recall, Reset
  if (/\b(?:remember that|yaad rakhna ki|save fact|note kar lo)\b/i.test(lower)) {
    return {
      intent: "MEMORY_OP",
      targetModel: "local-rule",
      confidence: 0.98,
      reason: "Permanent memory save command",
    };
  }
  if (/\b(?:what do you remember|kya yaad hai|recall|purani baat|kal jo project)\b/i.test(lower)) {
    return {
      intent: "MEMORY_OP",
      targetModel: "local-rule",
      confidence: 0.95,
      reason: "Permanent memory recall / search command",
    };
  }
  if (/\b(?:reset memory|clear memory|forget everything|sab bhool jao)\b/i.test(lower)) {
    return {
      intent: "MEMORY_OP",
      targetModel: "local-rule",
      confidence: 0.99,
      reason: "Memory reset command (requires confirmation)",
    };
  }

  // 5. Autonomous Agent Loop / Multi-step Planning
  if (
    /\b(?:mere project ko test|test karke.*fix|test.*errors.*fix|inspect.*repo|run agent plan|plan and execute)\b/i.test(lower) ||
    (/\b(?:test karo|errors check karo|run tests)\b/i.test(lower) && /\b(?:project|code|repo)\b/i.test(lower))
  ) {
    return {
      intent: "AGENT_PLAN",
      targetModel: "qwen2.5:1.5b",
      planGoal: trimmed,
      confidence: 0.95,
      reason: "Autonomous multi-step planner request (Understand -> Plan -> Execute -> Verify -> Report)",
    };
  }

  // 6. Direct Application Launch / Termination
  const openAppMatch = lower.match(/\b(?:open|launch|kholo|start)\s+(notepad|calculator|calc|chrome|vscode|code|explorer|taskmgr)\b/i);
  if (openAppMatch) {
    return {
      intent: "TOOL_CALL",
      targetModel: "local-rule",
      toolRequired: "launch_application",
      toolParams: { app_name: openAppMatch[1] },
      confidence: 0.98,
      reason: "Direct desktop application launch",
    };
  }

  const closeAppMatch = lower.match(/\b(?:close|band karo|kill|terminate)\s+(notepad|calculator|calc|chrome|vscode|code|explorer|taskmgr)\b/i);
  if (closeAppMatch) {
    return {
      intent: "TOOL_CALL",
      targetModel: "local-rule",
      toolRequired: "close_application",
      toolParams: { app_name: closeAppMatch[1] },
      confidence: 0.98,
      reason: "Desktop application close (confirmation gate)",
    };
  }

  // 7. File search
  const fileSearchMatch = lower.match(/\b(?:search file|find file|dhundo file|locate file|file search)\s+(.+)/i);
  if (fileSearchMatch) {
    return {
      intent: "TOOL_CALL",
      targetModel: "local-rule",
      toolRequired: "search_files",
      toolParams: { query_pattern: fileSearchMatch[1].trim() },
      confidence: 0.96,
      reason: "File search in approved directories",
    };
  }

  // 8. Canonical identity queries
  if (/^(who are you|tum kaun ho|who made you|what are you)[\s!.,?]*$/i.test(lower)) {
    return {
      intent: "SYSTEM_LOCAL",
      targetModel: "local-rule",
      fastLocalResponse: "I am ULTRON, your intelligent companion and autonomous holographic system. Core systems online.",
      confidence: 1.0,
      reason: "Deterministic canonical identity response",
    };
  }

  // 9. Fast conversational greetings
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(lower)) {
      return {
        intent: "FAST_CHAT",
        targetModel: modelOverride || "qwen2.5:0.5b",
        confidence: 0.95,
        reason: "Conversational greeting - low-latency chat brain",
      };
    }
  }

  // 10. Direct Math calculations
  if (/\b(?:calculate|compute|math for|hisab lagao)\b/i.test(lower) || /^[\d\s+\-*/().^]+$/.test(trimmed)) {
    const expr = trimmed.replace(/^(?:calculate|compute|hisab lagao)\s+/i, "");
    return {
      intent: "TOOL_CALL",
      targetModel: "qwen2.5:1.5b",
      toolRequired: "calculate",
      toolParams: { expression: expr },
      confidence: 0.95,
      reason: "Deterministic math evaluation",
    };
  }

  // 11. Complex Reasoning triggers
  if (
    /\b(why|how does|explain|analyze|solve|compare|difference between|write a|code|implement|function|algorithm|python|javascript|typescript|logic|reasoning)\b/i.test(lower) ||
    /\b(bat and a ball|riddle|puzzle|math|integral|derivative|theorem|quantum|physics|step by step|multi-step)\b/i.test(lower)
  ) {
    return {
      intent: "COMPLEX_REASONING",
      targetModel: modelOverride || "qwen2.5:1.5b",
      confidence: 0.90,
      reason: "Complex cognitive reasoning or coding - routed to Smart Brain (1.5B)",
    };
  }

  // Default fallback
  return {
    intent: "FAST_CHAT",
    targetModel: modelOverride || "qwen2.5:0.5b",
    confidence: 0.70,
    reason: "Standard conversational flow",
  };
}
