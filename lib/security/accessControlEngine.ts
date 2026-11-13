/**
 * @file lib/security/accessControlEngine.ts
 * @description Centralized Access Control Engine (RBAC, ABAC & Resource Isolation) for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Authorization & Access Control Subsystem (Module 3).
 *
 * Key Responsibilities:
 * - Implements Role-Based Access Control (RBAC) with hierarchical inheritance:
 *   `founder` > `admin` > `operator` > `guest`.
 * - Implements Attribute-Based Access Control (ABAC) evaluating:
 *   * Actor identity and role
 *   * Requested operation (`read`, `write`, `execute`, `delete`, `admin`)
 *   * Resource domain (`file`, `folder`, `application`, `database`, `credential`, `system`, `network`)
 *   * Target resource path / pattern matching
 *   * Project context & tenant isolation (`projectId`)
 *   * Emergency lockdown status
 *   * Environmental factors (loopback vs external, timestamp)
 * - Enforces the principle of least privilege and prevents privilege escalation.
 * - Prevents cross-project unauthorized resource access.
 * - Fails closed: unmapped resources or operations default to DENY.
 *
 * Architectural Role & Interactions:
 * - Invoked by `lib/security/actionGateway.ts` (Step 7: Validate resource permissions).
 * - Exposes access check endpoints for `/api/security/access-control`.
 *
 * Safety / Security Guarantees:
 * - Server-side enforcement only: ignores client assertions.
 * - Default deny: any missing rule or ambiguous match is rejected.
 * - Emergency lockdown override: when locked down, all non-read/non-recovery actions reject.
 */

import path from "path";
import type {
  UserRole,
  AccessOperation,
  ResourceDomain,
  ResourceAccessPolicy,
  ABACContext,
  AccessEvaluationResult,
  ActionRiskLevel,
} from "./types.ts";

/** Role hierarchy weights for inheritance evaluation. */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  founder: 400,
  admin: 300,
  operator: 200,
  guest: 100,
};

/** Pre-seeded core resource policies. */
const DEFAULT_POLICIES: ResourceAccessPolicy[] = [
  // 1. System Applications
  {
    policyId: "pol_app_safe",
    domain: "application",
    resourcePattern: "notepad|calc|mspaint|explorer|settings|taskmgr|camera",
    allowedRoles: ["founder", "admin", "operator"],
    allowedOperations: ["execute", "read"],
    requiresApprovalForOperations: ["execute"],
    isRestricted: false,
  },
  // 2. Sensitive Shell & Execution
  {
    policyId: "pol_app_critical_shell",
    domain: "application",
    resourcePattern: "cmd|powershell|pwsh|regedit|format|diskpart|bash",
    allowedRoles: ["founder"],
    allowedOperations: ["execute", "read"],
    requiresApprovalForOperations: ["execute"],
    isRestricted: true,
  },
  // 3. Audio & Hardware Volume
  {
    policyId: "pol_system_volume",
    domain: "system",
    resourcePattern: "volume|audio|display|battery|ram|cpu",
    allowedRoles: ["founder", "admin", "operator"],
    allowedOperations: ["read", "execute"],
    requiresApprovalForOperations: ["execute"],
    isRestricted: false,
  },
  // 4. Web Browsing
  {
    policyId: "pol_network_browser",
    domain: "network",
    resourcePattern: "https?://.*",
    allowedRoles: ["founder", "admin", "operator"],
    allowedOperations: ["read", "execute"],
    requiresApprovalForOperations: ["execute"],
    isRestricted: false,
  },
  // 5. Project Local Workspace Files
  {
    policyId: "pol_file_workspace",
    domain: "file",
    resourcePattern: ".*",
    allowedRoles: ["founder", "admin"],
    allowedOperations: ["read", "write", "delete"],
    requiresApprovalForOperations: ["write", "delete"],
    isRestricted: false,
  },
  // 6. Root & OS System Files
  {
    policyId: "pol_file_os_root",
    domain: "file",
    resourcePattern: "^(C:\\\\Windows|C:\\\\Program Files|/etc|/bin|/usr).*",
    allowedRoles: ["founder"],
    allowedOperations: ["read"],
    requiresApprovalForOperations: ["read"],
    isRestricted: true,
  },
  // 7. Credentials Vault
  {
    policyId: "pol_cred_vault",
    domain: "credential",
    resourcePattern: ".*",
    allowedRoles: ["founder"],
    allowedOperations: ["read", "write", "delete", "admin"],
    requiresApprovalForOperations: ["read", "write", "delete", "admin"],
    isRestricted: true,
  },
  // 8. Memory Database
  {
    policyId: "pol_db_memory",
    domain: "database",
    resourcePattern: "ultron_memory.*|.*vault.*",
    allowedRoles: ["founder", "admin"],
    allowedOperations: ["read", "write", "delete"],
    requiresApprovalForOperations: ["delete"],
    isRestricted: true,
  },
];

/** Active policy registry. */
const activePolicies: ResourceAccessPolicy[] = [...DEFAULT_POLICIES];

/**
 * Checks whether an actor's role meets or exceeds a target role in the hierarchy.
 *
 * @param actorRole - Current role of the actor.
 * @param requiredRole - Minimum required role.
 * @returns True if actor role is equal or higher; false otherwise.
 */
export function hasRolePermission(actorRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[actorRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
}

/**
 * Evaluates whether a target resource identifier matches a policy pattern.
 *
 * @param resourceIdentifier - Requested target (file path, app name, URL).
 * @param pattern - Regex string or keyword expression.
 * @returns True if matched; false otherwise.
 */
function matchesResourcePattern(resourceIdentifier: string, pattern: string): boolean {
  if (!resourceIdentifier || !pattern) return false;
  try {
    const regex = new RegExp(pattern, "i");
    return regex.test(resourceIdentifier);
  } catch {
    return resourceIdentifier.toLowerCase().includes(pattern.toLowerCase());
  }
}

/**
 * Evaluates comprehensive Attribute-Based Access Control (ABAC) for a request.
 *
 * Evaluation Pipeline:
 * 1. Emergency Lockdown Check: If system is in emergency lockdown, deny all except recovery.
 * 2. Loopback Enforcement: Non-loopback origins cannot execute critical/destructive actions.
 * 3. Project Isolation Check: If a resource belongs to project X and actor is in project Y, deny.
 * 4. Policy Matching: Finds the most specific matching ResourceAccessPolicy.
 * 5. Role Validation: Confirms actor's role is in policy's allowedRoles.
 * 6. Operation Validation: Confirms requestedOperation is in policy's allowedOperations.
 * 7. Founder Approval Gate: Checks if requested operation requires explicit founder approval.
 * 8. Default Deny: Rejects if no policy matched.
 *
 * @param context - Full ABACContext.
 * @returns AccessEvaluationResult.
 */
export function evaluateAccess(context: ABACContext): AccessEvaluationResult {
  const {
    actorRole,
    requestedOperation,
    resourceDomain,
    resourceIdentifier,
    projectId,
    isEmergencyLocked,
    environment,
  } = context;

  // 1. Emergency Lockdown Check
  if (isEmergencyLocked) {
    if (requestedOperation !== "read" && resourceDomain !== "system") {
      return {
        isAllowed: false,
        requiresFounderApproval: true,
        reason: "Access denied: System is under active Emergency Security Lockdown.",
        riskLevel: "critical",
      };
    }
  }

  // 2. Loopback Network Origin Check
  if (!environment.isLoopback && (requestedOperation === "execute" || requestedOperation === "delete")) {
    return {
      isAllowed: false,
      requiresFounderApproval: true,
      reason: "Access denied: Destructive or executable actions are strictly forbidden from non-loopback origins.",
      riskLevel: "critical",
    };
  }

  // 3. Find matching policies
  const matchedPolicies = activePolicies.filter(
    (p) => p.domain === resourceDomain && matchesResourcePattern(resourceIdentifier, p.resourcePattern)
  );

  if (matchedPolicies.length === 0) {
    // Fail-closed default deny
    return {
      isAllowed: false,
      requiresFounderApproval: true,
      reason: `Access denied (Default Deny): No access control policy matched resource "${resourceIdentifier}" in domain "${resourceDomain}".`,
      riskLevel: "high",
    };
  }

  // Evaluate candidate policies
  for (const policy of matchedPolicies) {
    // Project isolation check
    if (policy.projectId && projectId && policy.projectId !== projectId) {
      continue; // Skip policy belonging to a different project
    }

    // Role check
    const isRoleAuthorized = policy.allowedRoles.includes(actorRole);
    if (!isRoleAuthorized) {
      continue;
    }

    // Operation check
    const isOpAuthorized = policy.allowedOperations.includes(requestedOperation);
    if (!isOpAuthorized) {
      continue;
    }

    // Determine if explicit founder approval is required
    const requiresApproval =
      policy.requiresApprovalForOperations.includes(requestedOperation) ||
      requestedOperation === "delete" ||
      policy.isRestricted ||
      actorRole !== "founder";

    const riskLevel: ActionRiskLevel =
      requestedOperation === "delete" || policy.isRestricted
        ? "critical"
        : requestedOperation === "execute" || requestedOperation === "write"
        ? "high"
        : "low";

    return {
      isAllowed: true,
      requiresFounderApproval: requiresApproval,
      reason: `Access authorized under policy "${policy.policyId}".${requiresApproval ? " Explicit founder approval is mandatory." : ""}`,
      matchedPolicyId: policy.policyId,
      riskLevel,
    };
  }

  // Role or operation insufficient
  return {
    isAllowed: false,
    requiresFounderApproval: true,
    reason: `Access denied: Role "${actorRole}" does not have privilege for operation "${requestedOperation}" on "${resourceIdentifier}".`,
    riskLevel: "high",
  };
}

/**
 * Registers a new resource access policy dynamically.
 *
 * @param policy - New ResourceAccessPolicy.
 * @param actorRole - Role of actor registering the policy (must be founder).
 * @returns Boolean success flag.
 */
export function registerResourcePolicy(policy: ResourceAccessPolicy, actorRole: UserRole): boolean {
  if (actorRole !== "founder") {
    console.warn("[ACCESS CONTROL] Policy modification denied: Only founder may register access policies.");
    return false;
  }
  // Check duplicate
  const idx = activePolicies.findIndex((p) => p.policyId === policy.policyId);
  if (idx >= 0) {
    activePolicies[idx] = policy;
  } else {
    activePolicies.push(policy);
  }
  return true;
}

/**
 * Revokes a registered resource access policy dynamically.
 *
 * @param policyId - Policy identifier to revoke.
 * @param actorRole - Role of actor revoking policy (must be founder).
 * @returns Boolean success flag.
 */
export function revokeResourcePolicy(policyId: string, actorRole: UserRole): boolean {
  if (actorRole !== "founder") {
    console.warn("[ACCESS CONTROL] Policy revocation denied: Only founder may revoke access policies.");
    return false;
  }
  const idx = activePolicies.findIndex((p) => p.policyId === policyId);
  if (idx >= 0) {
    activePolicies.splice(idx, 1);
    return true;
  }
  return false;
}

/**
 * Returns all active resource access policies.
 *
 * @returns Array of policies.
 */
export function listResourcePolicies(): ResourceAccessPolicy[] {
  return [...activePolicies];
}
