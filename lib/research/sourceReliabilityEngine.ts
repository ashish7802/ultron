/**
 * @file lib/research/sourceReliabilityEngine.ts
 * @description Module 04: Source Reliability & Quality Engine for the ULTRON Co-Founder System.
 *
 * Subsystem:
 * Autonomous Knowledge & Research Intelligence - Source Credibility, Authority & Independence Evaluation.
 *
 * Key Responsibilities:
 * - Computes multi-dimensional explainable credibility assessments for discovered research sources.
 * - Evaluates 6 orthogonal dimensions: Authority, Relevance, Freshness, Evidence, Independence, and Transparency.
 * - Classifies sources into Primary vs Secondary, identifying official documentation and RFC standards.
 * - Detects syndicated copies, press wires, and mirrors to compute true source independence.
 * - Identifies commercial and vendor biases (e.g., proprietary cloud advocacy vs neutral benchmarks).
 * - Distinguishes missing dates from chronologically outdated versions using an exponential decay curve.
 * - Maps source dependencies to prevent false consensus (majority voting on copied articles).
 *
 * Architectural Role & Interactions:
 * - Upstream: Consumes `SourceRecord` and `EvidenceRecord` items produced by Modules 02 & 03.
 * - Downstream: Feeds `SourceQualityAssessment` and `SourceDependency` records to Module 05 (Claim Verification)
 *   and Module 06 (Contradiction Intelligence).
 * - Storage: Persists assessments into `lib/research/repository.ts`.
 *
 * Safety / Security Guarantees:
 * - Read-only analytical evaluation: Zero network side effects or external queries.
 * - Epistemic honesty: Explicitly documents missing metadata instead of fabricating synthetic dates or authors.
 * - Separation of concerns: Evaluates source reliability strictly independently of claim truthfulness.
 */

import crypto from "crypto";
import type {
  SourceRecord,
  EvidenceRecord,
  SourceQualityAssessment,
  QualityTier,
  SourceDependency,
  SourceType,
} from "./types.ts";

/**
 * Curated domain authority weights mapping known authoritative institutions to baseline scores.
 */
const HIGH_AUTHORITY_DOMAINS: Record<string, number> = {
  "nature.com": 0.99,
  "science.org": 0.99,
  "ieee.org": 0.98,
  "arxiv.org": 0.96,
  "w3.org": 0.97,
  "ietf.org": 0.98,
  "csrc.nist.gov": 0.98,
  "postgresql.org": 0.96,
  "docs.python.org": 0.96,
  "developer.mozilla.org": 0.97,
  "typescriptlang.org": 0.95,
  "nextjs.org": 0.94,
  "react.dev": 0.94,
  "nodejs.org": 0.95,
  "sqlite.org": 0.96,
  "github.com": 0.88,
  "wikipedia.org": 0.85,
};

/**
 * Primary source classifications that represent original technical specifications or authoring entities.
 */
const PRIMARY_SOURCE_TYPES: Set<SourceType> = new Set([
  "official_documentation",
  "technical_specification",
  "academic_paper",
  "github_repository",
  "api_documentation",
  "internal_document",
  "advanced_memory",
]);

export class SourceReliabilityEngine {
  /**
   * Assesses the reliability, independence, and quality of all discovered sources in a project.
   *
   * @param projectId - Parent project UUID.
   * @param inquiry - Core research inquiry or objective for relevance alignment.
   * @param sources - Discovered source records.
   * @param evidence - Extracted evidence records linked to these sources.
   * @returns Array of SourceQualityAssessment objects and detected SourceDependency links.
   */
  public evaluateSources(
    projectId: string,
    inquiry: string,
    sources: SourceRecord[],
    evidence: EvidenceRecord[]
  ): {
    assessments: SourceQualityAssessment[];
    dependencies: SourceDependency[];
  } {
    const dependencies = this.detectSourceDependencies(projectId, sources, evidence);
    const dependencyCountMap = new Map<string, number>();

    for (const dep of dependencies) {
      const count = dependencyCountMap.get(dep.sourceId) || 0;
      dependencyCountMap.set(dep.sourceId, count + 1);
    }

    const assessments: SourceQualityAssessment[] = sources.map((source) => {
      return this.evaluateSingleSource(projectId, inquiry, source, evidence, dependencyCountMap.get(source.id) || 0);
    });

    return { assessments, dependencies };
  }

  /**
   * Evaluates an individual source across all 6 dimensions.
   */
  private evaluateSingleSource(
    projectId: string,
    inquiry: string,
    source: SourceRecord,
    allEvidence: EvidenceRecord[],
    upstreamCopyCount: number
  ): SourceQualityAssessment {
    const sourceEvidence = allEvidence.filter((ev) => ev.source_id === source.id);

    // 1. Authority Evaluation
    const { authorityScore, isPrimary, isOfficial, authorityReasoning } = this.evaluateAuthority(source);

    // 2. Relevance Evaluation
    const { relevanceScore, relevanceReasoning } = this.evaluateRelevance(source, inquiry, sourceEvidence);

    // 3. Freshness Evaluation
    const { freshnessScore, freshnessReasoning } = this.evaluateFreshness(source);

    // 4. Evidence Transparency & Density
    const { evidenceScore, evidenceReasoning, transparencyScore, transparencyReasoning, transparencyLimitations } =
      this.evaluateEvidenceAndTransparency(source, sourceEvidence);

    // 5. Independence Evaluation
    const { independenceScore, independenceReasoning } = this.evaluateIndependence(source, upstreamCopyCount);

    // 6. Bias Identification
    const detectedBiases = this.detectBiases(source);

    // 7. Composite Weighted Score Calculation
    // Authority (25%), Relevance (25%), Evidence (20%), Independence (15%), Transparency (10%), Freshness (5%)
    const compositeQualityScore = Math.min(
      1.0,
      Math.max(
        0.0,
        authorityScore * 0.25 +
          relevanceScore * 0.25 +
          evidenceScore * 0.2 +
          independenceScore * 0.15 +
          transparencyScore * 0.1 +
          freshnessScore * 0.05
      )
    );

    const qualityTier = this.classifyQualityTier(compositeQualityScore, isOfficial, source.retrieval_status);

    return {
      id: crypto.randomUUID(),
      projectId,
      sourceId: source.id,
      authorityScore,
      relevanceScore,
      freshnessScore,
      evidenceScore,
      independenceScore,
      transparencyScore,
      compositeQualityScore: Number(compositeQualityScore.toFixed(3)),
      qualityTier,
      isPrimarySource: isPrimary,
      isOfficialDoc: isOfficial,
      detectedBiases,
      transparencyLimitations,
      assessmentBreakdown: {
        authorityReasoning,
        relevanceReasoning,
        freshnessReasoning,
        evidenceReasoning,
        independenceReasoning,
        transparencyReasoning,
      },
      assessedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // A. AUTHORITY EVALUATION
  // ============================================================================

  private evaluateAuthority(source: SourceRecord): {
    authorityScore: number;
    isPrimary: boolean;
    isOfficial: boolean;
    authorityReasoning: string;
  } {
    let score = 0.5;
    const isPrimary = PRIMARY_SOURCE_TYPES.has(source.source_type);
    let isOfficial = source.source_type === "official_documentation" || source.source_type === "api_documentation";
    const reasoning: string[] = [];

    // Extract hostname
    let host = "";
    try {
      if (source.original_url.startsWith("http")) {
        host = new URL(source.original_url).hostname.toLowerCase();
      }
    } catch {
      host = "";
    }

    // Check curated authoritative domains
    let domainWeight: number | undefined;
    for (const [authHost, weight] of Object.entries(HIGH_AUTHORITY_DOMAINS)) {
      if (host.includes(authHost) || source.publisher?.toLowerCase().includes(authHost)) {
        domainWeight = weight;
        score = Math.max(score, weight);
        isOfficial = isOfficial || authHost.includes("docs.") || authHost.includes(".org") || authHost.includes(".dev");
        reasoning.push(`Recognized authoritative publisher domain "${authHost}" (baseline authority: ${weight}).`);
        break;
      }
    }

    if (!domainWeight) {
      if (source.source_type === "internal_document" || source.source_type === "advanced_memory") {
        score = 0.95;
        reasoning.push("Internal verified workspace document or encrypted memory record.");
      } else if (source.source_type === "academic_paper") {
        score = 0.92;
        reasoning.push("Academic paper or theoretical pre-print with scholarly attribution.");
      } else if (source.source_type === "github_repository") {
        score = 0.85;
        reasoning.push("Public source code repository with verifiable version control tags.");
      } else if (source.source_type === "community_discussion") {
        score = 0.35;
        reasoning.push("Community forum or discussion thread (anecdotal signal, not authoritative fact).");
      } else {
        score = 0.6;
        reasoning.push("General web source with standard secondary publication authority.");
      }
    }

    if (source.author) {
      score = Math.min(1.0, score + 0.05);
      reasoning.push(`Identified explicit author or maintainer: "${source.author}".`);
    }

    return {
      authorityScore: Number(score.toFixed(3)),
      isPrimary,
      isOfficial,
      authorityReasoning: reasoning.join(" "),
    };
  }

  // ============================================================================
  // B. RELEVANCE EVALUATION
  // ============================================================================

  private evaluateRelevance(
    source: SourceRecord,
    inquiry: string,
    evidence: EvidenceRecord[]
  ): { relevanceScore: number; relevanceReasoning: string } {
    const inquiryTerms = inquiry
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    const titleLower = source.title.toLowerCase();
    const snippetLower = (source.snippet || "").toLowerCase();
    const evidenceText = evidence.map((e) => e.exact_passage.toLowerCase()).join(" ");

    let termMatches = 0;
    for (const term of inquiryTerms) {
      if (titleLower.includes(term) || snippetLower.includes(term) || evidenceText.includes(term)) {
        termMatches++;
      }
    }

    const matchRatio = inquiryTerms.length > 0 ? termMatches / inquiryTerms.length : 0.5;
    let score = Math.max(0.3, Math.min(1.0, 0.4 + matchRatio * 0.6));

    let reasoning = `Source matches ${termMatches} of ${inquiryTerms.length} core inquiry keywords.`;
    if (matchRatio >= 0.75) {
      score = Math.min(1.0, score + 0.1);
      reasoning += " High topical alignment across title, snippet, and extracted evidence.";
    } else if (matchRatio < 0.3) {
      reasoning += " Peripheral or marginal topical relevance to the central research inquiry.";
    }

    return {
      relevanceScore: Number(score.toFixed(3)),
      relevanceReasoning: reasoning,
    };
  }

  // ============================================================================
  // C. FRESHNESS EVALUATION
  // ============================================================================

  private evaluateFreshness(source: SourceRecord): { freshnessScore: number; freshnessReasoning: string } {
    const pubDateStr = source.publication_date;
    if (!pubDateStr) {
      return {
        freshnessScore: 0.5,
        freshnessReasoning:
          "Publication date is omitted by source. Evaluated with provisional neutral freshness.",
      };
    }

    const pubTime = new Date(pubDateStr).getTime();
    if (isNaN(pubTime)) {
      return {
        freshnessScore: 0.5,
        freshnessReasoning: "Publication timestamp could not be parsed unambiguously.",
      };
    }

    const now = Date.now();
    const ageInDays = Math.max(0, (now - pubTime) / (1000 * 60 * 60 * 24));

    // Freshness decay curve:
    // < 90 days: 1.0
    // < 1 year (365 days): 0.85
    // < 2 years (730 days): 0.70
    // < 4 years (1460 days): 0.50
    // >= 4 years: 0.30
    let score: number;
    let reason: string;

    if (ageInDays <= 90) {
      score = 1.0;
      reason = `Highly current: Published within the last ${Math.round(ageInDays)} days (${pubDateStr.slice(0, 10)}).`;
    } else if (ageInDays <= 365) {
      score = 0.85;
      reason = `Current: Published within the past year (${Math.round(ageInDays)} days ago).`;
    } else if (ageInDays <= 730) {
      score = 0.7;
      reason = `Moderately current: Published within the last 2 years (${pubDateStr.slice(0, 10)}).`;
    } else if (ageInDays <= 1460) {
      score = 0.5;
      reason = `Older technical documentation (${Math.round(ageInDays / 365)} years old). Verify version compatibility.`;
    } else {
      score = 0.3;
      reason = `Historical source: Published over 4 years ago (${pubDateStr.slice(0, 10)}). High probability of architectural drift.`;
    }

    return {
      freshnessScore: Number(score.toFixed(3)),
      freshnessReasoning: reason,
    };
  }

  // ============================================================================
  // D. EVIDENCE TRANSPARENCY & DENSITY
  // ============================================================================

  private evaluateEvidenceAndTransparency(
    source: SourceRecord,
    evidence: EvidenceRecord[]
  ): {
    evidenceScore: number;
    evidenceReasoning: string;
    transparencyScore: number;
    transparencyReasoning: string;
    transparencyLimitations: string[];
  } {
    const limitations: string[] = [];
    const count = evidence.length;

    let evScore: number;
    let evReason: string;

    if (count >= 5) {
      evScore = 0.95;
      evReason = `Extracted ${count} substantive verbatim passages with high evidentiary density.`;
    } else if (count >= 2) {
      evScore = 0.75;
      evReason = `Extracted ${count} supporting passages providing direct evidence for claims.`;
    } else if (count === 1) {
      evScore = 0.55;
      evReason = "Single supporting passage extracted. Limited evidentiary breadth.";
    } else {
      evScore = 0.2;
      evReason = "No verbatim supporting passages could be extracted from this source.";
      limitations.push("Source payload was empty or restricted; lacks direct textual evidence.");
    }

    // Transparency: evaluates whether the source cites specific versions, RFCs, or methods
    let transScore = 0.6;
    let transReason = "";

    const combinedText = evidence.map((e) => e.exact_passage).join(" ");
    const hasSpecificSpecs = /\b(v[0-9]+|RFC\s*[0-9]+|benchmark|latency|ISO|IEEE|spec)\b/i.test(combinedText);
    const hasVagueClaims = /\b(everyone knows|it is clear|obviously|unquestionably|proven best)\b/i.test(combinedText);

    if (hasSpecificSpecs) {
      transScore += 0.25;
      transReason = "Cites explicit specifications, version tags, or quantifiable benchmarks.";
    }
    if (hasVagueClaims) {
      transScore -= 0.2;
      limitations.push("Contains unsubstantiated rhetorical assertions ('obviously', 'proven best').");
    }

    transScore = Math.max(0.2, Math.min(1.0, transScore));
    if (!transReason) {
      transReason = "Standard declarative presentation without explicit technical citations.";
    }

    return {
      evidenceScore: Number(evScore.toFixed(3)),
      evidenceReasoning: evReason,
      transparencyScore: Number(transScore.toFixed(3)),
      transparencyReasoning: transReason,
      transparencyLimitations: limitations,
    };
  }

  // ============================================================================
  // E. INDEPENDENCE & SYNDICATION
  // ============================================================================

  private evaluateIndependence(
    source: SourceRecord,
    upstreamCopyCount: number
  ): { independenceScore: number; independenceReasoning: string } {
    if (upstreamCopyCount > 0) {
      const score = Math.max(0.3, 1.0 - upstreamCopyCount * 0.35);
      return {
        independenceScore: Number(score.toFixed(3)),
        independenceReasoning: `Source contains content duplicated or syndicated from ${upstreamCopyCount} other source(s). Cannot be counted as independent consensus.`,
      };
    }

    return {
      independenceScore: 1.0,
      independenceReasoning: "Genuinely independent source with unique content hash and lineage.",
    };
  }

  // ============================================================================
  // F. BIAS IDENTIFICATION
  // ============================================================================

  private detectBiases(source: SourceRecord): string[] {
    const biases: string[] = [];
    const text = `${source.title} ${source.snippet || ""}`.toLowerCase();

    // Commercial Vendor Bias
    if (
      /\b(pricing|buy now|start free trial|enterprise pricing|sales team|book a demo|contact sales)\b/i.test(text)
    ) {
      biases.push("Commercial / Vendor Sales: Content is published by a commercial provider promoting paid tiers.");
    }

    // Proprietary Platform Advocacy
    if (
      /\b(why our product is better|the best alternative to|switch from|migrate to our cloud)\b/i.test(text)
    ) {
      biases.push("Product Advocacy: Content exhibits competitive promotional framing.");
    }

    // Informal Forum Speculation
    if (source.source_type === "community_discussion") {
      biases.push("Subjective Community Sentiment: Statements represent personal opinions rather than verified engineering specifications.");
    }

    return biases;
  }

  // ============================================================================
  // G. SOURCE DEPENDENCY & DUPLICATION DETECTION
  // ============================================================================

  private detectSourceDependencies(
    projectId: string,
    sources: SourceRecord[],
    evidence: EvidenceRecord[]
  ): SourceDependency[] {
    const dependencies: SourceDependency[] = [];

    // Map evidence text chunks by source
    const sourcePassages = new Map<string, string[]>();
    for (const ev of evidence) {
      const existing = sourcePassages.get(ev.source_id) || [];
      existing.push(ev.exact_passage);
      sourcePassages.set(ev.source_id, existing);
    }

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const sourceA = sources[i];
        const sourceB = sources[j];

        // 1. Identical Content Hash
        if (sourceA.content_hash && sourceB.content_hash && sourceA.content_hash === sourceB.content_hash) {
          dependencies.push({
            id: crypto.randomUUID(),
            projectId,
            sourceId: sourceB.id,
            upstreamSourceId: sourceA.id,
            dependencyType: "syndicated_copy",
            confidence: 1.0,
            detectedAt: new Date().toISOString(),
          });
          continue;
        }

        // 2. High Text Excerpt Overlap
        const passagesA = sourcePassages.get(sourceA.id) || [];
        const passagesB = sourcePassages.get(sourceB.id) || [];

        let identicalChunks = 0;
        for (const pa of passagesA) {
          if (passagesB.some((pb) => pb.includes(pa.slice(0, 80)) || pa.includes(pb.slice(0, 80)))) {
            identicalChunks++;
          }
        }

        if (identicalChunks >= 2 && passagesA.length > 0) {
          dependencies.push({
            id: crypto.randomUUID(),
            projectId,
            sourceId: sourceB.id,
            upstreamSourceId: sourceA.id,
            dependencyType: "derived_citation",
            confidence: 0.85,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    return dependencies;
  }

  // ============================================================================
  // TIER CLASSIFICATION
  // ============================================================================

  private classifyQualityTier(
    compositeScore: number,
    isOfficial: boolean,
    status: SourceRecord["retrieval_status"]
  ): QualityTier {
    if (status === "failed" || status === "timeout" || status === "restricted") {
      return "UNRELIABLE";
    }
    if (isOfficial && compositeScore >= 0.75) {
      return "HIGH_QUALITY";
    }
    if (compositeScore >= 0.82) {
      return "HIGH_QUALITY";
    }
    if (compositeScore >= 0.68) {
      return "REPUTABLE";
    }
    if (compositeScore >= 0.48) {
      return "PROVISIONAL";
    }
    if (compositeScore >= 0.3) {
      return "LOW_CREDIBILITY";
    }
    return "UNRELIABLE";
  }
}

/** Global singleton instance */
export const sourceReliabilityEngine = new SourceReliabilityEngine();
