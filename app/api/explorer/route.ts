/**
 * @file app/api/explorer/route.ts
 * @description REST API Route for ULTRON Lite World Explorer & Topic Learning Mode.
 *
 * Subsystem:
 * Educational Exploration & Knowledge Synthesis.
 *
 * Key Responsibilities:
 * - POST (`explore`): Takes a concept or topic and returns a beginner-friendly Hinglish explanation,
 *   background, simplified terms, real-world connection, facts vs speculation, and sources.
 * - POST (`save_note`): Persists an explored topic and user notes to ULTRON's memory vault.
 *
 * Safety / Security Guarantees:
 * - Gated by desktop loopback session validation (`validateDesktopSession`).
 * - Never modifies system security gates or policy configuration.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import { defaultWorldExplorer } from "@/lib/learning/worldExplorerEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sessionCheck = validateDesktopSession(req);
  if (!sessionCheck.valid) {
    return createAuthErrorResponse(sessionCheck);
  }

  try {
    const body = await req.json();
    const { action, topic, category, notes, sourceUrl } = body;

    if (action === "explore" || (!action && topic)) {
      if (!topic || typeof topic !== "string") {
        return NextResponse.json({ ok: false, error: "Missing or invalid 'topic' string." }, { status: 400 });
      }
      const exploration = await defaultWorldExplorer.exploreTopic(topic, category);
      return NextResponse.json({ ok: true, exploration });
    }

    if (action === "save_note") {
      if (!topic || !notes) {
        return NextResponse.json({ ok: false, error: "Both 'topic' and 'notes' are required." }, { status: 400 });
      }
      const memResult = await defaultWorldExplorer.saveLearningNote(topic, notes, sourceUrl);
      return NextResponse.json({ ok: true, message: "Note saved to memory vault.", memResult });
    }

    return NextResponse.json({ ok: false, error: `Unsupported action '${action}'.` }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}
