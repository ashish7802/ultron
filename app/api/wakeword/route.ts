/**
 * @file app/api/wakeword/route.ts
 * @description Advanced Wake-Word and Audio State Coordination API for ULTRON.
 *
 * Subsystem:
 * Audio Ingestion & Hands-free Activation Route.
 *
 * Key Responsibilities:
 * - Provides centralized wake-word candidate testing and state broadcasting.
 * - Allows external microphone services or desktop background workers to submit detected speech.
 * - Manages active listening mode states (`WAKE_WORD`, `PUSH_TO_TALK`, `CONTINUOUS_CONVERSATION`).
 *
 * Safety / Security Guarantees:
 * - Local single-user design: no authentication is required (fingerprint/Zero-Trust gating was
 *   removed per user request), but inputs are validated/coerced so a malformed payload cannot
 *   poison the shared state.
 * - One-shot wake events expire after a short window and are cleared, so a stale trigger can
 *   never be replayed hours later.
 */

import { NextRequest, NextResponse } from "next/server";

/** How long a one-shot wake event may be picked up by the polling HUD. */
const WAKE_EVENT_TTL_MS = 2000;
/** Cap on a reported wake phrase (defensive: it is rendered in the HUD). */
const MAX_PHRASE_LENGTH = 120;

interface GlobalAudioState {
  mode: "WAKE_WORD" | "PUSH_TO_TALK" | "CONTINUOUS_CONVERSATION";
  muted: boolean;
  lastWakeEvent: {
    phrase: string;
    confidence: number;
    timestamp: number;
  } | null;
}

const audioState: GlobalAudioState = {
  mode: "WAKE_WORD",
  muted: false,
  lastWakeEvent: null,
};

/**
 * Polls the shared wake-word state and consumes any pending one-shot trigger.
 *
 * @returns Current mode/muted state, plus a `WAKE_WORD_DETECTED` event when fresh.
 */
export async function GET(): Promise<NextResponse> {
  const event = audioState.lastWakeEvent;
  if (event) {
    const ageMs = Date.now() - event.timestamp;
    if (ageMs >= 0 && ageMs < WAKE_EVENT_TTL_MS) {
      // One-shot trigger: consume it so the HUD activates exactly once.
      audioState.lastWakeEvent = null;
      return NextResponse.json({
        event: { type: "WAKE_WORD_DETECTED", phrase: event.phrase, confidence: event.confidence },
        status: "triggered",
        mode: audioState.mode,
        muted: audioState.muted,
      });
    }
    // Expired trigger (e.g. nobody polled in time): clear it instead of retaining it forever.
    audioState.lastWakeEvent = null;
  }

  return NextResponse.json({
    event: null,
    status: audioState.muted ? "muted" : "idle",
    mode: audioState.mode,
    muted: audioState.muted,
  });
}

/**
 * Updates the shared audio state or registers a wake-word detection.
 *
 * @param req - NextRequest containing `{ action?, phrase?, confidence?, mode?, muted? }`.
 * @returns Acknowledgement with the resulting mode/muted state.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const { action, phrase, confidence, mode, muted } = body;

    if (action === "trigger_wake") {
      const safePhrase = typeof phrase === "string" && phrase.trim() ? phrase.trim().slice(0, MAX_PHRASE_LENGTH) : "ultron";
      const numericConfidence = typeof confidence === "number" && Number.isFinite(confidence) ? confidence : 0.95;
      audioState.lastWakeEvent = {
        phrase: safePhrase,
        confidence: Math.min(1.0, Math.max(0.1, numericConfidence)),
        timestamp: Date.now(),
      };
      return NextResponse.json({ ok: true, message: "Wake word registered" });
    }

    if (typeof mode === "string" && ["WAKE_WORD", "PUSH_TO_TALK", "CONTINUOUS_CONVERSATION"].includes(mode)) {
      audioState.mode = mode as GlobalAudioState["mode"];
    }

    if (typeof muted === "boolean") {
      audioState.muted = muted;
    }

    return NextResponse.json({
      ok: true,
      mode: audioState.mode,
      muted: audioState.muted,
    });
  } catch (err) {
    console.error("[WAKEWORD ROUTE EXCEPTION]", err);
    return NextResponse.json({ error: "Failed to update audio state" }, { status: 500 });
  }
}
