/**
 * @file lib/security/index.ts
 * @description Centralized Security, Permission & Authorization Facade for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Access Control & Permission Management Engine (Blueprint Section 6).
 *
 * Key Responsibilities:
 * - Unifies all ten production security modules under one clean, high-performance facade:
 *   1. Identity & Authentication System (`identityEngine.ts`, `windowsHelloBridge.ts`)
 *   2. Permission Management Engine (`permissionEngine.ts`)
 *   3. Access Control System (`accessControlEngine.ts`)
 *   4. Action Authorization Gateway (`actionGateway.ts`)
 *   5. Credential & Secret Protection (`credentialEngine.ts`)
 *   6. Privacy & Data Protection (`privacyEngine.ts`)
 *   7. Security Monitoring & Threat Detection (`monitoringEngine.ts`)
 *   8. Audit & Accountability Engine (`auditEngine.ts`)
 *   9. Emergency Protection System (`emergencyEngine.ts`)
 *   10. Security Policy & Trust Engine (`policyEngine.ts`)
 * - Exports universal types and convenience helpers for Next.js API routes and UI components.
 *
 * Architectural Role & Safety Guarantees:
 * - Single source of truth for all security decisions across ULTRON.
 * - Server-side enforcement guarantees: client assertions cannot bypass policies.
 */

// Module 1: Identity & Authentication
export * from "./types.ts";
export * from "./windowsHelloBridge.ts";
export * from "./identityEngine.ts";

// Module 2: Permission Management
export * from "./permissionEngine.ts";

// Module 3: Access Control (RBAC & ABAC)
export * from "./accessControlEngine.ts";

// Module 4: Action Authorization Gateway
export * from "./actionGateway.ts";

// Module 5: Credential & Secret Protection
export * from "./credentialEngine.ts";

// Module 6: Privacy & Data Protection
export * from "./privacyEngine.ts";

// Module 7: Security Monitoring & Threat Detection
export * from "./monitoringEngine.ts";

// Module 8: Audit & Accountability Engine
export * from "./auditEngine.ts";

// Module 9: Emergency Protection System
export * from "./emergencyEngine.ts";

// Module 10: Security Policy & Trust Engine
export * from "./policyEngine.ts";
