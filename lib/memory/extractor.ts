/**
 * @file lib/memory/extractor.ts
 * @description Multi-Lingual Automatic Cognitive Memory Extractor & Provenance Engine.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P3: Extraction & Provenance).
 *
 * Key Responsibilities:
 * - Automatically parses user utterances, assistant responses, and cognitive context turns.
 * - Extracts structured candidate memories across the 12 memory tiers without stalling the UI.
 * - Multi-lingual support: Native recognition of English, Hindi, and Hinglish phrasing.
 * - Robust correction detection: Identifies explicit user corrections ("I am not Rahul, I am Ashish",
 *   "Mera naam Rahul nahi Ashish hai", "Don't use Postgres, use SQLite").
 * - Filters out questions, hypothetical speculations, markdown code blocks, and blockquotes so
 *   they are never mistakenly stored as verified personal facts.
 * - Records source-level provenance metadata (`turnId`, `sessionId`, `projectId`, `timestamp`, `actor`, `sourceType`, `extractionMethod`).
 * - Extracts architectural decisions, procedural recipes, personal facts, and error-solution pairs.
 *
 * Architectural Role & Safety Guarantees:
 * - Fail-closed secret scanner: drops utterances containing credentials (AWS, OpenAI, GitHub, JWT, DB URIs) immediately.
 * - Read-only analytical pipeline; never executes stateful modifications or shell commands.
 * - Integrates directly with `SpecializedMemoryService` and `MemoryDAO` via the asynchronous turn queue.
 */

import { containsProhibitedSecrets, sanitizeMemoryText, normalizeSemanticKey } from "./validators.ts";
import type { MemoryTier, MemorySourceType, MemoryProvenance } from "./types.ts";
import { GLOBAL_PROJECT_ID } from "./schema.ts";

export interface ExtractionInput {
  utterance: string;
  assistantReply?: string;
  turnId?: string;
  sessionId?: string;
  projectId?: string;
  actor?: "user" | "assistant" | "system";
  timestamp?: number;
  /** Optional metadata from Cognitive Context Engine (intent, complexity, constraints). */
  cognitiveContext?: {
    intentCategory?: string;
    primaryGoal?: string;
    instructions?: Array<{ rawText: string; isNegativeConstraint: boolean; priority: string }>;
  };
}

export interface ExtractedCandidateMemory {
  tier: MemoryTier;
  semanticKey: string;
  content: string;
  summary: string;
  importance: number; // 1 to 5
  confidence: number; // 0.0 to 1.0
  source: MemorySourceType;
  sourceRef: string;
  metadata: Record<string, unknown>;
  provenance: MemoryProvenance;
  isCorrection?: boolean;
  supersedesKey?: string;
}

/**
 * Returns true if the text represents a question, hypothetical inquiry, or exploratory speculation.
 * Questions and hypothetical thoughts must never be ingested as established ground-truth memories.
 *
 * @param text - Cleaned utterance string.
 * @returns True if interrogative or hypothetical phrasing is detected.
 */
export function isQuestionOrHypothetical(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return true;

  const lower = trimmed.toLowerCase();
  const hypotheticalPatterns: RegExp[] = [
    /\b(?:what if|what about|suppose that|suppose we|hypothetically|assuming that)\b/i,
    /\b(?:should (?:i|we|you)|can (?:i|we|you)|could (?:i|we|you)|would (?:it|we|you))\b/i,
    /\b(?:is it (?:better|true|possible|advisable)|do you think|wondering if|kya hum|kya aap|agar hum)\b/i,
    /\b(?:how about|maybe we should|what do you recommend)\b/i,
  ];

  return hypotheticalPatterns.some((pattern) => pattern.test(lower));
}

/**
 * Strips code blocks, blockquotes, and untrusted instruction fragments.
 * Ensures pasted documents or quoted materials are not mistaken for user-declared personal facts.
 *
 * @param text - Raw utterance text.
 * @returns Sanitized text with quoted blocks removed.
 */
export function stripUntrustedAndQuotedContent(text: string): string {
  if (!text) return "";
  return text
    // Strip zero-width and invisible control characters
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // Strip multi-line markdown fenced code blocks (```...```)
    .replace(/```[\s\S]*?```/g, " ")
    // Strip XML/HTML system, prompt, and instruction tags
    .replace(/<(?:system|assistant|instruction|prompt)[^>]*>[\s\S]*?<\/(?:system|assistant|instruction|prompt)>/gi, " ")
    // Strip long inline code spans (>30 chars)
    .replace(/`[^`]{30,}`/g, " ")
    // Strip markdown blockquotes (> ...)
    .replace(/(?:^|\n)>\s*[^\n]*/g, " ")
    // Strip untrusted prompt injection overrides
    .replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous\s+)?instructions[^\n.]*/gi, " ")
    .trim();
}

export class AutomaticMemoryExtractor {
  /**
   * Main entry point: extracts structured candidate memories from a conversational turn.
   *
   * @param input - ExtractionInput containing the utterance, context, and provenance metadata.
   * @returns Array of validated, deduplicated ExtractedCandidateMemory objects.
   */
  public extract(input: ExtractionInput): ExtractedCandidateMemory[] {
    const raw = (input.utterance || "").trim();
    if (!raw || raw.length < 3) return [];

    // Security check: Drop payloads with raw prohibited secrets immediately
    if (containsProhibitedSecrets(raw)) {
      return [];
    }

    // Safety check: Never extract personal or project ground truths from questions or hypothetical thoughts
    if (isQuestionOrHypothetical(raw)) {
      return [];
    }

    // Strip out quoted text, code blocks, or untrusted instruction blocks
    const unquoted = stripUntrustedAndQuotedContent(raw);
    if (!unquoted || unquoted.length < 3) return [];

    const clean = sanitizeMemoryText(unquoted);
    const candidates: ExtractedCandidateMemory[] = [];
    const now = input.timestamp || Date.now();
    const sourceRef = input.turnId ? `turn:${input.turnId}` : input.sessionId ? `session:${input.sessionId}` : "dialogue";
    const projectId = input.projectId || GLOBAL_PROJECT_ID;
    const actor = input.actor || "user";

    // 1. Name Declarations & Identity Corrections
    const nameCandidate = this._extractNameDeclaration(clean, sourceRef, now, projectId, actor, input.turnId, input.sessionId);
    if (nameCandidate) candidates.push(nameCandidate);

    // 2. Personal Preferences (Tech tools, UI mode, communication preferences)
    const prefCandidates = this._extractPersonalPreferences(clean, sourceRef, now, projectId, actor, input.turnId, input.sessionId);
    candidates.push(...prefCandidates);

    // 3. User Role & Expertise Level
    const roleCandidate = this._extractUserRole(clean, sourceRef, now, projectId, actor, input.turnId, input.sessionId);
    if (roleCandidate) candidates.push(roleCandidate);

    // 4. Project Information & Tech Stack Constraints
    const projectCandidates = this._extractProjectInformation(clean, sourceRef, now, projectId, actor, input.turnId, input.sessionId);
    candidates.push(...projectCandidates);

    // 5. Architecture Decisions (ADRs)
    const decisionCandidate = this._extractDecision(clean, sourceRef, now, projectId, actor, input.turnId, input.sessionId);
    if (decisionCandidate) candidates.push(decisionCandidate);

    // 6. Explicit Directives ("Remember that...", "Yaad rakhna...")
    const explicitCandidate = this._extractExplicitDirectives(clean, sourceRef, now, projectId, actor, input.turnId, input.sessionId);
    if (explicitCandidate) candidates.push(explicitCandidate);

    // 7. Procedural Steps & Command Workflows
    const proceduralCandidate = this._extractProceduralWorkflow(clean, sourceRef, now, projectId, actor, input.turnId, input.sessionId);
    if (proceduralCandidate) candidates.push(proceduralCandidate);

    // 8. Error & Solution Records
    const errorSolutionCandidate = this._extractErrorSolution(clean, input.assistantReply, sourceRef, now, projectId, actor, input.turnId, input.sessionId);
    if (errorSolutionCandidate) candidates.push(errorSolutionCandidate);

    // 9. Episodic & Temporal Events (Meetings, Deadlines)
    const episodicCandidate = this._extractEpisodicTemporal(clean, sourceRef, now, projectId, actor, input.turnId, input.sessionId);
    if (episodicCandidate) candidates.push(episodicCandidate);

    return candidates;
  }

  /**
   * Helper to build a complete, traceable MemoryProvenance record.
   */
  private _buildProvenance(
    projectId: string,
    timestamp: number,
    actor: "user" | "assistant" | "system",
    sourceType: MemorySourceType,
    extractionMethod: "heuristic_regex" | "context_engine" | "llm_distillation" | "explicit_directive" | "tool_execution",
    confidence: number,
    originalSourceReference: string,
    turnId?: string,
    sessionId?: string
  ): MemoryProvenance {
    return {
      turnId,
      sessionId,
      projectId,
      timestamp,
      actor,
      sourceType,
      extractionMethod,
      confidence,
      originalSourceReference,
    };
  }

  /**
   * Parses name declarations, identity introductions, and corrections in English, Hindi, and Hinglish.
   */
  private _extractNameDeclaration(
    text: string,
    sourceRef: string,
    now: number,
    projectId: string,
    actor: "user" | "assistant" | "system",
    turnId?: string,
    sessionId?: string
  ): ExtractedCandidateMemory | null {
    const clean = text.replace(/[,;!]/g, " ").replace(/\s+/g, " ").trim();

    // 1. Correction Pattern A: "I am not <wrong>, I am / call me <right>"
    const corrA = /(?:i am not|i'm not|not)\s+([a-zA-Z]{2,20})\s+(?:i am|i'm|my name is|my name's|call me|it's|it is|but)?\s*([a-zA-Z]{2,20})/i.exec(clean);
    if (corrA && corrA[1].toLowerCase() !== corrA[2].toLowerCase()) {
      const right = this._capitalize(corrA[2]);
      const wrong = this._capitalize(corrA[1]);
      return {
        tier: "personal",
        semanticKey: "user_name",
        content: `User's name is ${right}`,
        summary: `User name corrected to ${right} (not ${wrong})`,
        importance: 5,
        confidence: 1.0,
        source: "explicit_user",
        sourceRef,
        isCorrection: true,
        supersedesKey: "user_name",
        metadata: { rightName: right, wrongName: wrong, extractedAt: now },
        provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "explicit_directive", 1.0, sourceRef, turnId, sessionId),
      };
    }

    // 2. Correction Pattern B: "Mera naam <wrong> nahi <right> hai"
    const corrB = /(?:mera naam|mai|main)?\s*([a-zA-Z]{2,20})\s+(?:nahi|nahi hai|nahin)\s+(?:i am|my name is|call me|mujhe|naam|hai|hu|hoon)?\s*([a-zA-Z]{2,20})/i.exec(clean);
    if (corrB && corrB[1].toLowerCase() !== "mai" && corrB[1].toLowerCase() !== "mera" && corrB[1].toLowerCase() !== corrB[2].toLowerCase()) {
      const right = this._capitalize(corrB[2]);
      const wrong = this._capitalize(corrB[1]);
      return {
        tier: "personal",
        semanticKey: "user_name",
        content: `User's name is ${right}`,
        summary: `User name corrected to ${right} (not ${wrong})`,
        importance: 5,
        confidence: 1.0,
        source: "explicit_user",
        sourceRef,
        isCorrection: true,
        supersedesKey: "user_name",
        metadata: { rightName: right, wrongName: wrong, extractedAt: now, language: "hinglish" },
        provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "explicit_directive", 1.0, sourceRef, turnId, sessionId),
      };
    }

    // 3. Direct Declaration: "My name is <right>", "Mera naam <right> hai", "Call me <right>"
    const direct = /(?:my name is|my name's|call me|mera naam|naam hai|mujhe|i am|i'm|mai|main)\s+([a-zA-Z]{2,20})(?:\s+(?:hai|hu|hoon|bolo|bolte))?/i.exec(clean);
    if (direct) {
      const candidate = direct[1].trim();
      const stopwords = new Set([
        "not", "here", "ready", "fine", "doing", "trying", "ultron", "assistant",
        "today", "going", "back", "sorry", "happy", "listening", "good", "bad",
        "feeling", "sure", "a", "an", "the", "your", "you", "my", "me", "it",
        "name", "what", "is", "this", "that", "there", "who", "why", "how", "user"
      ]);

      if (!stopwords.has(candidate.toLowerCase())) {
        const right = this._capitalize(candidate);
        return {
          tier: "personal",
          semanticKey: "user_name",
          content: `User's name is ${right}`,
          summary: `User name identified as ${right}`,
          importance: 5,
          confidence: 1.0,
          source: "explicit_user",
          sourceRef,
          metadata: { name: right, extractedAt: now },
          provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "explicit_directive", 1.0, sourceRef, turnId, sessionId),
        };
      }
    }

    return null;
  }

  /**
   * Extracts personal preferences (tech tools, UI mode, languages, communication style) across English and Hindi.
   */
  private _extractPersonalPreferences(
    text: string,
    sourceRef: string,
    now: number,
    projectId: string,
    actor: "user" | "assistant" | "system",
    turnId?: string,
    sessionId?: string
  ): ExtractedCandidateMemory[] {
    const candidates: ExtractedCandidateMemory[] = [];
    const lower = text.toLowerCase();

    // 1. Comparison Preference: "I prefer X over Y" (with optional scope "for server code", etc.)
    // Matches single-word or hyphenated/plus identifiers like TypeScript, C++, Node.js, Next.js
    const compMatch = /(?:i prefer|i like using|i prefer using)\s+([a-zA-Z0-9#+.-]+(?:\s+[a-zA-Z0-9#+.-]+)*?)\s+over\s+([a-zA-Z0-9#+.-]+(?:\s+[a-zA-Z0-9#+.-]+)*?)(?:\s+for\s+[^.]+)?(?:\.|$)/i.exec(lower);
    if (compMatch) {
      const preferred = compMatch[1].trim();
      const nonPreferred = compMatch[2].trim();
      if (preferred.length >= 2 && nonPreferred.length >= 2) {
        const cleanSlug = normalizeSemanticKey(`pref_${preferred}`);
        candidates.push({
          tier: "personal",
          semanticKey: cleanSlug,
          content: `User prefers ${preferred} over ${nonPreferred}`,
          summary: `Preference: ${preferred} over ${nonPreferred}`,
          importance: 4,
          confidence: 1.0,
          source: "explicit_user",
          sourceRef,
          metadata: { preferred, nonPreferred, extractedAt: now },
          provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "heuristic_regex", 1.0, sourceRef, turnId, sessionId),
        });
      }
    }

    // 2. Hindi Preference: "Mujhe X pasand hai"
    const hindiMatch = /(?:mujhe)\s+([a-zA-Z0-9#+.\s-]{2,30})\s+(?:pasand hai|accha lagta hai)/i.exec(lower);
    if (hindiMatch) {
      const preferred = hindiMatch[1].trim();
      if (preferred.length >= 2 && !/\b(kuch|yeh|woh|sab)\b/.test(preferred)) {
        const cleanSlug = normalizeSemanticKey(`pref_${preferred}`);
        candidates.push({
          tier: "personal",
          semanticKey: cleanSlug,
          content: `User prefers ${preferred}`,
          summary: `Preference: ${preferred}`,
          importance: 4,
          confidence: 1.0,
          source: "explicit_user",
          sourceRef,
          metadata: { preferred, extractedAt: now, language: "hindi" },
          provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "heuristic_regex", 1.0, sourceRef, turnId, sessionId),
        });
      }
    }

    // 3. Negated Preference: English "I don't like X", Hindi "Mujhe X pasand nahi hai"
    const engNegMatch = /(?:i (?:do not|don't) like|i dislike|i avoid)\s+([a-zA-Z0-9#+.\s-]{2,30})(?:\.|$)/i.exec(lower);
    const hindiNegMatch = /(?:mujhe)\s+([a-zA-Z0-9#+.\s-]{2,30})\s+(?:pasand nahi hai|pasand nahin hai|acha nahi lagta)/i.exec(lower);
    const negMatch = engNegMatch || hindiNegMatch;
    if (negMatch) {
      const disliked = negMatch[1].replace(/[.,;!]+$/, "").trim();
      const cleanSlug = normalizeSemanticKey(`dislike_${disliked}`);
      candidates.push({
        tier: "personal",
        semanticKey: cleanSlug,
        content: `User dislikes or avoids ${disliked}`,
        summary: `Dislike/Constraint: ${disliked}`,
        importance: 4,
        confidence: 1.0,
        source: "explicit_user",
        sourceRef,
        metadata: { disliked, isNegativePreference: true, extractedAt: now },
        provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "heuristic_regex", 1.0, sourceRef, turnId, sessionId),
      });
    }

    // 4. Favorite Category: "My favorite X is Y"
    const favMatch = /my favorite\s+([a-z0-9_-]{3,20})\s+is\s+([a-zA-Z0-9#+.\s-]{2,30})/i.exec(text);
    if (favMatch) {
      const category = favMatch[1].trim().toLowerCase();
      const value = favMatch[2].replace(/[.,;!]+$/, "").trim();
      const cleanSlug = normalizeSemanticKey(`fav_${category}`);

      candidates.push({
        tier: "personal",
        semanticKey: cleanSlug,
        content: `User's favorite ${category} is ${value}`,
        summary: `Favorite ${category}: ${value}`,
        importance: 4,
        confidence: 1.0,
        source: "explicit_user",
        sourceRef,
        metadata: { category, value, extractedAt: now },
        provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "heuristic_regex", 1.0, sourceRef, turnId, sessionId),
      });
    }

    return candidates;
  }

  /**
   * Extracts founder/user professional role and engineering discipline.
   */
  private _extractUserRole(
    text: string,
    sourceRef: string,
    now: number,
    projectId: string,
    actor: "user" | "assistant" | "system",
    turnId?: string,
    sessionId?: string
  ): ExtractedCandidateMemory | null {
    const roleMatch = /(?:i am a|i work as a|my role is|mai ek|main ek)\s+([a-zA-Z0-9\s_-]{3,40})(?:\s+developer|\s+engineer|\s+architect|\s+scientist|\s+founder|\s+student|\s+hu|\s+hoon)/i.exec(text);
    if (roleMatch) {
      const fullRole = roleMatch[0]
        .replace(/^(?:i am a|i work as a|my role is|mai ek|main ek)\s+/i, "")
        .replace(/\s+(?:hu|hoon)$/i, "")
        .trim();

      if (fullRole.length >= 3 && fullRole.length <= 50) {
        return {
          tier: "personal",
          semanticKey: "user_role",
          content: `User works as ${fullRole}`,
          summary: `User role: ${fullRole}`,
          importance: 4,
          confidence: 1.0,
          source: "explicit_user",
          sourceRef,
          metadata: { role: fullRole, extractedAt: now },
          provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "heuristic_regex", 1.0, sourceRef, turnId, sessionId),
        };
      }
    }
    return null;
  }

  /**
   * Extracts project definitions, active sprint goals, or tech stack constraints.
   */
  private _extractProjectInformation(
    text: string,
    sourceRef: string,
    now: number,
    projectId: string,
    actor: "user" | "assistant" | "system",
    turnId?: string,
    sessionId?: string
  ): ExtractedCandidateMemory[] {
    const candidates: ExtractedCandidateMemory[] = [];
    const lower = text.toLowerCase();

    // 1. Building / Working on project
    const projMatch = /(?:i am building|i am working on|my project is|mai|main)\s+([a-zA-Z0-9\s_-]{3,35})(?:\s+project|\s+bana raha hu|\s+par kaam kar raha hu)?/i.exec(lower);
    if (projMatch && !/\b(it|that|this|code|something)\b/.test(projMatch[1])) {
      const projName = projMatch[1].trim();
      if (projName.length >= 3 && projName.length <= 40) {
        candidates.push({
          tier: "project",
          semanticKey: normalizeSemanticKey(`project_${projName}`),
          content: `User is building project: ${projName}`,
          summary: `Active Project: ${projName}`,
          importance: 4,
          confidence: 1.0,
          source: "inferred_dialogue",
          sourceRef,
          metadata: { projectName: projName, extractedAt: now, projectId },
          provenance: this._buildProvenance(projectId, now, actor, "inferred_dialogue", "heuristic_regex", 0.9, sourceRef, turnId, sessionId),
        });
      }
    }

    // 2. Tech Stack Declaration
    const stackMatch = /(?:my tech stack is|we are using|tech stack for this project is)\s+([a-zA-Z0-9#+.,\s-]{4,60})/i.exec(text);
    if (stackMatch) {
      const stack = stackMatch[1].trim();
      candidates.push({
        tier: "project",
        semanticKey: "project_tech_stack",
        content: `Project tech stack includes: ${stack}`,
        summary: `Tech Stack: ${stack}`,
        importance: 4,
        confidence: 1.0,
        source: "explicit_user",
        sourceRef,
        metadata: { techStack: stack, extractedAt: now, projectId },
        provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "heuristic_regex", 1.0, sourceRef, turnId, sessionId),
      });
    }

    return candidates;
  }

  /**
   * Extracts explicit Architecture Decision Records (ADRs).
   */
  private _extractDecision(
    text: string,
    sourceRef: string,
    now: number,
    projectId: string,
    actor: "user" | "assistant" | "system",
    turnId?: string,
    sessionId?: string
  ): ExtractedCandidateMemory | null {
    const decisionMatch = /(?:we decided to|i decided to|decision:\s*|humne decide kiya hai ki)\s+([^.]+)/i.exec(text);
    if (decisionMatch) {
      const decisionStatement = decisionMatch[1].trim();
      if (decisionStatement.length >= 10) {
        const slug = normalizeSemanticKey(`decision_${decisionStatement.slice(0, 30)}`);
        return {
          tier: "decision",
          semanticKey: slug,
          content: `Architecture Decision: ${decisionStatement}`,
          summary: `Decision: ${decisionStatement.slice(0, 100)}`,
          importance: 5,
          confidence: 1.0,
          source: "explicit_user",
          sourceRef,
          metadata: {
            decisionTitle: decisionStatement.slice(0, 60),
            decisionMade: decisionStatement,
            extractedAt: now,
            projectId,
          },
          provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "explicit_directive", 1.0, sourceRef, turnId, sessionId),
        };
      }
    }
    return null;
  }

  /**
   * Extracts explicit "Remember that..." and "Yaad rakhna..." directives in English and Hindi.
   */
  private _extractExplicitDirectives(
    text: string,
    sourceRef: string,
    now: number,
    projectId: string,
    actor: "user" | "assistant" | "system",
    turnId?: string,
    sessionId?: string
  ): ExtractedCandidateMemory | null {
    const rememberMatch = /^(?:please\s+)?(?:remember\s+that|yaad\s+rakhna\s+ki|yaad\s+rakhna\s*,\s*|note\s+that|save\s+to\s+memory|ye\s+yaad\s+rakhna)\s+(.+)$/i.exec(text);
    if (rememberMatch) {
      const fact = rememberMatch[1].trim();
      if (fact.length >= 4) {
        const slug = normalizeSemanticKey(`fact_${fact.slice(0, 25)}`);
        return {
          tier: "semantic",
          semanticKey: slug,
          content: fact,
          summary: fact.slice(0, 100),
          importance: 5,
          confidence: 1.0,
          source: "explicit_user",
          sourceRef,
          metadata: { explicitDirective: true, extractedAt: now },
          provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "explicit_directive", 1.0, sourceRef, turnId, sessionId),
        };
      }
    }
    return null;
  }

  /**
   * Extracts procedural steps and executable command sequences.
   */
  private _extractProceduralWorkflow(
    text: string,
    sourceRef: string,
    now: number,
    projectId: string,
    actor: "user" | "assistant" | "system",
    turnId?: string,
    sessionId?: string
  ): ExtractedCandidateMemory | null {
    // Increased character boundary to 80 chars to capture detailed procedure names
    const procedureMatch = /(?:to\s+([a-zA-Z0-9_\-\s]{4,80}),\s*(?:run|execute|step 1:?)\s+([^.]+))/i.exec(text);
    if (procedureMatch) {
      const procName = procedureMatch[1].trim();
      const commandOrSteps = procedureMatch[2].trim();
      const slug = normalizeSemanticKey(`proc_${procName}`);

      return {
        tier: "procedural",
        semanticKey: slug,
        content: `Procedure for ${procName}: run ${commandOrSteps}`,
        summary: `Procedure: ${procName}`,
        importance: 4,
        confidence: 1.0,
        source: "tool_execution",
        sourceRef,
        metadata: { procedureName: procName, executionCommand: commandOrSteps, extractedAt: now },
        provenance: this._buildProvenance(projectId, now, actor, "tool_execution", "heuristic_regex", 1.0, sourceRef, turnId, sessionId),
      };
    }
    return null;
  }

  /**
   * Extracts Error & Solution pairs from debugging interactions.
   */
  private _extractErrorSolution(
    text: string,
    assistantReply: string | undefined,
    sourceRef: string,
    now: number,
    projectId: string,
    actor: "user" | "assistant" | "system",
    turnId?: string,
    sessionId?: string
  ): ExtractedCandidateMemory | null {
    const errorMatch = /(?:the error was|the bug was|fixed the issue by|solved by|this (?:migration|task|build|run|test) failed because)\s+([^.]+)/i.exec(text);
    if (errorMatch) {
      const explanation = errorMatch[1].trim();
      if (explanation.length >= 10) {
        return {
          tier: "error_solution",
          semanticKey: normalizeSemanticKey(`fix_${explanation.slice(0, 30)}`),
          content: `Error Fix: ${explanation}`,
          summary: `Verified Fix: ${explanation.slice(0, 100)}`,
          importance: 4,
          confidence: 1.0,
          source: "tool_execution",
          sourceRef,
          metadata: { fixDetails: explanation, assistantContext: assistantReply?.slice(0, 150), extractedAt: now },
          provenance: this._buildProvenance(projectId, now, actor, "tool_execution", "heuristic_regex", 1.0, sourceRef, turnId, sessionId),
        };
      }
    }
    return null;
  }

  /**
   * Extracts episodic events or temporal deadlines.
   */
  private _extractEpisodicTemporal(
    text: string,
    sourceRef: string,
    now: number,
    projectId: string,
    actor: "user" | "assistant" | "system",
    turnId?: string,
    sessionId?: string
  ): ExtractedCandidateMemory | null {
    // 1. Meeting: "Meeting with X on Y"
    const meetMatch = /(?:meeting with\s+([a-zA-Z0-9\s_-]{2,30})\s+on\s+([^.]+))/i.exec(text);
    if (meetMatch) {
      const participant = meetMatch[1].trim();
      const when = meetMatch[2].trim();
      return {
        tier: "episodic",
        semanticKey: normalizeSemanticKey(`meeting_${participant}`),
        content: `Meeting with ${participant} scheduled on ${when}`,
        summary: `Meeting: ${participant} (${when})`,
        importance: 3,
        confidence: 0.95,
        source: "explicit_user",
        sourceRef,
        metadata: { participant, scheduledFor: when, extractedAt: now },
        provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "heuristic_regex", 0.95, sourceRef, turnId, sessionId),
      };
    }

    // 2. Deadline: "Sprint demo deadline is November 15"
    const deadlineMatch = /(?:(?:deadline|milestone|due date)\s+(?:is|for\s+[a-zA-Z0-9\s_-]+\s+is)\s+([^.]+))/i.exec(text);
    if (deadlineMatch) {
      const deadlineDetails = deadlineMatch[1].trim();
      return {
        tier: "temporal",
        semanticKey: normalizeSemanticKey(`deadline_${deadlineDetails.slice(0, 20)}`),
        content: `Deadline scheduled: ${deadlineDetails}`,
        summary: `Deadline: ${deadlineDetails}`,
        importance: 4,
        confidence: 0.95,
        source: "explicit_user",
        sourceRef,
        metadata: { deadline: deadlineDetails, extractedAt: now },
        provenance: this._buildProvenance(projectId, now, actor, "explicit_user", "heuristic_regex", 0.95, sourceRef, turnId, sessionId),
      };
    }

    return null;
  }

  private _capitalize(str: string): string {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}

/** Singleton instance getter for default automatic extractor. */
let defaultMemoryExtractorInstance: AutomaticMemoryExtractor | null = null;

export function getAutomaticMemoryExtractor(): AutomaticMemoryExtractor {
  if (!defaultMemoryExtractorInstance) {
    defaultMemoryExtractorInstance = new AutomaticMemoryExtractor();
  }
  return defaultMemoryExtractorInstance;
}
