/**
 * @file app/api/screen/diagnostics/route.ts
 * @description API Endpoint for Screen Awareness Module 12: Diagnostics & Health Telemetry.
 *
 * Subsystem:
 * Screen Awareness & Visual Intelligence - Diagnostics Endpoint.
 *
 * Responsibilities:
 * - GET: Executes comprehensive health checks across displays, privacy state, latencies, and permissions.
 * - Returns structured `ScreenDiagnosticsReport` with status (`HEALTHY`, `DEGRADED`, `CRITICAL`).
 *
 * Safety & Security Guarantees:
 * - Read-only telemetry introspection.
 */

import { NextRequest, NextResponse } from "next/server";
import { defaultScreenDiagnosticsEngine } from "@/lib/screen/diagnosticsEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";

export const dynamic = "force-dynamic";

/**
 * Extracts and validates founder/user session token from request.
 */
function extractSession(req: NextRequest) {
  const token =
    req.headers.get("x-ultron-session-token") ||
    req.cookies.get("ultron_session")?.value ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return { token: token || "", validation: validateSessionToken(token) };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { validation } = extractSession(req);
  if (!validation.isValid || !validation.session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Valid session required to run screen diagnostics." },
      { status: 401 }
    );
  }

  try {
    const report = await defaultScreenDiagnosticsEngine.generateReport();
    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Diagnostics failed" },
      { status: 500 }
    );
  }
}
