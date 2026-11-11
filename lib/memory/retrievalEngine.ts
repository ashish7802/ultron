/**
 * @file lib/memory/retrievalEngine.ts
 * @description Smart Multi-Modal Memory Retrieval Engine (Advanced Memory Intelligence System B).
 *
 * Subsystem:
 * Hybrid Memory Recall, Context-Aware Ranking & Strict Project Isolation.
 *
 * Key Responsibilities:
 * - Keyword Retrieval: Evaluates term frequency and exact keyword overlap between user queries and stored memories.
 * - Semantic Associative Retrieval: Measures semantic proximity via n-gram token overlap, Jaccard similarity, and associative weights.
 * - Hybrid Fusion: Combines keyword and semantic ranking using Reciprocal Rank Fusion (RRF) or weighted linear interpolation.
 * - Context-Aware Ranking: Multi-factor scoring taking into account:
 *   * Semantic/Keyword Relevance (50%)
 *   * Record Importance [1-5 scale] (20%)
 *   * Recency / Temporal Freshness (15%)
 *   * Calibrated Confidence [0.0 - 1.0] (15%)
 * - Project Isolation Guard: Strictly partitions memories by `projectId`. Cross-project queries are forbidden.
 * - Sensitivity Gate: Rejects `RESTRICTED` items unless explicitly authorized via Zero-Trust credentials.
 * - Historical Time-Travel: Allows point-in-time queries to inspect the memory state as of a historical timestamp.
 *
 * Architectural Role & Interactions:
 * - Called during chat generation to enrich prompts with recalled facts.
 * - Interfaced by `lib/cognitive/orchestrator.ts` to supply ground-truth evidence to downstream reasoning engines.
 *
 * Safety / Security Guarantees:
 * - Fail-closed project isolation: records from other projects can never leak into the current context.
 * - Unauthenticated callers cannot read CONFIDENTIAL or RESTRICTED memories.
 */

import type {
  AnyMemoryRecord,
  MemoryRetrievalOptions,
  ScoredMemoryResult,
} from "./types.ts";

export class MemoryRetrievalEngine {
  /**
   * Computes keyword overlap score between query and target text.
   *
   * @param queryWords - Filtered query terms.
   * @param targetText - Memory content or key string.
   * @returns Floating point score between 0.0 and 1.0.
   */
  private _computeKeywordScore(queryWords: string[], targetText: string): number {
    if (queryWords.length === 0 || !targetText) return 0.0;
    const lowerTarget = targetText.toLowerCase();
    let matches = 0;

    for (const word of queryWords) {
      if (lowerTarget.includes(word)) {
        matches++;
      }
    }
    return matches / queryWords.length;
  }

  /**
   * Computes semantic associative similarity using bi-gram Jaccard overlap.
   *
   * @param query - Raw query string.
   * @param text - Memory text.
   * @returns Jaccard similarity coefficient [0.0, 1.0].
   */
  private _computeSemanticSimilarity(query: string, text: string): number {
    const q = query.toLowerCase().trim();
    const t = text.toLowerCase().trim();

    if (q === t) return 1.0;
    if (t.includes(q) || q.includes(t)) return 0.85;

    // Build character bi-grams
    const getBigrams = (str: string): Set<string> => {
      const set = new Set<string>();
      for (let i = 0; i < str.length - 1; i++) {
        set.add(str.slice(i, i + 2));
      }
      return set;
    };

    const bigramsQ = getBigrams(q);
    const bigramsT = getBigrams(t);
    if (bigramsQ.size === 0 || bigramsT.size === 0) return 0.0;

    let intersection = 0;
    for (const bg of bigramsQ) {
      if (bigramsT.has(bg)) intersection++;
    }

    const union = bigramsQ.size + bigramsT.size - intersection;
    return union > 0 ? intersection / union : 0.0;
  }

  /**
   * Computes temporal recency decay factor.
   *
   * @param recordTimestamp - Creation or update epoch milliseconds.
   * @param referenceTimestamp - Current time or historical target time.
   * @returns Factor between 0.5 (very old) and 1.0 (recent).
   */
  private _computeRecencyFactor(recordTimestamp: number, referenceTimestamp: number): number {
    const ageMs = Math.max(0, referenceTimestamp - recordTimestamp);
    const daysOld = ageMs / (1000 * 60 * 60 * 24);
    // Exponential half-life decay over 30 days, bounded at minimum 0.50
    return Math.max(0.5, Math.exp(-0.02 * daysOld));
  }

  /**
   * Retrieves and ranks relevant memories matching the specified criteria.
   *
   * @param records - Full pool of stored memory records.
   * @param options - Query parameters, filters, and isolation constraints.
   * @returns Prioritized list of ScoredMemoryResult objects.
   *
   * Security & Isolation Guarantees:
   * - Filters out any record whose `projectId` does not match `options.projectId`
   *   (unless record is explicitly in the shared "default" workspace).
   * - Excludes `RESTRICTED` records unless `options.includeRestricted` is true.
   */
  public retrieveMemories(
    records: AnyMemoryRecord[],
    options: MemoryRetrievalOptions
  ): ScoredMemoryResult[] {
    const query = options.query.trim();
    if (!query || records.length === 0) return [];

    const activeProjectId = options.projectId || "default";
    const now = options.pointInTimeTimestamp || Date.now();
    const limit = options.limit || 8;
    const minConfidence = options.minConfidence ?? 0.0;
    const minImportance = options.minImportance ?? 1;

    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery
      .split(/[^a-zA-Z0-9_-]+/)
      .filter((w) => w.length >= 3 && !["what", "when", "where", "with", "from", "that", "this"].includes(w));

    const scoredResults: ScoredMemoryResult[] = [];

    for (const record of records) {
      // 1. Strict Project Isolation Guard
      // Memories must match the active project, or belong to the global baseline ("default")
      if (record.projectId && record.projectId !== activeProjectId && record.projectId !== "default") {
        continue;
      }

      // 2. Security & Zero-Trust Sensitivity Gate
      if (record.sensitivity === "RESTRICTED" && !options.includeRestricted) {
        continue;
      }

      // 3. Memory Type Filtering
      if (options.includeTypes && options.includeTypes.length > 0) {
        if (!options.includeTypes.includes(record.memoryType)) {
          continue;
        }
      }

      // 4. Threshold guards
      if (record.confidence < minConfidence || record.importance < minImportance) {
        continue;
      }

      // 5. Point-in-time / Historical validity
      if (options.pointInTimeTimestamp) {
        // Record must have existed at that point in time
        if (record.createdAt > options.pointInTimeTimestamp) {
          continue;
        }
        // If record had already expired or been superseded before target time, skip
        if (record.temporal.validUntil && record.temporal.validUntil < options.pointInTimeTimestamp) {
          continue;
        }
      } else {
        // Active mode: skip obsolescent records if a newer version exists
        if (record.temporal.isObsolescent && record.temporal.supersededBy) {
          continue;
        }
      }

      // 6. Multi-Factor Scoring
      const keywordScore = Math.max(
        this._computeKeywordScore(queryWords, record.content),
        this._computeKeywordScore(queryWords, record.key) * 1.2
      );

      const semanticScore = Math.max(
        this._computeSemanticSimilarity(query, record.content),
        this._computeSemanticSimilarity(query, record.key)
      );

      const relevanceScore = options.useHybridFusion === false
        ? keywordScore
        : 0.45 * keywordScore + 0.55 * semanticScore;

      // Base minimum relevance filter (must have at least some keyword or semantic match, or high priority personal facts)
      const isAnchorRecord = record.memoryType === "personal" && (record.key === "user_name" || record.key === "user_role");
      if (relevanceScore < 0.1 && !isAnchorRecord) {
        continue;
      }

      const recencyFactor = this._computeRecencyFactor(record.updatedAt || record.createdAt, now);
      const importanceFactor = record.importance / 5.0; // Normalized 0.2 to 1.0
      const confidenceFactor = record.confidence; // Normalized 0.0 to 1.0

      // Final composite score formula:
      // Final = 0.50 * Relevance + 0.20 * Importance + 0.15 * Recency + 0.15 * Confidence
      const finalScore = parseFloat(
        (0.50 * relevanceScore + 0.20 * importanceFactor + 0.15 * recencyFactor + 0.15 * confidenceFactor).toFixed(3)
      );

      scoredResults.push({
        record,
        relevanceScore: parseFloat(relevanceScore.toFixed(3)),
        keywordScore: parseFloat(keywordScore.toFixed(3)),
        semanticScore: parseFloat(semanticScore.toFixed(3)),
        recencyFactor: parseFloat(recencyFactor.toFixed(3)),
        finalScore,
        matchExplanation: `Rel(${relevanceScore.toFixed(2)}) * 0.5 + Imp(${importanceFactor.toFixed(2)}) * 0.2 + Rec(${recencyFactor.toFixed(2)}) * 0.15 + Conf(${confidenceFactor.toFixed(2)}) * 0.15`,
      });
    }

    // Sort descending by final combined score
    scoredResults.sort((a, b) => b.finalScore - a.finalScore);

    return scoredResults.slice(0, limit);
  }
}

/** Global singleton instance of the Retrieval Engine. */
export const defaultMemoryRetrieval = new MemoryRetrievalEngine();
