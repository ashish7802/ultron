/**
 * @file lib/memory/temporalRelationalEngine.ts
 * @description Temporal & Relational Knowledge Graph Subsystem (Memory Types 10 & 11, Intelligence System D).
 *
 * Subsystem:
 * Temporal Validity, Chronological Ordering & Entity-Relation Knowledge Graph.
 *
 * Key Responsibilities:
 * - Temporal Intelligence:
 *   * Manages validity intervals (`validFrom`, `validUntil`).
 *   * Detects outdated, expired, or obsolescent information.
 *   * Reconstructs chronological event timelines across multi-session interactions.
 * - Relational Intelligence & Knowledge Graph:
 *   * Indexes Subject-Predicate-Object triples (e.g., `Ashish` -> `DEVELOPING` -> `ULTRON`).
 *   * Connected Memory Retrieval: Performs 1-hop and 2-hop graph traversals to recall connected memories.
 *   * Knowledge Graph Integrity: Detects circular reference loops and cleans up orphaned relations.
 *
 * Architectural Role & Interactions:
 * - Integrated by `lib/memory/memoryCoordinator.ts` to enrich search results with graph-connected context.
 * - Used by `lib/cognitive/reasoningEngine.ts` to trace causal graphs and entity dependencies.
 *
 * Safety / Security Guarantees:
 * - Read-only graph traversals are bound by maximum hop limits (max depth: 2) to eliminate recursion traps.
 * - Preserves historical temporal states without erasing past validity intervals.
 */

import type {
  AnyMemoryRecord,
  RelationalTriple,
  RelationalMemoryRecord,
  TemporalMemoryRecord,
} from "./types.ts";

export interface KnowledgeGraphNode {
  entity: string;
  type?: string;
  connectedMemoryIds: string[];
}

export interface KnowledgeGraphEdge {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  memoryId: string;
}

export interface GraphTraversalResult {
  rootEntity: string;
  directNeighbors: string[];
  edgesTraversed: KnowledgeGraphEdge[];
  connectedMemoryRecords: AnyMemoryRecord[];
}

export class TemporalRelationalEngine {
  private _nodes: Map<string, KnowledgeGraphNode> = new Map();
  private _edges: KnowledgeGraphEdge[] = [];

  /**
   * Clears in-memory knowledge graph indexes.
   */
  public resetIndex(): void {
    this._nodes.clear();
    this._edges = [];
  }

  /**
   * Indexes triples and entity relationships from memory records.
   *
   * @param records - Memory records to index into the graph.
   */
  public buildGraphIndex(records: AnyMemoryRecord[]): void {
    this.resetIndex();

    for (const record of records) {
      // Index relational memory triples
      if (record.memoryType === "relational") {
        const relRecord = record as RelationalMemoryRecord;
        for (const triple of relRecord.triples) {
          this._registerTriple(triple, record.id);
        }
      }

      // Automatically register entity connections for explicit facts or personal bio
      if (record.memoryType === "personal" && record.key === "user_name") {
        const name = record.content.replace(/^user's name is\s+/i, "").trim();
        this._registerTriple({ subject: name, predicate: "IS_A", object: "HumanFounder", confidence: 1.0 }, record.id);
      }
    }
  }

  /**
   * Registers a single triple into the graph index.
   *
   * @param triple - Subject-Predicate-Object triple.
   * @param memoryId - Originating memory ID.
   */
  private _registerTriple(triple: RelationalTriple, memoryId: string): void {
    const s = triple.subject.trim();
    const p = triple.predicate.trim().toUpperCase();
    const o = triple.object.trim();

    // Register Nodes
    if (!this._nodes.has(s)) {
      this._nodes.set(s, { entity: s, connectedMemoryIds: [memoryId] });
    } else {
      const node = this._nodes.get(s)!;
      if (!node.connectedMemoryIds.includes(memoryId)) node.connectedMemoryIds.push(memoryId);
    }

    if (!this._nodes.has(o)) {
      this._nodes.set(o, { entity: o, connectedMemoryIds: [memoryId] });
    } else {
      const node = this._nodes.get(o)!;
      if (!node.connectedMemoryIds.includes(memoryId)) node.connectedMemoryIds.push(memoryId);
    }

    // Register Edge
    this._edges.push({
      subject: s,
      predicate: p,
      object: o,
      confidence: triple.confidence,
      memoryId,
    });
  }

  /**
   * Traverses the knowledge graph starting from a root entity up to a maximum depth of 2 hops.
   *
   * @param rootEntity - Name or identifier of starting entity.
   * @param allRecords - Pool of all available memory records.
   * @param maxHops - Maximum graph depth (default: 2).
   * @returns GraphTraversalResult with reachable entities, edges, and connected memory records.
   */
  public traverseConnectedMemories(
    rootEntity: string,
    allRecords: AnyMemoryRecord[],
    maxHops: number = 2
  ): GraphTraversalResult {
    const visitedEntities = new Set<string>();
    const traversedEdges: KnowledgeGraphEdge[] = [];
    const collectedMemoryIds = new Set<string>();

    const queue: Array<{ entity: string; depth: number }> = [{ entity: rootEntity, depth: 0 }];
    visitedEntities.add(rootEntity.toLowerCase());

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxHops) continue;

      // Find all outgoing or incoming edges for current entity
      for (const edge of this._edges) {
        const matchesSubject = edge.subject.toLowerCase() === current.entity.toLowerCase();
        const matchesObject = edge.object.toLowerCase() === current.entity.toLowerCase();

        if (matchesSubject || matchesObject) {
          traversedEdges.push(edge);
          collectedMemoryIds.add(edge.memoryId);

          const nextEntity = matchesSubject ? edge.object : edge.subject;
          if (!visitedEntities.has(nextEntity.toLowerCase())) {
            visitedEntities.add(nextEntity.toLowerCase());
            queue.push({ entity: nextEntity, depth: current.depth + 1 });
          }
        }
      }
    }

    const connectedMemoryRecords = allRecords.filter((r) => collectedMemoryIds.has(r.id));
    const directNeighbors = Array.from(visitedEntities).filter((e) => e !== rootEntity.toLowerCase());

    return {
      rootEntity,
      directNeighbors,
      edgesTraversed: traversedEdges,
      connectedMemoryRecords,
    };
  }

  /**
   * Evaluates if a given memory record is obsolescent or expired.
   *
   * @param record - Memory record to inspect.
   * @param checkTime - Current epoch timestamp.
   * @returns Boolean indicating obsolescence.
   */
  public isRecordObsolescent(record: AnyMemoryRecord, checkTime: number = Date.now()): boolean {
    if (record.temporal.isObsolescent) return true;
    if (record.temporal.validUntil && record.temporal.validUntil <= checkTime) return true;
    return false;
  }

  /**
   * Sorts an array of memory records chronologically by their temporal event timestamp or creation time.
   *
   * @param records - Memory records to sort.
   * @param direction - "asc" for oldest-first, "desc" for newest-first.
   * @returns Sorted records.
   */
  public sortChronologically(
    records: AnyMemoryRecord[],
    direction: "asc" | "desc" = "asc"
  ): AnyMemoryRecord[] {
    return [...records].sort((a, b) => {
      const timeA = (a.memoryType === "temporal" ? (a as TemporalMemoryRecord).eventTime : 0) || a.createdAt;
      const timeB = (b.memoryType === "temporal" ? (b as TemporalMemoryRecord).eventTime : 0) || b.createdAt;
      return direction === "asc" ? timeA - timeB : timeB - timeA;
    });
  }

  /**
   * Inspects graph integrity for orphaned relations (edges referring to non-existent memory IDs).
   *
   * @param activeMemoryIds - Set of currently active valid memory record IDs.
   * @returns Number of orphaned edges removed.
   */
  public cleanupOrphanedEdges(activeMemoryIds: Set<string>): number {
    const initialCount = this._edges.length;
    this._edges = this._edges.filter((e) => activeMemoryIds.has(e.memoryId));
    return initialCount - this._edges.length;
  }
}

/** Global singleton instance of Temporal & Relational Engine. */
export const defaultTemporalRelationalEngine = new TemporalRelationalEngine();
