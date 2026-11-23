/**
 * @file app/api/briefing/route.ts
 * @description REST API Route for ULTRON Lite Daily Briefing & World Awareness.
 *
 * Subsystem:
 * Autonomous Knowledge & Daily Intelligence Briefings.
 *
 * Key Responsibilities:
 * - GET: Returns today's daily briefing (top developments, India & world, AI/tech, topic to learn, sources).
 * - POST (`refresh`): Triggers an on-demand re-fetch of live RSS feeds to generate an updated briefing.
 *
 * Safety / Security Guarantees:
 * - Gated by desktop loopback session validation (`validateDesktopSession`).
 * - Zero hallucination: all news entries originate strictly from verified open RSS feeds.
 * - Outbound requests are bound by strict HTTP timeouts to protect CPU/RAM.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import { defaultDailyBriefingEngine } from "@/lib/news/dailyBriefingEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionCheck = validateDesktopSession(req);
  if (!sessionCheck.valid) {
    return createAuthErrorResponse(sessionCheck);
  }

  try {
    const briefing = await defaultDailyBriefingEngine.getDailyBriefing(false);
    return NextResponse.json({ ok: true, briefing });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sessionCheck = validateDesktopSession(req);
  if (!sessionCheck.valid) {
    return createAuthErrorResponse(sessionCheck);
  }

  try {
    const briefing = await defaultDailyBriefingEngine.getDailyBriefing(true);
    return NextResponse.json({ ok: true, briefing, refreshed: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}
