/**
 * @file lib/orchestration/index.ts
 * @description Centralized Task Orchestration Facade for ULTRON.
 *
 * Subsystem:
 * Centralized Task Orchestration Engine (Blueprint Section 7).
 *
 * Key Responsibilities:
 * - Unifies all fourteen production orchestration modules under one clean, high-performance facade:
 *   1. Goal Understanding Engine (`goalUnderstandingEngine.ts`)
 *   2. Intelligent Task Decomposition (`taskDecompositionEngine.ts`)
 *   3. Dependency Management Engine (`dependencyManagementEngine.ts`)
 *   4. Intelligent Priority Engine (`priorityEngine.ts`)
 *   5. Execution Planning Engine (`executionPlanningEngine.ts`)
 *   6. Workflow Management Engine (`workflowManagementEngine.ts`)
 *   7. Parallel Task Coordination (`parallelCoordinationEngine.ts`)
 *   8. Progress Tracking Engine (`progressTrackingEngine.ts`)
 *   9. Failure & Retry Management (`failureRetryEngine.ts`)
 *   10. Task Verification Engine (`taskVerificationEngine.ts`)
 *   11. Persistent Task State Management (`persistentStateEngine.ts`)
 *   12. Resource & Execution Management (`resourceManagementEngine.ts`)
 *   13. Human Approval Coordination (`humanApprovalCoordinator.ts`)
 *   14. Task Reporting & Summary (`taskReportingEngine.ts`)
 * - Exports the master `TaskOrchestrationEngine` coordinator and default singleton.
 *
 * Architectural Role & Safety Guarantees:
 * - Single entry point for all task planning, scheduling, execution, and verification across ULTRON.
 * - Enforces zero unverified task completions and mandatory approval gates.
 */

// Types & Contracts
export * from "./types.ts";

// Module 01: Goal Understanding
export * from "./goalUnderstandingEngine.ts";

// Module 02: Task Decomposition
export * from "./taskDecompositionEngine.ts";

// Module 03: Dependency Management
export * from "./dependencyManagementEngine.ts";

// Module 04: Intelligent Priority Engine
export * from "./priorityEngine.ts";

// Module 05: Execution Planning Engine
export * from "./executionPlanningEngine.ts";

// Module 06: Workflow Management Engine
export * from "./workflowManagementEngine.ts";

// Module 07: Parallel Task Coordination
export * from "./parallelCoordinationEngine.ts";

// Module 08: Progress Tracking Engine
export * from "./progressTrackingEngine.ts";

// Module 09: Failure & Retry Management
export * from "./failureRetryEngine.ts";

// Module 10: Task Verification Engine
export * from "./taskVerificationEngine.ts";

// Module 11: Persistent Task State Management
export * from "./persistentStateEngine.ts";

// Module 12: Resource & Execution Management
export * from "./resourceManagementEngine.ts";

// Module 13: Human Approval Coordination
export * from "./humanApprovalCoordinator.ts";

// Module 14: Task Reporting & Summary
export * from "./taskReportingEngine.ts";

// Master Orchestrator Facade
export * from "./orchestrator.ts";
