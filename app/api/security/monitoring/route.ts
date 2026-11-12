/**
 * @file app/api/security/monitoring/route.ts
 * @description Security Monitoring & Threat Detection API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Monitoring & Threat Detection Subsystem (Module 7).
 *
 * Key Responsibilities:
 * - GET: Retrieves security event telemetry and active incident dossiers.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listSecurityEvents,
  listSecurityIncidents,
} from "@/lib/security/monitoringEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || 50;

  return NextResponse.json({
    ok: true,
    events: listSecurityEvents(limit),
    incidents: listSecurityIncidents(),
  });
}
