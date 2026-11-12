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

import { NextResponse } from "next/server";
import { defaultScreenDiagnosticsEngine } from "@/lib/screen/diagnosticsEngine";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
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
