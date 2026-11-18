/**
 * @file app/api/models/route.ts
 * @description AI Model Manager REST API for Local Ollama Discovery, Configuration & Connectivity Testing.
 *
 * Subsystem:
 * AI Model Management & Local LLM Integration Layer.
 *
 * Key Responsibilities:
 * - GET: Discovers installed Ollama models on the configured loopback endpoint, measures latency,
 *   and returns truthful provider status (`connected` | `empty` | `offline`) alongside active settings.
 * - POST (`test_connection`): Executes a live, bounded connectivity probe against a validated loopback
 *   endpoint and returns latency, discovered models, or an explicit diagnostic error.
 * - POST (`select_model`): Persists a new active model selection via `updateUltronSettings`.
 * - POST (`update_config`): Persists validated endpoint, activeModel, temperature, timeoutMs,
 *   maxContextMessages, and streamResponses configuration.
 *
 * Architectural Role & Interactions:
 * - Backs the AI Model Manager view (`components/views/ModelManagerView.tsx`).
 * - Shares persisted runtime settings with `/app/api/chat/route.ts` and `/app/api/dashboard/route.ts`.
 *
 * Safety / Security Guarantees:
 * - Protected by `validateDesktopSession` (loopback origin + session gate).
 * - Strict loopback host enforcement via `validateLoopbackEndpoint` prevents SSRF.
 * - Never fabricates model availability; unreachable Ollama daemon is reported honestly as `offline`.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import {
  getActiveAiConfig,
  updateUltronSettings,
  validateLoopbackEndpoint,
} from "@/lib/runtimeConfig";
import { recordDiagnosticLog } from "@/lib/diagnosticsLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OllamaTagModel {
  name: string;
  size?: number;
  modified_at?: string;
  digest?: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

interface OllamaProbeResult {
  status: "connected" | "empty" | "offline";
  endpoint: string;
  latencyMs: number;
  models: Array<{
    name: string;
    sizeBytes: number | null;
    modifiedAt: string | null;
    parameterSize: string | null;
    quantization: string | null;
    family: string | null;
  }>;
  error: string | null;
  checkedAt: string;
}

/**
 * Executes a real, bounded HTTP probe against Ollama's `/api/tags` endpoint.
 *
 * @param endpoint - Validated loopback Ollama URL.
 * @param timeoutMs - Maximum wait duration in milliseconds.
 * @returns Structured probe outcome with latency and discovered models.
 */
async function probeOllamaEndpoint(endpoint: string, timeoutMs: number = 2500): Promise<OllamaProbeResult> {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);

    if (!res.ok) {
      return {
        status: "offline",
        endpoint,
        latencyMs,
        models: [],
        error: `Ollama responded with HTTP ${res.status} (${res.statusText || "error"}).`,
        checkedAt: new Date().toISOString(),
      };
    }

    const payload: unknown = await res.json();
    const rawModels =
      payload && typeof payload === "object" && "models" in payload && Array.isArray((payload as { models: unknown }).models)
        ? ((payload as { models: unknown[] }).models as OllamaTagModel[])
        : [];

    const models = rawModels
      .filter((entry) => entry && typeof entry.name === "string" && entry.name.trim().length > 0)
      .map((entry) => ({
        name: entry.name.trim(),
        sizeBytes: typeof entry.size === "number" && Number.isFinite(entry.size) ? entry.size : null,
        modifiedAt: typeof entry.modified_at === "string" ? entry.modified_at : null,
        parameterSize: entry.details?.parameter_size || null,
        quantization: entry.details?.quantization_level || null,
        family: entry.details?.family || null,
      }));

    return {
      status: models.length > 0 ? "connected" : "empty",
      endpoint,
      latencyMs,
      models,
      error: models.length === 0 ? "Ollama is reachable, but no local models are installed yet." : null,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    const reason = isTimeout
      ? `Connection timed out after ${timeoutMs}ms.`
      : `Local Ollama service unreachable at ${endpoint}. Start Ollama with "ollama serve" on this machine.`;

    return {
      status: "offline",
      endpoint,
      latencyMs,
      models: [],
      error: reason,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) return createAuthErrorResponse(auth);

  const config = getActiveAiConfig();
  const probe = await probeOllamaEndpoint(config.ollamaEndpoint, 2500);

  const activeModelInstalled = probe.models.some(
    (m) => m.name === config.activeModel || m.name.startsWith(config.activeModel),
  );

  return NextResponse.json(
    {
      ok: true,
      provider: config.provider,
      config,
      connection: {
        status: probe.status,
        latencyMs: probe.latencyMs,
        error: probe.error,
        checkedAt: probe.checkedAt,
        activeModelInstalled,
      },
      models: probe.models,
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

  if (action === "test_connection") {
    const current = getActiveAiConfig();
    const candidateEndpoint =
      typeof body.endpoint === "string" && body.endpoint.trim()
        ? validateLoopbackEndpoint(body.endpoint)
        : current.ollamaEndpoint;

    if (!candidateEndpoint) {
      return NextResponse.json(
        {
          ok: false,
          error: "Endpoint must be a valid loopback HTTP/HTTPS URL (localhost, 127.0.0.1, or [::1]).",
        },
        { status: 400 },
      );
    }

    const timeoutMs =
      typeof body.timeoutMs === "number" && Number.isFinite(body.timeoutMs)
        ? Math.min(10000, Math.max(1000, Math.round(body.timeoutMs)))
        : 3000;

    const probe = await probeOllamaEndpoint(candidateEndpoint, timeoutMs);
    recordDiagnosticLog(
      probe.status === "offline" ? "warn" : "info",
      "models",
      `Ollama connection test (${candidateEndpoint}): ${probe.status} (${probe.latencyMs}ms).`,
      { modelsFound: probe.models.length, status: probe.status },
    );

    return NextResponse.json({
      ok: true,
      probe,
    });
  }

  if (action === "select_model") {
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (!model) {
      return NextResponse.json({ ok: false, error: "Model name is required." }, { status: 400 });
    }
    const updated = updateUltronSettings({ ai: { activeModel: model } });
    if (!updated.ok) {
      return NextResponse.json({ ok: false, error: updated.error }, { status: 400 });
    }
    recordDiagnosticLog("info", "models", `Active AI model switched to ${updated.settings.ai.activeModel}.`);
    return NextResponse.json({ ok: true, config: updated.settings.ai });
  }

  if (action === "update_config") {
    const aiPatch: Record<string, unknown> = {};
    if (typeof body.ollamaEndpoint === "string") aiPatch.ollamaEndpoint = body.ollamaEndpoint;
    if (typeof body.activeModel === "string") aiPatch.activeModel = body.activeModel;
    if (typeof body.temperature === "number") aiPatch.temperature = body.temperature;
    if (typeof body.timeoutMs === "number") aiPatch.timeoutMs = body.timeoutMs;
    if (typeof body.maxContextMessages === "number") aiPatch.maxContextMessages = body.maxContextMessages;
    if (typeof body.streamResponses === "boolean") aiPatch.streamResponses = body.streamResponses;

    const updated = updateUltronSettings({ ai: aiPatch });
    if (!updated.ok) {
      return NextResponse.json({ ok: false, error: updated.error }, { status: 400 });
    }
    recordDiagnosticLog("info", "models", "AI model configuration updated.", {
      activeModel: updated.settings.ai.activeModel,
      endpoint: updated.settings.ai.ollamaEndpoint,
      timeoutMs: updated.settings.ai.timeoutMs,
    });
    return NextResponse.json({ ok: true, config: updated.settings.ai });
  }

  return NextResponse.json(
    { ok: false, error: `Unsupported action "${action}". Expected test_connection, select_model, or update_config.` },
    { status: 400 },
  );
}
