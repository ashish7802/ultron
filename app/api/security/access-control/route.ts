/**
 * @file app/api/security/access-control/route.ts
 * @description Access Control (RBAC & ABAC) API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Access Control Subsystem (Module 3).
 *
 * Key Responsibilities:
 * - GET: Lists access control policies and evaluates candidate ABAC access requests.
 * - POST: Registers new resource access policies (Founder role only).
 *
 * Safety / Security Guarantees:
 * - Server-side least privilege evaluation.
 * - Fails closed: unmapped resources default to deny.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  evaluateAccess,
  listResourcePolicies,
  registerResourcePolicy,
  revokeResourcePolicy,
} from "@/lib/security/accessControlEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";
import { isSystemLockedDown } from "@/lib/security/emergencyEngine";
import type { ABACContext } from "@/lib/security/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const evaluate = searchParams.get("evaluate") === "true";

  if (!evaluate) {
    return NextResponse.json({ ok: true, policies: listResourcePolicies() });
  }

  // ABAC query evaluation
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  const actorRole = auth.session ? auth.session.userRole : "guest";

  const context: ABACContext = {
    actorId: auth.session ? auth.session.userId : "guest_user",
    actorRole,
    sessionId: auth.session ? auth.session.sessionId : "none",
    requestedOperation: (searchParams.get("operation") || "read") as any,
    resourceDomain: (searchParams.get("domain") || "file") as any,
    resourceIdentifier: searchParams.get("resource") || "",
    projectId: searchParams.get("projectId") || undefined,
    isEmergencyLocked: isSystemLockedDown(),
    environment: {
      ipAddress: "127.0.0.1",
      isLoopback: true,
      timestamp: Date.now(),
      platform: process.platform,
    },
  };

  const result = evaluateAccess(context);
  return NextResponse.json({ ok: true, evaluation: result });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid || !auth.session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { policy } = body;
    if (!policy || !policy.policyId) {
      return NextResponse.json({ ok: false, error: "Policy object required." }, { status: 400 });
    }

    const success = registerResourcePolicy(policy, auth.session.userRole);
    return NextResponse.json({ ok: success });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Access control error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid || !auth.session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const policyId = searchParams.get("policyId");
    if (!policyId) {
      return NextResponse.json({ ok: false, error: "policyId required." }, { status: 400 });
    }

    const success = revokeResourcePolicy(policyId, auth.session.userRole);
    return NextResponse.json({ ok: success });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Access control error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
