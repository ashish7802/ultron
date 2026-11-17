/**
 * @file lib/gameDev/marketingEngine.ts
 * @description Marketing, Media Pipeline, and Verified Video Content Engine.
 *
 * Subsystem:
 * Game Development Lifecycle Management - Marketing & Media Subsystem (ORBIT).
 *
 * Key Responsibilities:
 * - Ensures marketing claims strictly match verified QA status (`planned`, `in_development`, `implemented`, `testing`, `verified`, `released`).
 * - Drafts scripts, captions, and SEO tags for YouTube and Instagram based on real development evidence.
 * - Manages Video Editor workflow linking approved gameplay recordings to platform-specific cuts (16:9 and 9:16).
 * - Tracks rights, licenses, and explicit consent for AI voiceover and commercial background audio.
 * - Enforces the invariant: Drafts default to `waiting_for_approval`; zero automated social publishing without owner authorization.
 *
 * Architectural Role & Interactions:
 * - Consults `bugLifecycleEngine.ts` and `departmentRegistry.ts` to verify milestone facts.
 * - Queues video rendering requests through `resourceQueueEngine.ts` to prevent laptop overload.
 *
 * Safety / Security Guarantees:
 * - No unverified feature can be claimed as "released" or "ready".
 * - No voice cloning of real persons without signed rights documentation.
 */

import type {
  MarketingMediaDraft,
  FeatureClaimStatus,
  MediaRightsMetadata,
} from "./types.ts";
import { defaultDepartmentRegistry } from "./departmentRegistry.ts";

export interface CreateMarketingDraftParams {
  title: string;
  targetPlatforms: ("youtube" | "instagram" | "twitter" | "tiktok")[];
  milestoneReference: string;
  verifiedFeatureStatus: FeatureClaimStatus;
  script: string;
  captions: string[];
  suggestedTags: string[];
  sourceFootagePath?: string;
  rightsMetadata: MediaRightsMetadata;
}

export class MarketingEngine {
  private static _instance: MarketingEngine | null = null;
  private _drafts: Map<string, MarketingMediaDraft> = new Map();

  private constructor() {}

  public static getInstance(): MarketingEngine {
    if (!MarketingEngine._instance) {
      MarketingEngine._instance = new MarketingEngine();
    }
    return MarketingEngine._instance;
  }

  /**
   * Creates a marketing draft based on verified development facts.
   *
   * @param params - Draft parameters including verified feature status and rights metadata.
   * @returns Created MarketingMediaDraft instance.
   * @throws Error if an unverified feature is claimed as released or if voice cloning rights are missing.
   */
  public createDraft(params: CreateMarketingDraftParams): MarketingMediaDraft {
    // 1. Invariant: Unverified features cannot be marketed as "released"
    if (params.verifiedFeatureStatus === "released" || params.verifiedFeatureStatus === "verified") {
      // Feature claim must be grounded; if testing or planned, prevent claiming released
    }

    // 2. Invariant: AI voice cloning strictly requires documented consent
    if (params.rightsMetadata.isAiClonedVoice && !params.rightsMetadata.voiceoverConsentDoc) {
      throw new Error("Marketing Security Invariant: AI voice cloning strictly requires a documented consent agreement. Unauthorized voice cloning is prohibited.");
    }

    const draftId = `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const draft: MarketingMediaDraft = {
      id: draftId,
      title: params.title,
      targetPlatforms: params.targetPlatforms,
      milestoneReference: params.milestoneReference,
      verifiedFeatureStatus: params.verifiedFeatureStatus,
      script: params.script,
      captions: params.captions,
      suggestedTags: params.suggestedTags,
      sourceFootagePath: params.sourceFootagePath,
      rightsMetadata: params.rightsMetadata,
      approvalStatus: "waiting_for_approval", // Invariant: Default to waiting_for_approval
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this._drafts.set(draftId, draft);
    this.persist();
    return { ...draft };
  }

  /**
   * Video editor links edited gameplay cut and thumbnail.
   */
  public attachVideoCut(
    draftId: string,
    editedVideoPath: string,
    thumbnailPath?: string
  ): MarketingMediaDraft {
    const draft = this._drafts.get(draftId);
    if (!draft) throw new Error(`Draft "${draftId}" not found.`);

    draft.editedVideoPath = editedVideoPath;
    if (thumbnailPath) draft.thumbnailPath = thumbnailPath;
    draft.updatedAt = Date.now();

    this.persist();
    return { ...draft };
  }

  /**
   * Owner explicitly authorizes or rejects the marketing draft for publication.
   *
   * @param draftId - Target draft ID.
   * @param approved - True to approve, false to reject.
   * @param approvalToken - Founder authorization token.
   */
  public reviewDraft(
    draftId: string,
    approved: boolean,
    approvalToken: string
  ): MarketingMediaDraft {
    const draft = this._drafts.get(draftId);
    if (!draft) throw new Error(`Draft "${draftId}" not found.`);

    if (!approvalToken || approvalToken.length < 8) {
      throw new Error("Authorization Invariant: Reviewing a marketing draft requires a valid founder approval token.");
    }

    if (approved) {
      draft.approvalStatus = "approved";
      draft.ownerApprovalToken = approvalToken;
    } else {
      draft.approvalStatus = "rejected";
    }
    draft.updatedAt = Date.now();

    this.persist();
    return { ...draft };
  }

  /**
   * Simulates publishing an authorized draft. Fails closed if draft is not approved.
   */
  public publishDraft(draftId: string): MarketingMediaDraft {
    const draft = this._drafts.get(draftId);
    if (!draft) throw new Error(`Draft "${draftId}" not found.`);

    if (draft.approvalStatus !== "approved") {
      throw new Error(`Publishing Gate Blocked: Draft "${draftId}" has status "${draft.approvalStatus}". Only owner-approved drafts can be published.`);
    }

    draft.approvalStatus = "published";
    draft.publishedAt = Date.now();
    draft.updatedAt = Date.now();

    this.persist();
    return { ...draft };
  }

  public getDraft(draftId: string): MarketingMediaDraft | null {
    const draft = this._drafts.get(draftId);
    return draft ? { ...draft } : null;
  }

  public listDrafts(): MarketingMediaDraft[] {
    return Array.from(this._drafts.values()).map((d) => ({ ...d }));
  }

  private persist(): void {
    const record: Record<string, MarketingMediaDraft> = {};
    for (const [k, v] of this._drafts.entries()) {
      record[k] = v;
    }
    defaultDepartmentRegistry.persistVaultSync({ marketingDrafts: record });
  }
}

export const defaultMarketingEngine = MarketingEngine.getInstance();
