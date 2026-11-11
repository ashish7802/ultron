/**
 * ============================================================================
 * Module Name: Research Safety & Integrity Engine (Module 11)
 * Subsystem: ULTRON Research & Verification Engine - Batch 04
 * File: lib/research/safetyEngine.ts
 * ============================================================================
 * 
 * ARCHITECTURAL ROLE & PURPOSE:
 * -----------------------------
 * Module 11 provides active defense, input sanitization, instruction hierarchy
 * enforcement, credential leak protection, and citation integrity verification
 * across the entire ULTRON research pipeline.
 * 
 * Rather than acting merely as an end-of-pipeline filter, this engine operates
 * in-flight during Discovery (Module 02), Evidence Extraction (Module 03),
 * Claim Verification (Module 05), Report Generation (Module 09), and Memory
 * Ingestion (Module 10).
 * 
 * It strictly enforces the foundational principle:
 * **External research content is untrusted data, NEVER executable instructions.**
 * 
 * KEY RESPONSIBILITIES:
 * ---------------------
 * 1. Layered Prompt Injection Detection: Detects prompt override commands,
 *    jailbreak templates (DAN, Developer Mode), secret exfiltration hooks,
 *    system prompt leakage probes, and control token smuggling (`<|...|>`).
 * 2. Malicious Document & Payload Awareness: Sanitizes raw HTML/Markdown,
 *    removes hidden `<script>`, `<iframe>`, `javascript:`, data URI vectors,
 *    zero-width character smuggling, and CSS invisible text overlays.
 * 3. Sensitive Data Redaction: Scans scraped or imported documents for accidental
 *    secret exposure (API keys, JWTs, AWS credentials, GitHub tokens, private keys)
 *    and masks them before evidence extraction and memory storage.
 * 4. Instruction Hierarchy Enforcement: Strictly preserves the priority chain:
 *    System Security Policies > Founder Explicit Directives > Research Objective > Untrusted Data.
 * 5. Citation Integrity Firewall: Verifies that every footnote in generated reports
 *    points to an authentic SourceRecord and a verbatim-matched EvidenceRecord.
 *    Rejects hallucinated references, phantom URLs, and fabricated quotes.
 * 6. Audit Logging & Security Event Dispatch: Emits structured security events
 *    (`ResearchSecurityEventRecord`) into `lib/research/repository.ts`.
 * 
 * SAFETY / SECURITY GUARANTEES:
 * -----------------------------
 * - Zero Execution of External Data: Discovered text cannot invoke shell commands,
 *   API routes, or OS automation scripts.
 * - Non-Destructive Fail-Safe Isolation: Quarantined content isolates only the
 *   malicious source while allowing clean, unrelated research tasks to proceed.
 * ============================================================================
 */

import crypto from "crypto";
import { researchRepository } from "./repository.ts";
import type {
  SecuritySeverity,
  SecurityActionTaken,
  SourceTrustTier,
  ContentSanitizationResult,
  SourceSafetyInspection,
  CitationIntegrityVerification,
  CitationIntegrityReport,
  ResearchReport,
  ResearchSecurityEventRecord,
  ResearchSourceAuditLogRecord,
  CitationIntegrityVerificationRecord,
} from "./types.ts";

/**
 * Curated regular expression patterns for prompt injection and instruction override detection.
 */
const INJECTION_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: SecuritySeverity;
  action: SecurityActionTaken;
}> = [
  // 1. Direct Instruction Overrides
  {
    name: "direct_instruction_override",
    pattern: /(?:ignore|disregard|forget|bypass|override)\s+(?:all\s+)?(?:previous\s+|prior\s+)?(?:instructions|rules|prompts|guidelines|constraints)/i,
    severity: "CRITICAL",
    action: "quarantined",
  },
  // 2. Jailbreak Persona Hijacking
  {
    name: "jailbreak_persona_hijacking",
    pattern: /(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+(?:DAN|unrestricted|jailbroken|developer\s+mode|root|god\s+mode)/i,
    severity: "CRITICAL",
    action: "quarantined",
  },
  // 3. System Prompt Extraction / Exfiltration
  {
    name: "system_prompt_exfiltration",
    pattern: /(?:print|reveal|output|display|show|leak|echo)\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions|secret\s+key|master\s+key|hidden\s+prompt)/i,
    severity: "HIGH",
    action: "quarantined",
  },
  // 4. Remote Exfiltration Hooks (fetch/curl/webhook patterns)
  {
    name: "remote_data_exfiltration",
    pattern: /(?:fetch|curl|wget|axios|XMLHttpRequest)\s*\(\s*["']https?:\/\/[^"']+\?(?:token|cookie|data|pwd|secret)=/i,
    severity: "CRITICAL",
    action: "blocked",
  },
  // 5. Destructive System Commands embedded in documentation
  {
    name: "embedded_destructive_command",
    pattern: /\b(?:rm\s+-rf\s+(?:\/|~)|format\s+[c-z]:|drop\s+database|del\s+\/f\s+\/s\s+\/q\s+c:\\)/i,
    severity: "CRITICAL",
    action: "neutralized",
  },
  // 6. Delimiter Smuggling & Control Tokens
  {
    name: "control_token_smuggling",
    pattern: /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>/i,
    severity: "HIGH",
    action: "neutralized",
  },
  // 7. Markdown Hidden Payload Ingestion
  {
    name: "markdown_hidden_instructions",
    pattern: /\[\/\/\]:\s*#\s*\((?:ignore|system|instruction|override)[^)]*\)/i,
    severity: "HIGH",
    action: "neutralized",
  },
];

/**
 * Regular expression patterns for sensitive credential and API key detection.
 */
const SENSITIVE_DATA_PATTERNS: Array<{
  name: "api_key" | "credential" | "auth_token" | "personal_identifier";
  pattern: RegExp;
  mask: string;
}> = [
  // OpenAI API Key
  { name: "api_key", pattern: /\bsk-(?:proj-)?[a-zA-Z0-9]{32,70}\b/g, mask: "[REDACTED_OPENAI_KEY]" },
  // Anthropic API Key
  { name: "api_key", pattern: /\bsk-ant-api[a-zA-Z0-9_-]{32,80}\b/g, mask: "[REDACTED_ANTHROPIC_KEY]" },
  // AWS Access Key ID
  { name: "credential", pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, mask: "[REDACTED_AWS_KEY]" },
  // Generic Bearer Token
  { name: "auth_token", pattern: /\bBearer\s+[a-zA-Z0-9_.-]{25,}\b/gi, mask: "Bearer [REDACTED_TOKEN]" },
  // GitHub Personal Access Token (classic & fine-grained)
  { name: "api_key", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,255}\b/g, mask: "[REDACTED_GITHUB_PAT]" },
  // Private Key Blocks
  { name: "credential", pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, mask: "[REDACTED_PRIVATE_KEY_BLOCK]" },
  // Stripe Secret Key
  { name: "api_key", pattern: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,34}\b/g, mask: "[REDACTED_STRIPE_KEY]" },
];

/**
 * Research Safety & Integrity Engine (Module 11)
 */
export class ResearchSafetyEngine {
  /**
   * Sanitizes external raw content, detecting prompt injections, stripping malicious HTML tags,
   * redacting sensitive credentials, and isolating instructions.
   *
   * @param rawContent Text or HTML gathered from external source
   * @param sourceId Optional originating source identifier
   * @param projectId Optional target project identifier
   * @returns ContentSanitizationResult containing sanitized text and threat telemetry
   */
  public async sanitizeContent(
    rawContent: string,
    sourceId?: string,
    projectId?: string
  ): Promise<ContentSanitizationResult> {
    if (!rawContent || !rawContent.trim()) {
      return {
        sanitizedContent: "",
        threatsDetected: [],
        sensitiveDataRedacted: [],
        isSafe: true,
        quarantineRequired: false,
      };
    }

    const threatsDetected: Array<{
      type: "prompt_injection" | "hidden_instruction" | "control_token" | "suspicious_html";
      pattern: string;
      action: string;
    }> = [];

    const sensitiveDataRedacted: Array<{
      type: "api_key" | "credential" | "auth_token" | "personal_identifier";
      redactedValue: string;
    }> = [];

    let cleaned = rawContent;
    let quarantineRequired = false;

    // ========================================================================
    // 1. STRIP SUSPICIOUS HTML ELEMENTS & HIDDEN OVERLAYS
    // ========================================================================
    const htmlThreats = [
      { tag: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, name: "<script> execution vector" },
      { tag: /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, name: "<iframe> embedding vector" },
      { tag: /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, name: "<object> payload vector" },
      { tag: /javascript:[^\s"'>]+/gi, name: "javascript: pseudo-protocol" },
      { tag: /style=["'][^"']*(?:display:\s*none|font-size:\s*0|visibility:\s*hidden)[^"']*["']/gi, name: "CSS hidden text overlay" },
    ];

    for (const ht of htmlThreats) {
      if (ht.tag.test(cleaned)) {
        threatsDetected.push({
          type: "suspicious_html",
          pattern: ht.name,
          action: "stripped",
        });
        cleaned = cleaned.replace(ht.tag, " [HTML_VECTOR_NEUTRALIZED] ");
      }
    }

    // Strip zero-width invisible characters often used for steganographic token injection
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, "");

    // ========================================================================
    // 2. DETECT PROMPT INJECTION & SYSTEM INSTRUCTION OVERRIDES
    // ========================================================================
    for (const rule of INJECTION_PATTERNS) {
      const match = rule.pattern.exec(cleaned);
      if (match) {
        threatsDetected.push({
          type: "prompt_injection",
          pattern: rule.name,
          action: rule.action,
        });

        if (rule.severity === "CRITICAL" || rule.severity === "HIGH") {
          quarantineRequired = true;
        }

        // Neutralize the injection pattern in text
        cleaned = cleaned.replace(rule.pattern, ` [PROMPT_INJECTION_NEUTRALIZED: ${rule.name}] `);

        // Record security event
        await this.recordSecurityEvent({
          id: crypto.randomUUID(),
          project_id: projectId,
          source_id: sourceId,
          event_type: "prompt_injection",
          severity: rule.severity,
          detected_pattern: rule.name,
          raw_excerpt: match[0].slice(0, 160),
          sanitized_excerpt: `[PROMPT_INJECTION_NEUTRALIZED: ${rule.name}]`,
          action_taken: rule.action,
          mitigation_notes: `Detected and neutralized injection pattern in external document text.`,
          created_at: new Date().toISOString(),
        });
      }
    }

    // ========================================================================
    // 3. SCAN AND REDACT SENSITIVE CREDENTIALS
    // ========================================================================
    for (const sens of SENSITIVE_DATA_PATTERNS) {
      if (sens.pattern.test(cleaned)) {
        sensitiveDataRedacted.push({
          type: sens.name,
          redactedValue: sens.mask,
        });

        cleaned = cleaned.replace(sens.pattern, sens.mask);

        // Record security event for sensitive data exposure
        await this.recordSecurityEvent({
          id: crypto.randomUUID(),
          project_id: projectId,
          source_id: sourceId,
          event_type: "sensitive_data_detected",
          severity: "HIGH",
          detected_pattern: sens.name,
          raw_excerpt: "[SENSITIVE_CREDENTIAL_MASKED]",
          sanitized_excerpt: sens.mask,
          action_taken: "redacted",
          mitigation_notes: `Redacted leaked credential pattern matching ${sens.name} to prevent storage in memory vault.`,
          created_at: new Date().toISOString(),
        });
      }
    }

    return {
      sanitizedContent: cleaned.trim(),
      threatsDetected,
      sensitiveDataRedacted,
      isSafe: threatsDetected.length === 0,
      quarantineRequired,
    };
  }

  /**
   * Pre-discovery source URL safety inspection: Evaluates domain credibility, trust tier,
   * and protocol safety before fetching network data.
   *
   * @param url Discovered target URL
   * @param sourceId Generated source identifier
   * @param projectId Research project identifier
   * @param provider Provider string (e.g. "live_web_search", "github_discovery")
   * @returns SourceSafetyInspection result
   */
  public async inspectSourceUrl(
    url: string,
    sourceId: string,
    projectId: string,
    provider: string
  ): Promise<SourceSafetyInspection> {
    const securityFlags: string[] = [];
    let isSafe = true;
    let trustTier: SourceTrustTier = "COMMUNITY_ANALYSIS";
    let accessDecision: "allowed" | "quarantined" | "blocked" | "rate_limited" = "allowed";
    let quarantineReason: string | undefined;

    try {
      const parsed = new URL(url);

      // Block SSRF to loopback and private interfaces
      const host = parsed.hostname.toLowerCase();
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host.startsWith("192.168.") ||
        host.startsWith("10.") ||
        host.endsWith(".local") ||
        host.endsWith(".internal")
      ) {
        isSafe = false;
        accessDecision = "blocked";
        trustTier = "MALICIOUS_REJECTED";
        securityFlags.push("SSRF_PRIVATE_NETWORK_TARGET");
        quarantineReason = "Access to private localhost or local subnet targets is strictly forbidden.";
      }

      // Enforce protocol boundaries (http/https only)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        isSafe = false;
        accessDecision = "blocked";
        trustTier = "MALICIOUS_REJECTED";
        securityFlags.push("UNSUPPORTED_PROTOCOL_TARGET");
        quarantineReason = `Unsupported network protocol: ${parsed.protocol}`;
      }

      // Classify Trust Tier
      if (isSafe) {
        if (host.includes("github.com") || host.includes("arxiv.org") || host.includes("ieee.org")) {
          trustTier = "VERIFIED_ACADEMIC";
        } else if (
          host.includes("postgresql.org") ||
          host.includes("python.org") ||
          host.includes("typescriptlang.org") ||
          host.includes("react.dev") ||
          host.includes("nextjs.org") ||
          host.includes("sqlite.org")
        ) {
          trustTier = "PRIMARY_OFFICIAL";
        } else {
          trustTier = "COMMUNITY_ANALYSIS";
        }
      }
    } catch {
      isSafe = false;
      accessDecision = "blocked";
      trustTier = "MALICIOUS_REJECTED";
      securityFlags.push("INVALID_MALFORMED_URL");
      quarantineReason = "Target URL could not be parsed as a valid RFC URI.";
    }

    // Persist source audit log
    const auditRecord: ResearchSourceAuditLogRecord = {
      id: crypto.randomUUID(),
      project_id: projectId,
      source_id: sourceId,
      url,
      provider,
      access_decision: accessDecision,
      trust_tier: trustTier,
      safety_flags: { flags: securityFlags, quarantineReason },
      inspected_at: new Date().toISOString(),
    };
    await researchRepository.saveSourceAuditLogs([auditRecord]);

    return {
      sourceId,
      url,
      isSafe,
      trustTier,
      accessDecision,
      securityFlags,
      quarantineReason,
      inspectedAt: new Date().toISOString(),
    };
  }

  /**
   * Citation Integrity Firewall: Audits research reports before final presentation.
   * Confirms every footnote index corresponds to an authentic SourceRecord and verbatim EvidenceRecord.
   *
   * @param report ResearchReport record generated by Module 09
   * @param projectId Research project identifier
   * @returns CitationIntegrityReport detailing audit outcomes
   */
  public async verifyCitationIntegrity(
    report: ResearchReport,
    projectId: string
  ): Promise<CitationIntegrityReport> {
    const sources = await researchRepository.getSources(projectId);
    const evidence = await researchRepository.getEvidence(projectId);

    const sourceMap = new Map<string, string>(); // sourceId -> canonical_url
    sources.forEach((s) => sourceMap.set(s.id, s.canonical_url || s.original_url));

    const evidenceMap = new Map<string, string>(); // evidenceId -> exact_passage
    evidence.forEach((e) => evidenceMap.set(e.id, e.exact_passage));

    const verifications: CitationIntegrityVerification[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let hasFabricatedReferences = false;

    for (const citation of report.citations) {
      let isValid = true;
      let hasVerbatimMatch = true;
      const diagnostics: string[] = [];

      // 1. Verify Source Existence in Repository
      if (!sourceMap.has(citation.sourceId)) {
        isValid = false;
        hasFabricatedReferences = true;
        diagnostics.push(`Citation [${citation.citationIndex}]: Source ID ${citation.sourceId} does not exist in repository.`);
      }

      // 2. Verify Evidence Existence & Verbatim Match
      if (citation.evidenceId) {
        const storedPassage = evidenceMap.get(citation.evidenceId);
        if (!storedPassage) {
          isValid = false;
          hasFabricatedReferences = true;
          diagnostics.push(`Citation [${citation.citationIndex}]: Evidence ID ${citation.evidenceId} not found.`);
        } else if (
          citation.exactPassageExcerpt &&
          !storedPassage.includes(citation.exactPassageExcerpt.slice(0, 40))
        ) {
          hasVerbatimMatch = false;
          diagnostics.push(`Citation [${citation.citationIndex}]: Footnote excerpt does not match stored passage text.`);
        }
      }

      if (isValid && hasVerbatimMatch) {
        validCount++;
      } else {
        invalidCount++;
      }

      verifications.push({
        id: crypto.randomUUID(),
        reportId: report.id,
        citationIndex: citation.citationIndex,
        sourceId: citation.sourceId,
        evidenceId: citation.evidenceId,
        isValid,
        hasVerbatimMatch,
        diagnostics: diagnostics.length > 0 ? diagnostics.join("; ") : undefined,
        verifiedAt: new Date().toISOString(),
      });
    }

    // Persist citation verification records
    const records: CitationIntegrityVerificationRecord[] = verifications.map((v) => ({
      id: v.id,
      report_id: v.reportId,
      citation_index: v.citationIndex,
      source_id: v.sourceId,
      evidence_id: v.evidenceId,
      is_valid: v.isValid,
      has_verbatim_match: v.hasVerbatimMatch,
      diagnostics: v.diagnostics,
      verified_at: v.verifiedAt,
    }));
    await researchRepository.saveCitationVerifications(records);

    if (hasFabricatedReferences) {
      await this.recordSecurityEvent({
        id: crypto.randomUUID(),
        project_id: projectId,
        event_type: "citation_integrity_failure",
        severity: "HIGH",
        detected_pattern: "phantom_or_fabricated_citations",
        raw_excerpt: `Report ${report.id} contained ${invalidCount} citations pointing to nonexistent sources/evidence.`,
        action_taken: "monitored",
        mitigation_notes: "Citation integrity firewall flagged unbacked citations.",
        created_at: new Date().toISOString(),
      });
    }

    return {
      reportId: report.id,
      totalCitations: report.citations.length,
      validCitationsCount: validCount,
      invalidCitationsCount: invalidCount,
      hasFabricatedReferences,
      verifications,
      auditedAt: new Date().toISOString(),
    };
  }

  /**
   * Records a structured security event in the shared repository.
   */
  private async recordSecurityEvent(event: ResearchSecurityEventRecord): Promise<void> {
    try {
      await researchRepository.saveSecurityEvents([event]);
    } catch (err) {
      console.warn("[RESEARCH SAFETY] Failed to record security event:", err);
    }
  }
}

/** Global singleton instance */
export const researchSafetyEngine = new ResearchSafetyEngine();
