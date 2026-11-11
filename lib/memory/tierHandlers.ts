/**
 * @file lib/memory/tierHandlers.ts
 * @description Specialized Handlers and Ingestion Pipelines for All 12 Memory Tiers.
 *
 * Subsystem:
 * Persistent Cognitive Memory & Knowledge Infrastructure (Phase P2: 12 Memory Types).
 *
 * Key Responsibilities:
 * - Provides dedicated, type-safe ingestion and retrieval helpers for each of the 12 memory tiers.
 * - Synchronizes specialized tables (`ultron_decisions`, `ultron_error_solutions`, `ultron_entity_nodes`, `ultron_entity_edges`).
 * - Applies tier-specific validation gates and secret-exclusion checks.
 *
 * Architectural Role & Safety Guarantees:
 * - Built directly on the canonical Phase P1 `MemoryDAO` and `SqliteMemoryAdapter`.
 * - Cross-table synchronization executes within safe single-process SQLite operations.
 * - Zero breaking changes to existing chat or cognitive pipelines.
 */

import { getMemoryDAO, MemoryDAO } from "./dao.ts";
import { getDefaultMemoryAdapter } from "./sqliteAdapter.ts";
import { validateMemoryPayload } from "./validators.ts";
import { GLOBAL_PROJECT_ID } from "./schema.ts";
import type {
  WorkingMemoryPayload,
  EpisodicMemoryPayload,
  SemanticMemoryPayload,
  ProceduralMemoryPayload,
  PersonalMemoryPayload,
  ProjectMemoryPayload,
  DecisionMemoryPayload,
  ErrorSolutionMemoryPayload,
  ResearchMemoryPayload,
  TemporalMemoryPayload,
  RelationalMemoryPayload,
  MetaMemoryPayload,
} from "./tierModels.ts";
import type { MemoryRecord } from "./types.ts";
import crypto from "node:crypto";

export class SpecializedMemoryService {
  private _dao: MemoryDAO;

  constructor(dao?: MemoryDAO) {
    this._dao = dao || getMemoryDAO();
  }

  private _getDb() {
    return ((this._dao as any)._adapter as any)?._db || (getDefaultMemoryAdapter() as any)._db;
  }

  /** 1. Stores a Working Memory item. */
  public async storeWorking(payload: WorkingMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Working Memory Validation Failed: ${val.errors.join("; ")}`);

    return this._dao.store({
      projectId: payload.projectId || GLOBAL_PROJECT_ID,
      tier: "working",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || `Session ${payload.activeSessionId} goal: ${payload.goalStack[0] || "Dialogue"}`,
      sensitivity: val.assignedSensitivity,
      status: "active",
      importance: payload.importance ?? 3,
      confidence: payload.confidence ?? 1.0,
      decayRate: val.assignedDecayRate,
      source: "inferred_dialogue",
      sourceRef: `session:${payload.activeSessionId}`,
      metadata: {
        sessionId: payload.activeSessionId,
        goalStack: payload.goalStack,
        turnCount: payload.turnCount,
        unresolvedReferences: payload.unresolvedReferences,
        scratchpad: payload.scratchpadNotes,
      },
    });
  }

  /** 2. Stores an Episodic Memory item. */
  public async storeEpisodic(payload: EpisodicMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Episodic Memory Validation Failed: ${val.errors.join("; ")}`);

    return this._dao.store({
      projectId: payload.projectId || GLOBAL_PROJECT_ID,
      tier: "episodic",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || payload.episodeTitle,
      sensitivity: val.assignedSensitivity,
      status: "active",
      importance: payload.importance ?? 4,
      confidence: payload.confidence ?? 1.0,
      decayRate: val.assignedDecayRate,
      source: "inferred_dialogue",
      metadata: {
        episodeTitle: payload.episodeTitle,
        participants: payload.participants,
        dialogueTurnIds: payload.dialogueTurnIds,
        keyOutcomes: payload.keyOutcomes,
        sessionStartedAt: payload.sessionStartedAt,
        sessionEndedAt: payload.sessionEndedAt,
      },
    });
  }

  /** 3. Stores a Semantic Memory item. */
  public async storeSemantic(payload: SemanticMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Semantic Memory Validation Failed: ${val.errors.join("; ")}`);

    return this._dao.store({
      projectId: payload.projectId || GLOBAL_PROJECT_ID,
      tier: "semantic",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || payload.factStatement.slice(0, 120),
      sensitivity: val.assignedSensitivity,
      status: "active",
      importance: payload.importance ?? 4,
      confidence: payload.confidence ?? 1.0,
      decayRate: val.assignedDecayRate,
      source: "system_rule",
      sourceRef: payload.verificationSource,
      metadata: {
        domain: payload.conceptDomain,
        statement: payload.factStatement,
        relatedConcepts: payload.relatedConcepts,
      },
    });
  }

  /** 4. Stores a Procedural Memory item. */
  public async storeProcedural(payload: ProceduralMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Procedural Memory Validation Failed: ${val.errors.join("; ")}`);

    return this._dao.store({
      projectId: payload.projectId || GLOBAL_PROJECT_ID,
      tier: "procedural",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || `Procedure: ${payload.procedureName} (${payload.executionSteps.length} steps)`,
      sensitivity: val.assignedSensitivity,
      status: "active",
      importance: payload.importance ?? 4,
      confidence: payload.confidence ?? 1.0,
      decayRate: val.assignedDecayRate,
      source: "tool_execution",
      metadata: {
        procedureName: payload.procedureName,
        triggerIntent: payload.triggerIntent,
        prerequisites: payload.prerequisites,
        steps: payload.executionSteps,
        successRate: payload.successRate,
        executionCount: payload.executionCount,
      },
    });
  }

  /** 5. Stores a Personal Memory item (Founder profile & preferences). */
  public async storePersonal(payload: PersonalMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Personal Memory Validation Failed: ${val.errors.join("; ")}`);

    return this._dao.store({
      projectId: payload.projectId || GLOBAL_PROJECT_ID,
      tier: "personal",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || `Founder ${payload.founderAttribute}: ${payload.attributeValue}`,
      sensitivity: "internal",
      status: "active",
      importance: 5, // Personal facts default to maximum importance
      confidence: 1.0,
      decayRate: 0.000, // Zero decay
      source: payload.userExplicitlyDeclared ? "explicit_user" : "inferred_dialogue",
      metadata: {
        founderAttribute: payload.founderAttribute,
        attributeValue: payload.attributeValue,
        isImmutable: payload.isImmutable,
        declared: payload.userExplicitlyDeclared,
      },
    });
  }

  /** 6. Stores a Project Memory item. */
  public async storeProject(payload: ProjectMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Project Memory Validation Failed: ${val.errors.join("; ")}`);

    return this._dao.store({
      projectId: payload.projectId || GLOBAL_PROJECT_ID,
      tier: "project",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || `Project ${payload.projectName} specifications`,
      sensitivity: val.assignedSensitivity,
      status: "active",
      importance: payload.importance ?? 4,
      confidence: payload.confidence ?? 1.0,
      decayRate: val.assignedDecayRate,
      source: "inferred_dialogue",
      metadata: {
        projectName: payload.projectName,
        repositoryPath: payload.repositoryPath,
        activeTechStack: payload.activeTechStack,
        sprintMilestones: payload.sprintMilestones,
        constraints: payload.architecturalConstraints,
      },
    });
  }

  /** 7. Stores a Decision Memory item (ADR) and updates `ultron_decisions`. */
  public async storeDecision(payload: DecisionMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Decision Memory Validation Failed: ${val.errors.join("; ")}`);

    const projectId = payload.projectId || GLOBAL_PROJECT_ID;
    const mem = await this._dao.store({
      projectId,
      tier: "decision",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || `Decision: ${payload.decisionTitle}`,
      sensitivity: val.assignedSensitivity,
      status: "active",
      importance: 5,
      confidence: 1.0,
      decayRate: 0.000, // Zero decay for ADRs
      source: "explicit_user",
      metadata: {
        title: payload.decisionTitle,
        context: payload.problemContext,
        decisionMade: payload.decisionMade,
        alternatives: payload.alternativesConsidered,
        tradeoffs: payload.tradeoffsAccepted,
        status: payload.decisionStatus,
      },
    });

    // Populate specialized ultron_decisions table
    try {
      const db = this._getDb();
      const decStmt = db.prepare(`
        INSERT OR REPLACE INTO ultron_decisions (
          id, memory_id, project_id, title, problem_context, decision_made, alternatives_considered, tradeoffs, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      decStmt.run(
        `dec_${crypto.randomBytes(6).toString("hex")}`,
        mem.id,
        projectId,
        payload.decisionTitle,
        payload.problemContext,
        payload.decisionMade,
        JSON.stringify(payload.alternativesConsidered),
        payload.tradeoffsAccepted,
        payload.decisionStatus,
        Date.now()
      );
    } catch {
      /* non-fatal if table unavailable in tests */
    }

    return mem;
  }

  /** 8. Stores an Error & Solution Memory item and updates `ultron_error_solutions`. */
  public async storeErrorSolution(payload: ErrorSolutionMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`ErrorSolution Memory Validation Failed: ${val.errors.join("; ")}`);

    const projectId = payload.projectId || GLOBAL_PROJECT_ID;
    const mem = await this._dao.store({
      projectId,
      tier: "error_solution",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || `Error Solution: ${payload.errorSignature}`,
      sensitivity: val.assignedSensitivity,
      status: "active",
      importance: 4,
      confidence: 1.0,
      decayRate: val.assignedDecayRate,
      source: "tool_execution",
      metadata: {
        signature: payload.errorSignature,
        rootCause: payload.rootCause,
        solution: payload.verifiedSolution,
        prevention: payload.preventionRule,
        testFile: payload.regressionTestFile,
      },
    });

    // Populate specialized ultron_error_solutions table
    try {
      const db = this._getDb();
      const errStmt = db.prepare(`
        INSERT OR REPLACE INTO ultron_error_solutions (
          id, memory_id, project_id, error_signature, stack_trace_snippet, root_cause, verified_solution, prevention_rule, occurrence_count, last_occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      errStmt.run(
        `err_${crypto.randomBytes(6).toString("hex")}`,
        mem.id,
        projectId,
        payload.errorSignature,
        payload.stackTraceSnippet || null,
        payload.rootCause,
        payload.verifiedSolution,
        payload.preventionRule || null,
        Date.now()
      );
    } catch {
      /* non-fatal */
    }

    return mem;
  }

  /** 9. Stores a Research Memory item. */
  public async storeResearch(payload: ResearchMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Research Memory Validation Failed: ${val.errors.join("; ")}`);

    return this._dao.store({
      projectId: payload.projectId || GLOBAL_PROJECT_ID,
      tier: "research",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || payload.searchQuery,
      sensitivity: "internal",
      status: "active",
      importance: 3,
      confidence: 0.9,
      decayRate: val.assignedDecayRate,
      source: "research_agent",
      metadata: {
        query: payload.searchQuery,
        summary: payload.synthesizedSummary,
        findings: payload.findings,
        sources: payload.sources,
        elapsedMs: payload.elapsedMs,
      },
    });
  }

  /** 10. Stores a Temporal Memory item. */
  public async storeTemporal(payload: TemporalMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Temporal Memory Validation Failed: ${val.errors.join("; ")}`);

    return this._dao.store({
      projectId: payload.projectId || GLOBAL_PROJECT_ID,
      tier: "temporal",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || `Event: ${payload.eventTitle}`,
      sensitivity: val.assignedSensitivity,
      status: "active",
      importance: payload.importance ?? 4,
      confidence: payload.confidence ?? 1.0,
      decayRate: val.assignedDecayRate,
      validFrom: payload.eventTimestamp,
      validUntil: payload.deadlineTimestamp,
      source: "inferred_dialogue",
      metadata: {
        eventTitle: payload.eventTitle,
        timestamp: payload.eventTimestamp,
        deadline: payload.deadlineTimestamp,
        recurrence: payload.recurrenceRule,
        completed: payload.isCompleted,
      },
    });
  }

  /** 11. Stores a Relational Memory item and updates Knowledge Graph nodes/edges. */
  public async storeRelational(payload: RelationalMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Relational Memory Validation Failed: ${val.errors.join("; ")}`);

    const projectId = payload.projectId || GLOBAL_PROJECT_ID;
    const mem = await this._dao.store({
      projectId,
      tier: "relational",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || `${payload.sourceEntityName} -[${payload.relationType}]-> ${payload.targetEntityName}`,
      sensitivity: "internal",
      status: "active",
      importance: 3,
      confidence: 1.0,
      decayRate: val.assignedDecayRate,
      source: "inferred_dialogue",
      metadata: {
        sourceEntity: payload.sourceEntityName,
        sourceType: payload.sourceEntityType,
        targetEntity: payload.targetEntityName,
        targetType: payload.targetEntityType,
        relation: payload.relationType,
        weight: payload.edgeWeight,
      },
    });

    // Synchronize Knowledge Graph entity nodes & edge
    try {
      const db = this._getDb();
      const now = Date.now();
      const sourceId = `node_${crypto.createHash("md5").update(`${projectId}:${payload.sourceEntityName}`).digest("hex").slice(0, 12)}`;
      const targetId = `node_${crypto.createHash("md5").update(`${projectId}:${payload.targetEntityName}`).digest("hex").slice(0, 12)}`;

      const nodeStmt = db.prepare(`
        INSERT OR IGNORE INTO ultron_entity_nodes (id, project_id, name, entity_type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      nodeStmt.run(sourceId, projectId, payload.sourceEntityName, payload.sourceEntityType, now);
      nodeStmt.run(targetId, projectId, payload.targetEntityName, payload.targetEntityType, now);

      const edgeId = `edge_${crypto.randomBytes(6).toString("hex")}`;
      const edgeStmt = db.prepare(`
        INSERT OR REPLACE INTO ultron_entity_edges (id, project_id, source_id, target_id, relation, weight, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      edgeStmt.run(edgeId, projectId, sourceId, targetId, payload.relationType, payload.edgeWeight, now);
    } catch {
      /* non-fatal */
    }

    return mem;
  }

  /** 12. Stores a Meta-Memory item. */
  public async storeMeta(payload: MetaMemoryPayload): Promise<MemoryRecord> {
    const val = validateMemoryPayload(payload);
    if (!val.isValid) throw new Error(`Meta Memory Validation Failed: ${val.errors.join("; ")}`);

    return this._dao.store({
      projectId: payload.projectId || GLOBAL_PROJECT_ID,
      tier: "meta",
      semanticKey: val.normalizedKey,
      content: val.scrubbedContent,
      summary: payload.summary || `Meta-Assessment for ${payload.topicArea}: ${payload.confidenceAssessment}`,
      sensitivity: "internal",
      status: "active",
      importance: 3,
      confidence: 1.0,
      decayRate: val.assignedDecayRate,
      source: "system_rule",
      metadata: {
        category: payload.metricCategory,
        topic: payload.topicArea,
        assessment: payload.confidenceAssessment,
        explanation: payload.gapExplanation,
        recommendation: payload.recommendedInvestigation,
      },
    });
  }

  /**
   * Retrieves Architecture Decision Records (ADRs) filtered by status and project.
   *
   * @param status - Decision status ('proposed' | 'accepted' | 'deprecated' | 'superseded'). If omitted, returns all.
   * @param projectId - Workspace project ID.
   * @returns Array of typed decision records.
   */
  public async findDecisionsByStatus(status?: string, projectId?: string): Promise<any[]> {
    const targetProject = projectId || GLOBAL_PROJECT_ID;
    const db = this._getDb();
    if (!db) return [];
    try {
      if (status) {
        const stmt = db.prepare(`
          SELECT * FROM ultron_decisions 
          WHERE project_id = ? AND status = ? 
          ORDER BY created_at DESC
        `);
        return stmt.all(targetProject, status);
      } else {
        const stmt = db.prepare(`
          SELECT * FROM ultron_decisions 
          WHERE project_id = ? 
          ORDER BY created_at DESC
        `);
        return stmt.all(targetProject);
      }
    } catch {
      return [];
    }
  }

  /**
   * Retrieves verified solutions and runbooks matching an error signature pattern.
   *
   * @param pattern - Substring or pattern to match against error signatures and root causes.
   * @param projectId - Workspace project ID.
   * @returns Array of matching error solution records.
   */
  public async findSolutionsForErrorPattern(pattern: string, projectId?: string): Promise<any[]> {
    const targetProject = projectId || GLOBAL_PROJECT_ID;
    const db = this._getDb();
    if (!db) return [];
    try {
      const stmt = db.prepare(`
        SELECT * FROM ultron_error_solutions 
        WHERE project_id = ? AND (error_signature LIKE ? OR root_cause LIKE ?) 
        ORDER BY occurrence_count DESC, last_occurred_at DESC
      `);
      const term = `%${pattern}%`;
      return stmt.all(targetProject, term, term);
    } catch {
      return [];
    }
  }

  /**
   * Retrieves the knowledge graph neighbors for a given entity node.
   *
   * @param entityName - Name of the entity node.
   * @param projectId - Workspace project ID.
   * @returns List of outgoing and incoming edges connected to this entity.
   */
  public async getEntityNeighbors(entityName: string, projectId?: string): Promise<{ outgoing: any[]; incoming: any[] }> {
    const targetProject = projectId || GLOBAL_PROJECT_ID;
    const db = this._getDb();
    if (!db) return { outgoing: [], incoming: [] };
    try {
      const nodeStmt = db.prepare(`SELECT id, name, entity_type FROM ultron_entity_nodes WHERE project_id = ? AND name = ?`);
      const node = nodeStmt.get(targetProject, entityName) as any;
      if (!node) return { outgoing: [], incoming: [] };

      const outStmt = db.prepare(`
        SELECT e.id, e.relation, e.weight, n.name AS target_name, n.entity_type AS target_type
        FROM ultron_entity_edges e
        JOIN ultron_entity_nodes n ON e.target_id = n.id
        WHERE e.project_id = ? AND e.source_id = ?
      `);
      const outgoing = outStmt.all(targetProject, node.id);

      const inStmt = db.prepare(`
        SELECT e.id, e.relation, e.weight, n.name AS source_name, n.entity_type AS source_type
        FROM ultron_entity_edges e
        JOIN ultron_entity_nodes n ON e.source_id = n.id
        WHERE e.project_id = ? AND e.target_id = ?
      `);
      const incoming = inStmt.all(targetProject, node.id);

      return { outgoing, incoming };
    } catch {
      return { outgoing: [], incoming: [] };
    }
  }
}

/** Singleton instance getter for specialized memory service. */
let defaultSpecializedMemoryServiceInstance: SpecializedMemoryService | null = null;

export function getSpecializedMemoryService(): SpecializedMemoryService {
  if (!defaultSpecializedMemoryServiceInstance) {
    defaultSpecializedMemoryServiceInstance = new SpecializedMemoryService();
  }
  return defaultSpecializedMemoryServiceInstance;
}
