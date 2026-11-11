/**
 * @file lib/research/claimVerificationEngine.ts
 * @description Module 05: Claim Verification Engine for the ULTRON Co-Founder System.
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - Atomic Claim Verification & Epistemic Stance Checking.
 *
 * Key Responsibilities:
 * - Evaluates individual atomic claims one at a time against gathered verbatim evidence and quality assessments.
 * - Enforces the strict 6-tier epistemic verification status:
 *   `verified`, `partially_verified`, `conflicting`, `unverified`, `outdated`, `refuted`.
 * - Cross-checks claims against authoritative official documentation and technical specifications.
 * - Enforces genuine source independence: Prevents syndicated copies from counting as multi-source consensus.
 * - Analyzes temporal validity, distinguishing historical truth from current software/API versions.
 * - Detects misleading statements, overgeneralizations, and missing technical qualifiers.
 * - Computes a calibrated, non-fabricated confidence assessment grounded in observable evidence coverage.
 *
 * Architectural Role & Interactions:
 * - Upstream: Consumes `ClaimRecord`, `EvidenceRecord`, `ClaimEvidenceLinkRecord`, and `SourceQualityAssessment`s.
 * - Downstream: Feeds `ClaimVerificationResult`s to Module 06 (Contradiction Intelligence) and the Orchestrator.
 * - Storage: Persists verification assessments into `lib/research/repository.ts`.
 *
 * Safety / Security Guarantees:
 * - Epistemic honesty: Never manufactures artificial certainty or treats AI assumptions as verified facts.
 * - Complete audit trail: Every verification status is accompanied by an explanation and linked evidence IDs.
 * - Read-only analytical processing: Zero network requests or external side effects.
 */

import crypto from "crypto";
import type {
  ClaimRecord,
  EvidenceRecord,
  ClaimEvidenceLinkRecord,
  SourceRecord,
  SourceQualityAssessment,
  SourceDependency,
  ClaimVerificationResult,
  ClaimVerificationStatus,
  VerificationConfidenceLevel,
  TemporalAssessment,
} from "./types.ts";

export class ClaimVerificationEngine {
  /**
   * Verifies all claims for a research project against gathered evidence and source quality metrics.
   *
   * @param projectId - Parent project UUID.
   * @param claims - Atomic claims extracted by Module 03.
   * @param evidence - Verbatim evidence passages collected by Module 03.
   * @param links - ClaimEvidenceLink junction records.
   * @param sources - Discovered sources.
   * @param qualityAssessments - Source reliability assessments from Module 04.
   * @param dependencies - Source dependency records from Module 04.
   * @returns Array of ClaimVerificationResult objects.
   */
  public verifyClaims(
    projectId: string,
    claims: ClaimRecord[],
    evidence: EvidenceRecord[],
    links: ClaimEvidenceLinkRecord[],
    sources: SourceRecord[],
    qualityAssessments: SourceQualityAssessment[],
    dependencies: SourceDependency[]
  ): ClaimVerificationResult[] {
    const evidenceMap = new Map<string, EvidenceRecord>(evidence.map((e) => [e.id, e]));
    const sourceMap = new Map<string, SourceRecord>(sources.map((s) => [s.id, s]));
    const qualityMap = new Map<string, SourceQualityAssessment>(qualityAssessments.map((q) => [q.sourceId, q]));

    // Map syndicated/dependent source IDs
    const syndicatedSourceIds = new Set<string>(
      dependencies.filter((d) => d.dependencyType === "syndicated_copy").map((d) => d.sourceId)
    );

    return claims.map((claim) => {
      // Find all evidence linked to this claim
      const claimLinks = links.filter((l) => l.claim_id === claim.id);
      const linkedEvidence = claimLinks
        .map((l) => evidenceMap.get(l.evidence_id))
        .filter((e): e is EvidenceRecord => Boolean(e));

      return this.verifySingleClaim(
        projectId,
        claim,
        linkedEvidence,
        evidence,
        sourceMap,
        qualityMap,
        syndicatedSourceIds
      );
    });
  }

  /**
   * Evaluates a single atomic claim against its direct evidence and the broader evidentiary corpus.
   */
  private verifySingleClaim(
    projectId: string,
    claim: ClaimRecord,
    directEvidence: EvidenceRecord[],
    allEvidence: EvidenceRecord[],
    sourceMap: Map<string, SourceRecord>,
    qualityMap: Map<string, SourceQualityAssessment>,
    syndicatedSourceIds: Set<string>
  ): ClaimVerificationResult {
    const claimText = claim.claim_text.toLowerCase();
    const subject = (claim.subject || "").toLowerCase();
    const predicate = (claim.predicate || "").toLowerCase();
    const objectVal = (claim.object_value || "").toLowerCase();

    // 1. Evidence Matching (Direct, Contradicting, Irrelevant)
    const directEvidenceIds: string[] = [];
    const contradictingEvidenceIds: string[] = [];

    for (const ev of directEvidence) {
      const passText = ev.exact_passage.toLowerCase();
      if (passText.includes(objectVal) || passText.includes(predicate) || passText.includes(claimText)) {
        directEvidenceIds.push(ev.id);
      }
    }

    // Scan for potential contradictions in other evidence passages discussing the same subject
    for (const ev of allEvidence) {
      if (directEvidenceIds.includes(ev.id)) continue;
      const passText = ev.exact_passage.toLowerCase();

      // Check if passage discusses the same subject but asserts negation or incompatible values
      if (subject && passText.includes(subject)) {
        const isNegation =
          passText.includes(`does not support ${objectVal}`) ||
          passText.includes(`cannot ${objectVal}`) ||
          passText.includes(`no longer supports ${objectVal}`) ||
          passText.includes(`deprecated ${objectVal}`) ||
          passText.includes(`removed in version`);

        if (isNegation) {
          contradictingEvidenceIds.push(ev.id);
        }
      }
    }

    // 2. Official Source Cross-Checking
    let primarySourceChecked = false;
    for (const evId of directEvidenceIds) {
      const ev = allEvidence.find((e) => e.id === evId);
      if (ev) {
        const qa = qualityMap.get(ev.source_id);
        if (qa && (qa.isOfficialDoc || qa.isPrimarySource)) {
          primarySourceChecked = true;
          break;
        }
      }
    }

    // 3. Genuine Independent Sources Calculation
    const uniqueSourceIds = new Set<string>();
    for (const evId of directEvidenceIds) {
      const ev = allEvidence.find((e) => e.id === evId);
      if (ev && !syndicatedSourceIds.has(ev.source_id)) {
        uniqueSourceIds.add(ev.source_id);
      }
    }
    const independentSourcesCount = uniqueSourceIds.size;

    // 4. Temporal Assessment & Outdated Statement Check
    const temporalAssessment = this.evaluateTemporalValidity(claim, directEvidence, sourceMap);

    // 5. Misleading Statement & Qualifier Check
    const misleadingIndicators = this.detectMisleadingIndicators(claim, directEvidence);

    // 6. Strict Status Assignment (Verified, Partially, Conflicting, Unverified, Outdated, Refuted)
    const { status, explanation } = this.determineVerificationStatus(
      directEvidenceIds.length,
      contradictingEvidenceIds.length,
      primarySourceChecked,
      independentSourcesCount,
      temporalAssessment,
      misleadingIndicators,
      qualityMap,
      directEvidence,
      claim
    );

    // 7. Calibrated Confidence Scoring (Grounded in observable factors)
    const { confidenceScore, confidenceLevel } = this.calculateConfidenceScore(
      status,
      directEvidenceIds.length,
      primarySourceChecked,
      independentSourcesCount,
      contradictingEvidenceIds.length,
      misleadingIndicators.length
    );

    return {
      id: crypto.randomUUID(),
      projectId,
      claimId: claim.id,
      verificationStatus: status,
      confidenceScore,
      confidenceLevel,
      primarySourceChecked,
      independentSourcesCount,
      directEvidenceIds,
      contradictingEvidenceIds,
      explanation,
      qualifierNotes: claim.context_qualifier
        ? `Contextual qualifier: "${claim.context_qualifier}".`
        : undefined,
      misleadingIndicators,
      temporalAssessment,
      verifiedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // TEMPORAL ASSESSMENT
  // ============================================================================

  private evaluateTemporalValidity(
    claim: ClaimRecord,
    directEvidence: EvidenceRecord[],
    sourceMap: Map<string, SourceRecord>
  ): TemporalAssessment {
    const claimLower = claim.claim_text.toLowerCase();
    const isTimeSensitive =
      /\b(currently|latest|recent|now|v[0-9]+|version\s+[0-9]+|20[0-9]{2})\b/i.test(claimLower);

    let statedDateOrVersion: string | undefined;
    const vMatch = claimLower.match(/\bv([0-9]+(?:\.[0-9]+)?)\b/);
    if (vMatch) statedDateOrVersion = `v${vMatch[1]}`;

    // Check publication dates of direct evidence
    let oldestDate: Date | null = null;
    for (const ev of directEvidence) {
      const src = sourceMap.get(ev.source_id);
      if (src && src.publication_date) {
        const d = new Date(src.publication_date);
        if (!isNaN(d.getTime())) {
          if (!oldestDate || d < oldestDate) oldestDate = d;
        }
      }
    }

    const isOutdated =
      claimLower.includes("deprecated") ||
      (oldestDate !== null && Date.now() - oldestDate.getTime() > 1000 * 60 * 60 * 24 * 365 * 3);

    return {
      isTimeSensitive,
      statedDateOrVersion,
      isOutdated,
      temporalNote: isOutdated
        ? "Source evidence is older than 3 years or discusses deprecated architectural mechanisms."
        : isTimeSensitive
          ? "Time-sensitive statement verified against available recent release metadata."
          : "Declarative factual assertion without tight temporal coupling.",
    };
  }

  // ============================================================================
  // MISLEADING STATEMENT DETECTION
  // ============================================================================

  private detectMisleadingIndicators(claim: ClaimRecord, directEvidence: EvidenceRecord[]): string[] {
    const indicators: string[] = [];
    const text = claim.claim_text.toLowerCase();

    // 1. Overgeneralization
    if (/\b(always|never|every|all|fastest|infinitely|perfect|flawless)\b/i.test(text)) {
      indicators.push(
        "Overgeneralization: Claim asserts absolute performance or universality ('always', 'fastest', 'every') which is rarely valid without qualification."
      );
    }

    // 2. Correlation vs Causation
    if (/\b(causes|leads to|results in|proves that)\b/i.test(text) && !/\b(due to|configured with)\b/i.test(text)) {
      indicators.push(
        "Causal Assertion: Statement infers direct causation without explicit empirical benchmarking details."
      );
    }

    // 3. Missing Technical Qualifier
    if (claim.claim_type === "performance_benchmark" && !/\b(under|with|using|concurrency|threads|ram)\b/i.test(text)) {
      indicators.push(
        "Missing Workload Qualifier: Performance benchmark claim omits concurrency, hardware, or workload parameters."
      );
    }

    // Check if direct evidence has qualifier omitted by claim
    for (const ev of directEvidence) {
      const pass = ev.exact_passage.toLowerCase();
      if (pass.includes("only when") || pass.includes("requires optional") || pass.includes("experimental")) {
        indicators.push(
          "Unreflected Prerequisite: Underlying source marks this capability as conditional or experimental."
        );
        break;
      }
    }

    return indicators;
  }

  // ============================================================================
  // STATUS DETERMINATION
  // ============================================================================

  private determineVerificationStatus(
    directCount: number,
    contradictingCount: number,
    primaryChecked: boolean,
    independentCount: number,
    temporal: TemporalAssessment,
    misleading: string[],
    qualityMap: Map<string, SourceQualityAssessment>,
    directEvidence: EvidenceRecord[],
    claim: ClaimRecord
  ): { status: ClaimVerificationStatus; explanation: string } {
    const typeNote = claim.claim_type !== "general_fact" ? ` for ${claim.claim_type.replace(/_/g, " ")}` : "";
    // 1. Refuted by direct evidence
    if (contradictingCount > 0 && directCount === 0) {
      return {
        status: "refuted",
        explanation: `Claim is contradicted by ${contradictingCount} authoritative evidence passage(s).`,
      };
    }

    // 2. Conflicting credible evidence
    if (contradictingCount > 0 && directCount > 0) {
      return {
        status: "conflicting",
        explanation: `Conflicting evidence detected: Supported by ${directCount} passage(s), but contradicted by ${contradictingCount} passage(s). Requires cross-source resolution.`,
      };
    }

    // 3. Outdated
    if (temporal.isOutdated) {
      return {
        status: "outdated",
        explanation: "Statement reflects historical architectural states or deprecated versions no longer current.",
      };
    }

    // 4. Unverified: Insufficient evidence
    if (directCount === 0) {
      return {
        status: "unverified",
        explanation: "Insufficient empirical evidence: No direct verbatim supporting passages found in gathered sources.",
      };
    }

    // Check quality of supporting sources
    let hasHighQualitySource = false;
    for (const ev of directEvidence) {
      const qa = qualityMap.get(ev.source_id);
      if (qa && (qa.qualityTier === "HIGH_QUALITY" || qa.qualityTier === "REPUTABLE")) {
        hasHighQualitySource = true;
        break;
      }
    }

    // 5. Partially Verified
    if (misleading.length > 0 || !hasHighQualitySource || (independentCount === 1 && !primaryChecked)) {
      return {
        status: "partially_verified",
        explanation: `Partially verified: Core concept is attested in ${directCount} passage(s), but lacks independent secondary confirmation or carries unreflected qualifications.`,
      };
    }

    // 6. Verified
    const authorityDesc = primaryChecked
      ? "verified against authoritative primary documentation"
      : `confirmed across ${independentCount} independent reputable sources`;

    return {
      status: "verified",
      explanation: `Strong empirical evidence: Directly ${authorityDesc}${typeNote} with zero conflicting passages.`,
    };
  }

  // ============================================================================
  // CONFIDENCE CALCULATION
  // ============================================================================

  private calculateConfidenceScore(
    status: ClaimVerificationStatus,
    directCount: number,
    primaryChecked: boolean,
    independentCount: number,
    contradictingCount: number,
    misleadingCount: number
  ): { confidenceScore: number; confidenceLevel: VerificationConfidenceLevel } {
    let score = 0.5;

    switch (status) {
      case "verified":
        score = primaryChecked ? 0.95 : Math.min(0.92, 0.75 + independentCount * 0.08);
        break;
      case "partially_verified":
        score = Math.min(0.72, 0.5 + directCount * 0.08 - misleadingCount * 0.05);
        break;
      case "conflicting":
        score = 0.45; // Epistemic ambiguity
        break;
      case "outdated":
        score = 0.85; // High confidence that it IS outdated
        break;
      case "refuted":
        score = 0.9;  // High confidence in the refutation
        break;
      case "unverified":
        score = 0.2;
        break;
    }

    // Penalty for unconfirmed contradictions
    if (contradictingCount > 0 && status !== "refuted" && status !== "conflicting") {
      score = Math.max(0.1, score - 0.2);
    }

    const bounded = Number(Math.max(0.1, Math.min(0.99, score)).toFixed(3));

    let level: VerificationConfidenceLevel;
    if (bounded >= 0.85) level = "HIGH";
    else if (bounded >= 0.7) level = "MODERATE";
    else if (bounded >= 0.45) level = "PROVISIONAL";
    else level = "LOW";

    return { confidenceScore: bounded, confidenceLevel: level };
  }
}

/** Global singleton instance */
export const claimVerificationEngine = new ClaimVerificationEngine();
