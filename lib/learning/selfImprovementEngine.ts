/**
 * @file lib/learning/selfImprovementEngine.ts
 * @description Module 09: Self-Improvement Engine for ULTRON.
 *
 * Subsystem:
 * Learning & Evolution Engine (Blueprint Section 8, Module 09).
 *
 * Key Responsibilities:
 * - Proactively detects system capability gaps, recurring weaknesses, and execution bottlenecks.
 * - Enforces the Non-Negotiable Boundary: STRICT DISTINCTION BETWEEN SUGGESTED AND IMPLEMENTED IMPROVEMENTS.
 * - Formulates structured `ImprovementProposal` records with empirical motivation, expected delta, and risk levels.
 * - Performs performance bottleneck analysis across historical step latencies (identifies slowest 20% of operations).
 * - Generates high-confidence proposals across 6 distinct categories:
 *   1. NEW_SKILL: Turn frequent ad-hoc workflows into automated reusable skills.
 *   2. STRATEGY_TUNING: Adjust task dispatch topologies to reduce latency.
 *   3. KNOWLEDGE_UPDATE: Refresh outdated or missing domain documentation.
 *   4. REGRESSION_GUARD: Install pre-checks against recurring failure signatures.
 *   5. PROMPT_REFINEMENT: Update system steering prompts based on feedback patterns.
 *   6. PERFORMANCE_CACHE: Introduce in-memory or indexed cache for repeated read operations.
 * - Tracks approval state and measures empirical before/after improvement impact.
 *
 * Architectural Role & Interactions:
 * - Submits proposals to `lib/learning/evolutionManagementEngine.ts` for founder authorization.
 * - Interrogates `lib/learning/mistakeLearningEngine.ts`, `lib/learning/strategyOptimizationEngine.ts`,
 *   and `lib/learning/performanceEvaluationEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - NEVER autonomously alters production codebase, permissions, or system policies without explicit approval.
 * - All proposals default to `PENDING_APPROVAL` with explicit risk assessments and reversibility ratings.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  CapabilityGap,
  ImprovementProposal,
  ImprovementType,
  FailureRecord,
  StrategyMetricRecord,
  SystemPerformanceReport,
} from "./types.ts";

export interface SelfImprovementOptions {
  storageDir?: string;
  autoSave?: boolean;
}

export class SelfImprovementEngine {
  private _storageDir: string;
  private _proposalsFile: string;
  private _gapsFile: string;
  private _proposals: Map<string, ImprovementProposal> = new Map();
  private _gaps: Map<string, CapabilityGap> = new Map();
  private _autoSave: boolean;

  constructor(options?: SelfImprovementOptions) {
    this._storageDir = options?.storageDir || path.join(process.cwd(), ".learning", "proposals");
    this._proposalsFile = path.join(this._storageDir, "improvement_proposals.json");
    this._gapsFile = path.join(this._storageDir, "capability_gaps.json");
    this._autoSave = options?.autoSave ?? true;

    this._initStorage();
    this._load();
  }

  private _initStorage(): void {
    try {
      if (!fs.existsSync(this._storageDir)) {
        fs.mkdirSync(this._storageDir, { recursive: true });
      }
    } catch (err) {
      console.error("[SelfImprovementEngine] Storage init error:", err);
    }
  }

  private _load(): void {
    try {
      if (fs.existsSync(this._proposalsFile)) {
        const raw = fs.readFileSync(this._proposalsFile, "utf-8");
        const list: ImprovementProposal[] = JSON.parse(raw);
        for (const item of list) {
          this._proposals.set(item.proposalId, item);
        }
      }
      if (fs.existsSync(this._gapsFile)) {
        const raw = fs.readFileSync(this._gapsFile, "utf-8");
        const list: CapabilityGap[] = JSON.parse(raw);
        for (const item of list) {
          this._gaps.set(item.gapId, item);
        }
      }
    } catch (err) {
      console.warn("[SelfImprovementEngine] Could not load proposals, initializing fresh state:", err);
    }
  }

  private _persist(): void {
    if (!this._autoSave) return;
    try {
      const pList = Array.from(this._proposals.values());
      const pTmp = `${this._proposalsFile}.tmp_${Date.now()}`;
      fs.writeFileSync(pTmp, JSON.stringify(pList, null, 2), "utf-8");
      fs.renameSync(pTmp, this._proposalsFile);

      const gList = Array.from(this._gaps.values());
      const gTmp = `${this._gapsFile}.tmp_${Date.now()}`;
      fs.writeFileSync(gTmp, JSON.stringify(gList, null, 2), "utf-8");
      fs.renameSync(gTmp, this._gapsFile);
    } catch (err) {
      console.error("[SelfImprovementEngine] Atomic write error:", err);
    }
  }

  /**
   * Analyzes historical failures to identify capability gaps.
   *
   * @param failures - Historical failure records.
   * @returns Detected capability gaps.
   */
  public detectCapabilityGaps(failures: FailureRecord[]): CapabilityGap[] {
    const gapsFound: CapabilityGap[] = [];
    const taxonomyCounts: Map<string, { count: number; ids: string[]; samples: string[] }> = new Map();

    for (const f of failures) {
      if (!taxonomyCounts.has(f.taxonomy)) {
        taxonomyCounts.set(f.taxonomy, { count: 0, ids: [], samples: [] });
      }
      const item = taxonomyCounts.get(f.taxonomy)!;
      item.count += f.recurrenceCount;
      item.ids.push(f.failureId);
      if (item.samples.length < 2) {
        item.samples.push(f.rawErrorMessage);
      }
    }

    for (const [taxonomy, data] of taxonomyCounts.entries()) {
      if (data.count >= 2) {
        const gapId = `gap_${taxonomy.toLowerCase()}_${Date.now()}`;
        const severity = data.count >= 5 ? "CRITICAL" : data.count >= 3 ? "HIGH" : "MEDIUM";
        const suggestedRemedy = `Install specialized pre-flight validation and regression guards for ${taxonomy}.`;

        const gap: CapabilityGap = {
          gapId,
          title: `Recurring Vulnerability: High Frequency of [${taxonomy}]`,
          domain: taxonomy,
          description: `Observed ${data.count} occurrences across historical executions. Sample: "${data.samples[0] || ""}"`,
          evidenceFailureIds: data.ids,
          frequencyCount: data.count,
          severity,
          suggestedRemedy,
          detectedAt: Date.now(),
        };

        this._gaps.set(gapId, gap);
        gapsFound.push(gap);
      }
    }

    this._persist();
    return gapsFound;
  }

  /**
   * Analyzes strategy metrics to locate latency and token bottlenecks.
   *
   * @param metrics - Strategy performance metric records.
   * @returns Array of identified bottlenecks with recommended optimizations.
   */
  public analyzeBottlenecks(metrics: StrategyMetricRecord[]): Array<{
    strategyName: string;
    category: string;
    averageDurationMs: number;
    averageTokens: number;
    bottleneckType: "LATENCY" | "TOKEN_EXHAUSTION" | "LOW_WIN_RATE";
    recommendation: string;
  }> {
    const bottlenecks: Array<{
      strategyName: string;
      category: string;
      averageDurationMs: number;
      averageTokens: number;
      bottleneckType: "LATENCY" | "TOKEN_EXHAUSTION" | "LOW_WIN_RATE";
      recommendation: string;
    }> = [];

    for (const m of metrics) {
      if (m.sampleCount >= 2) {
        if (m.successRate < 0.6) {
          bottlenecks.push({
            strategyName: m.strategyName,
            category: m.taskCategory,
            averageDurationMs: m.averageDurationMs,
            averageTokens: m.averageTokens,
            bottleneckType: "LOW_WIN_RATE",
            recommendation: `Strategy has a low success rate of ${(m.successRate * 100).toFixed(0)}%. Propose alternative multi-step workflow.`,
          });
        } else if (m.averageDurationMs > 25000) {
          bottlenecks.push({
            strategyName: m.strategyName,
            category: m.taskCategory,
            averageDurationMs: m.averageDurationMs,
            averageTokens: m.averageTokens,
            bottleneckType: "LATENCY",
            recommendation: `Average execution exceeds 25 seconds. Parallelize non-dependent steps or cache intermediate outputs.`,
          });
        }
      }
    }

    return bottlenecks;
  }

  /**
   * Formulates a structured Improvement Proposal awaiting founder decision.
   *
   * @param params - Proposal parameters.
   * @returns Newly created ImprovementProposal.
   *
   * State & Side Effects:
   * Sets status to `PENDING_APPROVAL`, marks `isImplemented: false`, persists to disk.
   */
  public proposeImprovement(params: {
    title: string;
    type: ImprovementType;
    description: string;
    motivation: string;
    supportingEvidenceIds?: string[];
    expectedImpactMetric: string;
    expectedImprovementDelta: number;
    riskLevel?: "LOW" | "MEDIUM" | "HIGH";
    potentialSideEffects?: string[];
    reversibility?: "INSTANT" | "MODERATE" | "MANUAL";
    implementationPayload?: Record<string, unknown>;
  }): ImprovementProposal {
    const proposalId = `prop_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

    const proposal: ImprovementProposal = {
      proposalId,
      title: params.title,
      type: params.type,
      description: params.description,
      motivation: params.motivation,
      supportingEvidenceIds: params.supportingEvidenceIds || [],
      expectedImpactMetric: params.expectedImpactMetric,
      expectedImprovementDelta: params.expectedImprovementDelta,
      riskAssessment: {
        riskLevel: params.riskLevel || "LOW",
        potentialSideEffects: params.potentialSideEffects || ["Minor cache invalidation overhead"],
        reversibility: params.reversibility || "INSTANT",
      },
      implementationPayload: params.implementationPayload || {},
      status: "PENDING_APPROVAL",
      proposedAt: Date.now(),
      isImplemented: false,
    };

    this._proposals.set(proposalId, proposal);
    this._persist();
    return proposal;
  }

  /**
   * Evaluates the empirical impact of an implemented improvement by comparing before/after benchmark reports.
   *
   * @param proposalId - Proposal ID.
   * @param beforeReport - Performance report prior to applying change.
   * @param afterReport - Performance report following change application.
   * @returns Evaluated impact assessment with net improvement delta.
   */
  public evaluateImprovementImpact(
    proposalId: string,
    beforeReport: SystemPerformanceReport,
    afterReport: SystemPerformanceReport
  ): {
    proposalId: string;
    scoreDelta: number;
    latencyDeltaMs: number;
    successRateDelta: number;
    isNetPositive: boolean;
    recommendation: "KEEP_ACTIVE" | "ROLLBACK";
  } {
    const prop = this._proposals.get(proposalId);
    if (!prop) throw new Error(`Proposal "${proposalId}" not found.`);

    const scoreDelta = Number((afterReport.overallScore - beforeReport.overallScore).toFixed(1));
    const latencyDeltaMs = afterReport.meanLatencyMs - beforeReport.meanLatencyMs;
    const successRateDelta = Number((afterReport.taskSuccessRate - beforeReport.taskSuccessRate).toFixed(3));

    // A net positive requires no decrease in score and no significant spike in latency
    const isNetPositive = scoreDelta >= 0 && successRateDelta >= -0.01 && latencyDeltaMs <= 500;
    const recommendation = isNetPositive ? "KEEP_ACTIVE" : "ROLLBACK";

    return {
      proposalId,
      scoreDelta,
      latencyDeltaMs,
      successRateDelta,
      isNetPositive,
      recommendation,
    };
  }

  /**
   * Lists all improvement proposals.
   */
  public listProposals(): ImprovementProposal[] {
    return Array.from(this._proposals.values());
  }

  /**
   * Lists detected capability gaps.
   */
  public listGaps(): CapabilityGap[] {
    return Array.from(this._gaps.values());
  }

  /**
   * Retrieves a specific proposal by ID.
   */
  public getProposal(proposalId: string): ImprovementProposal | undefined {
    return this._proposals.get(proposalId);
  }

  /**
   * Updates proposal decision state (e.g. APPROVED, REJECTED, APPLIED).
   */
  public updateProposalStatus(
    proposalId: string,
    status: ImprovementProposal["status"],
    notes?: string
  ): ImprovementProposal {
    const prop = this._proposals.get(proposalId);
    if (!prop) throw new Error(`Proposal "${proposalId}" not found.`);

    prop.status = status;
    prop.decidedAt = Date.now();
    if (notes) prop.decisionNotes = notes;
    if (status === "APPLIED") prop.isImplemented = true;
    if (status === "ROLLED_BACK") prop.isImplemented = false;

    this._persist();
    return prop;
  }

  /**
   * Clears state for isolated testing.
   */
  public clear(): void {
    this._proposals.clear();
    this._gaps.clear();
    try {
      if (fs.existsSync(this._proposalsFile)) fs.unlinkSync(this._proposalsFile);
      if (fs.existsSync(this._gapsFile)) fs.unlinkSync(this._gapsFile);
    } catch {
      // Ignore
    }
  }
}

export const defaultSelfImprovementEngine = new SelfImprovementEngine();
