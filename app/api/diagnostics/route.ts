/**
 * @file app/api/diagnostics/route.ts
 * @description Developer & Diagnostic Center REST API for ULTRON Runtime Health & Logs.
 *
 * Subsystem:
 * Developer / Diagnostic Center & System Observability.
 *
 * Key Responsibilities:
 * - GET: Returns verified runtime telemetry (Node.js process stats, platform, uptime, memory RSS/heap),
 *   vault integrity metadata (without leaking secrets), DPAPI & Windows Hello availability,
 *   audit chain verification status, Ollama connectivity summary, and redacted server logs.
 * - POST (`clear_logs`): Clears the bounded in-memory server diagnostic log buffer.
 * - POST (`record_client_error`): Logs a sanitized client-side exception into the diagnostic stream.
 * - POST (`verify_audit_chain`): Runs on-demand cryptographic HMAC-SHA256 verification of the audit ledger.
 *
 * Architectural Role & Interactions:
 * - Backs `components/views/DiagnosticsView.tsx`.
 * - Strictly read-only on `ultron_memory_vault.json` and `.security_vault/*`.
 *
 * Safety / Security Guarantees:
 * - Protected by `validateDesktopSession`.
 * - Never outputs encryption keys, session tokens, recovery keys, or decrypted vault contents.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import { getCryptoStatus } from "@/lib/crypto";
import { getMemoryStats } from "@/lib/memoryManager";
import { DpapiBridge } from "@/lib/security/dpapiBridge";
import { getWindowsHelloStatus } from "@/lib/security/windowsHelloBridge";
import { getLockdownStatus } from "@/lib/security/emergencyEngine";
import { verifyAuditChainIntegrity } from "@/lib/security/auditEngine";
import { defaultAppPathService } from "@/lib/security/appPathService";
import { getActiveAiConfig } from "@/lib/runtimeConfig";
import {
  listDiagnosticLogs,
  recordDiagnosticLog,
  clearDiagnosticLogs,
  type DiagnosticLogLevel,
} from "@/lib/diagnosticsLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Probes Ollama reachability quickly for the diagnostic overview without throwing.
 */
async function probeOllamaSummary(endpoint: string): Promise<{
  reachable: boolean;
  latencyMs: number;
  modelCount: number;
  error: string | null;
}> {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);
    if (!res.ok) {
      return { reachable: false, latencyMs, modelCount: 0, error: `HTTP ${res.status}` };
    }
    const payload: unknown = await res.json();
    const count =
      payload && typeof payload === "object" && "models" in payload && Array.isArray((payload as { models: unknown }).models)
        ? (payload as { models: unknown[] }).models.length
        : 0;
    return { reachable: true, latencyMs, modelCount: count, error: null };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Math.max(1, Date.now() - startedAt),
      modelCount: 0,
      error: err instanceof Error ? err.message : "Unreachable",
    };
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) return createAuthErrorResponse(auth);

  const { searchParams } = new URL(req.url);
  const rawLevel = searchParams.get("level") || "all";
  const level: DiagnosticLogLevel | "all" =
    rawLevel === "info" || rawLevel === "warn" || rawLevel === "error" ? rawLevel : "all";
  const limit = Number(searchParams.get("limit")) || 120;

  const aiConfig = getActiveAiConfig();
  const [windowsHello, ollamaSummary] = await Promise.all([
    getWindowsHelloStatus(),
    probeOllamaSummary(aiConfig.ollamaEndpoint),
  ]);

  const memUsage = process.memoryUsage();
  const vaultPath = defaultAppPathService.getMemoryVaultPath();
  const backupPath = path.join(process.cwd(), "backups", "pre_migration_safe_snapshot", "ultron_memory_vault.json");

  let vaultExists = false;
  let vaultSizeBytes = 0;
  let vaultModifiedAt: string | null = null;
  try {
    if (fs.existsSync(vaultPath)) {
      const stat = fs.statSync(vaultPath);
      vaultExists = true;
      vaultSizeBytes = stat.size;
      vaultModifiedAt = stat.mtime.toISOString();
    }
  } catch {
    // Non-fatal metadata inspection failure
  }

  let memoryStats: ReturnType<typeof getMemoryStats> | null;
  try {
    memoryStats = getMemoryStats();
  } catch {
    memoryStats = null;
  }

  const cryptoStatus = getCryptoStatus();
  const dpapiAvailable = DpapiBridge.getInstance().isAvailable();
  const lockdown = getLockdownStatus();
  const auditVerification = verifyAuditChainIntegrity();

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        uptimeSeconds: Math.round(process.uptime()),
        pid: process.pid,
        rssBytes: memUsage.rss,
        heapUsedBytes: memUsage.heapUsed,
        heapTotalBytes: memUsage.heapTotal,
        executionMode: process.env.ULTRON_USER_DATA_DIR ? "electron-packaged" : "web-dev",
      },
      vault: {
        exists: vaultExists,
        sizeBytes: vaultSizeBytes,
        modifiedAt: vaultModifiedAt,
        backupSnapshotPresent: fs.existsSync(backupPath),
        memoryCount: memoryStats?.total ?? null,
        encryption: cryptoStatus,
      },
      security: {
        dpapiAvailable,
        dpapiReason: dpapiAvailable
          ? "Windows DPAPI helper verified on host."
          : `Unavailable on ${process.platform} host (requires Windows).`,
        windowsHelloSupported: Boolean(windowsHello.supported),
        windowsHelloStatus: windowsHello.availability,
        lockdownActive: Boolean(lockdown.isLockedDown),
        auditChainValid: Boolean(auditVerification.isChainValid),
        auditEntriesChecked: auditVerification.totalEntriesVerified ?? 0,
      },
      model: {
        provider: aiConfig.provider,
        endpoint: aiConfig.ollamaEndpoint,
        activeModel: aiConfig.activeModel,
        timeoutMs: aiConfig.timeoutMs,
        ...ollamaSummary,
      },
      logs: listDiagnosticLogs({ level, limit }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) return createAuthErrorResponse(auth);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed JSON payload." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (action === "clear_logs") {
    const cleared = clearDiagnosticLogs();
    return NextResponse.json({ ok: true, cleared });
  }

  if (action === "verify_audit_chain") {
    const report = verifyAuditChainIntegrity();
    recordDiagnosticLog(
      report.isChainValid ? "info" : "error",
      "security",
      `Audit chain integrity check: ${report.isChainValid ? "VALID" : "TAMPERING DETECTED"} (${report.totalEntriesVerified} entries).`,
    );
    return NextResponse.json({ ok: true, report });
  }

  if (action === "record_client_error") {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const subsystem = typeof body.subsystem === "string" ? body.subsystem.trim() : "ui";
    if (!message) {
      return NextResponse.json({ ok: false, error: "Error message is required." }, { status: 400 });
    }
    const entry = recordDiagnosticLog("error", subsystem, message);
    return NextResponse.json({ ok: true, entry });
  }

  return NextResponse.json(
    { ok: false, error: `Unsupported diagnostics action "${action}".` },
    { status: 400 },
  );
}
