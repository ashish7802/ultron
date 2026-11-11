/**
 * @file lib/memory/index.ts
 * @description Central Entry Point & Barrel Exports for ULTRON Advanced Cognitive Memory System.
 *
 * Subsystem:
 * Core Knowledge, 12 Specialized Memory Types, Lifecycle Pipeline & Self-Healing Disaster Recovery.
 *
 * Key Responsibilities:
 * - Unifies exports for all 12 specialized memory subsystems.
 * - Exports the 10-stage memory lifecycle coordinator (`defaultMemoryCoordinator`).
 * - Re-exports sub-engines:
 *   * `WorkingMemoryEngine` (Type 1)
 *   * `MemoryExtractionEngine` (System A)
 *   * `MemoryRetrievalEngine` (System B)
 *   * `MemoryManagementEngine` (System C)
 *   * `TemporalRelationalEngine` (System D, Types 10 & 11)
 *   * `MetaMemoryEngine` (System E, Type 12)
 *   * `SelfHealingEngine` (Disaster Recovery & Playbooks)
 *   * `MemorySecurityEngine` (Zero-Trust Gating & AES-256-GCM)
 *
 * Architectural Role & Interactions:
 * - Consumed by `lib/memoryManager.ts`, `lib/cognitive/orchestrator.ts`, and `app/api/chat/route.ts`.
 *
 * Safety / Security Guarantees:
 * - Single source of truth for all cognitive memory types.
 */

export * from "./types.ts";
export * from "./workingMemory.ts";
export * from "./extractionEngine.ts";
export * from "./managementEngine.ts";
export * from "./retrievalEngine.ts";
export * from "./temporalRelationalEngine.ts";
export * from "./metaMemoryEngine.ts";
export * from "./selfHealingEngine.ts";
export * from "./securityEngine.ts";
export * from "./memoryCoordinator.ts";
