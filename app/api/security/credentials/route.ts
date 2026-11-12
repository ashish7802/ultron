/**
 * @file app/api/security/credentials/route.ts
 * @description Credential & Secret Protection API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Credential & Secret Protection Subsystem (Module 5).
 *
 * Key Responsibilities:
 * - GET: Lists sanitized credential metadata (never plaintext secrets).
 * - POST: Stores, rotates, or revokes credentials (Founder role only).
 *
 * Safety / Security Guarantees:
 * - Zero raw secrets in GET responses or logs.
 * - AES-256-GCM encryption with 96-bit CSPRNG nonces.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listCredentialMetadata,
  storeCredential,
  revokeCredential,
} from "@/lib/security/credentialEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid || !auth.session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    credentials: listCredentialMetadata(),
  });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid || !auth.session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, name, secretValue, category } = body;

    switch (action) {
      case "store": {
        const result = storeCredential(name, secretValue, category, auth.session.userRole);
        return NextResponse.json({ ok: result.success, metadata: result.metadata, error: result.error });
      }

      case "revoke": {
        const success = revokeCredential(name, auth.session.userRole);
        return NextResponse.json({ ok: success });
      }

      default:
        return NextResponse.json({ ok: false, error: `Invalid action "${action}".` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Credential error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
