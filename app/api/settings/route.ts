/**
 * @file app/api/settings/route.ts
 * @description Persisted ULTRON Settings REST API Route.
 *
 * Subsystem:
 * Settings Center Configuration Persistence.
 *
 * Key Responsibilities:
 * - GET: Returns the full validated 9-section ULTRON settings object from atomic disk storage.
 * - POST: Validates and persists partial updates or resets settings to clean defaults.
 *
 * Architectural Role & Interactions:
 * - Backs `components/views/SettingsCenterView.tsx` and workspace preferences.
 * - Uses `/lib/runtimeConfig.ts` (isolated from `ultron_memory_vault.json` and `.security_vault`).
 *
 * Safety / Security Guarantees:
 * - Protected by `validateDesktopSession` (fail-closed loopback + session gate).
 * - Enforces schema bounds and loopback-only Ollama endpoint restrictions.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import {
  loadUltronSettings,
  updateUltronSettings,
  resetUltronSettings,
  type PartialUltronSettings,
} from "@/lib/runtimeConfig";
import { recordDiagnosticLog } from "@/lib/diagnosticsLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = validateDesktopSession(req);
  if (!auth.valid) return createAuthErrorResponse(auth);

  const settings = loadUltronSettings();
  return NextResponse.json({ ok: true, settings }, { headers: { "Cache-Control": "no-store" } });
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

  if (body.action === "reset") {
    const defaults = resetUltronSettings();
    recordDiagnosticLog("info", "settings", "ULTRON settings reset to factory defaults.");
    return NextResponse.json({ ok: true, settings: defaults, message: "Settings reset to defaults." });
  }

  const patch = (body.settings && typeof body.settings === "object"
    ? body.settings
    : body) as PartialUltronSettings;

  const result = updateUltronSettings(patch);
  if (!result.ok) {
    recordDiagnosticLog("warn", "settings", `Settings validation failed: ${result.error}`);
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  recordDiagnosticLog("info", "settings", "ULTRON settings saved cleanly.", {
    updatedAt: result.settings.updatedAt,
  });

  return NextResponse.json({
    ok: true,
    settings: result.settings,
    message: "Settings saved.",
  });
}
