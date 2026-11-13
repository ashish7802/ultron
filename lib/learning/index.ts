/**
 * @file lib/learning/index.ts
 * @description Central Entry Point & Barrel Exports for the ULTRON Learning & Evolution Engine.
 *
 * Subsystem:
 * Learning & Evolution Engine (Blueprint Section 8, Pages 71-79).
 *
 * Key Responsibilities:
 * - Unifies exports for all 10 core learning modules:
 *   1. Experience Learning Engine (`experienceLearningEngine.ts`)
 *   2. Feedback Learning Engine (`feedbackLearningEngine.ts`)
 *   3. Mistake & Failure Learning Engine (`mistakeLearningEngine.ts`)
 *   4. Knowledge Acquisition Engine (`knowledgeAcquisitionEngine.ts`)
 *   5. Skill Development Engine (`skillDevelopmentEngine.ts`)
 *   6. Strategy Optimization Engine (`strategyOptimizationEngine.ts`)
 *   7. Performance Evaluation Engine (`performanceEvaluationEngine.ts`)
 *   8. Adaptive Intelligence Engine (`adaptiveIntelligenceEngine.ts`)
 *   9. Self-Improvement Engine (`selfImprovementEngine.ts`)
 *   10. Evolution Management Engine (`evolutionManagementEngine.ts`)
 * - Exports master `LearningCoordinator` and default singleton (`defaultLearningCoordinator`).
 * - Re-exports all contract types, interfaces, and enums from `types.ts`.
 *
 * Architectural Role & Interactions:
 * - Consumed by `app/api/learning/route.ts`, `components/LearningEvolutionModal.tsx`,
 *   and cognitive planning/orchestration subsystems.
 *
 * Safety / Security Guarantees:
 * - Single source of truth for all learning and evolution capabilities.
 */

// Contracts & Enums
export * from "./types.ts";

// Module 01: Experience Learning Engine
export * from "./experienceLearningEngine.ts";

// Module 02: Feedback Learning Engine
export * from "./feedbackLearningEngine.ts";

// Module 03: Mistake & Failure Learning Engine
export * from "./mistakeLearningEngine.ts";

// Module 04: Knowledge Acquisition Engine
export * from "./knowledgeAcquisitionEngine.ts";

// Module 05: Skill Development Engine
export * from "./skillDevelopmentEngine.ts";

// Module 06: Strategy Optimization Engine
export * from "./strategyOptimizationEngine.ts";

// Module 07: Performance Evaluation Engine
export * from "./performanceEvaluationEngine.ts";

// Module 08: Adaptive Intelligence Engine
export * from "./adaptiveIntelligenceEngine.ts";

// Module 09: Self-Improvement Engine
export * from "./selfImprovementEngine.ts";

// Module 10: Evolution Management Engine
export * from "./evolutionManagementEngine.ts";

// Master Coordinator
export * from "./learningCoordinator.ts";
