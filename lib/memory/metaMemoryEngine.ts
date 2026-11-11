/**
 * @file lib/memory/metaMemoryEngine.ts
 * @description Meta-Memory Subsystem (Memory Type 12 of 12, Intelligence System E).
 *
 * Subsystem:
 * Self-Awareness of Knowledge Limits, Gap Identification & Retrieval Calibration.
 *
 * Key Responsibilities:
 * - Known Information Identification: Aggregates verified facts and established knowledge regarding a query topic.
 * - Missing Information Identification: Identifies knowledge blind spots, missing parameters, and unverified assumptions.
 * - Confidence Tracking: Evaluates epistemic calibration and flags memories that lack corroboration or are based on weak inferences.
 * - Retrieval Reliability Evaluation: Scores the adequacy of recalled memories against user goals before generating answers.
 * - Epistemic Stance Synthesis: Generates MetaMemory assessments consumed by `lib/cognitive/uncertaintyEngine.ts`.
 *
 * Architectural Role & Interactions:
 * - Direct collaborator with `lib/cognitive/uncertaintyEngine.ts` and `lib/cognitive/selfEvaluationEngine.ts`.
 * - Prevents false certainty by alerting downstream reasoning engines when stored evidence is insufficient.
 *
 * Safety / Security Guarantees:
 * - Read-only introspective evaluation; never hallucinates knowledge where records are absent.
 * - Explicitly tags unverified assumptions so they are not treated as immutable ground truth.
 */

import type {
  MetaMemoryRecord,
  ScoredMemoryResult,
} from "./types.ts";

export interface MetaMemoryAssessment {
  topic: string;
  knownFacts: string[];
  missingFacets: string[];
  completenessScore: number; // 0.0 to 1.0
  retrievalReliability: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  unverifiedMemoriesCount: number;
  clarificationRequired: boolean;
  recommendedClarifications: string[];
}

export class MetaMemoryEngine {
  /**
   * Evaluates the meta-memory state for a given query or topic across stored records.
   *
   * @param topic - Topic or user query.
   * @param recalledResults - Recalled memory records from the retrieval engine.
   * @returns Comprehensive MetaMemoryAssessment report.
   */
  public assessKnowledgeState(
    topic: string,
    recalledResults: ScoredMemoryResult[]
  ): MetaMemoryAssessment {
    const cleanTopic = topic.trim();
    const knownFacts: string[] = [];
    const missingFacets: string[] = [];
    const recommendedClarifications: string[] = [];
    let unverifiedCount = 0;

    for (const res of recalledResults) {
      const rec = res.record;
      if (rec.confidence >= 0.8 && rec.source === "explicit") {
        knownFacts.push(rec.content);
      } else if (rec.confidence < 0.7 || rec.source === "inferred") {
        unverifiedCount++;
        knownFacts.push(`[Provisional] ${rec.content}`);
      } else {
        knownFacts.push(rec.content);
      }
    }

    // Inspect common missing aspects depending on inquiry keywords
    const lower = cleanTopic.toLowerCase();

    if (/\b(deploy|build|release|publish)\b/.test(lower) && !knownFacts.some((f) => /environment|server|docker|port|cloud/i.test(f))) {
      missingFacets.push("Deployment target environment / server architecture");
      recommendedClarifications.push("Which deployment target (local Docker, self-hosted Linux, or cloud) should be used?");
    }

    if (/\b(database|storage|schema|table)\b/.test(lower) && !knownFacts.some((f) => /postgres|sqlite|mysql|redis/i.test(f))) {
      missingFacets.push("Database engine specification");
      recommendedClarifications.push("Do you prefer local SQLite or PostgreSQL for this database task?");
    }

    if (/\b(budget|cost|price|runway)\b/.test(lower) && !knownFacts.some((f) => /budget|usd|dollar|rupee|cost/i.test(f))) {
      missingFacets.push("Financial budget and cost limits");
      recommendedClarifications.push("What is the maximum allowed monthly budget for infrastructure?");
    }

    // Calculate knowledge completeness
    let completenessScore: number;
    if (knownFacts.length >= 3 && missingFacets.length === 0) {
      completenessScore = 0.95;
    } else if (knownFacts.length >= 1 && missingFacets.length === 0) {
      completenessScore = 0.75;
    } else if (knownFacts.length >= 1 && missingFacets.length > 0) {
      completenessScore = 0.50;
    } else {
      completenessScore = 0.15;
    }

    // Determine retrieval reliability rating
    let retrievalReliability: MetaMemoryAssessment["retrievalReliability"];
    if (completenessScore >= 0.80 && recalledResults.length > 0 && recalledResults[0].finalScore >= 0.65) {
      retrievalReliability = "HIGH";
    } else if (completenessScore >= 0.50) {
      retrievalReliability = "MEDIUM";
    } else if (knownFacts.length > 0) {
      retrievalReliability = "LOW";
    } else {
      retrievalReliability = "INSUFFICIENT";
    }

    const clarificationRequired = retrievalReliability === "INSUFFICIENT" && missingFacets.length > 0;

    return {
      topic: cleanTopic,
      knownFacts,
      missingFacets,
      completenessScore,
      retrievalReliability,
      unverifiedMemoriesCount: unverifiedCount,
      clarificationRequired,
      recommendedClarifications,
    };
  }

  /**
   * Synthesizes a formal MetaMemoryRecord (Type 12) from an assessment.
   *
   * @param assessment - Computed MetaMemory assessment.
   * @param projectId - Active project ID.
   * @returns MetaMemoryRecord ready for persistence or HUD telemetry.
   */
  public createMetaMemoryRecord(
    assessment: MetaMemoryAssessment,
    projectId: string = "default"
  ): MetaMemoryRecord {
    const now = Date.now();
    return {
      id: `meta_${Date.now()}`,
      key: `meta_${assessment.topic.slice(0, 20).toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
      memoryType: "meta",
      targetTopic: assessment.topic,
      knownInformationCount: assessment.knownFacts.length,
      missingInformationFacets: assessment.missingFacets,
      overallKnowledgeCompleteness: assessment.completenessScore,
      retrievalReliabilityRating: assessment.retrievalReliability,
      recommendedClarifications: assessment.recommendedClarifications,
      content: `Meta-Knowledge for "${assessment.topic}": ${assessment.knownFacts.length} facts known, ${assessment.missingFacets.length} aspects missing. Reliability: ${assessment.retrievalReliability}.`,
      importance: 4,
      confidence: 1.0,
      sensitivity: "INTERNAL",
      source: "autonomous_learning",
      projectId,
      provenance: {
        origin: "meta_memory_engine",
        timestamp: now,
        author: "ultron_engine",
      },
      temporal: {
        validFrom: now,
        isObsolescent: false,
      },
      versions: [
        {
          versionNumber: 1,
          content: `Initial meta-memory assessment for "${assessment.topic}"`,
          timestamp: now,
          changeReason: "Initial creation",
        },
      ],
      contradictionStatus: "NONE",
      tags: ["meta_memory", "epistemic_calibration", assessment.retrievalReliability.toLowerCase()],
      createdAt: now,
      updatedAt: now,
      accessCount: 1,
      lastAccessedAt: now,
    };
  }
}

/** Global singleton instance of Meta-Memory Engine. */
export const defaultMetaMemoryEngine = new MetaMemoryEngine();
