/**
 * @file app/api/security/privacy/route.ts
 * @description Privacy & Data Protection API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Privacy & Data Protection Subsystem (Module 6).
 *
 * Key Responsibilities:
 * - POST: Scans input text for sensitive patterns/secrets and governs screen capture consent.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  scanAndSanitizeText,
  grantScreenCaptureConsent,
  revokeScreenCaptureConsent,
  evaluateScreenCapturePrivacy,
} from "@/lib/security/privacyEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
  const auth = validateSessionToken(token);
  if (!auth.isValid) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, text, windowTitle, durationMs } = body;

    switch (action) {
      case "scan": {
        const scan = scanAndSanitizeText(text || "");
        return NextResponse.json({ ok: true, scan });
      }

      case "screen_consent_grant": {
        grantScreenCaptureConsent(durationMs || 5 * 60 * 1000);
        return NextResponse.json({ ok: true, message: "Screen capture consent granted." });
      }

      case "screen_consent_revoke": {
        revokeScreenCaptureConsent();
        return NextResponse.json({ ok: true, message: "Screen capture consent revoked and buffers purged." });
      }

      case "screen_privacy_check": {
        const evalState = evaluateScreenCapturePrivacy(windowTitle);
        return NextResponse.json({ ok: true, state: evalState });
      }

      default:
        return NextResponse.json({ ok: false, error: `Invalid action "${action}".` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Privacy error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
