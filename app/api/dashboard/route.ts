/**
 * @file app/api/dashboard/route.ts
 * @description Read-only, session-protected telemetry for the command-center UI.
 *
 * Responsibilities:
 * - Reports host metrics, persisted workflow state, visible desktop windows, and security counts.
 * - Checks configured local-model availability without starting or changing the model service.
 *
 * Architectural Role & Interactions:
 * - Aggregates existing ULTRON services for `CommandCenterDashboard`.
 *
 * Safety / Security Guarantees:
 * - Requires the same trusted desktop session as other privileged API routes.
 * - Performs read-only host and workflow inspection; unsupported metrics remain unavailable.
 */

import os from "node:os";
import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import { defaultPersistentStateEngine } from "@/lib/orchestration/persistentStateEngine";
import { defaultPythonBridge } from "@/lib/computer/pythonBridge";
import { listSecurityEvents, listSecurityIncidents } from "@/lib/security/monitoringEngine";
import {
  DEFAULT_FALLBACK_MODEL_ID,
  DEFAULT_OLLAMA_ENDPOINT,
} from "@/lib/cognitive/multiModelEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Takes a snapshot of cumulative CPU counters without mutating host state.
 *
 * @returns Aggregate idle and total CPU ticks, or `null` when the host exposes no cores.
 */
function readCpuTicks(): { idle: number; total: number } | null {
  const cores = os.cpus();
  if (cores.length === 0) return null;

  return cores.reduce(
    (totals, core) => {
      const coreTotal = Object.values(core.times).reduce((sum, value) => sum + value, 0);
      return {
        idle: totals.idle + core.times.idle,
        total: totals.total + coreTotal,
      };
    },
    { idle: 0, total: 0 },
  );
}

/**
 * Measures CPU utilization over a short sampling window.
 *
 * @returns Utilization percentage, or `null` when the counters cannot be sampled.
 */
async function measureCpuUsage(): Promise<number | null> {
  const before = readCpuTicks();
  if (!before) return null;

  await new Promise<void>((resolve) => setTimeout(resolve, 250));
  const after = readCpuTicks();
  if (!after) return null;

  const totalDelta = after.total - before.total;
  const idleDelta = after.idle - before.idle;
  if (totalDelta <= 0 || idleDelta < 0) return null;

  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

/**
 * Reads capacity for the volume containing the ULTRON process.
 *
 * @returns Total/free bytes and used percentage, or `null` when the filesystem cannot report them.
 */
function readStorage(): { totalBytes: number; freeBytes: number; usedPercent: number } | null {
  try {
    const stats = fs.statfsSync(process.cwd());
    const blockSize = Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * blockSize;
    const freeBytes = Number(stats.bavail) * blockSize;
    if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !Number.isFinite(freeBytes)) return null;

    return {
      totalBytes,
      freeBytes,
      usedPercent: Math.round(((totalBytes - freeBytes) / totalBytes) * 100),
    };
  } catch {
    return null;
  }
}

/**
 * Checks the same local Ollama endpoint and model preference used by the cognitive engine.
 *
 * @returns The selected installed model, or an explicit unavailable status; does not launch Ollama.
 */
async function checkConfiguredModel(): Promise<{
  status: "ready" | "unavailable";
  model: string | null;
}> {
  const preferredModel = process.env.OLLAMA_MODEL?.trim() || DEFAULT_FALLBACK_MODEL_ID;

  try {
    const response = await fetch(`${DEFAULT_OLLAMA_ENDPOINT}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return { status: "unavailable", model: preferredModel };

    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("models" in payload) ||
      !Array.isArray(payload.models)
    ) {
      return { status: "unavailable", model: preferredModel };
    }

    const models = payload.models.filter(
      (entry): entry is { name: string } =>
        Boolean(entry && typeof entry === "object" && "name" in entry && typeof entry.name === "string"),
    );
    if (models.length === 0) return { status: "unavailable", model: preferredModel };

    const selectedModel = models.find(
      (entry) => entry.name === preferredModel || entry.name.startsWith(preferredModel),
    );
    return { status: "ready", model: selectedModel?.name ?? models[0].name };
  } catch {
    return { status: "unavailable", model: preferredModel };
  }
}

/**
 * Counts visible desktop windows through the existing read-only Python command.
 *
 * @returns Visible-window count, or `null` when the desktop bridge is unavailable.
 */
async function countVisibleWindows(): Promise<number | null> {
  try {
    const result = await defaultPythonBridge.execute<unknown[]>("windows", {}, 2000);
    return result.success && Array.isArray(result.data) ? result.data.length : null;
  } catch {
    return null;
  }
}

/**
 * Returns a partial, authenticated status snapshot for the command center.
 *
 * @param req - Incoming same-origin desktop request.
 * @returns No-store telemetry JSON; rejects requests that fail the desktop session gate.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) return createAuthErrorResponse(auth);

  const [cpuPercent, model, visibleWindows] = await Promise.all([
    measureCpuUsage(),
    checkConfiguredModel(),
    countVisibleWindows(),
  ]);
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();

  let workflows: ReturnType<typeof defaultPersistentStateEngine.listWorkflows> | null;
  try {
    workflows = defaultPersistentStateEngine.listWorkflows();
  } catch {
    workflows = null;
  }

  const activeWorkflows = workflows?.filter((workflow) =>
    ["PLANNING", "PENDING_APPROVAL", "RUNNING", "VERIFYING"].includes(workflow.state),
  ) ?? [];
  const tasks = activeWorkflows.flatMap((workflow) => Object.values(workflow.tasks));
  const openTaskStatuses = new Set(["PENDING", "READY", "BLOCKED", "AWAITING_APPROVAL", "RUNNING"]);
  const storage = readStorage();

  return NextResponse.json(
    {
      ok: true,
      sampledAt: Date.now(),
      host: {
        platform: os.platform(),
        release: os.release(),
        cpuModel: os.cpus()[0]?.model ?? null,
        cpuCores: os.cpus().length || null,
      },
      metrics: {
        cpuPercent,
        memoryPercent:
          totalMemory > 0 ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : null,
        memoryTotalBytes: totalMemory || null,
        memoryFreeBytes: freeMemory,
        storage,
        gpuPercent: null,
      },
      model,
      workflows: workflows
        ? {
            total: workflows.length,
            active: activeWorkflows.length,
            openTasks: tasks.filter((task) => openTaskStatuses.has(task.status)).length,
          }
        : null,
      visibleWindows,
      security: {
        recentEventCount: listSecurityEvents(50).length,
        activeIncidentCount: listSecurityIncidents().filter((incident) => incident.status !== "RESOLVED").length,
      },
      diagnostics: {
        cpuAvailable: cpuPercent !== null,
        storageAvailable: storage !== null,
        workflowStoreAvailable: workflows !== null,
        desktopWindowInspectionAvailable: visibleWindows !== null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
