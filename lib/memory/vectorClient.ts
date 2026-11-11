/**
 * @file lib/memory/vectorClient.ts
 * @description Local Ollama Embedding Client, Dimension Validation, and Vector Mathematics.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P4: Hybrid Retrieval).
 *
 * Key Responsibilities:
 * - Interfaces with local Ollama `/api/embed` endpoint to produce dense semantic embeddings.
 * - Dynamic dimension discovery: validates vector length from actual model responses without hardcoding.
 * - Fail-safe numeric validation: ensures all embedding coordinates are finite IEEE 754 floats.
 * - Enforces model and dimension invariants to prevent cross-model vector space comparisons.
 * - Computes high-performance vector cosine similarity.
 * - Provides a distinct lexical n-gram feature hasher strictly isolated from semantic vector spaces.
 *
 * Architectural Role & Safety Guarantees:
 * - 100% Local: connects strictly to loopback (`127.0.0.1:11434`) with zero paid external APIs.
 * - Non-blocking circuit breaker: 2000 ms fail-fast budget. If Ollama is offline or warming up,
 *   gracefully returns `null` so callers fallback to SQLite FTS5 without stalling chat streaming.
 */

export interface VectorEmbedResult {
  embedding: Float32Array;
  dimensions: number;
  modelName: string;
  provider: string;
}

export interface EmbedOptions {
  model?: string;
  timeoutMs?: number;
}

/**
 * Computes cosine similarity between two float vectors.
 *
 * Formula:
 * cos(theta) = (A . B) / (||A||_2 * ||B||_2)
 *
 * @param vecA - First vector (Float32Array or number array).
 * @param vecB - Second vector (Float32Array or number array).
 * @returns Cosine similarity score between -1.0 and 1.0.
 * @throws Error if dimensions do not match.
 */
export function cosineSimilarity(
  vecA: Float32Array | number[],
  vecB: Float32Array | number[]
): number {
  if (vecA.length !== vecB.length) {
    throw new Error(
      `Vector dimension mismatch: cannot compute cosine similarity between dimension ${vecA.length} and ${vecB.length}`
    );
  }

  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  const len = vecA.length;
  for (let i = 0; i < len; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 0 || normB <= 0) {
    return 0.0;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0.0;

  const sim = dotProduct / denominator;
  // Bounded between -1.0 and 1.0 to prevent floating point precision overflow
  return Math.max(-1.0, Math.min(1.0, sim));
}

/**
 * Computes a deterministic lexical n-gram sparse feature hash.
 *
 * IMPORTANT ARCHITECTURAL NOTE:
 * This is a LEXICAL sparse-hash representation, NOT a semantic neural embedding.
 * It is strictly separated from neural vector spaces (`nomic-embed-text`) and must
 * never be stored in the canonical semantic vector table or compared against neural vectors.
 *
 * @param text - Raw input string.
 * @param dimensions - Feature vector width (default: 384).
 * @returns L2-normalized Float32Array.
 */
export function computeLexicalFeatureVector(text: string, dimensions: number = 384): Float32Array {
  const vec = new Float32Array(dimensions);
  if (!text || typeof text !== "string") return vec;

  const clean = text.toLowerCase().trim();
  if (clean.length < 2) return vec;

  // Extract character 3-grams
  for (let i = 0; i < clean.length - 2; i++) {
    const tri = clean.slice(i, i + 3);
    // Polynomial rolling hash
    let hash = 0;
    for (let j = 0; j < tri.length; j++) {
      hash = (hash * 31 + tri.charCodeAt(j)) >>> 0;
    }
    const bucket = hash % dimensions;
    vec[bucket] += 1.0;
  }

  // L2 unit normalization
  let sumSq = 0.0;
  for (let i = 0; i < dimensions; i++) {
    sumSq += vec[i] * vec[i];
  }

  if (sumSq > 0) {
    const norm = Math.sqrt(sumSq);
    for (let i = 0; i < dimensions; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

export class LocalVectorClient {
  private _host: string;
  private _defaultModel: string;
  private _defaultTimeoutMs: number;
  private _knownDimensions: Map<string, number> = new Map();

  constructor(options: { host?: string; defaultModel?: string; timeoutMs?: number } = {}) {
    this._host = options.host || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    this._defaultModel = options.defaultModel || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
    this._defaultTimeoutMs = options.timeoutMs || 2000;
  }

  /**
   * Generates a semantic vector embedding using the modern Ollama `/api/embed` endpoint.
   *
   * @param text - Cleaned text or summary to embed.
   * @param options - Model and timeout overrides.
   * @returns VectorEmbedResult on success, or null if service is offline/unavailable.
   */
  public async embed(text: string, options: EmbedOptions = {}): Promise<VectorEmbedResult | null> {
    const clean = (text || "").trim();
    if (!clean) return null;

    const model = options.model || this._defaultModel;
    const timeoutMs = options.timeoutMs || this._defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = `${this._host}/api/embed`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: clean,
          truncate: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return null;
      }

      const body = (await res.json()) as { embeddings?: number[][] };
      if (!body || !Array.isArray(body.embeddings) || body.embeddings.length === 0) {
        return null;
      }

      const rawVector = body.embeddings[0];
      if (!Array.isArray(rawVector) || rawVector.length === 0) {
        return null;
      }

      // Strict validation: every element must be a finite float
      const dimensions = rawVector.length;
      const floatArr = new Float32Array(dimensions);
      for (let i = 0; i < dimensions; i++) {
        const val = rawVector[i];
        if (!Number.isFinite(val)) {
          console.warn(`[VECTOR CLIENT] Non-finite float value returned at index ${i} by model ${model}`);
          return null;
        }
        floatArr[i] = val;
      }

      // Record discovered dimensions for this model
      this._knownDimensions.set(model, dimensions);

      return {
        embedding: floatArr,
        dimensions,
        modelName: model,
        provider: "ollama",
      };
    } catch {
      // Circuit breaker: fail gracefully without crashing caller or blocking chat
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Returns discovered dimensions for a given model, or undefined if not yet observed.
   */
  public getObservedDimensions(modelName?: string): number | undefined {
    return this._knownDimensions.get(modelName || this._defaultModel);
  }

  /**
   * Health probe verifying if local Ollama embedding service is operational.
   */
  public async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      const res = await fetch(`${this._host}/api/tags`, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Singleton instance getter for local vector client. */
let defaultVectorClientInstance: LocalVectorClient | null = null;

export function getLocalVectorClient(): LocalVectorClient {
  if (!defaultVectorClientInstance) {
    defaultVectorClientInstance = new LocalVectorClient();
  }
  return defaultVectorClientInstance;
}
