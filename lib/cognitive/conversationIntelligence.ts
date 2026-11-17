/**
 * @file lib/cognitive/conversationIntelligence.ts
 * @description Reusable intent and context helpers for grounded ULTRON conversations.
 *
 * Subsystem:
 * Cognitive conversation routing and project/task context resolution.
 *
 * Key Responsibilities:
 * - Normalizes natural-language text consistently before intent matching.
 * - Resolves identity/capability queries and project references from actual history.
 * - Summarizes persisted workflow state without executing or approving tasks.
 * - Produces explicit degraded replies when local inference cannot answer.
 *
 * Architectural Role & Safety Guarantees:
 * - Called by the chat route and cognitive context pipeline.
 * - Reads only caller-provided history, project records and workflow snapshots.
 * - Never invents stored facts or performs computer actions.
 */

import type { WorkflowInstance } from "../orchestration/types.ts";
import type { ConversationTurn } from "./contextEngine.ts";

export type SystemConversationIntent = "identity" | "capabilities";

export interface ProjectContextCandidate {
  projectId: string;
  projectName: string;
  aliases?: string[];
  keywords?: string[];
}

export interface ResolvedProjectContext {
  projectId?: string;
  projectName?: string;
  ambiguous: boolean;
}

export type InferenceFailureReason =
  | "unavailable"
  | "timeout"
  | "cancelled"
  | "model_unavailable"
  | "http_error"
  | "invalid_response"
  | "empty_response";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "before", "but", "can", "continue",
  "could", "did", "does", "for", "from", "have", "help", "how", "into", "its", "last",
  "make", "more", "next", "our", "please", "previous", "project", "should", "that", "the",
  "their", "then", "there", "this", "those", "today", "what", "when", "where", "which",
  "who", "why", "with", "would", "you", "your",
]);

/**
 * Normalizes casing, Unicode compatibility forms, punctuation and whitespace for matching.
 *
 * @param text - Untrusted user or conversation text.
 * @returns Lowercase words with punctuation and repeated whitespace removed.
 */
export function normalizeConversationText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identifies common identity and capability requests without relying on exact punctuation.
 *
 * @param text - Current user utterance.
 * @returns The matched reusable intent, or null when the utterance is not a system query.
 */
export function detectSystemConversationIntent(text: string): SystemConversationIntent | null {
  const normalized = normalizeConversationText(text);
  if (/^(who are you|who is ultron|what are you|tell me who you are|tell me about yourself|introduce yourself)$/.test(normalized)) {
    return "identity";
  }
  if (/^(what can you do|what do you do|what are your capabilities|what can ultron do|list your capabilities|your capabilities|help)$/.test(normalized)) {
    return "capabilities";
  }
  return null;
}

/**
 * Selects a project only when its name/aliases appear in the query or recent conversation.
 *
 * @param query - Current user utterance.
 * @param history - Earlier conversation turns.
 * @param projects - Persisted project records reduced to names and search terms.
 * @returns A unique project selection or an explicit ambiguous/unknown result.
 */
export function resolveProjectContext(
  query: string,
  history: ConversationTurn[],
  projects: ProjectContextCandidate[]
): ResolvedProjectContext {
  const queryText = normalizeConversationText(query);
  const historyText = normalizeConversationText(
    history.slice(-8).map((turn) => turn.content).join(" ")
  );
  const queryWords = new Set(queryText.split(" ").filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));

  const ranked = projects.map((project) => {
    const names = [project.projectName, ...(project.aliases || [])]
      .map(normalizeConversationText)
      .filter(Boolean);
    const searchTerms = [...names, ...(project.keywords || []).map(normalizeConversationText)]
      .flatMap((term) => term.split(" "))
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));

    let score = 0;
    for (const name of names) {
      if (name.length >= 3 && queryText.includes(name)) score += 12;
      else if (name.length >= 3 && historyText.includes(name)) score += 8;
    }

    for (const term of new Set(searchTerms)) {
      if (queryWords.has(term)) score += 4;
      else if (historyText.split(" ").includes(term)) score += 2;
    }

    return { project, score };
  }).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return { ambiguous: false };
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    return { ambiguous: true };
  }

  return {
    projectId: ranked[0].project.projectId,
    projectName: ranked[0].project.projectName,
    ambiguous: false,
  };
}

/**
 * Detects requests that ask ULTRON to report existing task state.
 *
 * @param text - Current user utterance.
 * @returns True for task-resume/status requests; false for ordinary planning discussion.
 */
export function isPersistedTaskStatusRequest(text: string): boolean {
  const normalized = normalizeConversationText(text);
  return /\b(continue|resume|pick up)\b.*\b(task|workflow|work|where we left off)\b/.test(normalized) ||
    /^(what is next|whats next|what next|continue previous task|resume task)$/.test(normalized) ||
    /\b(show|list|handle|manage|check)\b.*\b(my )?(business|today|pending|open)\b.*\b(tasks?|work|todos?)\b/.test(normalized);
}

/**
 * Formats persisted, unfinished workflow state without starting or approving execution.
 *
 * @param workflows - Persisted orchestration workflows.
 * @param query - Current user request.
 * @param history - Earlier conversation turns used to rank related workflows.
 * @returns Honest workflow summary or null when no unfinished workflow is relevant.
 */
export function summarizePersistedWorkflow(
  workflows: WorkflowInstance[],
  query: string,
  history: ConversationTurn[]
): string | null {
  const active = workflows
    .filter((workflow) => !["COMPLETED", "CANCELLED"].includes(workflow.state))
    .filter((workflow) => Object.values(workflow.tasks).some((task) =>
      ["PENDING", "READY", "BLOCKED", "AWAITING_APPROVAL", "RUNNING", "FAILED"].includes(task.status)
    ));

  if (active.length === 0) {
    return "I couldn't find an unfinished task in ULTRON's persisted workflow records. I haven't assumed or marked any task as done. Tell me which task you want to plan or resume.";
  }

  const contextWords = new Set(normalizeConversationText(
    `${query} ${history.slice(-6).map((turn) => turn.content).join(" ")}`
  ).split(" ").filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));

  const ranked = active.map((workflow) => {
    const searchable = normalizeConversationText([
      workflow.goal.title,
      workflow.goal.rawPrompt,
      ...Object.values(workflow.tasks).map((task) => `${task.title} ${task.description}`),
    ].join(" "));
    const score = [...contextWords].reduce((total, word) => total + (searchable.split(" ").includes(word) ? 1 : 0), 0);
    return { workflow, score };
  }).sort((a, b) => b.score - a.score || b.workflow.updatedAt - a.workflow.updatedAt);

  const hasSpecificMatch = ranked[0].score > 0;
  if (!hasSpecificMatch && ranked.length > 1) {
    const choices = ranked.slice(0, 3).map(({ workflow }) => `- ${workflow.goal.title} (${workflow.state})`).join("\n");
    return `I found multiple unfinished workflows and can't safely guess which one you mean:\n${choices}\nTell me which workflow to inspect. Nothing has been resumed or executed.`;
  }

  const workflow = ranked[0].workflow;
  const tasks = Object.values(workflow.tasks);
  const pendingApproval = tasks.find((task) => task.status === "AWAITING_APPROVAL");
  if (pendingApproval) {
    return `**${workflow.goal.title}** is ${workflow.state}. Its next task, **${pendingApproval.title}**, is waiting for explicit approval. I have not approved or executed it.`;
  }

  const nextTask = tasks.find((task) => task.status === "READY") ||
    tasks.find((task) => task.status === "PENDING");
  const blocked = tasks.filter((task) => task.status === "BLOCKED");
  const failed = tasks.filter((task) => task.status === "FAILED");
  const lines = [
    `**${workflow.goal.title}** — workflow state: **${workflow.state}**.`,
    nextTask
      ? `Next recorded task: **${nextTask.title}** (${nextTask.status}). This is a status report only; it has not been started.`
      : "No task is currently marked READY or PENDING in the saved workflow.",
    `Completed tasks: ${workflow.completedTaskIds.length}.`,
  ];
  if (blocked.length > 0) lines.push(`Blocked: ${blocked.map((task) => task.title).join("; ")}.`);
  if (failed.length > 0) lines.push(`Failed: ${failed.map((task) => task.title).join("; ")}.`);
  return lines.join("\n");
}

/**
 * States why a model answer is unavailable without substituting a generic pretend answer.
 *
 * @param reason - Classified Ollama failure.
 * @param query - User request to keep the explanation contextual.
 * @returns Degraded response that does not claim successful analysis or execution.
 */
export function buildInferenceFailureReply(reason: InferenceFailureReason, query: string): string {
  const request = query.trim() ? ` for “${query.trim().slice(0, 160)}”` : "";
  const explanations: Record<InferenceFailureReason, string> = {
    unavailable: "the local Ollama service is not responding",
    timeout: "the local model exceeded its inference time limit",
    cancelled: "the request was cancelled before a response was produced",
    model_unavailable: "the selected model is not installed or is unavailable",
    http_error: "the local model service returned an error",
    invalid_response: "the model service returned an invalid response",
    empty_response: "the model returned no answer",
  };
  const retryGuidance: Record<InferenceFailureReason, string> = {
    unavailable: "Start Ollama and verify the configured local endpoint, then retry.",
    timeout: "Try a shorter request or select a suitable local model.",
    cancelled: "Send the request again if you still need an answer.",
    model_unavailable: "Install the configured model or select one that is already available.",
    http_error: "Check the local model service logs and retry after it is healthy.",
    invalid_response: "Check the model/service version and retry.",
    empty_response: "Retry once; if it repeats, inspect the model's local logs.",
  };
  return `I couldn't produce a reliable answer${request} because ${explanations[reason]}. I have not completed or executed the requested work. ${retryGuidance[reason]}`;
}

/**
 * Identifies a request for decisions recorded on the previous local calendar day.
 *
 * @param text - Current user utterance.
 * @returns True when the query explicitly asks about yesterday's decisions.
 */
export function isYesterdayDecisionQuery(text: string): boolean {
  const normalized = normalizeConversationText(text);
  return /\b(yesterday|kal)\b/.test(normalized) && /\b(decision|decisions|decide|decided|agree|agreed|chose)\b/.test(normalized);
}
