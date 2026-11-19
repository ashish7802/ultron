/**
 * @file app/api/security/policies/route.ts
 * @description Security Policy & Trust Invariants API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Governance & Policy Subsystem (Module 10).
 *
 * Key Responsibilities:
 * - GET: Lists all active policies, including immutable core invariants.
 * - POST: Updates security policies with conflict detection (Founder role only).
 *
 * Safety / Security Guarantees:
 * - Immutable invariants cannot be disabled or weakened.
 * - AI prompt injections cannot modify policies.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listSecurityPolicies,
  updateSecurityPolicy,
  validatePolicyRule,
} from "@/lib/security/policyEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";
import { isAllowedRequestOrigin } from "@/lib/sessionGate";

export async function GET(req: NextRequest) {
  const originCheck = isAllowedRequestOrigin(req);
  if (!originCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: originCheck.error || "Cross-origin security policy requests are prohibited." },
      { status: originCheck.status || 403 }
    );
  }
  const policies = listSecurityPolicies();
  return NextResponse.json({ ok: true, policies });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid || !auth.session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { rule } = body;

    if (!rule || !rule.policyId) {
      return NextResponse.json({ ok: false, error: "Rule object with policyId required." }, { status: 400 });
    }

    const validation = validatePolicyRule(rule);
    if (!validation.isValid) {
      return NextResponse.json({
        ok: false,
        error: "Policy validation failed",
        conflicts: validation.conflicts,
      }, { status: 400 });
    }

    const update = updateSecurityPolicy(rule, auth.session.userRole, auth.session.userId);
    return NextResponse.json({ ok: update.success, error: update.error });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Policy engine error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
