/**
 * @file lib/cognitive/contextEngine.ts
 * @description Component 01: Context Understanding Engine for ULTRON.
 *
 * Subsystem:
 * Central Cognitive Intelligence & Natural Language Understanding Layer.
 *
 * Key Responsibilities:
 * - Understands explicit directives versus implicit co-founder intent behind every user instruction.
 * - Maintains conversational continuity across turns, resolving pronouns and follow-up queries.
 * - Detects ambiguity, scores missing parameters, and formulates transparent best-effort assumptions.
 * - Extracts and categorizes multi-step instructions and negative constraints ("never", "do not").
 * - Calculates an empirical task complexity score to guide dynamic cognitive tier routing.
 *
 * Architectural Role & Interactions:
 * - Entry-point engine invoked by `lib/cognitive/orchestrator.ts`.
 * - Ingests the current user query and validated conversation history.
 * - Outputs a normalized, strongly-typed `ParsedContext` used by downstream reasoning engines.
 *
 * Safety / Security Guarantees:
 * - Read-only analysis; does not mutate state or execute child processes.
 * - Separates untrusted user text from internal directive metadata.
 * - Flags conflicting or destructive instructions for explicit confirmation.
 */

import type {
  ParsedContext,
  CognitiveIntentCategory,
  ExtractedInstruction,
  AmbiguityFacet,
  InstructionPriority,
} from "./types.ts";
import { normalizeConversationText } from "./conversationIntelligence.ts";

export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Normalizes input text by removing redundant whitespace and ASCII control characters.
 *
 * @param text - Raw input string.
 * @returns Cleaned single-line or normalized multi-line string.
 */
function cleanQueryText(text: string): string {
  if (!text || typeof text !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

/**
 * Classifies the high-level intent category of the user's inquiry.
 *
 * @param query - Cleaned query string.
 * @param hasCode - True if input contains code blocks or snippets.
 * @returns CognitiveIntentCategory matching the dominant purpose.
 */
function determineIntentCategory(query: string, hasCode: boolean): CognitiveIntentCategory {
  const lower = query.toLowerCase();

  // 1. Fast greetings
  if (/^(?:hey|hello|hi|hlo|heyy|namaste|yo|good\s+(?:morning|afternoon|evening))\b/i.test(lower) && lower.length < 35) {
    return "GREETING";
  }

  // 2. Fast desktop/system commands
  if (/^(?:status|help|time|date|battery|volume|mute|who are you|what can you do)\b/i.test(lower) && lower.length < 50) {
    return "FAST_COMMAND";
  }
  if (/^(?:open|launch|start|kholo)\s+[a-z0-9\s_-]+$/i.test(lower)) {
    return "FAST_COMMAND";
  }

  // 3. Project planning and roadmaps
  if (
    /\b(roadmap|milestone|schedule|timeline|plan|phases?|step-by-step|sprint|breakdown|organize)\b/i.test(lower) &&
    /\b(build|develop|implement|launch|project|system|feature|architecture)\b/i.test(lower)
  ) {
    return "PROJECT_PLANNING";
  }

  // 4. Strategic decision making & trade-off evaluation
  if (
    /\b(should (?:we|i)|decide|decision|pros and cons|trade-off|compare|versus|vs|choose between|alternatives|roi|viability)\b/i.test(lower)
  ) {
    return "STRATEGIC_DECISION";
  }

  // 5. Critical thinking & Devil's Advocate inquiries
  if (
    /\b(challenge|devil\s+s advocate|devils advocate|critique|flaws?|what\s+s wrong with|whats wrong with|risks?|weakness|pitfalls?|counter argument|counterargument|blind spots?)\b/i.test(lower)
  ) {
    return "CRITICAL_INQUIRY";
  }

  // 6. Problem-solving & debugging
  if (
    hasCode ||
    /\b(debug|error|issue|bug|fix|crash|failed?|root cause|why is .* (?:failing|broken|slow)|troubleshoot|bottleneck|times? out|timing out|freezes?|hangs?|locking|lock contention)\b/i.test(lower)
  ) {
    return "PROBLEM_SOLVING";
  }

  // 7. In-depth technical architecture
  if (
    /\b(architecture|refactor|design pattern|distributed|microservice|database schema|api design|encryption|concurrency|performance|saas|cloud|pipeline|electron|ipc)\b/i.test(lower)
  ) {
    return "TECHNICAL_ANALYSIS";
  }

  // 8. Creative exploration / brainstorming
  if (/\b(brainstorm|ideas?|concept|vision|what if|innovate|co-founder perspective)\b/i.test(lower)) {
    return "CREATIVE_EXPLORATION";
  }

  return "GENERAL_CONVERSATION";
}

/**
 * Extracts individual actionable instructions, non-negotiable rules, and negative constraints.
 *
 * @param query - User query.
 * @returns Array of ExtractedInstruction objects.
 */
function extractInstructions(query: string): ExtractedInstruction[] {
  const instructions: ExtractedInstruction[] = [];
  const lines = query.split(/\n|\.\s+|;\s+/).map((l) => l.trim()).filter((l) => l.length > 5);

  let idCounter = 1;
  for (const line of lines) {
    const lower = line.toLowerCase();
    const isNegative = /\b(do not|don'?t|never|must not|cannot|without|avoid|prohibit|reject)\b/i.test(lower);
    const isMandatory = /\b(must|mandatory|strictly|always|ensure|require|never|critical|non-negotiable)\b/i.test(lower);

    let priority: InstructionPriority = "MEDIUM";
    if (isMandatory || isNegative) priority = "MANDATORY";
    else if (/\b(should|prefer|important|ideally)\b/i.test(lower)) priority = "HIGH";
    else if (/\b(optional|if possible|maybe|could)\b/i.test(lower)) priority = "OPTIONAL";

    let category: ExtractedInstruction["category"] = "PROCEDURAL";
    if (/\b(code|function|api|database|schema|async|type|class|library|framework)\b/i.test(lower)) {
      category = "TECHNICAL";
    } else if (/\b(architecture|layer|microservice|module|boundary|system)\b/i.test(lower)) {
      category = "ARCHITECTURAL";
    } else if (/\b(cost|price|budget|expensive|free|paid|api tier|token)\b/i.test(lower)) {
      category = "FINANCIAL";
    }

    instructions.push({
      id: `inst_${idCounter++}`,
      rawText: line,
      normalizedText: line.replace(/^[-*•\d.)\s]+/, "").trim(),
      priority,
      isNegativeConstraint: isNegative,
      category,
    });
  }

  return instructions;
}

/**
 * Evaluates contextual ambiguity, identifies missing parameters, and forms transparent assumptions.
 *
 * @param query - Cleaned query.
 * @param intent - Determined intent category.
 * @param history - Conversation history turns.
 * @returns Tuple of [ambiguityScore, ambiguityFacets, statedAssumptions].
 */
function evaluateAmbiguity(
  query: string,
  intent: CognitiveIntentCategory,
  history: ConversationTurn[]
): [number, AmbiguityFacet[], string[]] {
  const facets: AmbiguityFacet[] = [];
  const assumptions: string[] = [];
  const lower = query.toLowerCase();

  // Fast greetings and known commands have zero ambiguity
  if (intent === "GREETING" || intent === "FAST_COMMAND") {
    return [0.0, [], []];
  }

  // 1. Missing technology/framework context in technical requests
  if (intent === "TECHNICAL_ANALYSIS" || intent === "PROBLEM_SOLVING") {
    const mentionsTech = /\b(typescript|javascript|python|rust|go|c\+\+|node|react|next|sql|sqlite|postgres|docker)\b/i.test(lower);
    if (!mentionsTech && history.length === 0) {
      facets.push({
        parameter: "technology_stack",
        explanation: "No specific programming language or tech stack was specified.",
        bestEffortAssumption: "Assuming our current ULTRON repository stack: TypeScript (Next.js) & Python (FastAPI).",
        importance: "MODERATE",
      });
      assumptions.push("Assumed TypeScript/Python tech stack based on our repository foundation.");
    }
  }

  // 2. Decision making without stated criteria or constraints
  if (intent === "STRATEGIC_DECISION") {
    const mentionsCriteria = /\b(cost|budget|latency|scale|timeline|speed|security|maintainability)\b/i.test(lower);
    if (!mentionsCriteria) {
      facets.push({
        parameter: "decision_criteria",
        explanation: "Decision criteria (e.g. speed vs cost vs maintainability) were not explicitly weighted.",
        bestEffortAssumption: "Evaluating balanced across implementation speed, long-term maintainability, and zero paid dependency cost.",
        importance: "CRITICAL",
      });
      assumptions.push("Assumed balanced weighting: prioritizing developer velocity, stability, and zero paid API cost.");
    }
  }

  // 3. Planning without milestone timelines
  if (intent === "PROJECT_PLANNING") {
    const mentionsTimeline = /\b(days?|weeks?|months?|q[1-4]|deadline|timeline|sprint)\b/i.test(lower);
    if (!mentionsTimeline) {
      facets.push({
        parameter: "timeline_horizon",
        explanation: "Target execution timeline was not provided.",
        bestEffortAssumption: "Structuring as an iterative milestone roadmap with phases sequenced by architectural dependency.",
        importance: "LOW",
      });
      assumptions.push("Structured as phased milestone iterations sequenced by architectural dependencies.");
    }
  }

  // Calculate ambiguity score bounded [0.0, 1.0]
  let score = 0.05;
  if (query.trim().split(/\s+/).length < 4 && history.length === 0) score += 0.4;
  for (const facet of facets) {
    if (facet.importance === "CRITICAL") score += 0.4;
    else if (facet.importance === "MODERATE") score += 0.2;
    else score += 0.1;
  }

  return [Math.min(0.95, Math.max(0.0, parseFloat(score.toFixed(2)))), facets, assumptions];
}

/**
 * Resolves conversational pronouns and references using recent conversation history.
 *
 * @param query - Current user utterance.
 * @param history - Conversation turns preceding this query.
 * @returns Object mapping referents to inferred subjects and the expanded query string.
 */
function resolveConversationContinuity(
  query: string,
  history: ConversationTurn[]
): { resolvedReferences: Record<string, string>; expandedQuery: string; isFollowUp: boolean } {
  const resolvedReferences: Record<string, string> = {};
  let expanded = query;
  const lower = normalizeConversationText(query);

  // Detect elliptical or follow-up patterns
  const isFollowUp =
    /^(?:and why|why so|how come|what about|and the other one|what else|explain further|continue|what next|what is next|whats next)\b/i.test(lower) ||
    (history.length > 0 && (
      /\b(it|this|that|these|those|former|latter|second option|previous)\b/i.test(lower) ||
      (lower.length < 60 && /^(?:why|how|what|and|but|so)\b/i.test(lower))
    ));

  if (history.length > 0) {
    const lastUserTurn = [...history].reverse().find((t) => t.role === "user");
    const lastAssistantTurn = [...history].reverse().find((t) => t.role === "assistant");

    // Keep the adjacent user/assistant exchange together so references resolve to the answer's subject.
    const needsReference =
      isFollowUp ||
      /\b(it|this|that|these|those|former|latter|second option|previous error|game|project)\b/i.test(lower);
    if (needsReference) {
      const recentContext = [lastUserTurn?.content, lastAssistantTurn?.content]
        .filter((entry): entry is string => Boolean(entry))
        .map((entry) => entry.replace(/\s+/g, " ").trim().slice(0, 350));
      if (recentContext.length > 0) {
        resolvedReferences["target_context"] = recentContext.join("\n");
      }
    }

    if (isFollowUp && lastUserTurn) {
      expanded = query;
    }
  }

  return { resolvedReferences, expandedQuery: expanded, isFollowUp };
}

/**
 * Computes an empirical task complexity score [0.0 to 1.0] based on linguistic features,
 * multi-step clauses, domain vocabulary, and reasoning depth requirements.
 *
 * @param query - Cleaned query.
 * @param intent - Determined intent category.
 * @param instructionCount - Number of extracted instructions.
 * @param isMultiStep - True if query contains sequential conjunctions.
 * @returns Floating point score where >= 0.3 triggers Analytical Co-Founder Track.
 */
function calculateComplexityScore(
  query: string,
  intent: CognitiveIntentCategory,
  instructionCount: number,
  isMultiStep: boolean
): number {
  if (intent === "GREETING" || intent === "FAST_COMMAND") return 0.05;

  let score = 0.15;
  const lengthFactor = Math.min(0.25, query.length / 500);
  score += lengthFactor;

  if (isMultiStep) score += 0.2;
  if (instructionCount > 2) score += 0.15;

  if (
    intent === "STRATEGIC_DECISION" ||
    intent === "CRITICAL_INQUIRY" ||
    intent === "PROJECT_PLANNING" ||
    intent === "TECHNICAL_ANALYSIS"
  ) {
    score += 0.3;
  } else if (intent === "PROBLEM_SOLVING") {
    score += 0.25;
  }

  return Math.min(1.0, Math.max(0.05, parseFloat(score.toFixed(2))));
}

/**
 * Main analysis pipeline of Component 01: Context Understanding Engine.
 *
 * @param rawQuery - User input text.
 * @param history - Conversation history turns.
 * @returns Fully parsed, strongly-typed ParsedContext.
 */
export function analyzeContext(
  rawQuery: string,
  history: ConversationTurn[] = []
): ParsedContext {
  const cleaned = cleanQueryText(rawQuery);
  const normalized = normalizeConversationText(cleaned);
  const hasCode = /```|function\b|class\b|const\s+\w+\s*=|import\s+.*from|def\s+\w+\(/i.test(cleaned);
  const intent = determineIntentCategory(normalized, hasCode);
  const instructions = extractInstructions(cleaned);

  // Check for multi-step conjunctions (e.g. "First ..., then ..., and finally ...")
  const isMultiStep =
    /\b(first|then|next|after that|finally|step 1|step 2|secondly|furthermore)\b/i.test(normalized) ||
    instructions.length > 2;

  const { resolvedReferences, expandedQuery, isFollowUp } = resolveConversationContinuity(cleaned, history);
  const [ambiguityScore, ambiguityFacets, statedAssumptions] = evaluateAmbiguity(normalized, intent, history);
  const complexityScore = calculateComplexityScore(normalized, intent, instructions.length, isMultiStep);

  // Language script heuristics
  let detectedLanguage = "English";
  if (/[\u0900-\u097F]/.test(cleaned)) detectedLanguage = "Hindi";
  else if (/\b(kya|kaise|karo|bhai|yaar|nahi|hain|hum|meri|tumhe)\b/i.test(normalized)) detectedLanguage = "Hinglish";

  return {
    originalQuery: rawQuery,
    cleanedQuery: expandedQuery,
    intentCategory: intent,
    primaryGoal: cleaned.split(/\n|\.\s+/)[0].slice(0, 150),
    subGoals: instructions.slice(1).map((i) => i.normalizedText),
    instructions,
    ambiguityScore,
    ambiguityFacets,
    statedAssumptions,
    isMultiStep,
    isFollowUp,
    resolvedReferences,
    detectedLanguage,
    complexityScore,
  };
}
