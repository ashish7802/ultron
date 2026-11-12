/**
 * @file app/api/security/audit/route.ts
 * @description Chained Audit Ledger & Verification API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Audit & Accountability Subsystem (Module 8).
 *
 * Key Responsibilities:
 * - GET: Queries audit entries and runs full HMAC-SHA256 chain integrity verification.
 *
 * Safety / Security Guarantees:
 * - Read-only: Ledger entries are immutable and cannot be edited via API.
 * - Cryptographic verification: Validates all blocks from genesis to tip.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  queryAuditEntries,
  verifyAuditChainIntegrity,
} from "@/lib/security/auditEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const verify = searchParams.get("verify") === "true";

  if (verify) {
    const report = verifyAuditChainIntegrity();
    return NextResponse.json({ ok: true, verificationReport: report });
  }

  const actor = searchParams.get("actor") || undefined;
  const action = searchParams.get("action") || undefined;
  const status = searchParams.get("status") || undefined;
  const limit = Number(searchParams.get("limit")) || 100;

  const entries = queryAuditEntries({
    actor,
    action,
    executionStatus: status,
    limit,
  });

  return NextResponse.json({ ok: true, auditEntries: entries });
}
