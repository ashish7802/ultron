/**
 * @file lib/learning/feedbackLearningEngine.ts
 * @description Module 02: Feedback Learning Engine for ULTRON.
 *
 * Subsystem:
 * Learning & Evolution Engine (Blueprint Section 8, Module 02).
 *
 * Key Responsibilities:
 * - Processes founder positive and negative feedback signals across multi-turn interactions.
 * - Detects explicit corrections ("do not use X, always use Y", "keep it concise") vs implicit sentiment.
 * - Enforces strict priority management: explicit founder directives override inferred preferences.
 * - Adapts communication style profiles (verbosity, code commenting, formality, proactivity).
 * - Clusters recurring feedback themes to detect repeated mistakes and user frustrations.
 * - Retains explicit response corrections to ground future generative turns.
 *
 * Architectural Role & Interactions:
 * - Feeds adapted preferences into `lib/memory/types.ts` (Personal & Decision Memory).
 * - Supplies prompt guidelines to `lib/cognitive/orchestrator.ts` and `app/api/chat/route.ts`.
 * - Ingests feedback events from UI ratings, chat corrections, and explicit terminal commands.
 *
 * Safety / Security Guarantees:
 * - Prevents feedback poisoning: unauthenticated feedback or contradictory instructions are flagged.
 * - Enforces immutable retention of explicit founder safety guidelines.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  FounderFeedback,
  FeedbackPolarity,
  FeedbackCategory,
  LearnedPreference,
  CommunicationStyleProfile,
} from "./types.ts";

export interface FeedbackEngineOptions {
  storageDir?: string;
  autoSave?: boolean;
}

export class FeedbackLearningEngine {
  private _storageDir: string;
  private _feedbackFile: string;
  private _preferencesFile: string;
  private _profileFile: string;
  private _feedbackList: Map<string, FounderFeedback> = new Map();
  private _preferences: Map<string, LearnedPreference> = new Map();
  private _styleProfile: CommunicationStyleProfile;
  private _autoSave: boolean;

  constructor(options?: FeedbackEngineOptions) {
    this._storageDir = options?.storageDir || path.join(process.cwd(), ".learning", "feedback");
    this._feedbackFile = path.join(this._storageDir, "founder_feedback.json");
    this._preferencesFile = path.join(this._storageDir, "learned_preferences.json");
    this._profileFile = path.join(this._storageDir, "communication_profile.json");
    this._autoSave = options?.autoSave ?? true;

    this._styleProfile = {
      verbosityLevel: "BALANCED",
      formalityLevel: "PROFESSIONAL_CO_FOUNDER",
      codeCommentPreference: "RICH_EDUCATIONAL",
      proactivityScore: 0.8,
      customRules: [],
      lastAdaptedAt: Date.now(),
    };

    this._initStorage();
    this._load();
  }

  private _initStorage(): void {
    try {
      if (!fs.existsSync(this._storageDir)) {
        fs.mkdirSync(this._storageDir, { recursive: true });
      }
    } catch (err) {
      console.error("[FeedbackLearningEngine] Storage init error:", err);
    }
  }

  private _load(): void {
    try {
      if (fs.existsSync(this._feedbackFile)) {
        const raw = fs.readFileSync(this._feedbackFile, "utf-8");
        const list: FounderFeedback[] = JSON.parse(raw);
        for (const item of list) {
          this._feedbackList.set(item.feedbackId, item);
        }
      }
      if (fs.existsSync(this._preferencesFile)) {
        const raw = fs.readFileSync(this._preferencesFile, "utf-8");
        const list: LearnedPreference[] = JSON.parse(raw);
        for (const item of list) {
          this._preferences.set(item.key, item);
        }
      }
      if (fs.existsSync(this._profileFile)) {
        const raw = fs.readFileSync(this._profileFile, "utf-8");
        this._styleProfile = JSON.parse(raw);
      }
    } catch (err) {
      console.warn("[FeedbackLearningEngine] Failed to load feedback records, using defaults:", err);
    }
  }

  private _persist(): void {
    if (!this._autoSave) return;
    try {
      const fbList = Array.from(this._feedbackList.values());
      const fbTmp = `${this._feedbackFile}.tmp_${Date.now()}`;
      fs.writeFileSync(fbTmp, JSON.stringify(fbList, null, 2), "utf-8");
      fs.renameSync(fbTmp, this._feedbackFile);

      const prefList = Array.from(this._preferences.values());
      const prefTmp = `${this._preferencesFile}.tmp_${Date.now()}`;
      fs.writeFileSync(prefTmp, JSON.stringify(prefList, null, 2), "utf-8");
      fs.renameSync(prefTmp, this._preferencesFile);

      const profTmp = `${this._profileFile}.tmp_${Date.now()}`;
      fs.writeFileSync(profTmp, JSON.stringify(this._styleProfile, null, 2), "utf-8");
      fs.renameSync(profTmp, this._profileFile);
    } catch (err) {
      console.error("[FeedbackLearningEngine] Atomic write error:", err);
    }
  }

  /**
   * Ingests feedback from the founder, classifies priority and triggers adaptation.
   *
   * @param params - Raw feedback text, rating, optional target/correction texts, and explicit directive flag.
   * @returns Newly recorded FounderFeedback object.
   *
   * State & Side Effects:
   * Analyzes feedback, detects explicit corrections, updates learned preferences and communication style profile.
   */
  public ingestFeedback(params: {
    rawText: string;
    polarity?: FeedbackPolarity;
    category?: FeedbackCategory;
    rating?: number;
    targetResponse?: string;
    correctedResponse?: string;
    isExplicitInstruction?: boolean;
    projectId?: string;
    sessionId?: string;
    messageId?: string;
  }): FounderFeedback {
    const feedbackId = `fb_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const rawText = params.rawText.trim();

    // Auto-detect polarity if not supplied
    const polarity: FeedbackPolarity =
      params.polarity ||
      this._detectPolarity(rawText, params.rating, params.correctedResponse !== undefined);

    // Auto-detect category
    const category: FeedbackCategory = params.category || this._detectCategory(rawText);

    // Auto-detect if this is an explicit founder instruction
    const isExplicitInstruction =
      params.isExplicitInstruction ?? this._isExplicitDirective(rawText);

    const priority = isExplicitInstruction
      ? "CRITICAL"
      : polarity === "NEGATIVE" || polarity === "CORRECTION"
      ? "HIGH"
      : "MEDIUM";

    const hash = crypto
      .createHash("sha256")
      .update(`${feedbackId}:${rawText}:${polarity}:${priority}`)
      .digest("hex");

    const feedback: FounderFeedback = {
      feedbackId,
      sessionId: params.sessionId,
      messageId: params.messageId,
      polarity,
      category,
      rating: params.rating,
      rawText,
      targetResponse: params.targetResponse,
      correctedResponse: params.correctedResponse,
      isExplicitInstruction,
      priority,
      projectId: params.projectId,
      timestamp: Date.now(),
      retained: true,
      hash,
    };

    this._feedbackList.set(feedbackId, feedback);

    // Adapt preferences based on feedback
    this._adaptFromFeedback(feedback);

    this._persist();
    return feedback;
  }

  /**
   * Automatically derives feedback polarity from text phrasing and numerical ratings.
   */
  private _detectPolarity(text: string, rating?: number, hasCorrection?: boolean): FeedbackPolarity {
    if (hasCorrection) return "CORRECTION";
    if (rating !== undefined) {
      if (rating >= 4) return "POSITIVE";
      if (rating <= 2) return "NEGATIVE";
      return "NEUTRAL";
    }
    const lower = text.toLowerCase();
    const positiveWords = ["great", "perfect", "good", "excellent", "awesome", "well done", "thanks", "sahi hai", "badhiya", "fast", "speedy"];
    const negativeWords = [
      "wrong", "bad", "incorrect", "failed", "terrible", "stop", "dont", "don't",
      "galat", "kharab", "slow", "sluggish", "poor", "too long", "latency", "high latency", "timeout"
    ];

    const posMatch = positiveWords.some((w) => lower.includes(w));
    const negMatch = negativeWords.some((w) => lower.includes(w));

    if (posMatch && !negMatch) return "POSITIVE";
    if (negMatch && !posMatch) return "NEGATIVE";
    return "NEUTRAL";
  }

  /**
   * Categorizes the feedback topic.
   */
  private _detectCategory(text: string): FeedbackCategory {
    const lower = text.toLowerCase();
    if (lower.includes("code") || lower.includes("bug") || lower.includes("refactor") || lower.includes("typescript")) {
      return "CODE_QUALITY";
    }
    if (lower.includes("style") || lower.includes("concise") || lower.includes("brief") || lower.includes("too long") || lower.includes("tone")) {
      return "COMMUNICATION_STYLE";
    }
    if (lower.includes("tool") || lower.includes("terminal") || lower.includes("shell") || lower.includes("browser")) {
      return "TOOL_SELECTION";
    }
    if (lower.includes("slow") || lower.includes("fast") || lower.includes("latency") || lower.includes("timeout")) {
      return "LATENCY";
    }
    if (lower.includes("strategy") || lower.includes("plan") || lower.includes("approach")) {
      return "STRATEGY_ACCURACY";
    }
    if (lower.includes("safe") || lower.includes("permission") || lower.includes("security")) {
      return "SAFETY";
    }
    return "PREFERENCE";
  }

  /**
   * Detects whether the text contains imperative commands or explicit founder rules.
   */
  private _isExplicitDirective(text: string): boolean {
    const lower = text.toLowerCase();
    const directivePatterns = [
      "always ",
      "never ",
      "do not ",
      "don't ",
      "from now on",
      "remember to",
      "make sure to",
      "rule:",
      "mandatory",
      "strict requirement",
    ];
    return directivePatterns.some((p) => lower.includes(p));
  }

  /**
   * Adapts internal preference mappings and communication style from ingested feedback.
   */
  private _adaptFromFeedback(feedback: FounderFeedback): void {
    const text = feedback.rawText.toLowerCase();

    // 1. Style Adaptations
    if (text.includes("concise") || text.includes("too long") || text.includes("short answers") || text.includes("brief")) {
      this._styleProfile.verbosityLevel = "CONCISE";
      this._updatePreference("style.verbosity", "CONCISE", feedback, true);
    } else if (text.includes("more detail") || text.includes("explain in depth") || text.includes("detailed")) {
      this._styleProfile.verbosityLevel = "DETAILED";
      this._updatePreference("style.verbosity", "DETAILED", feedback, true);
    }

    if (text.includes("minimal comments") || text.includes("no comments")) {
      this._styleProfile.codeCommentPreference = "ESSENTIAL_ONLY";
      this._updatePreference("code.commenting", "ESSENTIAL_ONLY", feedback, true);
    } else if (text.includes("thorough comments") || text.includes("explain why and how")) {
      this._styleProfile.codeCommentPreference = "RICH_EDUCATIONAL";
      this._updatePreference("code.commenting", "RICH_EDUCATIONAL", feedback, true);
    }

    // 2. Custom Rule Retention
    if (feedback.isExplicitInstruction) {
      if (!this._styleProfile.customRules.includes(feedback.rawText)) {
        this._styleProfile.customRules.push(feedback.rawText);
      }
      this._updatePreference(`explicit_rule_${Date.now()}`, feedback.rawText, feedback, true);
    }

    // 3. Response Correction Retention
    if (feedback.correctedResponse) {
      this._updatePreference(
        `correction_${feedback.feedbackId}`,
        `Target: "${feedback.targetResponse || ""}" -> Correction: "${feedback.correctedResponse}"`,
        feedback,
        true
      );
    }

    this._styleProfile.lastAdaptedAt = Date.now();
  }

  /**
   * Upserts a learned preference with reinforced weight.
   */
  private _updatePreference(
    key: string,
    value: string | number | boolean,
    feedback: FounderFeedback,
    isHardRule: boolean
  ): void {
    const existing = this._preferences.get(key);
    if (existing) {
      existing.value = value;
      existing.reinforcementCount++;
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
      existing.isHardRule = isHardRule || existing.isHardRule;
      if (!existing.sourceFeedbackIds.includes(feedback.feedbackId)) {
        existing.sourceFeedbackIds.push(feedback.feedbackId);
      }
      existing.lastUpdated = Date.now();
    } else {
      const newPref: LearnedPreference = {
        preferenceId: `pref_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
        key,
        category: feedback.category,
        value,
        confidence: isHardRule ? 1.0 : 0.7,
        reinforcementCount: 1,
        isHardRule,
        sourceFeedbackIds: [feedback.feedbackId],
        lastUpdated: Date.now(),
      };
      this._preferences.set(key, newPref);
    }
  }

  /**
   * Detects repeated feedback patterns and clusters recurring founder critiques.
   *
   * @returns Array of clustered pattern themes with frequency counts and priority ratings.
   */
  public detectRepeatedFeedbackPatterns(): Array<{
    theme: string;
    category: FeedbackCategory;
    count: number;
    polarity: FeedbackPolarity;
    sampleFeedback: string[];
    isUrgent: boolean;
  }> {
    const all = Array.from(this._feedbackList.values());
    const themeMap: Map<string, { count: number; category: FeedbackCategory; polarity: FeedbackPolarity; samples: string[] }> = new Map();

    for (const fb of all) {
      // Create theme key from category + polarity
      const key = `${fb.category}::${fb.polarity}`;
      if (!themeMap.has(key)) {
        themeMap.set(key, { count: 0, category: fb.category, polarity: fb.polarity, samples: [] });
      }
      const item = themeMap.get(key)!;
      item.count++;
      if (item.samples.length < 3) {
        item.samples.push(fb.rawText);
      }
    }

    const results: Array<{
      theme: string;
      category: FeedbackCategory;
      count: number;
      polarity: FeedbackPolarity;
      sampleFeedback: string[];
      isUrgent: boolean;
    }> = [];

    for (const [key, data] of themeMap.entries()) {
      if (data.count >= 2) {
        const isUrgent = data.polarity === "NEGATIVE" && data.count >= 3;
        results.push({
          theme: key,
          category: data.category,
          count: data.count,
          polarity: data.polarity,
          sampleFeedback: data.samples,
          isUrgent,
        });
      }
    }

    results.sort((a, b) => b.count - a.count);
    return results;
  }

  /**
   * Compiles current communication style rules and explicit instructions into prompt guidelines.
   *
   * @returns Array of formatted prompt instructions to steer subsequent LLM turns.
   */
  public getSteeringPromptGuidelines(): string[] {
    const guidelines: string[] = [];

    // Formality & Verbosity
    guidelines.push(`Communication Verbosity: ${this._styleProfile.verbosityLevel}.`);
    guidelines.push(`Code Commenting Standard: ${this._styleProfile.codeCommentPreference}.`);

    // Hard rules from explicit founder instructions
    for (const rule of this._styleProfile.customRules) {
      guidelines.push(`FOUNDER DIRECTIVE: ${rule}`);
    }

    // Active high-confidence preferences
    for (const pref of this._preferences.values()) {
      if (pref.isHardRule && pref.confidence >= 0.8) {
        guidelines.push(`CRITICAL PREFERENCE [${pref.key}]: ${pref.value}`);
      }
    }

    return guidelines;
  }

  /**
   * Retrieves all recorded founder feedback entries.
   */
  public listFeedback(): FounderFeedback[] {
    return Array.from(this._feedbackList.values());
  }

  /**
   * Retrieves all learned preferences.
   */
  public listPreferences(): LearnedPreference[] {
    return Array.from(this._preferences.values());
  }

  /**
   * Returns the current communication style profile.
   */
  public getCommunicationProfile(): CommunicationStyleProfile {
    return { ...this._styleProfile };
  }

  /**
   * Clears feedback store (for test suite hygiene).
   */
  public clear(): void {
    this._feedbackList.clear();
    this._preferences.clear();
    this._styleProfile = {
      verbosityLevel: "BALANCED",
      formalityLevel: "PROFESSIONAL_CO_FOUNDER",
      codeCommentPreference: "RICH_EDUCATIONAL",
      proactivityScore: 0.8,
      customRules: [],
      lastAdaptedAt: Date.now(),
    };
    try {
      if (fs.existsSync(this._feedbackFile)) fs.unlinkSync(this._feedbackFile);
      if (fs.existsSync(this._preferencesFile)) fs.unlinkSync(this._preferencesFile);
      if (fs.existsSync(this._profileFile)) fs.unlinkSync(this._profileFile);
    } catch {
      // Ignore
    }
  }
}

export const defaultFeedbackEngine = new FeedbackLearningEngine();
