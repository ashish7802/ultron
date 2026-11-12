/**
 * @file lib/orchestration/dependencyManagementEngine.ts
 * @description Module 03: Dependency Management Engine for the ULTRON Task Orchestration Engine.
 *
 * Subsystem:
 * Task Orchestration Engine - Phase 2 Intelligent Planning.
 *
 * Key Responsibilities:
 * - Constructs Directed Acyclic Graphs (DAGs) representing sequential and parallel task dependencies.
 * - Detects circular dependencies using Kahn's / Tarjan's algorithm and rejects invalid graphs.
 * - Identifies the Critical Path (longest duration sequence) governing overall workflow duration.
 * - Detects blocking tasks holding up downstream work and calculates bottleneck nodes.
 * - Validates execution eligibility: guarantees that no task executes before its prerequisite tasks are VERIFIED.
 * - Supports dynamic dependency additions, removals, and updates without breaking graph consistency.
 *
 * Architectural Role & Interactions:
 * - Coordinates with `taskDecompositionEngine.ts` to build the graph.
 * - Supplies topological sorting and critical path data to `executionPlanningEngine.ts` and `priorityEngine.ts`.
 *
 * Safety / Security Guarantees:
 * - Deterministic cycle detection prevents infinite loops in orchestration dispatchers.
 * - Fail-closed: if an unregistered dependency is referenced, validation fails immediately.
 */

import type {
  OrchestrationTask,
  DependencyGraphNode,
  DependencyValidationResult,
  TaskStatus,
} from "./types.ts";

export class DependencyManagementEngine {
  /**
   * Builds an indexed dependency graph representation from a dictionary of tasks.
   *
   * @param tasks - Dictionary of OrchestrationTask instances.
   * @returns Map of taskId to DependencyGraphNode.
   */
  public buildGraph(tasks: Record<string, OrchestrationTask>): Map<string, DependencyGraphNode> {
    const graph = new Map<string, DependencyGraphNode>();

    // 1. Initialize nodes
    for (const taskId of Object.keys(tasks)) {
      graph.set(taskId, {
        taskId,
        dependencies: [...(tasks[taskId].dependencies || [])],
        dependents: [],
        depth: 0,
        isCriticalPath: false,
      });
    }

    // 2. Populate reverse edges (dependents)
    for (const [taskId, node] of graph.entries()) {
      for (const depId of node.dependencies) {
        const depNode = graph.get(depId);
        if (depNode) {
          depNode.dependents.push(taskId);
        }
      }
    }

    // 3. Compute topological depths
    this._computeDepths(graph);

    return graph;
  }

  /**
   * Validates the dependency graph: verifies all references exist, checks for circular dependencies,
   * computes topological execution order, and calculates the critical path.
   *
   * @param tasks - Map of tasks to validate.
   * @returns Comprehensive DependencyValidationResult.
   */
  public validateGraph(tasks: Record<string, OrchestrationTask>): DependencyValidationResult {
    const taskIds = Object.keys(tasks);
    if (taskIds.length === 0) {
      return {
        isValid: true,
        hasCycles: false,
        topologicalOrder: [],
        criticalPath: [],
        bottlenecks: [],
      };
    }

    // Check for missing dependency references
    for (const task of Object.values(tasks)) {
      for (const depId of task.dependencies) {
        if (!tasks[depId]) {
          return {
            isValid: false,
            hasCycles: false,
            topologicalOrder: [],
            criticalPath: [],
            bottlenecks: [],
            error: `Task "${task.id}" depends on unknown prerequisite task "${depId}".`,
          };
        }
      }
    }

    // Kahn's algorithm for Topological Sort & Cycle Detection
    const inDegree: Map<string, number> = new Map();
    const adj: Map<string, string[]> = new Map();

    for (const id of taskIds) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const task of Object.values(tasks)) {
      for (const depId of task.dependencies) {
        adj.get(depId)!.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      }
    }

    // Queue of nodes with zero in-degree (ready to execute immediately)
    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const topologicalOrder: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      topologicalOrder.push(current);

      for (const neighbor of adj.get(current) || []) {
        const nextDeg = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, nextDeg);
        if (nextDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    // If topological order does not contain all tasks, a cycle exists
    if (topologicalOrder.length < taskIds.length) {
      const cycleNodes = taskIds.filter((id) => !topologicalOrder.includes(id));
      return {
        isValid: false,
        hasCycles: true,
        cycleNodes,
        topologicalOrder: [],
        criticalPath: [],
        bottlenecks: [],
        error: `Circular dependency detected involving tasks: [${cycleNodes.join(", ")}]`,
      };
    }

    // Calculate Critical Path (longest duration path from start to end)
    const criticalPath = this._calculateCriticalPath(tasks, topologicalOrder, adj);

    // Identify bottlenecks (nodes with highest number of downstream dependents)
    const bottlenecks = this._identifyBottlenecks(tasks);

    return {
      isValid: true,
      hasCycles: false,
      topologicalOrder,
      criticalPath,
      bottlenecks,
    };
  }

  /**
   * Evaluates whether a given task is currently eligible to execute.
   * A task can only execute if:
   * 1. Its status is PENDING or READY.
   * 2. All of its prerequisite tasks have status COMPLETED or VERIFIED.
   *
   * @param taskId - Target task ID.
   * @param tasks - Map of all tasks in the workflow.
   * @returns Object indicating eligibility and any blocking task IDs.
   */
  public canExecute(
    taskId: string,
    tasks: Record<string, OrchestrationTask>
  ): { eligible: boolean; blockingTaskIds: string[]; reason?: string } {
    const task = tasks[taskId];
    if (!task) {
      return { eligible: false, blockingTaskIds: [], reason: "Task does not exist." };
    }

    if (task.status === "COMPLETED" || task.status === "VERIFIED") {
      return { eligible: false, blockingTaskIds: [], reason: "Task is already complete." };
    }

    if (task.status === "CANCELLED" || task.status === "FAILED") {
      return { eligible: false, blockingTaskIds: [], reason: `Task is in terminal state ${task.status}.` };
    }

    const blockingTaskIds: string[] = [];

    for (const depId of task.dependencies) {
      const depTask = tasks[depId];
      if (!depTask) {
        blockingTaskIds.push(depId);
      } else if (depTask.status !== "COMPLETED" && depTask.status !== "VERIFIED") {
        blockingTaskIds.push(depId);
      }
    }

    if (blockingTaskIds.length > 0) {
      return {
        eligible: false,
        blockingTaskIds,
        reason: `Blocked waiting for ${blockingTaskIds.length} prerequisite tasks: [${blockingTaskIds.join(", ")}].`,
      };
    }

    return { eligible: true, blockingTaskIds: [] };
  }

  /**
   * Adds or updates a dependency between two tasks, rejecting the modification if it would create a cycle.
   */
  public addDependency(
    tasks: Record<string, OrchestrationTask>,
    taskId: string,
    dependsOnTaskId: string
  ): { success: boolean; error?: string } {
    if (!tasks[taskId]) {
      return { success: false, error: `Task "${taskId}" not found.` };
    }
    if (!tasks[dependsOnTaskId]) {
      return { success: false, error: `Prerequisite task "${dependsOnTaskId}" not found.` };
    }
    if (taskId === dependsOnTaskId) {
      return { success: false, error: "A task cannot depend on itself." };
    }

    // Clone tasks to test for cycle before applying
    const cloned: Record<string, OrchestrationTask> = JSON.parse(JSON.stringify(tasks));
    if (!cloned[taskId].dependencies.includes(dependsOnTaskId)) {
      cloned[taskId].dependencies.push(dependsOnTaskId);
    }

    const validation = this.validateGraph(cloned);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // Valid; apply modification
    if (!tasks[taskId].dependencies.includes(dependsOnTaskId)) {
      tasks[taskId].dependencies.push(dependsOnTaskId);
    }

    return { success: true };
  }

  /**
   * Removes a dependency between two tasks.
   */
  public removeDependency(
    tasks: Record<string, OrchestrationTask>,
    taskId: string,
    dependsOnTaskId: string
  ): { success: boolean } {
    if (tasks[taskId]) {
      tasks[taskId].dependencies = tasks[taskId].dependencies.filter((id) => id !== dependsOnTaskId);
    }
    return { success: true };
  }

  /**
   * Partitions topologically ordered tasks into concurrent execution waves.
   * Tasks in Wave N only depend on tasks in Waves 0..N-1 and can execute concurrently with each other.
   */
  public partitionExecutionWaves(
    tasks: Record<string, OrchestrationTask>,
    topologicalOrder: string[]
  ): string[][] {
    const waves: string[][] = [];
    const taskWaveMap = new Map<string, number>();

    for (const taskId of topologicalOrder) {
      const task = tasks[taskId];
      let maxDepWave = -1;

      for (const depId of task.dependencies) {
        const depWave = taskWaveMap.get(depId) ?? 0;
        if (depWave > maxDepWave) {
          maxDepWave = depWave;
        }
      }

      const assignedWave = maxDepWave + 1;
      taskWaveMap.set(taskId, assignedWave);

      while (waves.length <= assignedWave) {
        waves.push([]);
      }
      waves[assignedWave].push(taskId);
    }

    return waves;
  }

  /**
   * Computes the Critical Path (path with the maximum cumulative duration).
   */
  private _calculateCriticalPath(
    tasks: Record<string, OrchestrationTask>,
    topologicalOrder: string[],
    adj: Map<string, string[]>
  ): string[] {
    const dist = new Map<string, number>();
    const parent = new Map<string, string | null>();

    for (const id of topologicalOrder) {
      dist.set(id, tasks[id]?.estimatedDurationMs || 1000);
      parent.set(id, null);
    }

    for (const u of topologicalOrder) {
      const currentDist = dist.get(u) || 0;
      for (const v of adj.get(u) || []) {
        const weight = tasks[v]?.estimatedDurationMs || 1000;
        if (currentDist + weight > (dist.get(v) || 0)) {
          dist.set(v, currentDist + weight);
          parent.set(v, u);
        }
      }
    }

    // Find end node with maximum distance
    let maxDist = -1;
    let endNode: string | null = null;
    for (const [id, d] of dist.entries()) {
      if (d > maxDist) {
        maxDist = d;
        endNode = id;
      }
    }

    const path: string[] = [];
    let curr = endNode;
    while (curr) {
      path.unshift(curr);
      curr = parent.get(curr) || null;
    }

    return path;
  }

  /**
   * Computes topological depths.
   */
  private _computeDepths(graph: Map<string, DependencyGraphNode>): void {
    for (const [id, node] of graph.entries()) {
      node.depth = node.dependencies.length;
    }
  }

  /**
   * Identifies bottleneck tasks having the most outgoing dependents.
   */
  private _identifyBottlenecks(tasks: Record<string, OrchestrationTask>): string[] {
    const counts = new Map<string, number>();
    for (const task of Object.values(tasks)) {
      for (const depId of task.dependencies) {
        counts.set(depId, (counts.get(depId) || 0) + 1);
      }
    }

    const sorted = Array.from(counts.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    return sorted.slice(0, 5);
  }
}

/** Global default dependency management engine singleton */
export const defaultDependencyManagementEngine = new DependencyManagementEngine();
