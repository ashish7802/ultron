/**
 * @file lib/security/policyEngine.ts
 * @description Centralized Security Policy & Immutable Trust Engine for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Governance & Policy Subsystem (Module 10).
 *
 * Key Responsibilities:
 * - Maintains and enforces the 7 Immutable Core Security Invariants:
 *   1. INV_01: NO_VALID_AUTH_NO_EXECUTION
 *   2. INV_02: MANDATORY_FOUNDER_APPROVAL (Destructive actions)
 *   3. INV_03: ZERO_RAW_BIOMETRICS_STORED
 *   4. INV_04: ZERO_PLAINTEXT_SECRETS
 *   5. INV_05: IMMUTABLE_AUDIT_TRAIL (HMAC-SHA256 Chained)
 *   6. INV_06: LOCKDOWN_FAILS_CLOSED (Persistent state)
 *   7. INV_07: AI_CANNOT_WEAKEN_SECURITY (Immunity against prompt injection / LLM overrides)
 * - Validates proposed policy updates against immutable core invariants (Conflict Detection).
 * - Enforces policy versioning and generates audit events for policy modifications.
 * - Enforces fail-closed defaults for any unconfigured or conflicting security parameter.
 *
 * Architectural Role & Interactions:
 * - Consulted by `lib/security/actionGateway.ts` (Step 6: Evaluate Security Policy).
 * - Exposed via `/api/security/policies`.
 *
 * Safety / Security Guarantees:
 * - Non-negotiable invariants: cannot be disabled, weakened, or removed even by API calls.
 * - AI prompt immunity: LLM instructions ("I allow you to skip approval") are strictly rejected.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { recordSecurityEvent } from "./monitoringEngine.ts";
import type {
  SecurityPolicyRule,
  PolicyValidationResult,
  UserRole,
} from "./types.ts";

/** Path to persistent custom policies file. */
const POLICIES_FILE = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  ".security_vault",
  "policies.json"
);

/** The 7 Non-Negotiable Immutable Core Invariants. */
export const IMMUTABLE_CORE_INVARIANTS: readonly SecurityPolicyRule[] = Object.freeze([
  {
    policyId: "INV_01_AUTH_REQUIRED",
    name: "No Valid Authorization = No Execution",
    version: 1,
    description: "Every external and protected operation must possess a valid, non-expired session and verified authorization.",
    isImmutableCorePolicy: true,
    enabled: true,
    scope: "*",
    ruleExpression: "session.valid == true && grant.verified == true",
    enforcementMode: "BLOCK",
    updatedAt: 1700000000000,
    updatedBy: "system_core",
  },
  {
    policyId: "INV_02_FOUNDER_APPROVAL",
    name: "Mandatory Founder Approval for Destructive Operations",
    version: 1,
    description: "Destructive operations (file/folder deletion, memory wipe, credential changes, shell exec) require explicit founder sign-off.",
    isImmutableCorePolicy: true,
    enabled: true,
    scope: "action.isDestructive == true",
    ruleExpression: "approval.status == 'approved' && approval.role == 'founder'",
    enforcementMode: "REQUIRE_APPROVAL",
    updatedAt: 1700000000000,
    updatedBy: "system_core",
  },
  {
    policyId: "INV_03_ZERO_RAW_BIOMETRICS",
    name: "Zero Raw Biometric Storage",
    version: 1,
    description: "Raw fingerprint images, templates, or biometric samples must NEVER be stored, copied, or transmitted by ULTRON.",
    isImmutableCorePolicy: true,
    enabled: true,
    scope: "biometrics.*",
    ruleExpression: "storage.rawBiometrics == false",
    enforcementMode: "BLOCK",
    updatedAt: 1700000000000,
    updatedBy: "system_core",
  },
  {
    policyId: "INV_04_ZERO_PLAINTEXT_SECRETS",
    name: "Zero Plaintext Credentials at Rest",
    version: 1,
    description: "All stored secrets and tokens must be encrypted with authenticated AES-256-GCM. Plaintext secrets are banned from logs.",
    isImmutableCorePolicy: true,
    enabled: true,
    scope: "credentials.*",
    ruleExpression: "vault.encrypted == true && logs.secretsRedacted == true",
    enforcementMode: "BLOCK",
    updatedAt: 1700000000000,
    updatedBy: "system_core",
  },
  {
    policyId: "INV_05_IMMUTABLE_AUDIT",
    name: "Immutable Cryptographic Audit Trail",
    version: 1,
    description: "Audit records are append-only and cryptographically chained with HMAC-SHA256. Entries cannot be edited or deleted.",
    isImmutableCorePolicy: true,
    enabled: true,
    scope: "audit.*",
    ruleExpression: "audit.chainVerified == true && mutation.isAppendOnly == true",
    enforcementMode: "BLOCK",
    updatedAt: 1700000000000,
    updatedBy: "system_core",
  },
  {
    policyId: "INV_06_LOCKDOWN_FAIL_CLOSED",
    name: "Emergency Lockdown Fails Closed Across Restarts",
    version: 1,
    description: "Active emergency lockdown persists to disk; restarting the server cannot disable or bypass lockdown.",
    isImmutableCorePolicy: true,
    enabled: true,
    scope: "emergency.*",
    ruleExpression: "lockdown.persistsOnRestart == true && unlock.requiresFounderAuth == true",
    enforcementMode: "BLOCK",
    updatedAt: 1700000000000,
    updatedBy: "system_core",
  },
  {
    policyId: "INV_07_AI_IMMUNITY",
    name: "AI Cannot Weaken Security Policies",
    version: 1,
    description: "LLM completions, conversational statements, or non-founder inputs cannot override, disable, or weaken security policies.",
    isImmutableCorePolicy: true,
    enabled: true,
    scope: "*",
    ruleExpression: "actor.isAI == false || policy.immutable == true",
    enforcementMode: "BLOCK",
    updatedAt: 1700000000000,
    updatedBy: "system_core",
  },
]);

/** Active runtime policies list (starts with the immutable core invariants). */
const dynamicPolicies: SecurityPolicyRule[] = [...IMMUTABLE_CORE_INVARIANTS];

/**
 * Loads custom dynamic policies from disk on startup.
 */
function initializePolicies(): void {
  try {
    const dir = path.dirname(POLICIES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(POLICIES_FILE)) {
      const raw = fs.readFileSync(POLICIES_FILE, "utf-8");
      const list: SecurityPolicyRule[] = JSON.parse(raw);
      for (const p of list) {
        if (!p.isImmutableCorePolicy && !dynamicPolicies.some((dp) => dp.policyId === p.policyId)) {
          dynamicPolicies.push(p);
        }
      }
    }
  } catch (err) {
    console.warn("[POLICY ENGINE] Failed to load custom policies from disk:", err);
  }
}

initializePolicies();

/**
 * Persists dynamic policies to disk atomically.
 */
function persistPolicies(): void {
  try {
    const dir = path.dirname(POLICIES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = `${POLICIES_FILE}.tmp.${crypto.randomBytes(4).toString("hex")}`;
    fs.writeFileSync(tempFile, JSON.stringify(dynamicPolicies, null, 2), "utf-8");
    fs.renameSync(tempFile, POLICIES_FILE);
  } catch (err) {
    console.error("[POLICY ENGINE] Failed to persist policies:", err);
  }
}

/**
 * Validates a candidate security policy rule against immutable core invariants.
 *
 * Conflict Detection:
 * - Rejects any attempt to disable or overwrite an immutable invariant.
 * - Rejects any rule that attempts to permit unauthenticated execution or disable audit logs.
 *
 * @param candidate - Proposed SecurityPolicyRule.
 * @returns PolicyValidationResult.
 */
export function validatePolicyRule(candidate: SecurityPolicyRule): PolicyValidationResult {
  const conflicts: string[] = [];

  // Check if candidate matches an existing immutable core invariant
  const matchingInvariant = IMMUTABLE_CORE_INVARIANTS.find(
    (inv) => inv.policyId === candidate.policyId
  );

  if (matchingInvariant) {
    if (!candidate.enabled) {
      conflicts.push(`Cannot disable immutable core invariant "${candidate.policyId}".`);
    }
    if (candidate.enforcementMode !== matchingInvariant.enforcementMode) {
      conflicts.push(`Cannot weaken enforcement mode of immutable invariant "${candidate.policyId}".`);
    }
  }

  // Expression-level conflict checks
  const expr = (candidate.ruleExpression || "").toLowerCase();
  if (expr.includes("skipauth") || expr.includes("auth.enabled == false")) {
    conflicts.push("Policy conflicts with INV_01: Disabling authentication is strictly forbidden.");
  }
  if (expr.includes("skipapproval") || expr.includes("approval.required == false")) {
    conflicts.push("Policy conflicts with INV_02: Disabling mandatory approval is strictly forbidden.");
  }
  if (expr.includes("storebiometrics") || expr.includes("biometrics.raw == true")) {
    conflicts.push("Policy conflicts with INV_03: Storing raw biometrics is strictly forbidden.");
  }

  return {
    isValid: conflicts.length === 0,
    conflicts,
    invariantsPreserved: conflicts.length === 0,
    details:
      conflicts.length === 0
        ? "Policy validated successfully: All core invariants preserved."
        : `Policy validation failed with ${conflicts.length} conflict(s).`,
  };
}

/**
 * Registers or updates a dynamic security policy rule.
 *
 * Authorization:
 * - Only the founder can modify security policies.
 * - Validation must pass (zero conflicts with core invariants).
 *
 * @param rule - Proposed SecurityPolicyRule.
 * @param actorRole - Current role of actor proposing update (must be "founder").
 * @param actorId - Actor identity for audit.
 * @returns Result object.
 */
export function updateSecurityPolicy(
  rule: SecurityPolicyRule,
  actorRole: UserRole,
  actorId: string
): { success: boolean; error?: string } {
  if (actorRole !== "founder") {
    recordSecurityEvent(
      "POLICY_VIOLATION",
      "HIGH",
      actorId,
      `Unauthorized attempt by role "${actorRole}" to modify policy "${rule.policyId}".`
    );
    return { success: false, error: "Access Denied: Only the founder may modify security policies." };
  }

  const validation = validatePolicyRule(rule);
  if (!validation.isValid) {
    recordSecurityEvent(
      "POLICY_VIOLATION",
      "CRITICAL",
      actorId,
      `Policy update rejected due to invariant conflict: ${validation.conflicts.join("; ")}`
    );
    return { success: false, error: validation.conflicts.join("; ") };
  }

  const existingIdx = dynamicPolicies.findIndex((p) => p.policyId === rule.policyId);
  if (existingIdx >= 0) {
    if (dynamicPolicies[existingIdx].isImmutableCorePolicy) {
      return { success: false, error: "Cannot modify or replace an immutable core invariant." };
    }
    rule.version = dynamicPolicies[existingIdx].version + 1;
    rule.updatedAt = Date.now();
    rule.updatedBy = actorId;
    dynamicPolicies[existingIdx] = rule;
  } else {
    rule.version = 1;
    rule.updatedAt = Date.now();
    rule.updatedBy = actorId;
    dynamicPolicies.push(rule);
  }

  persistPolicies();

  recordSecurityEvent(
    "AUTH_SUCCESS",
    "INFO",
    actorId,
    `Security policy "${rule.policyId}" updated to version ${rule.version}.`
  );

  return { success: true };
}

/**
 * Lists all active security policies.
 *
 * @returns Array of SecurityPolicyRules.
 */
export function listSecurityPolicies(): SecurityPolicyRule[] {
  return [...dynamicPolicies];
}
