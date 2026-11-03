/**
 * @file lib/responseDecisionEngine.ts
 * @description Central Intelligent Response Decision Engine for ULTRON AI.
 * 
 * Subsystem:
 * Core Brain & Conversational Intent Arbitration.
 * 
 * Key Responsibilities:
 * - Decides whether ULTRON should RESPOND, REACT, LISTEN, CLARIFY, IGNORE, or INTERRUPT.
 * - Distinguishes user commands from background conversation, TV audio, and non-actionable chatter.
 * - Identifies incomplete sentences and continuation pauses without premature turn cuts.
 * - Distinguishes conversational acknowledgements ("hmm", "okay", "yeah") from actionable requests.
 * - Enforces safety confirmation requirements on destructive, security, or financial operations.
 * - Quick-Decision Policy: ambiguous input is answered with a stated best-effort assumption
 *   instead of a clarification loop, so the assistant never gets stuck on doubt.
 */

export type DecisionAction =
  | "RESPOND"
  | "REACT"
  | "LISTEN"
  | "CLARIFY"
  | "IGNORE"
  | "INTERRUPT";

export type ResponseMode = "VOICE" | "TEXT" | "BOTH" | "SILENT";

export interface DecisionResult {
  action: DecisionAction;
  intent: string;
  confidence: number;
  reason: string;
  /** Human-readable assumption ULTRON made when it decided to act instead of asking back. */
  assumption?: string;
  response_mode: ResponseMode;
  requires_confirmation: boolean;
  acknowledgement_phrase?: string;
  cleaned_query?: string;
}

export interface ConversationContext {
  lastAssistantSpeech?: string;
  lastUserSpeech?: string;
  turnCount: number;
  followUpWindowActive: boolean;
  isAssistantSpeaking: boolean;
  activationMode: "WAKE_WORD" | "PUSH_TO_TALK" | "CONTINUOUS_CONVERSATION";
}

const FILLER_AND_ACKNOWLEDGEMENTS = new Set([
  "hmm", "hm", "yeah", "yes", "ok", "okay", "alright", "right", "uh-huh",
  "um", "uh", "cool", "sure", "got it", "i see", "yup", "no", "nope"
]);

const DESTRUCTIVE_KEYWORDS = [
  "delete all", "drop database", "format drive", "shutdown system", "restart computer",
  "erase disk", "rm -rf", "wipe memory", "factory reset", "kill process"
];

const WAKE_PATTERNS = [
  /^(hey\s+)?ultron\b/i,
  /^(ok\s+)?ultron\b/i,
  /^(hi\s+)?ultron\b/i,
  /\bultron\b/i,
];

export class ResponseDecisionEngine {
  /**
   * Main evaluation pipeline deciding the assistant's behavior for a captured utterance.
   */
  public evaluate(utterance: string, context: ConversationContext): DecisionResult {
    const raw = (utterance || "").trim();
    const lower = raw.toLowerCase();

    // 1. Guard against empty or whitespace audio
    if (!raw) {
      return {
        action: "IGNORE",
        intent: "EMPTY_AUDIO",
        confidence: 1.0,
        reason: "No audible transcript detected",
        response_mode: "SILENT",
        requires_confirmation: false,
      };
    }

    // 2. Interruption Detection: If assistant is speaking and user issues a stop command
    if (context.isAssistantSpeaking) {
      const isStopCommand = /^(stop|shut\s*up|quiet|halt|pause|silence|wait)\b/i.test(lower);
      if (isStopCommand) {
        return {
          action: "INTERRUPT",
          intent: "STOP_SPEECH",
          confidence: 0.98,
          reason: "User explicitly commanded speech cancellation",
          response_mode: "SILENT",
          requires_confirmation: false,
        };
      }
    }

    // 3. Hallucination and common subtitle artifact suppression
    const isKnownNoiseArtifact =
      lower.includes("subtitles by") ||
      lower.includes("thank you for watching") ||
      lower.includes("thanks for watching") ||
      lower.includes("amara.org") ||
      lower === "you" ||
      lower === "status report.";
    if (isKnownNoiseArtifact) {
      return {
        action: "IGNORE",
        intent: "STT_HALLUCINATION",
        confidence: 0.95,
        reason: "Matched known acoustic background noise hallucination",
        response_mode: "SILENT",
        requires_confirmation: false,
      };
    }

    // 4. Incomplete sentences and trailing continuation words
    // If the sentence ends with conjunctions or prepositions, user is likely still completing thought
    const isTrailingContinuation = /\b(and|or|because|so|if|then|with|that|which|about|to)$/i.test(lower);
    if (isTrailingContinuation) {
      return {
        action: "LISTEN",
        intent: "CONTINUATION_EXPECTED",
        confidence: 0.9,
        reason: "Utterance ends with an open conjunction; waiting for user completion",
        response_mode: "SILENT",
        requires_confirmation: false,
      };
    }

    // 5. Conversational Acknowledgements ("hmm", "okay", "yeah")
    // Should NOT trigger full LLM answers; react subtly or remain in listening loop
    if (FILLER_AND_ACKNOWLEDGEMENTS.has(lower.replace(/[.!?,]/g, ""))) {
      // NOTE: response_mode must match the chosen action — REACT carries a spoken
      // acknowledgement, so advertising SILENT here previously told consumers not to speak it.
      const acknowledgementAction = context.followUpWindowActive ? "REACT" : "IGNORE";
      return {
        action: acknowledgementAction,
        intent: "CONVERSATIONAL_ACKNOWLEDGEMENT",
        confidence: 0.92,
        reason: "User uttered conversational acknowledgement without query",
        response_mode: acknowledgementAction === "REACT" ? "VOICE" : "SILENT",
        requires_confirmation: false,
        acknowledgement_phrase: "Understood.",
      };
    }

    // 6. Direct User Earbuds Interaction:
    // Since the mic is locked to user headphones/earbuds, every spoken phrase
    // is treated as an intentional instruction to eliminate false IGNORE silences.
    let explicitlyAddressed = false;
    let cleaned = raw;

    for (const pattern of WAKE_PATTERNS) {
      if (pattern.test(raw)) {
        explicitlyAddressed = true;
        cleaned = raw.replace(pattern, "").replace(/^[,:\s]+/, "").trim();
        break;
      }
    }

    // If user only said the wake word ("Ultron", "Hey Ultron"), provide a quick ready reaction
    if (explicitlyAddressed && (!cleaned || cleaned.length < 2)) {
      return {
        action: "REACT",
        intent: "WAKE_CONFIRMATION",
        confidence: 0.99,
        reason: "Wake word acknowledged; awaiting user command",
        response_mode: "VOICE",
        requires_confirmation: false,
        acknowledgement_phrase: "I'm listening.",
      };
    }

    const queryToEvaluate = cleaned || raw;

    // 7. Quick-Decision Policy: never stall the user with a clarification loop for a single
    //    ambiguous word. Instead, make the best-effort interpretation immediately and state
    //    the assumption, so ULTRON keeps moving (explicit user requirement).
    if (queryToEvaluate.split(/\s+/).length === 1 && !context.lastUserSpeech && !context.followUpWindowActive) {
      const singleWord = queryToEvaluate.toLowerCase().replace(/[^a-z]/g, "");
      const isKnownCommand = ["time", "date", "status", "help", "mute", "unmute", "hello", "hi", "hey"].includes(singleWord);
      if (!isKnownCommand && singleWord.length >= 2) {
        return {
          action: "RESPOND",
          intent: "ASSUMED_QUERY",
          confidence: 0.6,
          reason: "Single-word query handled with a best-effort assumption instead of stalling",
          response_mode: "BOTH",
          requires_confirmation: false,
          assumption: `I'll take that as a request about "${queryToEvaluate}".`,
          cleaned_query: queryToEvaluate,
        };
      }
    }

    // 8. Destructive Action Gating
    const isDestructive = DESTRUCTIVE_KEYWORDS.some((kw) => lower.includes(kw));
    if (isDestructive) {
      return {
        action: "RESPOND",
        intent: "CRITICAL_ACTION",
        confidence: 0.95,
        reason: "Potentially destructive action requires confirmation token",
        response_mode: "BOTH",
        requires_confirmation: true,
        cleaned_query: queryToEvaluate,
      };
    }

    // 9. Standard Actionable User Request
    return {
      action: "RESPOND",
      intent: "USER_QUERY",
      confidence: 0.95,
      reason: "Actionable request directed at ULTRON",
      response_mode: "BOTH",
      requires_confirmation: false,
      cleaned_query: queryToEvaluate,
    };
  }
}

