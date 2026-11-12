/**
 * @file app/api/security/emergency/route.ts
 * @description Emergency Stop & Persistent Lockdown API Endpoint for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Emergency & System Defense Subsystem (Module 9).
 *
 * Key Responsibilities:
 * - GET: Returns active emergency lockdown status.
 * - POST: Triggers Emergency Stop or executes founder-authenticated recovery unlock.
 *
 * Safety / Security Guarantees:
 * - Fail-closed: Lockdown restricts all external execution.
 * - Recovery requires verified founder recovery key.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getLockdownStatus,
  triggerEmergencyStop,
  unlockFromEmergencyStop,
} from "@/lib/security/emergencyEngine";
import { validateSessionToken } from "@/lib/security/identityEngine";

export async function GET() {
  const status = getLockdownStatus();
  return NextResponse.json({ ok: true, lockdownStatus: status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, reason, recoveryKey } = body;

    switch (action) {
      case "lockdown": {
        const token = req.headers.get("x-ultron-session-token") || req.cookies.get("ultron_session")?.value;
        const auth = validateSessionToken(token);
        const actor = auth.session ? auth.session.userId : "emergency_user";

        const state = triggerEmergencyStop({
          actor,
          reason: reason || "Manual Emergency Stop triggered via API/UI.",
          revokeAllSessions: true,
        });

        return NextResponse.json({ ok: true, lockdownState: state });
      }

      case "unlock": {
        if (!recoveryKey) {
          return NextResponse.json({ ok: false, error: "Founder recoveryKey required to unlock." }, { status: 400 });
        }

        const result = unlockFromEmergencyStop({
          recoveryKey,
          actor: "founder_recovery",
          reason: reason || "Authorized recovery unlock",
        });

        return NextResponse.json({ ok: result.success, error: result.error });
      }

      default:
        return NextResponse.json({ ok: false, error: `Invalid action "${action}".` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Emergency system error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
