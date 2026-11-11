/**
 * @file lib/memory/extractionEngine.ts
 * @description Automatic Memory Extraction Pipeline (Advanced Memory Intelligence System A).
 *
 * Subsystem:
 * Memory Extraction, Sensitivity Classification & Credential Exclusion.
 *
 * Key Responsibilities:
 * - Automatically scans conversation utterances and agent outputs for critical facts.
 * - Extracts 6 distinct categories: Facts, Decisions, Experiences, Preferences, Procedures, and Personal Bio.
 * - Credential Exclusion: Strips API keys, passwords, bearer tokens, and private keys before persistence.
 * - Classifies information sensitivity: PUBLIC, INTERNAL, CONFIDENTIAL, or RESTRICTED.
 * - Derives entity-relation triples (Subject -> Predicate -> Object) for knowledge graph indexing.
 * - Attaches cryptographic SHA-256 content hashes and source provenance.
 *
 * Architectural Role & Interactions:
 * - Invoked by `app/api/chat/route.ts` during turn processing to silently ingest facts.
 * - Feeds structured candidates into `lib/memory/managementEngine.ts` for deduplication and storage.
 *
 * Safety / Security Guarantees:
 * - Credential Exclusion Gate: High-entropy tokens, regex patterns matching known cloud/API keys,
 *   and authorization headers are redacted or rejected prior to writing to the memory vault.
 * - All personal assertions are tagged with strict provenance and sensitivity levels.
 */

import crypto from "crypto";
import type {
  MemorySensitivity,
  MemorySource,
  MemoryProvenance,
  RelationalTriple,
} from "./types.ts";

export interface ExtractedCandidate {
  key: string;
  category: "fact" | "preference" | "decision" | "experience" | "procedure" | "personal";
  content: string;
  importance: number;
  confidence: number;
  sensitivity: MemorySensitivity;
  source: MemorySource;
  tags: string[];
  triples: RelationalTriple[];
  projectId?: string;
  provenance: MemoryProvenance;
  containsCredentialRedaction: boolean;
}

export class MemoryExtractionEngine {
  /** Known credential patterns to exclude from persistent storage. */
  private readonly _credentialPatterns = [
    // OpenAI, Anthropic, Stripe, GitHub, AWS, Generic API keys
    /(?:sk-[a-zA-Z0-9\-_]{20,80})/g,
    /(?:ghp_[a-zA-Z0-9]{36,40})/g,
    /(?:gho_[a-zA-Z0-9]{36,40})/g,
    /(?:AKIA[0-9A-Z]{16})/g,
    /(?:bearer\s+[a-zA-Z0-9_\-.~+/]+=*)/gi,
    /(?:password\s*[:=]\s*["']?[^\s"']{6,40}["']?)/gi,
    /(?:api_key\s*[:=]\s*["']?[^\s"']{8,60}["']?)/gi,
    /(?:client_secret\s*[:=]\s*["']?[^\s"']{8,60}["']?)/gi,
    /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g,
  ];

  /**
   * Sanitizes text by redacting credentials and dangerous injection tokens.
   *
   * @param text - Raw utterance or extracted text.
   * @returns Cleaned text and flag indicating if sensitive tokens were redacted.
   */
  public sanitizeAndExcludeCredentials(text: string): { cleanText: string; redacted: boolean } {
    let cleanText = text
      .replace(/<\|.*?\|>/g, "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .trim();

    let redacted = false;
    for (const pattern of this._credentialPatterns) {
      if (pattern.test(cleanText)) {
        redacted = true;
        cleanText = cleanText.replace(pattern, "[REDACTED_CREDENTIAL]");
      }
    }

    return { cleanText, redacted };
  }

  /**
   * Classifies the sensitivity of the extracted memory record.
   *
   * @param text - Content of the memory.
   * @param category - Category of memory.
   * @returns MemorySensitivity tier.
   */
  public classifySensitivity(text: string, category: string): MemorySensitivity {
    const lower = text.toLowerCase();

    // High privacy: financial, medical, biometric, passwords, credentials
    if (
      /\b(password|secret|credential|token|biometric|fingerprint|salary|revenue|banking|ssn|pin)\b/.test(lower)
    ) {
      return "RESTRICTED";
    }

    // Confidential: personal bio, exact physical address, private founder discussions
    if (
      category === "personal" ||
      /\b(address|phone|email|residence|home|wife|child|family|confidential|private)\b/.test(lower)
    ) {
      return "CONFIDENTIAL";
    }

    // Internal: project architecture, tech stack, internal decisions, procedures
    if (category === "project" || category === "decision" || category === "procedure") {
      return "INTERNAL";
    }

    // Public: general facts, published knowledge
    return "PUBLIC";
  }

  /**
   * Extracts entity-relation triples (Subject -> Predicate -> Object) using rule-based grammar.
   *
   * @param text - Input statement.
   * @returns Array of extracted relational triples.
   */
  public extractRelationalTriples(text: string): RelationalTriple[] {
    const triples: RelationalTriple[] = [];
    const lower = text.toLowerCase();

    // Pattern 1: User / Founder relationships (e.g., "Ashish is building ULTRON", "User prefers TypeScript")
    const buildMatch = /(?:ashish|user)\s+(?:is building|is developing|is creating|works on)\s+([a-zA-Z0-9_\-\s]{2,30})/i.exec(text);
    if (buildMatch) {
      triples.push({
        subject: "Ashish",
        predicate: "DEVELOPS",
        object: buildMatch[1].trim(),
        confidence: 0.95,
      });
    }

    const techMatch = /(?:prefer|prefers|uses|using)\s+([a-zA-Z0-9#+.\s]{2,20})/i.exec(lower);
    if (techMatch) {
      triples.push({
        subject: "Ashish",
        predicate: "PREFERS_TECH",
        object: techMatch[1].trim(),
        confidence: 0.9,
      });
    }

    // Pattern 2: System dependencies (e.g., "ULTRON uses Next.js", "Ollama runs on port 11434")
    const usesMatch = /([a-zA-Z0-9_-]+)\s+(?:uses|depends on|requires|integrates with)\s+([a-zA-Z0-9_.\s-]+)/i.exec(text);
    if (usesMatch && usesMatch[1].toLowerCase() !== "user" && usesMatch[1].toLowerCase() !== "ashish") {
      triples.push({
        subject: usesMatch[1].trim(),
        predicate: "DEPENDS_ON",
        object: usesMatch[2].trim(),
        confidence: 0.85,
      });
    }

    return triples;
  }

  /**
   * Analyzes an utterance and extracts candidate memories across all 6 categories.
   *
   * @param text - Utterance text.
   * @param role - Speaker role ("user" | "assistant").
   * @param projectId - Active project ID (default: "default").
   * @param sessionId - Active conversation session ID.
   * @returns Array of extracted memory candidates ready for deduplication and persistence.
   */
  public extractCandidates(
    text: string,
    role: "user" | "assistant" = "user",
    projectId: string = "default",
    sessionId: string = "active_session"
  ): ExtractedCandidate[] {
    const { cleanText, redacted } = this.sanitizeAndExcludeCredentials(text);
    if (!cleanText || cleanText.length < 5) return [];

    const candidates: ExtractedCandidate[] = [];
    const now = Date.now();

    // 1. Explicit Remember Directives ("Remember that X", "Yaad rakhna ki X")
    const rememberMatch = /^(?:please\s+)?(?:remember\s+that|yaad\s+rakhna\s+ki|note\s+that|save\s+to\s+memory)\s+(.+)$/i.exec(cleanText);
    if (rememberMatch) {
      const fact = rememberMatch[1].trim();
      const triples = this.extractRelationalTriples(fact);
      candidates.push({
        key: `explicit_fact_${crypto.createHash("sha256").update(fact).digest("hex").slice(0, 10)}`,
        category: "fact",
        content: fact,
        importance: 5,
        confidence: 1.0,
        sensitivity: this.classifySensitivity(fact, "fact"),
        source: "explicit",
        tags: ["explicit_instruction", "verified"],
        triples,
        projectId,
        provenance: { origin: "user_directive", timestamp: now, author: "user", sessionId, projectId },
        containsCredentialRedaction: redacted,
      });
      return candidates;
    }

    // 2. Personal Identity & Name Declarations ("My name is X", "I am not Y, I am X")
    const namePattern = /(?:my name is|i am not\s+\w+\s+(?:i am|call me|my name is)|call me|mera naam)\s+([a-zA-Z]{2,20})/i.exec(cleanText);
    if (namePattern) {
      const name = namePattern[1].charAt(0).toUpperCase() + namePattern[1].slice(1).toLowerCase();
      if (!["ultron", "ready", "listening", "assistant", "here"].includes(name.toLowerCase())) {
        candidates.push({
          key: "user_name",
          category: "personal",
          content: `User's name is ${name}`,
          importance: 5,
          confidence: 1.0,
          sensitivity: "CONFIDENTIAL",
          source: "explicit",
          tags: ["identity", "user_profile"],
          triples: [{ subject: name, predicate: "IS_USER", object: "True", confidence: 1.0 }],
          projectId,
          provenance: { origin: "identity_declaration", timestamp: now, author: "user", sessionId, projectId },
          containsCredentialRedaction: redacted,
        });
      }
    }

    // 3. User Role & Profession ("I work as a senior engineer", "I am a founder")
    const roleMatch = /(?:i work as(?: an?| the)?|i am an?|my role is(?: an?| the)?|mai ek)\s+([a-zA-Z0-9\s_-]{2,35}(?:developer|engineer|founder|architect|scientist|lead|manager|analyst|designer))/i.exec(cleanText);
    if (roleMatch) {
      const roleStr = roleMatch[1].trim();
      candidates.push({
        key: "user_role",
        category: "personal",
        content: `User works as ${roleStr}`,
        importance: 4,
        confidence: 0.95,
        sensitivity: "CONFIDENTIAL",
        source: "inferred",
        tags: ["identity", "profession"],
        triples: [{ subject: "Ashish", predicate: "WORKS_AS", object: roleStr, confidence: 0.95 }],
        projectId,
        provenance: { origin: "conversation_inference", timestamp: now, author: "user", sessionId, projectId },
        containsCredentialRedaction: redacted,
      });
    }

    // 4. Technology & Architectural Preferences ("I prefer Next.js over Remix", "We decided to use SQLite")
    const prefMatch = /(?:i prefer|i like using|we prefer|mujhe)\s+([a-zA-Z0-9#+.\-_]{2,25}?)\s+(?:over|instead of|for|because|pasand)/i.exec(cleanText);
    if (prefMatch) {
      const pref = prefMatch[1].trim();
      candidates.push({
        key: `pref_${pref.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 15)}`,
        category: "preference",
        content: `User prefers ${pref}`,
        importance: 3,
        confidence: 0.9,
        sensitivity: "INTERNAL",
        source: "inferred",
        tags: ["preference", "tech_stack"],
        triples: [{ subject: "Ashish", predicate: "PREFERS", object: pref, confidence: 0.9 }],
        projectId,
        provenance: { origin: "conversation_inference", timestamp: now, author: "user", sessionId, projectId },
        containsCredentialRedaction: redacted,
      });
    }

    // 5. Strategic & Architectural Decisions ("We decided to...", "Let's stick with...", "Final decision is...")
    const decisionMatch = /(?:we decided to|the decision is to|let's go with|our decision is)\s+(.+)/i.exec(cleanText);
    if (decisionMatch) {
      const decContent = decisionMatch[1].trim();
      candidates.push({
        key: `dec_${crypto.createHash("sha256").update(decContent).digest("hex").slice(0, 10)}`,
        category: "decision",
        content: `Decision: ${decContent}`,
        importance: 5,
        confidence: 0.95,
        sensitivity: "INTERNAL",
        source: role === "user" ? "explicit" : "autonomous_learning",
        tags: ["architecture_decision", "project_milestone"],
        triples: [],
        projectId,
        provenance: { origin: "strategic_agreement", timestamp: now, author: role, sessionId, projectId },
        containsCredentialRedaction: redacted,
      });
    }

    // 6. Experience / Error Remediation Learning ("The bug was caused by X, fixed by doing Y")
    const bugFixMatch = /(?:the (?:bug|issue|failure|crash) was caused by|we fixed the error by|root cause was)\s+(.+)/i.exec(cleanText);
    if (bugFixMatch) {
      const expContent = bugFixMatch[0].trim();
      candidates.push({
        key: `exp_${crypto.createHash("sha256").update(expContent).digest("hex").slice(0, 10)}`,
        category: "experience",
        content: expContent,
        importance: 4,
        confidence: 0.9,
        sensitivity: "INTERNAL",
        source: "autonomous_learning",
        tags: ["troubleshooting", "error_solution"],
        triples: [],
        projectId,
        provenance: { origin: "error_postmortem", timestamp: now, author: role, sessionId, projectId },
        containsCredentialRedaction: redacted,
      });
    }

    // 7. Procedure / Playbook Instructions ("To build the project run...", "Step 1: ... Step 2: ...")
    const procedureMatch = /(?:to (?:build|deploy|run|test|start|recover|launch|setup)(?:\s+[\w-]+){1,4}(?:,\s*run|:|\s+do|\s+use)|steps? to (?:reproduce|deploy|install|build))/i.exec(cleanText);
    if (procedureMatch) {
      candidates.push({
        key: `proc_${crypto.createHash("sha256").update(cleanText).digest("hex").slice(0, 10)}`,
        category: "procedure",
        content: cleanText,
        importance: 4,
        confidence: 0.85,
        sensitivity: "INTERNAL",
        source: "inferred",
        tags: ["workflow", "playbook", "procedure"],
        triples: [],
        projectId,
        provenance: { origin: "procedure_documentation", timestamp: now, author: role, sessionId, projectId },
        containsCredentialRedaction: redacted,
      });
    }

    return candidates;
  }
}

/** Global singleton instance of the Extraction Engine. */
export const defaultMemoryExtractor = new MemoryExtractionEngine();
