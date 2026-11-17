/**
 * @file lib/gameDev/types.ts
 * @description Centralized Type Definitions & Domain Contracts for the Resource-Aware Game Development Team.
 *
 * Subsystem:
 * Game Development Lifecycle Management - Lean Team Architecture.
 *
 * Key Responsibilities:
 * - Defines contracts for Departments (4 persistent: Production Coordination, Game Dev, QA & Delivery, Marketing & Media).
 * - Defines contracts for Role Profiles (4 leaders + 6 specialists = 10 reusable profiles; 4 on-demand templates).
 * - Defines strict state lifecycle for Tasks, Execution Jobs, Bug Reports, and Marketing Media Drafts.
 * - Outlines Concurrency, Telemetry, and Laptop Resource Constraints.
 *
 * Architectural Role & Interactions:
 * - Shared contract library consumed by `departmentRegistry.ts`, `resourceQueueEngine.ts`, `bugLifecycleEngine.ts`,
 *   `marketingEngine.ts`, and the Next.js `/api/gamedev` endpoint.
 *
 * Safety / Security Guarantees:
 * - Roles strictly access assigned scope and cannot mutate protected ULTRON infrastructure or unapproved canon.
 * - Public marketing releases strictly require owner authorization; zero automatic posting.
 * - Bug resolution strictly requires independent QA evidence before closing.
 */

// ==============================================================================
// 1. DEPARTMENT & ROLE PROFILE CONTRACTS
// ==============================================================================

export type DepartmentSlug =
  | "production-coordination"
  | "game-development"
  | "quality-delivery"
  | "marketing-media"
  | "creative-direction"
  | "world-design"
  | "narrative-audio"
  | "security-ops";

export type RoleProfileStatus = "active" | "inactive" | "archived";

export interface RoleProfileHistoryEntry {
  timestamp: number;
  action: "created" | "activated" | "deactivated" | "archived" | "reactivated" | "updated";
  reason: string;
  actor: string;
}

export interface RoleProfile {
  id: string; // e.g. "NEXUS-01", "FORGE-PULSE-01", "AEGIS-QA-01", "ATLAS-A01"
  departmentSlug: DepartmentSlug;
  name: string;
  roleTitle: string;
  isLeader: boolean;
  isOnDemandTemplate: boolean;
  mission: string;
  instructions: string;
  skills: string[];
  requiredInputs: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
  allowedTools: string[];
  escalationRules: string[];
  sharedRuntimeRef: "ollama-local";
  status: RoleProfileStatus;
  version: number;
  history: RoleProfileHistoryEntry[];
}

export interface Department {
  slug: DepartmentSlug;
  name: string;
  description: string;
  leaderProfileId: string;
  isPersistent: boolean;
  allowedTaskTypes: string[];
  responsibilities: string[];
  dependencies: DepartmentSlug[];
  status: "operational" | "paused" | "standby";
  version: number;
  createdAt: number;
  updatedAt: number;
}

// ==============================================================================
// 2. VISION & CANON CONTRACTS
// ==============================================================================

export interface GameVision {
  id: string;
  title: string;
  pitch: string;
  targetPlatform: string;
  targetHardwareBaseline: string; // e.g. "Intel Core i5-8365U, 8GB RAM, Intel UHD 620"
  approvedCanon: string[];
  visualDirection: string;
  scopeBoundaries: string[];
  lastApprovedBy: string;
  approvedAt: number;
  version: number;
}

// ==============================================================================
// 3. TASK & RESOURCE EXECUTION CONTRACTS
// ==============================================================================

export type GameDevTaskStatus =
  | "draft"
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "archived";

export interface TaskArtifact {
  id: string;
  title: string;
  filePath: string;
  version: number;
  checksumSha256?: string;
  createdAt: number;
  authorRoleId: string;
  approvalStatus: "draft" | "pending_review" | "approved" | "rejected";
}

export interface GameDevTask {
  id: string;
  title: string;
  description: string;
  departmentSlug: DepartmentSlug;
  assignedRoleId: string;
  status: GameDevTaskStatus;
  priority: "low" | "medium" | "high" | "critical";
  visionAnchor: string; // Excerpt linking task to the approved vision
  dependencies: string[]; // Task IDs that must complete first
  requiredContextFiles: string[];
  resourceEstimate: {
    estimatedDurationSec: number;
    requiresHeavyCompute: boolean; // 3D render, build, video export
    requiresModelInference: boolean;
  };
  artifacts: TaskArtifact[];
  evidence?: string;
  unresolvedQuestions?: string[];
  nextDependency?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ExecutionJob {
  id: string;
  taskId: string;
  roleId: string;
  status: "queued" | "executing" | "completed" | "failed" | "deferred";
  workerSlot: number; // 0 (strictly 1 inference worker active globally)
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  failureReason?: string;
  resourceSnapshot?: {
    cpuLoadPercent?: number;
    freeMemoryMb?: number;
    resourcePressureThrottled?: boolean;
  };
}

// ==============================================================================
// 4. QUALITY & BUG LIFECYCLE CONTRACTS
// ==============================================================================

export type BugSeverity = "critical" | "high" | "medium" | "low";
export type BugStatus =
  | "reported"
  | "assigned"
  | "fix_proposed"
  | "qa_verifying"
  | "verified"
  | "closed"
  | "blocked";

export interface BugReport {
  id: string;
  title: string;
  buildVersion: string;
  stepsToReproduce: string[];
  expectedResult: string;
  actualResult: string;
  severity: BugSeverity;
  affectedSubsystem: string;
  status: BugStatus;
  reportedByRoleId: string; // strictly QA (e.g. AEGIS-QA-01)
  assignedToRoleId?: string; // strictly Engineering (e.g. FORGE-GAMEPLAY-01)
  engineeringCommitRef?: string;
  qaVerificationEvidence?: {
    verifiedAt: number;
    verifiedByRoleId: string;
    notes: string;
    regressionPassed: boolean;
    verificationLogPath?: string;
  };
  createdAt: number;
  updatedAt: number;
}

// ==============================================================================
// 5. MARKETING & MEDIA PIPELINE CONTRACTS
// ==============================================================================

export type FeatureClaimStatus =
  | "planned"
  | "in_development"
  | "implemented"
  | "testing"
  | "verified"
  | "released";

export interface MediaRightsMetadata {
  voiceoverConsentDoc?: string;
  isAiClonedVoice: boolean;
  commercialMusicLicenseRef?: string;
  rightsAttestation: string;
  complianceChecked: boolean;
}

export interface MarketingMediaDraft {
  id: string;
  title: string;
  targetPlatforms: ("youtube" | "instagram" | "twitter" | "tiktok")[];
  milestoneReference: string;
  verifiedFeatureStatus: FeatureClaimStatus; // Must match verified QA status
  script: string;
  captions: string[];
  suggestedTags: string[];
  sourceFootagePath?: string; // Approved gameplay recording
  editedVideoPath?: string;
  thumbnailPath?: string;
  rightsMetadata: MediaRightsMetadata;
  approvalStatus: "draft" | "waiting_for_approval" | "approved" | "published" | "rejected";
  ownerApprovalToken?: string;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ==============================================================================
// 6. PERSISTENT VAULT SCHEMA
// ==============================================================================

export interface GameDevVaultData {
  version: number;
  lastUpdated: number;
  vision: GameVision;
  departments: Record<DepartmentSlug, Department>;
  roles: Record<string, RoleProfile>;
  tasks: Record<string, GameDevTask>;
  bugs: Record<string, BugReport>;
  marketingDrafts: Record<string, MarketingMediaDraft>;
  jobs: Record<string, ExecutionJob>;
}
