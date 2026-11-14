/**
 * @file lib/security/types.ts
 * @description Centralized Type Definitions & Contracts for the ULTRON Security & Permission System.
 *
 * Subsystem:
 * Centralized Security, Authorization, Access Control & Audit Infrastructure (Blueprint Section 6).
 *
 * Key Responsibilities:
 * - Defines structured interfaces and enums for all ten security modules:
 *   1. Identity & Authentication (User, Session, Hardware Bio, Device Binding)
 *   2. Permission Management (Approval Plans, States, Scopes, Tokens)
 *   3. Access Control (RBAC Roles, ABAC Attributes, Resource Isolation)
 *   4. Action Authorization Gateway (Execution Pipelines, Risk Tiers, Verification Grants)
 *   5. Credential & Secret Protection (DPAPI Wrappers, Vault Entries, Rotation Metadata)
 *   6. Privacy & Data Protection (Data Classification, PII/Secret Masking, Screen Privacy)
 *   7. Security Monitoring & Threat Detection (Security Events, Anomaly Detection, Incidents)
 *   8. Audit & Accountability (HMAC-SHA256 Chained Ledgers, Audit Envelopes)
 *   9. Emergency Protection System (Global Lockdown State, Emergency Stop, Recovery Credentials)
 *   10. Security Policy & Trust Engine (Policy Rules, Invariants, Conflict Resolution)
 *
 * Architectural Role & Interactions:
 * - Shared across all security engines in `lib/security/`.
 * - Consumed by API routes (`/api/security/*`, `/api/chat`, `/api/permission`).
 * - Bridges to Python host engines (`ultron_engine/windows_hello.py`, `ultron_engine/secure_vault.py`).
 *
 * Safety / Security Guarantees:
 * - Fail-closed type guarantees: unassigned or missing permissions default to deny.
 * - Zero raw biometric storage: biometric models contain strictly boolean verification and hardware metadata.
 * - Secret redaction enforcement: interfaces distinguish raw secrets from sanitized metadata.
 */

/* ==============================================================================
 * MODULE 1: IDENTITY & AUTHENTICATION TYPES
 * ============================================================================== */

export type UserRole = "founder" | "admin" | "operator" | "guest";

export type AuthMethod = "windows_hello" | "fingerprint" | "session_token" | "recovery_key";

/**
 * Explicit Authentication & Authorization Levels (F-01 Security Hardening).
 * Enforces discrete capability boundaries across application initialization,
 * normal chat access, tool execution, and founder administrative actions.
 */
export type AuthenticationLevel =
  | "ANONYMOUS"              // Unauthenticated visitor
  | "CHAT_AUTHENTICATED"    // Loopback desktop session initialized for interactive conversational chat
  | "BIOMETRIC_VERIFIED"    // Verified via Windows Hello biometric authentication challenge
  | "PRIVILEGED_AUTHORIZED" // Verified with active execution grant for sensitive/destructive operations
  | "FOUNDER_AUTHORIZED";   // Full founder authority confirmed via biometrics or recovery key

export interface UserIdentity {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  isFounder: boolean;
  createdAt: number;
  lastLoginAt: number;
  enrolledAuthMethods: AuthMethod[];
}

export interface DeviceBinding {
  deviceId: string;
  hostname: string;
  platform: string;
  hardwareFingerprint: string;
  trustedSince: number;
  isCurrentDevice: boolean;
}

export interface WindowsHelloStatus {
  supported: boolean;
  availability: string;
  deviceName: string;
  manufacturer: string;
  deviceId: string;
  hardwareStatus: string;
  windowsHelloReady: boolean;
  isEnrolled: boolean;
  enrolledFingerprintsCount: number;
  rawBiometricsStored: false; // Non-negotiable invariant: ALWAYS false
  enclaveType: string;
}

export interface BiometricVerificationResult {
  success: boolean;
  result: "Verified" | "Canceled" | "RetriesExhausted" | "DeviceBusy" | "Timeout" | "Error" | "NonWindowsPlatform";
  message: string;
  hardwareBinding?: string;
  verifiedAt?: number;
}

export interface DesktopSession {
  sessionId: string;
  sessionToken: string;
  userId: string;
  userRole: UserRole;
  authenticationLevel: AuthenticationLevel;
  deviceId: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  isRevoked: boolean;
  revocationReason?: string;
  lastBiometricVerificationAt?: number;
}

export interface SensitiveActionChallenge {
  challengeId: string;
  action: string;
  resource: string;
  createdAt: number;
  expiresAt: number;
  isConsumed: boolean;
  requiredMethod: AuthMethod;
}

/* ==============================================================================
 * MODULE 2: PERMISSION MANAGEMENT TYPES
 * ============================================================================== */

export type PermissionActionType =
  | "app_launch"
  | "app_terminate"
  | "file_read"
  | "file_write"
  | "file_delete"
  | "folder_delete"
  | "shell_exec"
  | "browser_open"
  | "volume_change"
  | "system_command"
  | "memory_wipe"
  | "credential_read"
  | "credential_write"
  | "credential_revoke"
  | "policy_update"
  | "emergency_unlock"
  | "payment_exec"
  | "external_publish"
  | "prod_deploy";

export type ActionRiskLevel = "low" | "medium" | "high" | "critical";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executing"
  | "executed"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "revoked";

export interface ActionScope {
  exactTarget: string;
  permittedParameters: Record<string, unknown>;
  affectedResources: string[];
  projectId?: string;
}

export interface PermissionApprovalRequest {
  requestId: string;
  actionId?: string; // Unique Action Identifier
  actionType: PermissionActionType;
  title: string;
  description: string;
  target: string;
  resourceId?: string; // Resource Identifier
  params: Record<string, unknown>;
  affectedResources: string[];
  riskLevel: ActionRiskLevel;
  riskExplanation: string;
  actionHash: string; // SHA-256 of canonical action + target + params
  scope: ActionScope;
  requestedByActor: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  status: ApprovalStatus;
  approvalToken: string; // Token given to founder/UI to sign decision
  executionGrantToken: string | null; // Single-use execution authorization
  founderIdentity?: string; // Verified Founder Identity bound to this approval
  decidedByActor?: string;
  decidedAt?: number;
  decisionReason?: string;
  isDestructive: boolean;
  rollbackPlan?: string;
  executedAt?: number;
  executionStatus?: "PENDING" | "EXECUTING" | "COMPLETED" | "FAILED";
  finalResultRef?: string; // Reference to execution result or output
}

/* ==============================================================================
 * MODULE 3: ACCESS CONTROL (RBAC & ABAC) TYPES
 * ============================================================================== */

export type AccessOperation = "read" | "write" | "execute" | "delete" | "admin";

export type ResourceDomain = "file" | "folder" | "application" | "database" | "credential" | "system" | "network";

export interface ResourceAccessPolicy {
  policyId: string;
  domain: ResourceDomain;
  resourcePattern: string; // Glob or exact path/URI (e.g. "C:/projects/*", "notepad.exe")
  allowedRoles: UserRole[];
  allowedOperations: AccessOperation[];
  requiresApprovalForOperations: AccessOperation[];
  projectId?: string; // Tenant/project isolation
  isRestricted: boolean;
}

export interface ABACContext {
  actorId: string;
  actorRole: UserRole;
  sessionId: string;
  requestedOperation: AccessOperation;
  resourceDomain: ResourceDomain;
  resourceIdentifier: string;
  projectId?: string;
  isEmergencyLocked: boolean;
  environment: {
    ipAddress: string;
    isLoopback: boolean;
    timestamp: number;
    platform: string;
  };
}

export interface AccessEvaluationResult {
  isAllowed: boolean;
  requiresFounderApproval: boolean;
  reason: string;
  matchedPolicyId?: string;
  riskLevel: ActionRiskLevel;
}

/* ==============================================================================
 * MODULE 4: ACTION AUTHORIZATION GATEWAY TYPES
 * ============================================================================== */

export interface GatewayExecutionRequest<TParams = Record<string, unknown>> {
  actionType: PermissionActionType;
  target: string;
  params: TParams;
  actorId: string;
  sessionId: string;
  projectId?: string;
  justification?: string;
}

export interface GatewayExecutionResult<TOutput = unknown> {
  success: boolean;
  requiresApproval: boolean;
  approvalRequest?: PermissionApprovalRequest;
  executionGrantToken?: string;
  result?: TOutput;
  error?: string;
  auditRecordId?: string;
  pipelineStepCompleted: number;
}

/* ==============================================================================
 * MODULE 5: CREDENTIAL & SECRET PROTECTION TYPES
 * ============================================================================== */

export interface CredentialMetadata {
  secretId: string;
  name: string;
  category: "api_key" | "oauth_token" | "database_uri" | "service_account" | "master_key";
  createdAt: number;
  lastRotatedAt: number;
  expiresAt?: number;
  isRevoked: boolean;
  isDPAPIProtected: boolean;
  allowedRoles: UserRole[];
  fingerprint: string; // SHA-256 of the value for rotation tracking, NEVER the plaintext
}

export interface EncryptedSecretRecord {
  secretId: string;
  metadata: CredentialMetadata;
  encryptedBlob: string; // Base64 ciphertext (AES-256-GCM or DPAPI-wrapped)
  nonce: string; // Base64 96-bit CSPRNG IV
  authTag: string; // Base64 128-bit GCM MAC
}

/* ==============================================================================
 * MODULE 6: PRIVACY & DATA PROTECTION TYPES
 * ============================================================================== */

export type DataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export interface SensitivePatternFinding {
  type: "api_key" | "jwt_token" | "private_key" | "password" | "credit_card" | "email" | "ssn";
  startIndex: number;
  endIndex: number;
  sampleMasked: string;
  entropyScore?: number;
}

export interface PrivacyScanResult {
  isClean: boolean;
  detectedFindings: SensitivePatternFinding[];
  sanitizedText: string;
  suggestedClassification: DataClassification;
}

export interface ScreenPrivacyState {
  isScreenCaptureAllowed: boolean;
  activeConsentExpiresAt: number;
  activeWindowExcluded: boolean;
  excludedWindowMatch?: string;
  reason: string;
}

/* ==============================================================================
 * MODULE 7: SECURITY MONITORING & THREAT DETECTION TYPES
 * ============================================================================== */

export type ThreatSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SecurityEventType =
  | "AUTH_SUCCESS"
  | "AUTH_FAILURE"
  | "BIOMETRIC_FAILED"
  | "SESSION_ANOMALY"
  | "RATE_LIMIT_EXCEEDED"
  | "UNAUTHORIZED_RESOURCE_ACCESS"
  | "PERMISSION_BYPASS_ATTEMPT"
  | "EXPIRED_APPROVAL_USAGE"
  | "TAMPERING_DETECTED"
  | "GATEWAY_BYPASS_ATTEMPT"
  | "DESTRUCTIVE_ACTION_ATTEMPTED"
  | "EMERGENCY_STOP_TRIGGERED"
  | "EMERGENCY_STOP_RECOVERED"
  | "POLICY_VIOLATION";

export interface SecurityEvent {
  eventId: string;
  timestamp: number;
  type: SecurityEventType;
  severity: ThreatSeverity;
  actor: string;
  sessionId?: string;
  resource?: string;
  details: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface SecurityIncident {
  incidentId: string;
  timestamp: number;
  severity: ThreatSeverity;
  title: string;
  summary: string;
  triggeringEvents: string[]; // Event IDs
  status: "OPEN" | "INVESTIGATING" | "CONTAINED" | "RESOLVED";
  remediationActionTaken?: string;
}

/* ==============================================================================
 * MODULE 8: AUDIT & ACCOUNTABILITY TYPES
 * ============================================================================== */

export interface ChainedAuditEntry {
  auditId: string;
  sequenceNumber: number;
  timestamp: number;
  actor: string;
  role: UserRole;
  action: PermissionActionType | string;
  resource: string;
  riskLevel: ActionRiskLevel;
  sessionRef?: string;
  approvalRef?: string;
  correlationId?: string;
  executionStatus: "SUCCESS" | "FAILURE" | "DENIED" | "BLOCKED" | "REVOKED";
  resultSummary?: string;
  failureReason?: string;
  detailsSanitized: string;
  previousEntryHash: string; // Immutable HMAC-SHA256 hash linking to previous entry
  currentEntryHash: string; // HMAC-SHA256(previousEntryHash + canonicalPayload)
}

export interface AuditVerificationReport {
  isChainValid: boolean;
  totalEntriesVerified: number;
  brokenSequenceAt?: number;
  corruptedAuditId?: string;
  verifiedAt: number;
}

/* ==============================================================================
 * MODULE 9: EMERGENCY PROTECTION SYSTEM TYPES
 * ============================================================================== */

export interface EmergencyLockdownState {
  isLockedDown: boolean;
  lockedAt?: number;
  lockedByActor?: string;
  triggerReason?: string;
  activeExecutionsTerminated: number;
  sessionsRevokedCount: number;
  recoveryVerificationRequired: boolean;
  recoveryPassphraseHash?: string; // PBKDF2 hash of founder recovery key
}

export interface LockdownTriggerParams {
  reason: string;
  actor: string;
  revokeAllSessions?: boolean;
}

export interface RecoveryUnlockParams {
  recoveryKey: string;
  actor: string;
  reason: string;
}

/* ==============================================================================
 * MODULE 10: SECURITY POLICY & TRUST ENGINE TYPES
 * ============================================================================== */

export interface SecurityPolicyRule {
  policyId: string;
  name: string;
  version: number;
  description: string;
  isImmutableCorePolicy: boolean; // Immutable core invariants CANNOT be removed or weakened
  enabled: boolean;
  scope: string; // Domain or wildcard
  ruleExpression: string;
  enforcementMode: "BLOCK" | "REQUIRE_APPROVAL" | "AUDIT_ONLY";
  updatedAt: number;
  updatedBy: string;
}

export interface PolicyValidationResult {
  isValid: boolean;
  conflicts: string[];
  invariantsPreserved: boolean;
  details: string;
}
